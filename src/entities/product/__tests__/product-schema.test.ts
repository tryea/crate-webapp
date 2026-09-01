/**
 * @jest-environment node
 *
 * Phase 8 coverage: productFormSchema (strict, no transforms so RHF's
 * Resolver generic stays sound) + the pure toProductInsert normalizer.
 * Distinct from import-schema.test.ts, which covers the CSV-side coercing
 * schema. Here lowercase SKU must FAIL (no uppercasing on the form path).
 */
import {
  productFormSchema,
  toProductInsert,
  type ProductFormValues,
} from "../model/product-schema";

const valid: ProductFormValues = {
  sku: "BEV-001",
  name: "Mineral Water 600ml",
  description: "",
  imageUrl: "",
  unit: "pcs",
  categoryId: "",
  supplierId: "",
  barcode: "",
  reorderPoint: 0,
  costPrice: "0.00",
  sellingPrice: "0.00",
  isActive: true,
};

describe("productFormSchema: happy path", () => {
  test("minimal valid object parses", () => {
    expect(productFormSchema.safeParse(valid).success).toBe(true);
  });
});

describe("productFormSchema: SKU regex (no coercion on form path)", () => {
  test.each(["A", "BEV-001", "STA-001-X9", "9-A"])("accepts %p", (sku) => {
    expect(productFormSchema.safeParse({ ...valid, sku }).success).toBe(true);
  });

  test("lowercase SKU FAILS here (unlike the import schema which uppercases)", () => {
    expect(productFormSchema.safeParse({ ...valid, sku: "bev-001" }).success).toBe(false);
  });

  test.each(["-BEV", "BEV 001", "BE.V", "", "x".repeat(65)])("rejects %p", (sku) => {
    expect(productFormSchema.safeParse({ ...valid, sku }).success).toBe(false);
  });
});

describe("productFormSchema: reorderPoint (number, int, >= 0)", () => {
  test("zero and positive integers pass", () => {
    expect(productFormSchema.safeParse({ ...valid, reorderPoint: 0 }).success).toBe(true);
    expect(productFormSchema.safeParse({ ...valid, reorderPoint: 25 }).success).toBe(true);
  });

  test("negative fails", () => {
    expect(productFormSchema.safeParse({ ...valid, reorderPoint: -1 }).success).toBe(false);
  });

  test("non-integer fails", () => {
    expect(productFormSchema.safeParse({ ...valid, reorderPoint: 1.5 }).success).toBe(false);
  });

  test("string is NOT coerced: fails", () => {
    expect(productFormSchema.safeParse({ ...valid, reorderPoint: "5" }).success).toBe(false);
  });
});

describe("productFormSchema: money fields", () => {
  test.each(["0", "1500", "1500.5", "1500.50"])("accepts %p", (m) => {
    expect(productFormSchema.safeParse({ ...valid, costPrice: m }).success).toBe(true);
  });

  test.each(["1500.555", "-1500.00", "1.5e3", ""])("rejects %p", (m) => {
    expect(productFormSchema.safeParse({ ...valid, sellingPrice: m }).success).toBe(false);
  });
});

describe("productFormSchema: required scalars", () => {
  test("blank name / unit fail", () => {
    expect(productFormSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...valid, unit: "" }).success).toBe(false);
  });

  test("isActive is not coerced from string", () => {
    expect(productFormSchema.safeParse({ ...valid, isActive: "true" }).success).toBe(false);
  });
});

describe("toProductInsert: blank-to-null normalization", () => {
  test("blank and whitespace-only optionals become null", () => {
    const out = toProductInsert({
      ...valid,
      description: "",
      imageUrl: "   ",
      categoryId: "",
      supplierId: "  ",
      barcode: "",
    });
    expect(out.description).toBeNull();
    expect(out.imageUrl).toBeNull();
    expect(out.categoryId).toBeNull();
    expect(out.supplierId).toBeNull();
    expect(out.barcode).toBeNull();
  });

  test("non-blank optionals and required fields pass through", () => {
    const out = toProductInsert({
      ...valid,
      description: "Premium",
      categoryId: "cat-1",
      costPrice: "12000.00",
    });
    expect(out.description).toBe("Premium");
    expect(out.categoryId).toBe("cat-1");
    expect(out.sku).toBe("BEV-001");
    expect(out.costPrice).toBe("12000.00"); // money stays a string for numeric(14,2)
    expect(out.reorderPoint).toBe(0);
    expect(out.isActive).toBe(true);
  });
});
