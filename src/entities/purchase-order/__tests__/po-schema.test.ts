/**
 * @jest-environment node
 *
 * Phase 8 coverage — purchase-order form schemas. Receiving has real
 * integrity stakes (double-receive guard lives in the action, but the
 * input contract is the first gate): receiveNow must be a non-negative
 * integer and a receipt must touch at least one line.
 */
import {
  poHeaderFormSchema,
  poLineFormSchema,
  poReceiveFormSchema,
  poReceiveLineSchema,
} from "../model/po-schema";

const U1 = "123e4567-e89b-12d3-a456-426614174000";
const U2 = "123e4567-e89b-12d3-a456-426614174001";
const U3 = "123e4567-e89b-12d3-a456-426614174002";

describe("poHeaderFormSchema", () => {
  test("supplier + warehouse uuids parse; date/notes optional", () => {
    expect(poHeaderFormSchema.safeParse({ supplierId: U1, warehouseId: U2 }).success).toBe(true);
  });

  test("non-uuid supplier fails", () => {
    expect(poHeaderFormSchema.safeParse({ supplierId: "x", warehouseId: U2 }).success).toBe(false);
  });

  test("notes over 1000 chars fail", () => {
    expect(
      poHeaderFormSchema.safeParse({
        supplierId: U1,
        warehouseId: U2,
        notes: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });
});

describe("poLineFormSchema", () => {
  const base = { productId: U1, quantityOrdered: 10, unitCost: "1500.00" };

  test("valid line parses", () => {
    expect(poLineFormSchema.safeParse(base).success).toBe(true);
  });

  test("zero / negative / non-integer ordered qty rejected", () => {
    expect(poLineFormSchema.safeParse({ ...base, quantityOrdered: 0 }).success).toBe(false);
    expect(poLineFormSchema.safeParse({ ...base, quantityOrdered: -1 }).success).toBe(false);
    expect(poLineFormSchema.safeParse({ ...base, quantityOrdered: 1.5 }).success).toBe(false);
  });

  test("unitCost is required and money-formatted", () => {
    expect(poLineFormSchema.safeParse({ productId: U1, quantityOrdered: 1 }).success).toBe(false);
    expect(poLineFormSchema.safeParse({ ...base, unitCost: "1500.555" }).success).toBe(false);
    expect(poLineFormSchema.safeParse({ ...base, unitCost: "0" }).success).toBe(true);
  });
});

describe("poReceiveLineSchema", () => {
  test("receiveNow allows zero (skip this line) but not negative", () => {
    expect(poReceiveLineSchema.safeParse({ lineId: U1, receiveNow: 0 }).success).toBe(true);
    expect(poReceiveLineSchema.safeParse({ lineId: U1, receiveNow: 5 }).success).toBe(true);
    expect(poReceiveLineSchema.safeParse({ lineId: U1, receiveNow: -1 }).success).toBe(false);
  });

  test("non-integer receiveNow rejected", () => {
    expect(poReceiveLineSchema.safeParse({ lineId: U1, receiveNow: 2.5 }).success).toBe(false);
  });
});

describe("poReceiveFormSchema", () => {
  test("at least one line required", () => {
    expect(poReceiveFormSchema.safeParse({ poId: U1, lines: [] }).success).toBe(false);
  });

  test("valid multi-line receipt parses", () => {
    const r = poReceiveFormSchema.safeParse({
      poId: U1,
      lines: [
        { lineId: U2, receiveNow: 3 },
        { lineId: U3, receiveNow: 0 },
      ],
    });
    expect(r.success).toBe(true);
  });
});
