/**
 * @jest-environment node
 *
 * Tests for the perpetual weighted-average-cost valuation module.
 * Bima's gate before the dashboard surfaces "Total stock value".
 */
import {
  computeInventoryValue,
  computeProductValuations,
  valuationSummary,
  type ValuationMovement,
} from "../domain/valuation";

const t = (iso: string) => new Date(iso);

describe("computeProductValuations — basic shapes", () => {
  test("empty movements list = empty state", () => {
    const state = computeProductValuations([]);
    expect(state.size).toBe(0);
  });

  test("single stock_in establishes qty + WAC", () => {
    const state = computeProductValuations([
      {
        productId: "p1",
        type: "stock_in",
        quantity: 10,
        unitCost: 5,
        createdAt: t("2026-01-01"),
      },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(10);
    expect(p1.totalValue).toBe(50);
    expect(p1.wac).toBe(5);
  });

  test("two stock_in at different costs blends to weighted avg", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: t("2026-01-01") },
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 7, createdAt: t("2026-01-02") },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(20);
    expect(p1.totalValue).toBe(120); // 50 + 70
    expect(p1.wac).toBe(6); // weighted (5×10 + 7×10) / 20
  });
});

describe("computeProductValuations — stock_out depletes at WAC", () => {
  test("sell half at current WAC", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: t("2026-01-01") },
      { productId: "p1", type: "stock_out", quantity: -4, createdAt: t("2026-01-02") },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(6);
    expect(p1.totalValue).toBe(30); // 6 × 5
    expect(p1.wac).toBe(5); // unchanged
  });

  test("sell ALL drops state to zero", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: t("2026-01-01") },
      { productId: "p1", type: "stock_out", quantity: -10, createdAt: t("2026-01-02") },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(0);
    expect(p1.totalValue).toBe(0);
    expect(p1.wac).toBe(0);
  });

  test("classic WAC scenario: buy, buy, sell, buy", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 100, unitCost: 10, createdAt: t("2026-01-01") },
      { productId: "p1", type: "stock_in", quantity: 100, unitCost: 12, createdAt: t("2026-01-02") },
      // After 2 stock_ins: 200 qty, 2200 value, WAC = 11
      { productId: "p1", type: "stock_out", quantity: -50, createdAt: t("2026-01-03") },
      // After stock_out 50: 150 qty, 1650 value, WAC = 11 (unchanged)
      { productId: "p1", type: "stock_in", quantity: 100, unitCost: 13, createdAt: t("2026-01-04") },
      // After last: 250 qty, 2950 value, WAC = 11.8
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(250);
    expect(p1.totalValue).toBeCloseTo(2950, 10);
    expect(p1.wac).toBeCloseTo(11.8, 10);
  });
});

describe("computeProductValuations — transfers are cost-neutral", () => {
  test("transfer_out + transfer_in pair within same product nets to zero state change", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 100, unitCost: 10, createdAt: t("2026-01-01") },
      { productId: "p1", type: "transfer_out", quantity: -20, createdAt: t("2026-01-02") },
      { productId: "p1", type: "transfer_in", quantity: 20, createdAt: t("2026-01-02") },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(100);
    expect(p1.totalValue).toBe(1000);
    expect(p1.wac).toBe(10);
  });
});

describe("computeProductValuations — adjustments use current WAC", () => {
  test("positive adjustment adds qty valued at current WAC", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: t("2026-01-01") },
      { productId: "p1", type: "adjustment", quantity: 2, createdAt: t("2026-01-02") },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(12);
    expect(p1.totalValue).toBe(60); // 50 + 2 × 5
    expect(p1.wac).toBe(5);
  });

  test("negative adjustment subtracts at WAC", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: t("2026-01-01") },
      { productId: "p1", type: "adjustment", quantity: -3, createdAt: t("2026-01-02") },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(7);
    expect(p1.totalValue).toBe(35);
    expect(p1.wac).toBe(5);
  });
});

