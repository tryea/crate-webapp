/**
 * Inventory valuation: perpetual weighted-average cost (WAC).
 *
 * Pure functions only. The same Bima-gate discipline as stock-math:
 * tests come BEFORE this module is used in a feature.
 *
 * Method (documented per COUNCIL.md §6 PHASE 6):
 *
 *   For each product, walk all movements in chronological order maintaining
 *   running (qty, totalValue). At each step:
 *
 *     stock_in:        qty += q;  totalValue += q × unitCost
 *     stock_out:       qty -= q;  totalValue -= q × current_WAC   (COGS at WAC)
 *     transfer_in:     qty += q;  totalValue += q × unitCost (uses current
 *                      WAC if unitCost absent, transfers are cost-neutral
 *                      at product-level since the pair cancels out)
 *     transfer_out:    qty -= q;  totalValue -= q × current_WAC
 *     adjustment +:    qty += q;  totalValue += q × current_WAC
 *                      (positive adjustment uses current WAC as "rediscovered" basis)
 *     adjustment -:    qty -= q;  totalValue -= q × current_WAC
 *
 *   current_WAC at any step = totalValue / qty (or 0 if qty == 0)
 *
 *   Result: per-product { qty, totalValue, wac }. Sum totalValue across
 *   products = inventory valuation at the dashboard.
 *
 * Limitations documented:
 *  - Negative qty (impossible under CHECK + checkDecrementAllowed) clamps
 *    to zero state, never accumulates phantom debt.
 *  - Cost of stock_in WITHOUT a unitCost (i.e. null/undefined) is treated
 *    as the current WAC. This usually only happens in seed data.
 *  - Cents granularity. We never store sub-cent precision; intermediate
 *    arithmetic uses JS Number (sufficient for portfolio-scale data).
 */

export type ValuationMovementType =
  | "stock_in"
  | "stock_out"
  | "transfer_in"
  | "transfer_out"
  | "adjustment";

export interface ValuationMovement {
  productId: string;
  type: ValuationMovementType;
  quantity: number; // signed: +in, -out
  unitCost?: number | null;
  createdAt: Date | string | number;
}

export interface ProductValuationState {
  qty: number;
  totalValue: number;
  wac: number;
}

function asTime(t: Date | string | number): number {
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  return new Date(t).getTime();
}

/**
 * Walk movements per product in chronological order. Returns the final
 * (qty, totalValue, wac) state for each product that has any movement.
 *
 * Movements are sorted ONCE; the caller doesn't need to pre-sort.
 */
export function computeProductValuations(
  movements: ReadonlyArray<ValuationMovement>,
): Map<string, ProductValuationState> {
  const sorted = [...movements].sort((a, b) => asTime(a.createdAt) - asTime(b.createdAt));
  const state = new Map<string, { qty: number; totalValue: number }>();

  for (const m of sorted) {
    const cur = state.get(m.productId) ?? { qty: 0, totalValue: 0 };
    const wac = cur.qty > 0 ? cur.totalValue / cur.qty : 0;

    if (m.quantity > 0) {
      // Increment paths: stock_in, transfer_in, positive adjustment
      const unitCost = m.unitCost ?? wac;
      cur.qty += m.quantity;
      cur.totalValue += m.quantity * unitCost;
    } else if (m.quantity < 0) {
      // Decrement at current WAC (the accounting standard for WAC method)
      const magnitude = Math.abs(m.quantity);
      cur.qty -= magnitude;
      cur.totalValue -= magnitude * wac;
      // Floor at zero, shouldn't happen under CHECK + checkDecrementAllowed,
      // but defends against bad data getting in via direct DB writes.
      if (cur.qty <= 0) {
        cur.qty = 0;
        cur.totalValue = 0;
      }
    }
    // quantity === 0 is rejected by DB CHECK + validateMovementShape

    state.set(m.productId, cur);
  }

  const result = new Map<string, ProductValuationState>();
  for (const [productId, { qty, totalValue }] of state) {
    result.set(productId, {
      qty,
      totalValue,
      wac: qty > 0 ? totalValue / qty : 0,
    });
  }
  return result;
}

/**
 * Sum total value across all products. The dashboard "Total stock value"
 * KPI calls this.
 */
export function computeInventoryValue(
  valuations: Map<string, ProductValuationState>,
): number {
  let total = 0;
  for (const v of valuations.values()) total += v.totalValue;
  return total;
}

/**
 * Convenience composer used by the dashboard: walk movements once, sum
 * once, return both.
 */
export function valuationSummary(
  movements: ReadonlyArray<ValuationMovement>,
): {
  perProduct: Map<string, ProductValuationState>;
  totalValue: number;
} {
  const perProduct = computeProductValuations(movements);
  return { perProduct, totalValue: computeInventoryValue(perProduct) };
}
