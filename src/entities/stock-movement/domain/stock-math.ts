/**
 * Stock-math domain layer.
 *
 * Pure functions only — NO DB, NO server, NO React. Everything here is unit-
 * tested in `__tests__/stock-math.test.ts` PER COUNCIL §0 rule 3 (domain
 * logic has tests BEFORE it's marked done).
 *
 * The invariants this module guards:
 *  - Quantity sign convention per movement type (see expectedSignForType).
 *  - Quantity is never zero on an actual movement.
 *  - Stock level = SUM(quantity) across all movements for a (product, location)
 *    — the table is append-only; the level is derived.
 *  - Stock-out never drives a level below zero unless backorder is allowed.
 *  - Transfer = two opposing movements w/ same transferGroupId, summing to 0.
 */

export type MovementType =
  | "stock_in"
  | "stock_out"
  | "transfer_in"
  | "transfer_out"
  | "adjustment";

export type MovementReason =
  | "purchase"
  | "sale"
  | "return_to_supplier"
  | "return_from_customer"
  | "damage"
  | "lost"
  | "count_correction"
  | "transfer"
  | "other";

export interface MovementShape {
  productId: string;
  locationId: string;
  type: MovementType;
  reason: MovementReason;
  quantity: number;
  transferGroupId?: string | null;
}

// Movement input as used by builders (callers supply the magnitude as a
// positive number — `quantity`; we set the sign per type). adjustment is
// special: caller supplies a signed delta directly.
export interface DirectionalInput {
  productId: string;
  locationId: string;
  reason: MovementReason;
  quantity: number; // magnitude (>0) for in/out/transfer; signed delta for adjustment
  transferGroupId?: string | null;
}

/**
 * Sign convention per movement type.
 *  - stock_in / transfer_in : +
 *  - stock_out / transfer_out : -
 *  - adjustment : either (caller supplies signed delta)
 */
export function expectedSignForType(type: MovementType): 1 | -1 | "any" {
  switch (type) {
    case "stock_in":
    case "transfer_in":
      return 1;
    case "stock_out":
    case "transfer_out":
      return -1;
    case "adjustment":
      return "any";
  }
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validate that a movement's quantity has the correct sign for its type
 * and is non-zero. CHECK constraint at DB level also enforces qty != 0;
 * this is the first line of defense at the API.
 */
export function validateMovementShape(input: Pick<MovementShape, "type" | "quantity">): ValidationResult {
  if (!Number.isInteger(input.quantity)) {
    return { ok: false, error: "Quantity must be a whole number." };
  }
  if (input.quantity === 0) {
    return { ok: false, error: "Quantity must not be zero." };
  }
  const expected = expectedSignForType(input.type);
  if (expected === "any") return { ok: true };
  if (expected > 0 && input.quantity < 0) {
    return { ok: false, error: `${input.type} requires a positive quantity.` };
  }
  if (expected < 0 && input.quantity > 0) {
    return { ok: false, error: `${input.type} requires a negative quantity.` };
  }
  return { ok: true };
}

/**
 * Compute current level for a slice of movements (assumed already filtered
 * to one product+location). The slice's `quantity` values carry sign.
 */
export function computeStockLevel(
  movements: ReadonlyArray<Pick<MovementShape, "quantity">>,
): number {
  let total = 0;
  for (const m of movements) total += m.quantity;
  return total;
}

/**
 * Aggregate many movements into a level map keyed by `${productId}|${locationId}`.
 * Useful for batched displays (a warehouse's location-level grid).
 */
export function buildLevelMap(
  movements: ReadonlyArray<Pick<MovementShape, "productId" | "locationId" | "quantity">>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of movements) {
    const key = `${m.productId}|${m.locationId}`;
    map.set(key, (map.get(key) ?? 0) + m.quantity);
  }
  return map;
}

/**
 * Validate that a stock-out (or any decrement) is allowed at the current
 * level. Returns the resulting level on success so callers can decide UI
 * affordances (e.g. "this will trigger a reorder alert").
 */
export function checkDecrementAllowed({
  currentLevel,
  decrementBy, // positive number — how much to take out
  allowBackorder = false,
}: {
  currentLevel: number;
  decrementBy: number;
  allowBackorder?: boolean;
}): { ok: true; newLevel: number } | { ok: false; newLevel: number; error: string } {
  if (!Number.isInteger(decrementBy) || decrementBy <= 0) {
    return { ok: false, newLevel: currentLevel, error: "Quantity must be a positive whole number." };
  }
  const newLevel = currentLevel - decrementBy;
  if (!allowBackorder && newLevel < 0) {
    return {
      ok: false,
      newLevel,
      error: `Insufficient stock: have ${currentLevel}, requested ${decrementBy}.`,
    };
  }
  return { ok: true, newLevel };
}

/**
 * Build a paired transfer (two movements, opposing signs, same group id).
 * Caller supplies a fresh transferGroupId — typically `crypto.randomUUID()`.
 *
 * The PAIR is what an operator submits via the transfer UI; the server
 * action wraps both inserts in a single transaction so partial failure is
 * impossible (COUNCIL §4.3).
 */
export function buildTransferPair(input: {
  productId: string;
  sourceLocationId: string;
  destLocationId: string;
  quantity: number;
  transferGroupId: string;
  reason?: MovementReason;
}): {
  source: MovementShape;
  dest: MovementShape;
} {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("Transfer quantity must be a positive whole number.");
  }
  if (input.sourceLocationId === input.destLocationId) {
    throw new Error("Transfer source and destination must differ.");
  }
  const reason = input.reason ?? "transfer";
  return {
    source: {
      productId: input.productId,
      locationId: input.sourceLocationId,
      type: "transfer_out",
      reason,
      quantity: -input.quantity,
      transferGroupId: input.transferGroupId,
    },
    dest: {
      productId: input.productId,
      locationId: input.destLocationId,
      type: "transfer_in",
      reason,
      quantity: input.quantity,
      transferGroupId: input.transferGroupId,
    },
  };
}

/**
 * Verify a transfer pair is balanced and well-formed. Caught in tests
 * to prevent regressions in buildTransferPair; also usable as a server-
 * side sanity check before insertion.
 */
export function transferPairBalances(pair: {
  source: MovementShape;
  dest: MovementShape;
}): boolean {
  return (
    pair.source.productId === pair.dest.productId &&
    pair.source.locationId !== pair.dest.locationId &&
    pair.source.quantity === -pair.dest.quantity &&
    pair.source.quantity < 0 &&
    pair.dest.quantity > 0 &&
    pair.source.type === "transfer_out" &&
    pair.dest.type === "transfer_in" &&
    Boolean(pair.source.transferGroupId) &&
    pair.source.transferGroupId === pair.dest.transferGroupId
  );
}

/**
 * Reorder-status classifier. Pure on numbers; the UI feeds it
 * `currentLevel` (derived) + `reorderPoint` (product config).
 */
export type StockHealth = "out-of-stock" | "low-stock" | "in-stock";

export function classifyStockHealth(
  currentLevel: number,
  reorderPoint: number,
): StockHealth {
  if (currentLevel <= 0) return "out-of-stock";
  if (currentLevel <= reorderPoint) return "low-stock";
  return "in-stock";
}
