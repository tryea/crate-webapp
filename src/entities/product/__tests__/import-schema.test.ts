/**
 * @jest-environment node
 *
 * Closes GH issue #9 — Jest coverage for productImportRowSchema edge
 * cases. Bima's gate per COUNCIL §0 rule 3.
 *
 * The schema is the critical bottleneck for bulk CSV import correctness.
 * Every transformer + every validator gets a spec.
 */
import { productImportRowSchema } from "../model/import-schema";

const minimalValidRaw = {
  sku: "BEV-001",
  name: "Mineral Water 600ml",
};

describe("productImportRowSchema — happy path", () => {
  test("minimal valid input (sku + name) parses with defaults", () => {
    const r = productImportRowSchema.safeParse(minimalValidRaw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sku).toBe("BEV-001");
      expect(r.data.name).toBe("Mineral Water 600ml");
      expect(r.data.unit).toBe("pcs");
      expect(r.data.reorderPoint).toBe(0);
      expect(r.data.costPrice).toBe("0.00");
      expect(r.data.sellingPrice).toBe("0.00");
      expect(r.data.isActive).toBe(true);
      expect(r.data.description).toBeNull();
      expect(r.data.barcode).toBeNull();
      expect(r.data.categorySlug).toBeNull();
      expect(r.data.supplierName).toBeNull();
    }
  });

  test("full valid input round-trips with type coercions", () => {
    const r = productImportRowSchema.safeParse({
      sku: "snk-001", // lowercase → upper
      name: "  Mixed Nuts  ", // trim
      description: "Premium roasted",
      unit: "pack",
      barcode: "8991002101013",
      category_slug: "snacks",
      supplier_name: "Aria Distributors",
      reorder_point: "12",
      cost_price: "12000",
      selling_price: "25000.50",
      is_active: "true",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sku).toBe("SNK-001"); // uppercased
      expect(r.data.name).toBe("Mixed Nuts"); // trimmed
      expect(r.data.unit).toBe("pack");
      expect(r.data.reorderPoint).toBe(12);
      expect(r.data.costPrice).toBe("12000"); // money string passed through
      expect(r.data.sellingPrice).toBe("25000.50");
      expect(r.data.isActive).toBe(true);
      expect(r.data.categorySlug).toBe("snacks");
    }
  });
});

describe("productImportRowSchema — required fields", () => {
  test("missing sku fails with field-level error", () => {
    const r = productImportRowSchema.safeParse({ name: "Foo" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.includes("sku"));
      expect(issue).toBeDefined();
    }
  });

  test("missing name fails with field-level error", () => {
    const r = productImportRowSchema.safeParse({ sku: "BEV-001" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.includes("name"));
      expect(issue).toBeDefined();
    }
  });

  test("blank sku fails", () => {
    const r = productImportRowSchema.safeParse({ sku: "", name: "Foo" });
    expect(r.success).toBe(false);
  });

  test("blank name fails", () => {
    const r = productImportRowSchema.safeParse({ sku: "BEV-001", name: "" });
    expect(r.success).toBe(false);
  });
});

describe("productImportRowSchema — SKU regex", () => {
  test("uppercase alphanumeric + dashes passes", () => {
    for (const sku of ["A", "ABC", "A-B-C", "BEV-001", "STA-001-X9"]) {
      const r = productImportRowSchema.safeParse({ sku, name: "x" });
      expect(r.success).toBe(true);
    }
  });

  test("starting with a dash fails", () => {
    const r = productImportRowSchema.safeParse({ sku: "-BEV-001", name: "x" });
    expect(r.success).toBe(false);
  });

  test("containing a space fails", () => {
    const r = productImportRowSchema.safeParse({ sku: "BEV 001", name: "x" });
    expect(r.success).toBe(false);
  });

  test("containing lowercase fails when uppercased input contains symbol", () => {
    // Lowercase coerces to upper before regex; "a-b" → "A-B" passes,
    // but "a.b" → "A.B" fails (dot is not allowed).
    expect(productImportRowSchema.safeParse({ sku: "a-b", name: "x" }).success).toBe(true);
    expect(productImportRowSchema.safeParse({ sku: "a.b", name: "x" }).success).toBe(false);
  });

  test("longer than 64 chars fails", () => {
    const sku = "A".repeat(65);
    const r = productImportRowSchema.safeParse({ sku, name: "x" });
    expect(r.success).toBe(false);
  });
});

