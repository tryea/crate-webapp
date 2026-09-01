/**
 * @jest-environment node
 *
 * Pure-math tests for the stock-movement domain.
 *
 * COUNCIL §0 rule 3 ("no fake completeness"): domain logic has tests
 * BEFORE it's marked done. These are the contract for what Stock In,
 * Stock Out, Transfer, and Adjustment must obey at runtime.
 */
import {
  buildLevelMap,
  buildTransferPair,
  checkDecrementAllowed,
  classifyStockHealth,
  computeStockLevel,
  expectedSignForType,
  transferPairBalances,
  validateMovementShape,
  type MovementShape,
} from "../domain/stock-math";

describe("expectedSignForType", () => {
  test("stock_in and transfer_in are positive", () => {
    expect(expectedSignForType("stock_in")).toBe(1);
    expect(expectedSignForType("transfer_in")).toBe(1);
  });
  test("stock_out and transfer_out are negative", () => {
    expect(expectedSignForType("stock_out")).toBe(-1);
    expect(expectedSignForType("transfer_out")).toBe(-1);
  });
  test("adjustment is sign-agnostic", () => {
    expect(expectedSignForType("adjustment")).toBe("any");
  });
});

describe("validateMovementShape", () => {
  test("rejects zero quantity for every type", () => {
    for (const type of ["stock_in", "stock_out", "transfer_in", "transfer_out", "adjustment"] as const) {
      const result = validateMovementShape({ type, quantity: 0 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/zero/i);
    }
  });

  test("rejects non-integer quantity", () => {
    const result = validateMovementShape({ type: "stock_in", quantity: 1.5 });
    expect(result.ok).toBe(false);
  });

  test("rejects positive qty for stock_out", () => {
    const result = validateMovementShape({ type: "stock_out", quantity: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/negative/i);
  });

  test("rejects negative qty for stock_in", () => {
    const result = validateMovementShape({ type: "stock_in", quantity: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/positive/i);
  });

  test("accepts correctly signed movements", () => {
    expect(validateMovementShape({ type: "stock_in", quantity: 10 }).ok).toBe(true);
    expect(validateMovementShape({ type: "stock_out", quantity: -10 }).ok).toBe(true);
    expect(validateMovementShape({ type: "transfer_in", quantity: 3 }).ok).toBe(true);
    expect(validateMovementShape({ type: "transfer_out", quantity: -3 }).ok).toBe(true);
  });

  test("accepts adjustment in either direction", () => {
    expect(validateMovementShape({ type: "adjustment", quantity: 7 }).ok).toBe(true);
    expect(validateMovementShape({ type: "adjustment", quantity: -7 }).ok).toBe(true);
  });
});

describe("computeStockLevel", () => {
  test("empty list = level 0", () => {
    expect(computeStockLevel([])).toBe(0);
  });

  test("sums signed quantities", () => {
    expect(computeStockLevel([{ quantity: 10 }, { quantity: -3 }, { quantity: 5 }])).toBe(12);
  });

  test("transfer pair within same product/location sums to zero contribution", () => {
    expect(computeStockLevel([{ quantity: -5 }, { quantity: 5 }])).toBe(0);
  });
});

describe("buildLevelMap", () => {
  test("aggregates per (productId, locationId)", () => {
    const movements: Pick<MovementShape, "productId" | "locationId" | "quantity">[] = [
      { productId: "p1", locationId: "L1", quantity: 100 },
      { productId: "p1", locationId: "L1", quantity: -20 },
      { productId: "p1", locationId: "L2", quantity: 50 },
      { productId: "p2", locationId: "L1", quantity: 8 },
    ];
    const map = buildLevelMap(movements);
    expect(map.get("p1|L1")).toBe(80);
    expect(map.get("p1|L2")).toBe(50);
    expect(map.get("p2|L1")).toBe(8);
  });
});

describe("checkDecrementAllowed", () => {
  test("permits decrement when stock is sufficient", () => {
    const result = checkDecrementAllowed({ currentLevel: 100, decrementBy: 30 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newLevel).toBe(70);
  });

  test("blocks decrement that would go negative (no backorder)", () => {
    const result = checkDecrementAllowed({ currentLevel: 5, decrementBy: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/insufficient/i);
      expect(result.newLevel).toBe(-5);
    }
  });

  test("permits negative decrement when backorder allowed", () => {
    const result = checkDecrementAllowed({ currentLevel: 5, decrementBy: 10, allowBackorder: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newLevel).toBe(-5);
  });

  test("rejects zero and negative decrementBy", () => {
    expect(checkDecrementAllowed({ currentLevel: 50, decrementBy: 0 }).ok).toBe(false);
    expect(checkDecrementAllowed({ currentLevel: 50, decrementBy: -5 }).ok).toBe(false);
  });

  test("boundary: exact-match decrement leaves zero stock", () => {
    const result = checkDecrementAllowed({ currentLevel: 5, decrementBy: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newLevel).toBe(0);
  });
});

describe("buildTransferPair", () => {
  const baseInput = {
    productId: "p1",
    sourceLocationId: "L1",
    destLocationId: "L2",
    quantity: 10,
    transferGroupId: "t-group-1",
  };

  test("returns pair with opposing signs", () => {
    const pair = buildTransferPair(baseInput);
    expect(pair.source.quantity).toBe(-10);
    expect(pair.dest.quantity).toBe(10);
  });

  test("source = transfer_out, dest = transfer_in", () => {
    const pair = buildTransferPair(baseInput);
    expect(pair.source.type).toBe("transfer_out");
    expect(pair.dest.type).toBe("transfer_in");
  });

  test("shares transferGroupId across both rows", () => {
    const pair = buildTransferPair(baseInput);
    expect(pair.source.transferGroupId).toBe("t-group-1");
    expect(pair.dest.transferGroupId).toBe("t-group-1");
  });

  test("throws on same source and destination", () => {
    expect(() =>
      buildTransferPair({ ...baseInput, destLocationId: baseInput.sourceLocationId }),
    ).toThrow(/source and destination/i);
  });

  test("throws on zero or negative quantity", () => {
    expect(() => buildTransferPair({ ...baseInput, quantity: 0 })).toThrow();
    expect(() => buildTransferPair({ ...baseInput, quantity: -3 })).toThrow();
    expect(() => buildTransferPair({ ...baseInput, quantity: 1.5 })).toThrow();
  });

  test("default reason is 'transfer'", () => {
    const pair = buildTransferPair(baseInput);
    expect(pair.source.reason).toBe("transfer");
    expect(pair.dest.reason).toBe("transfer");
  });
});

describe("transferPairBalances", () => {
  test("happy-path pair balances", () => {
    const pair = buildTransferPair({
      productId: "p1",
      sourceLocationId: "L1",
      destLocationId: "L2",
      quantity: 7,
      transferGroupId: "t-1",
    });
    expect(transferPairBalances(pair)).toBe(true);
  });

  test("rejects pair with mismatched products", () => {
    const pair = buildTransferPair({
      productId: "p1",
      sourceLocationId: "L1",
      destLocationId: "L2",
      quantity: 7,
      transferGroupId: "t-1",
    });
    const tampered = { ...pair, dest: { ...pair.dest, productId: "p2" } };
    expect(transferPairBalances(tampered)).toBe(false);
  });

  test("rejects pair with same source/dest location", () => {
    const pair = buildTransferPair({
      productId: "p1",
      sourceLocationId: "L1",
      destLocationId: "L2",
      quantity: 7,
      transferGroupId: "t-1",
    });
    const tampered = { ...pair, dest: { ...pair.dest, locationId: "L1" } };
    expect(transferPairBalances(tampered)).toBe(false);
  });

  test("rejects unbalanced quantities", () => {
    const pair = buildTransferPair({
      productId: "p1",
      sourceLocationId: "L1",
      destLocationId: "L2",
      quantity: 7,
      transferGroupId: "t-1",
    });
    const tampered = { ...pair, dest: { ...pair.dest, quantity: 8 } };
    expect(transferPairBalances(tampered)).toBe(false);
  });

  test("rejects pair with missing transferGroupId", () => {
    const pair = buildTransferPair({
      productId: "p1",
      sourceLocationId: "L1",
      destLocationId: "L2",
      quantity: 7,
      transferGroupId: "t-1",
    });
    const tampered = { ...pair, source: { ...pair.source, transferGroupId: null } };
    expect(transferPairBalances(tampered)).toBe(false);
  });
});

describe("classifyStockHealth", () => {
  test("returns out-of-stock at zero or negative level", () => {
    expect(classifyStockHealth(0, 10)).toBe("out-of-stock");
    expect(classifyStockHealth(-5, 10)).toBe("out-of-stock");
  });

  test("returns low-stock when at or below reorder point", () => {
    expect(classifyStockHealth(10, 10)).toBe("low-stock");
    expect(classifyStockHealth(5, 10)).toBe("low-stock");
  });

  test("returns in-stock when above reorder point", () => {
    expect(classifyStockHealth(11, 10)).toBe("in-stock");
    expect(classifyStockHealth(100, 10)).toBe("in-stock");
  });

  test("boundary: just above reorder", () => {
    expect(classifyStockHealth(1, 0)).toBe("in-stock");
  });
});

/**
 * End-to-end stock-flow scenario via pure math only.
 * Simulates: receive 100, sell 30, transfer 20 to L2, receive 50 → expect
 * L1=100 L2=20 at the end (after the transfer the sale's already happened).
 *
 * Wait, sell 30 first, then transfer 20.
 *   L1 starts: 0
 *   +stock_in 100  → L1=100
 *   +stock_out -30 → L1=70
 *   +transfer_out -20 (paired) → L1=50
 *   +transfer_in 20 at L2 → L2=20
 *   +stock_in 50 at L1 → L1=100
 */
describe("end-to-end scenario", () => {
  test("compound stock flow lands on expected levels", () => {
    const t = buildTransferPair({
      productId: "p1",
      sourceLocationId: "L1",
      destLocationId: "L2",
      quantity: 20,
      transferGroupId: "t-1",
    });
    const movements: Pick<MovementShape, "productId" | "locationId" | "quantity">[] = [
      { productId: "p1", locationId: "L1", quantity: 100 }, // stock_in
      { productId: "p1", locationId: "L1", quantity: -30 }, // stock_out
      t.source, // transfer_out at L1
      t.dest, // transfer_in at L2
      { productId: "p1", locationId: "L1", quantity: 50 }, // stock_in
    ];
    const map = buildLevelMap(movements);
    expect(map.get("p1|L1")).toBe(100);
    expect(map.get("p1|L2")).toBe(20);
  });
});
