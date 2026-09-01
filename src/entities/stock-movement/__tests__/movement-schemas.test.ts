/**
 * @jest-environment node
 *
 * Phase 8 coverage: stock-movement FORM schemas (movement-schemas.ts).
 * These are the validation SSOT the server actions re-parse before any write
 * (COUNCIL §0 rule 5 + §4.3). The domain math already has 34 specs; this
 * fills the gap on the per-flow input contracts: reason partitioning,
 * positive-int quantities, the transfer source≠dest refine, and the
 * adjustment signed-delta + mandatory-note rules.
 */
import {
  stockInFormSchema,
  stockOutFormSchema,
  transferFormSchema,
  adjustmentFormSchema,
} from "../model/movement-schemas";

const U1 = "123e4567-e89b-12d3-a456-426614174000";
const U2 = "123e4567-e89b-12d3-a456-426614174001";
const U3 = "123e4567-e89b-12d3-a456-426614174002";

describe("stockInFormSchema", () => {
  const base = { productId: U1, locationId: U2, quantity: 5, reason: "purchase" as const };

  test("minimal valid receive parses", () => {
    expect(stockInFormSchema.safeParse(base).success).toBe(true);
  });

  test.each(["purchase", "return_from_customer", "other"])("accepts receive reason %p", (reason) => {
    expect(stockInFormSchema.safeParse({ ...base, reason }).success).toBe(true);
  });

  test.each(["sale", "damage", "lost", "transfer", "count_correction"])(
    "rejects non-receive reason %p",
    (reason) => {
      expect(stockInFormSchema.safeParse({ ...base, reason }).success).toBe(false);
    },
  );

  test("non-uuid product / location fail", () => {
    expect(stockInFormSchema.safeParse({ ...base, productId: "nope" }).success).toBe(false);
    expect(stockInFormSchema.safeParse({ ...base, locationId: "nope" }).success).toBe(false);
  });

  test("optional unitCost accepts blank, money, or omission; rejects bad money", () => {
    expect(stockInFormSchema.safeParse({ ...base, unitCost: "" }).success).toBe(true);
    expect(stockInFormSchema.safeParse({ ...base, unitCost: "1500.00" }).success).toBe(true);
    expect(stockInFormSchema.safeParse({ ...base }).success).toBe(true);
    expect(stockInFormSchema.safeParse({ ...base, unitCost: "1500.555" }).success).toBe(false);
    expect(stockInFormSchema.safeParse({ ...base, unitCost: "-5" }).success).toBe(false);
  });
});

describe("POSITIVE_INT quantity (shared across in/out)", () => {
  const inBase = { productId: U1, locationId: U2, reason: "purchase" as const };
  test("zero is rejected (must be > 0)", () => {
    expect(stockInFormSchema.safeParse({ ...inBase, quantity: 0 }).success).toBe(false);
  });
  test("negative is rejected", () => {
    expect(stockInFormSchema.safeParse({ ...inBase, quantity: -3 }).success).toBe(false);
  });
  test("non-integer is rejected", () => {
    expect(stockInFormSchema.safeParse({ ...inBase, quantity: 2.5 }).success).toBe(false);
  });
  test("positive integer is accepted", () => {
    expect(stockInFormSchema.safeParse({ ...inBase, quantity: 7 }).success).toBe(true);
  });
});

describe("stockOutFormSchema", () => {
  const base = { productId: U1, locationId: U2, quantity: 3, reason: "sale" as const };

  test("minimal valid issue parses (magnitude positive, server flips sign)", () => {
    expect(stockOutFormSchema.safeParse(base).success).toBe(true);
  });

  test.each(["sale", "damage", "lost", "return_to_supplier", "other"])(
    "accepts issue reason %p",
    (reason) => {
      expect(stockOutFormSchema.safeParse({ ...base, reason }).success).toBe(true);
    },
  );

  test.each(["purchase", "return_from_customer", "transfer", "count_correction"])(
    "rejects non-issue reason %p",
    (reason) => {
      expect(stockOutFormSchema.safeParse({ ...base, reason }).success).toBe(false);
    },
  );
});

describe("transferFormSchema", () => {
  const base = {
    productId: U1,
    sourceLocationId: U2,
    destLocationId: U3,
    quantity: 4,
  };

  test("valid transfer between distinct locations parses", () => {
    expect(transferFormSchema.safeParse(base).success).toBe(true);
  });

  test("same source and destination is rejected (refine) with dest path", () => {
    const r = transferFormSchema.safeParse({ ...base, destLocationId: U2 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("destLocationId"))).toBe(true);
    }
  });

  test("zero quantity rejected", () => {
    expect(transferFormSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
  });
});

describe("adjustmentFormSchema", () => {
  const base = {
    productId: U1,
    locationId: U2,
    delta: -2,
    reason: "count_correction" as const,
    notes: "Cycle count variance",
  };

  test("valid signed-down adjustment with a note parses", () => {
    expect(adjustmentFormSchema.safeParse(base).success).toBe(true);
  });

  test("positive delta (found extra) parses", () => {
    expect(adjustmentFormSchema.safeParse({ ...base, delta: 3 }).success).toBe(true);
  });

  test("zero delta is rejected", () => {
    const r = adjustmentFormSchema.safeParse({ ...base, delta: 0 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("delta"))).toBe(true);
    }
  });

  test("non-integer delta is rejected", () => {
    expect(adjustmentFormSchema.safeParse({ ...base, delta: 1.5 }).success).toBe(false);
  });

  test("missing note is rejected (adjustments require a reason)", () => {
    const r = adjustmentFormSchema.safeParse({ ...base, notes: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("notes"))).toBe(true);
    }
  });

  test.each(["count_correction", "damage", "lost", "other"])("accepts reason %p", (reason) => {
    expect(adjustmentFormSchema.safeParse({ ...base, reason }).success).toBe(true);
  });

  test("rejects a non-adjustment reason like 'sale'", () => {
    expect(adjustmentFormSchema.safeParse({ ...base, reason: "sale" }).success).toBe(false);
  });
});
