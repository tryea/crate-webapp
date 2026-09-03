import {
  matchesSearchQuery,
  normaliseSearchText,
  rowHaystack,
} from "../global-filter";

/**
 * The rows below are shaped like a real movements row, because every case here
 * is a query that was typed into the live table on 3 Sep 2026 and came back
 * with nothing (CPP-FILTER-1).
 */
type MovementRow = {
  id: string;
  createdAt: Date;
  type: string;
  productId: string;
  productName: string | null;
  productSku: string | null;
  locationCode: string | null;
  quantity: number;
  reason: string;
  reference: string | null;
  transferGroupId: string | null;
};

const adjustment: MovementRow = {
  id: "3f0a1c9e-77aa-4b21-9d0e-a1b2c3d4e5f6",
  createdAt: new Date("2026-08-12T09:35:00.000Z"),
  type: "adjustment",
  productId: "9c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
  productName: "Cold Brew Coffee 250ml",
  productSku: "BEV-002",
  locationCode: "A1",
  quantity: -2,
  reason: "count_correction",
  reference: null,
  transferGroupId: null,
};

const sale: MovementRow = {
  ...adjustment,
  id: "11111111-2222-3333-4444-555555555555",
  type: "stock_out",
  productName: "Mineral Water 600ml",
  productSku: "BEV-001",
  locationCode: "B1",
  quantity: -9,
  reason: "sale",
  reference: "SO-2026-0217",
};

const hay = (row: MovementRow) => rowHaystack(row);
const finds = (row: MovementRow, query: string) =>
  matchesSearchQuery(hay(row), query);

describe("normaliseSearchText", () => {
  it("lowercases, turns underscores into spaces and collapses whitespace", () => {
    expect(normaliseSearchText("  Count_Correction   NOW ")).toBe(
      "count correction now",
    );
  });
});

describe("rowHaystack", () => {
  it("keeps text that a cell-only column renders from the row", () => {
    // `product` and `location` have no accessorKey, so TanStack never saw them.
    expect(hay(adjustment)).toContain("cold brew coffee 250ml");
    expect(hay(adjustment)).toContain("bev-002");
    expect(hay(adjustment)).toContain("a1");
  });

  it("leaves out ids, so a short query cannot collide with a uuid", () => {
    const text = hay(adjustment);
    expect(text).not.toContain("3f0a1c9e");
    expect(text).not.toContain("9c1d2e3f");
  });

  it("leaves out dates, whose text form depends on locale and runtime", () => {
    expect(hay(adjustment)).not.toContain("2026");
  });

  it("adds text supplied by a column that renders from a lookup map", () => {
    const suppliers = new Map([["s-1", "Aria Distributors"]]);
    const row = { supplierId: "s-1", name: "A5 Notebook" };
    const text = rowHaystack(row, [
      (r: typeof row) => suppliers.get(r.supplierId) ?? null,
    ]);
    expect(text).toContain("aria distributors");
    // proves the value came from the map: the row on its own has no name for it
    expect(rowHaystack(row)).not.toContain("aria distributors");
  });

  it("reaches one level into a nested object such as an audit diff", () => {
    const text = rowHaystack({ diff: { reorderPoint: "24 to 30" } });
    expect(text).toContain("24 to 30");
  });
});

describe("matchesSearchQuery", () => {
  it("matches a two-word query against an underscored stored value", () => {
    // The exact failure this ticket exists for: the screen shows
    // "count correction", the database stores "count_correction".
    expect(finds(adjustment, "count correction")).toBe(true);
  });

  it("still matches either single word on its own", () => {
    expect(finds(adjustment, "count")).toBe(true);
    expect(finds(adjustment, "correction")).toBe(true);
  });

  it("ignores case", () => {
    expect(finds(adjustment, "COUNT CORRECTION")).toBe(true);
    expect(finds(sale, "mineral WATER")).toBe(true);
  });

  it("ignores word order and extra spaces", () => {
    expect(finds(adjustment, "correction   count")).toBe(true);
  });

  it("matches a reference even though the first row of the table has none", () => {
    // The old default read row 0 to decide whether `reference` was searchable.
    expect(finds(sale, "SO-2026-0217")).toBe(true);
  });

  it("does not match a row that lacks one of the tokens", () => {
    expect(finds(adjustment, "count transfer")).toBe(false);
    expect(finds(sale, "count correction")).toBe(false);
  });

  it("does not match a query that only appears in an id", () => {
    expect(finds(adjustment, "3f0a1c9e")).toBe(false);
  });

  it("treats an empty query as no filter at all", () => {
    expect(finds(adjustment, "")).toBe(true);
    expect(finds(adjustment, "   ")).toBe(true);
  });
});