describe("computeProductValuations — multi-product isolation", () => {
  test("two products tracked independently", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: t("2026-01-01") },
      { productId: "p2", type: "stock_in", quantity: 4, unitCost: 25, createdAt: t("2026-01-01") },
      { productId: "p1", type: "stock_out", quantity: -2, createdAt: t("2026-01-02") },
    ]);
    expect(state.get("p1")).toEqual({ qty: 8, totalValue: 40, wac: 5 });
    expect(state.get("p2")).toEqual({ qty: 4, totalValue: 100, wac: 25 });
  });
});

describe("computeProductValuations — chronological ordering", () => {
  test("out-of-order input is sorted by createdAt", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 100, unitCost: 12, createdAt: t("2026-01-02") },
      { productId: "p1", type: "stock_in", quantity: 100, unitCost: 10, createdAt: t("2026-01-01") },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(200);
    expect(p1.totalValue).toBe(2200);
    expect(p1.wac).toBe(11);
  });
});

describe("computeInventoryValue", () => {
  test("sums totalValue across products", () => {
    const states = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: t("2026-01-01") },
      { productId: "p2", type: "stock_in", quantity: 4, unitCost: 25, createdAt: t("2026-01-01") },
    ]);
    expect(computeInventoryValue(states)).toBe(150);
  });

  test("returns 0 for empty inventory", () => {
    expect(computeInventoryValue(new Map())).toBe(0);
  });
});

describe("valuationSummary", () => {
  test("composes both functions in one pass-ish call", () => {
    const movements: ValuationMovement[] = [
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: t("2026-01-01") },
      { productId: "p1", type: "stock_out", quantity: -3, createdAt: t("2026-01-02") },
    ];
    const summary = valuationSummary(movements);
    expect(summary.totalValue).toBe(35);
    expect(summary.perProduct.get("p1")!.qty).toBe(7);
  });
});

describe("defends against bad data", () => {
  test("stock_in without unitCost uses current WAC (or 0 if first)", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, createdAt: t("2026-01-01") }, // no cost
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 10, createdAt: t("2026-01-02") },
    ]);
    const p1 = state.get("p1")!;
    // first stock_in had no cost (WAC was 0) → totalValue stays 0 for those 10
    // second adds 100 → 20 qty, 100 value, WAC = 5
    expect(p1.qty).toBe(20);
    expect(p1.totalValue).toBe(100);
    expect(p1.wac).toBe(5);
  });

  test("over-decrement clamps to zero, doesn't go negative", () => {
    // Should not happen under CHECK + checkDecrementAllowed, but if it
    // sneaks past validation, state floors rather than carrying phantom debt.
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 5, unitCost: 4, createdAt: t("2026-01-01") },
      { productId: "p1", type: "stock_out", quantity: -10, createdAt: t("2026-01-02") },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(0);
    expect(p1.totalValue).toBe(0);
    expect(p1.wac).toBe(0);
  });
});

describe("computeProductValuations — createdAt type handling (asTime branches)", () => {
  // The dashboard passes Date objects, but the ledger row's createdAt can
  // arrive as a numeric epoch (JSON) or an ISO string (raw SQL). asTime must
  // normalise all three so chronological sort stays correct regardless of source.
  test("numeric epoch timestamps sort correctly", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_out", quantity: -5, createdAt: Date.UTC(2026, 0, 2) },
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 4, createdAt: Date.UTC(2026, 0, 1) },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(5);
    expect(p1.totalValue).toBe(20);
    expect(p1.wac).toBe(4);
  });

  test("ISO string timestamps are parsed and sorted", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 4, createdAt: "2026-01-02T00:00:00Z" },
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 6, createdAt: "2026-01-01T00:00:00Z" },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(20);
    expect(p1.totalValue).toBe(100);
    expect(p1.wac).toBe(5);
  });

  test("mixed Date / number / string timestamps interleave correctly", () => {
    const state = computeProductValuations([
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: t("2026-01-01") },
      { productId: "p1", type: "stock_in", quantity: 10, unitCost: 5, createdAt: Date.UTC(2026, 0, 2) },
      { productId: "p1", type: "stock_out", quantity: -4, createdAt: "2026-01-03T00:00:00Z" },
    ]);
    const p1 = state.get("p1")!;
    expect(p1.qty).toBe(16);
    expect(p1.totalValue).toBe(80);
    expect(p1.wac).toBe(5);
  });
});
