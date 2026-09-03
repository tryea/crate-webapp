import {
  matchesSearchQuery,
  rowHaystack,
  type RowSearchValue,
} from "../global-filter";

/**
 * A placeholder is a promise the table makes to whoever types in it. This file
 * holds every promise the nine tables currently make, next to a row shaped like
 * the real one, and checks the promise is kept.
 *
 * If a placeholder changes, change it here too. If a promise cannot be kept,
 * the placeholder is what gives way: a small promise kept beats a large one
 * broken.
 */
type Promised = {
  table: string;
  placeholder: string;
  row: Record<string, unknown>;
  searchValues?: RowSearchValue<Record<string, unknown>>[];
  /** One query per noun the placeholder names, spelled as the screen spells it. */
  queries: string[];
};

const CATEGORIES = new Map([["cat-1", "Beverages"]]);
const SUPPLIERS = new Map([["sup-1", "Aria Distributors"]]);

const TABLES: Promised[] = [
  {
    table: "warehouses",
    placeholder: "Filter by name, code, address…",
    row: { id: "w-1", name: "Jakarta Central", code: "JKT-C", address: "Jl. Sudirman 40" },
    queries: ["Jakarta Central", "JKT-C", "Sudirman"],
  },
  {
    table: "locations",
    placeholder: "Filter by code or label…",
    row: { id: "l-1", warehouseId: "w-1", code: "A1", name: "Aisle 1 front" },
    queries: ["A1", "Aisle 1 front"],
  },
  {
    table: "suppliers",
    placeholder: "Filter by name, email, phone…",
    row: {
      id: "s-1",
      name: "Aria Distributors",
      contactEmail: "sales@aria.test",
      contactPhone: "+62 812 3456 7890",
    },
    queries: ["Aria Distributors", "sales@aria.test", "812 3456"],
  },
  {
    table: "products",
    placeholder: "Filter by SKU, name, category, supplier…",
    row: {
      id: "p-1",
      sku: "BEV-002",
      name: "Cold Brew Coffee 250ml",
      categoryId: "cat-1",
      supplierId: "sup-1",
    },
    // category and supplier render from lookup maps, so the row cannot carry them
    searchValues: [
      (r) => CATEGORIES.get(r.categoryId as string) ?? null,
      (r) => SUPPLIERS.get(r.supplierId as string) ?? null,
    ],
    queries: ["BEV-002", "Cold Brew Coffee", "Beverages", "Aria Distributors"],
  },
  {
    table: "categories",
    placeholder: "Filter by name or slug…",
    row: { id: "c-1", name: "Beverages", slug: "beverages" },
    queries: ["Beverages", "beverages"],
  },
  {
    table: "audit",
    placeholder: "Filter by user, action, resource type…",
    row: {
      id: "a-1",
      userName: "Mira Manager",
      userEmail: "manager@crate.local",
      action: "stock_out",
      resourceType: "stock_movement",
      resourceId: "3f0a1c9e-77aa-4b21-9d0e-a1b2c3d4e5f6",
      diff: { quantity: -9, reason: "sale" },
    },
    // spelled as the screen spells them: underscores are rendered as spaces
    queries: ["Mira Manager", "manager@crate.local", "stock out", "stock movement"],
  },
  {
    table: "movements",
    placeholder: "Filter by product, SKU, reason, reference…",
    row: {
      id: "m-1",
      productId: "p-1",
      productName: "Cold Brew Coffee 250ml",
      productSku: "BEV-002",
      reason: "count_correction",
      reference: "SO-2026-0217",
    },
    queries: ["Cold Brew Coffee", "BEV-002", "count correction", "SO-2026-0217"],
  },
  {
    table: "users",
    placeholder: "Filter by name, email, role…",
    row: { id: "u-1", name: "Mira Manager", email: "manager@crate.local", role: "manager" },
    queries: ["Mira Manager", "manager@crate.local", "manager"],
  },
  {
    table: "orders",
    placeholder: "Filter by PO number, supplier, status…",
    row: {
      id: "po-1",
      poNumber: "PO-2026-011",
      supplierName: "Aria Distributors",
      status: "partial",
    },
    queries: ["PO-2026-011", "Aria Distributors", "Partial"],
  },
];

describe("every placeholder promise is kept", () => {
  test.each(TABLES)("$table: $placeholder", ({ row, searchValues, queries }) => {
    const haystack = rowHaystack(row, searchValues ?? []);
    for (const query of queries) {
      expect({ query, found: matchesSearchQuery(haystack, query) }).toEqual({
        query,
        found: true,
      });
    }
  });

  test("nine tables are covered, and the count is asserted so a new one cannot slip in", () => {
    expect(TABLES).toHaveLength(9);
  });

  test("a resource id is NOT promised, and is NOT searchable", () => {
    // Deliberate: ids are excluded so a short query cannot collide with a uuid.
    // The audit placeholder was narrowed to "resource type" to match.
    const audit = TABLES.find((t) => t.table === "audit");
    expect(audit?.placeholder).not.toMatch(/diff|resource,/);
    const haystack = rowHaystack(audit?.row ?? {});
    expect(matchesSearchQuery(haystack, "3f0a1c9e")).toBe(false);
  });
});