describe("productImportRowSchema — money regex", () => {
  test("zero / no decimals passes", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      cost_price: "0",
      selling_price: "1000",
    });
    expect(r.success).toBe(true);
  });

  test("up to 2 decimals passes", () => {
    expect(
      productImportRowSchema.safeParse({ ...minimalValidRaw, cost_price: "1500.5" }).success,
    ).toBe(true);
    expect(
      productImportRowSchema.safeParse({ ...minimalValidRaw, cost_price: "1500.50" }).success,
    ).toBe(true);
  });

  test("3+ decimals fails", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      cost_price: "1500.555",
    });
    expect(r.success).toBe(false);
  });

  test("negative money fails (regex excludes minus)", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      cost_price: "-1500.00",
    });
    expect(r.success).toBe(false);
  });

  test("scientific notation fails", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      cost_price: "1.5e3",
    });
    expect(r.success).toBe(false);
  });

  test("numeric input is coerced to fixed-2 string", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      cost_price: 1500,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.costPrice).toBe("1500.00");
  });

  test("blank money string defaults to 0.00", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      cost_price: "",
      selling_price: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.costPrice).toBe("0.00");
      expect(r.data.sellingPrice).toBe("0.00");
    }
  });
});

describe("productImportRowSchema — integer coercion", () => {
  test("integer string parses", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      reorder_point: "24",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reorderPoint).toBe(24);
  });

  test("decimal string truncates via parseInt", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      reorder_point: "24.5",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reorderPoint).toBe(24);
  });

  test("numeric input passes through (truncated)", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      reorder_point: 7,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reorderPoint).toBe(7);
  });

  test("blank reorder_point defaults to 0", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      reorder_point: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reorderPoint).toBe(0);
  });

  test("garbage string yields NaN → integer schema rejects", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      reorder_point: "abc",
    });
    expect(r.success).toBe(false);
  });

  test("negative integer fails", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      reorder_point: -5,
    });
    expect(r.success).toBe(false);
  });
});

describe("productImportRowSchema — boolean coercion", () => {
  test("'true' → true", () => {
    const r = productImportRowSchema.safeParse({ ...minimalValidRaw, is_active: "true" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(true);
  });

  test("'false' → false", () => {
    const r = productImportRowSchema.safeParse({ ...minimalValidRaw, is_active: "false" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(false);
  });

  test("'1' / '0' / 'yes' / 'y'", () => {
    expect(
      productImportRowSchema.safeParse({ ...minimalValidRaw, is_active: "1" }).success &&
        productImportRowSchema.parse({ ...minimalValidRaw, is_active: "1" }).isActive,
    ).toBe(true);
    expect(
      productImportRowSchema.parse({ ...minimalValidRaw, is_active: "0" }).isActive,
    ).toBe(false);
    expect(
      productImportRowSchema.parse({ ...minimalValidRaw, is_active: "yes" }).isActive,
    ).toBe(true);
    expect(
      productImportRowSchema.parse({ ...minimalValidRaw, is_active: "Y" }).isActive,
    ).toBe(true);
  });

  test("native true / false pass through", () => {
    expect(
      productImportRowSchema.parse({ ...minimalValidRaw, is_active: true }).isActive,
    ).toBe(true);
    expect(
      productImportRowSchema.parse({ ...minimalValidRaw, is_active: false }).isActive,
    ).toBe(false);
  });

  test("blank string defaults to true (active)", () => {
    expect(
      productImportRowSchema.parse({ ...minimalValidRaw, is_active: "" }).isActive,
    ).toBe(true);
  });

  test("garbage string defaults to false (anything-not-truthy)", () => {
    expect(
      productImportRowSchema.parse({ ...minimalValidRaw, is_active: "maybe" }).isActive,
    ).toBe(false);
  });
});

describe("productImportRowSchema — trimToNull on optional fields", () => {
  test("blank description / image / barcode → null", () => {
    const r = productImportRowSchema.parse({
      ...minimalValidRaw,
      description: "",
      image_url: "   ",
      barcode: "",
    });
    expect(r.description).toBeNull();
    expect(r.imageUrl).toBeNull();
    expect(r.barcode).toBeNull();
  });

  test("whitespace-only category_slug / supplier_name → null", () => {
    const r = productImportRowSchema.parse({
      ...minimalValidRaw,
      category_slug: "   ",
      supplier_name: "",
    });
    expect(r.categorySlug).toBeNull();
    expect(r.supplierName).toBeNull();
  });
});

describe("productImportRowSchema — length caps", () => {
  test("description over 2000 chars fails", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      description: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  test("name over 200 chars fails", () => {
    const r = productImportRowSchema.safeParse({
      ...minimalValidRaw,
      name: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });
});
