/**
 * @jest-environment jsdom
 *
 * The unit specs in global-filter.test.ts prove the helper is right. These
 * prove the TABLE actually uses it, which is where the defect lived: the helper
 * could be perfect and the filter still blind if the options never reach
 * TanStack.
 *
 * Every case below is a query that returned nothing on the live movements
 * ledger on 3 September 2026, plus the shape that caused it.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../data-table";

type Row = {
  id: string;
  productName: string;
  productSku: string;
  supplierId: string;
  reason: string;
  reference: string | null;
};

const SUPPLIERS = new Map([["sup-1", "Aria Distributors"]]);

const DATA: Row[] = [
  {
    // First row on purpose: its `reference` is null, which is what used to
    // switch the whole reference column off for every other row.
    id: "3f0a1c9e-77aa-4b21-9d0e-a1b2c3d4e5f6",
    productName: "Cold Brew Coffee 250ml",
    productSku: "BEV-002",
    supplierId: "sup-1",
    reason: "count_correction",
    reference: null,
  },
  {
    id: "11111111-2222-3333-4444-555555555555",
    productName: "Mineral Water 600ml",
    productSku: "BEV-001",
    supplierId: "sup-1",
    reason: "sale",
    reference: "SO-2026-0217",
  },
];

const COLUMNS: ColumnDef<Row>[] = [
  {
    // Cell-only, exactly like the movements Product column: no accessorKey, so
    // TanStack refused to search it at all.
    id: "product",
    header: "Product",
    cell: ({ row }) => (
      <span>
        {row.original.productName} {row.original.productSku}
      </span>
    ),
  },
  {
    // Cell-only AND rendered from a lookup map, like the products Supplier
    // column: the row holds the id only, so the text has to be supplied.
    id: "supplier",
    header: "Supplier",
    meta: {
      searchValue: (row: Row) => SUPPLIERS.get(row.supplierId) ?? null,
    },
    cell: ({ row }) => <span>{SUPPLIERS.get(row.original.supplierId)}</span>,
  },
  {
    accessorKey: "reason",
    header: "Reason",
    cell: ({ row }) => <span>{row.original.reason.replace(/_/g, " ")}</span>,
  },
  { accessorKey: "reference", header: "Reference" },
];

function renderTable() {
  render(
    <DataTable
      data={DATA}
      columns={COLUMNS}
      emptyState={<span>No movements yet.</span>}
    />,
  );
  return screen.getByLabelText(/filter table/i);
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("DataTable global filter wiring", () => {
  test("finds a cell-only column, multi-word (cause A)", () => {
    const input = renderTable();
    type(input, "Mineral Water");
    expect(screen.getByText(/Mineral Water 600ml/)).toBeInTheDocument();
    expect(screen.queryByText(/Cold Brew Coffee/)).toBeNull();
  });

  test("finds a SKU that only exists inside a cell-only column (cause A)", () => {
    const input = renderTable();
    type(input, "BEV-001");
    expect(screen.getByText(/Mineral Water 600ml/)).toBeInTheDocument();
    expect(screen.queryByText(/Cold Brew Coffee/)).toBeNull();
  });

  test("finds a reference although the FIRST row has none (cause B)", () => {
    const input = renderTable();
    type(input, "SO-2026-0217");
    expect(screen.getByText(/Mineral Water 600ml/)).toBeInTheDocument();
    expect(screen.queryByText(/Cold Brew Coffee/)).toBeNull();
  });

  test("finds a reason typed the way the screen spells it (cause C)", () => {
    const input = renderTable();
    type(input, "count correction");
    expect(screen.getByText(/Cold Brew Coffee/)).toBeInTheDocument();
    expect(screen.queryByText(/Mineral Water 600ml/)).toBeNull();
  });

  test("finds text supplied by meta.searchValue, which no row carries", () => {
    const input = renderTable();
    type(input, "Aria Distributors");
    expect(screen.getByText(/Cold Brew Coffee/)).toBeInTheDocument();
    expect(screen.getByText(/Mineral Water 600ml/)).toBeInTheDocument();
  });

  test("does not match on a uuid fragment", () => {
    const input = renderTable();
    type(input, "3f0a1c9e");
    expect(screen.queryByText(/Cold Brew Coffee/)).toBeNull();
    expect(screen.queryByText(/Mineral Water 600ml/)).toBeNull();
  });

  test("filters even when NO column survives the row-zero type sniff", () => {
    // The dangerous shape: the only accessor column holds a Date, and every
    // other column is cell-only. TanStack would then rule that nothing is
    // globally filterable and never call the filter at all, so the table would
    // quietly show every row for every query. This is what
    // getColumnCanGlobalFilter guards; without it this test shows both rows.
    type DateRow = { id: string; createdAt: Date; label: string };
    const rows: DateRow[] = [
      { id: "a-1", createdAt: new Date("2026-08-12T09:35:00Z"), label: "Alpha" },
      { id: "b-2", createdAt: new Date("2026-08-11T09:35:00Z"), label: "Beta" },
    ];
    const columns: ColumnDef<DateRow>[] = [
      { accessorKey: "createdAt", header: "When", cell: () => <span>when</span> },
      { id: "label", header: "Label", cell: ({ row }) => <span>{row.original.label}</span> },
    ];

    render(
      <DataTable
        data={rows}
        columns={columns}
        emptyState={<span>Nothing here.</span>}
      />,
    );
    const input = screen.getAllByLabelText(/filter table/i)[0];
    type(input, "Alpha");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).toBeNull();
  });

  test("still rejects a query that matches nothing", () => {
    const input = renderTable();
    type(input, "zzzzz");
    expect(screen.queryByText(/Cold Brew Coffee/)).toBeNull();
    expect(screen.queryByText(/Mineral Water 600ml/)).toBeNull();
  });
});

describe("DataTable empty states tell the two causes apart", () => {
  test("a filter that matches nothing says so, and does NOT claim there is no data", () => {
    const input = renderTable();
    type(input, "zzzzz");
    expect(screen.getByText(/No match for/)).toBeInTheDocument();
    expect(screen.getByText(/zzzzz/)).toBeInTheDocument();
    // the "no data yet" copy would be a lie here: the rows exist
    expect(screen.queryByText("No movements yet.")).toBeNull();
  });

  test("no data at all still shows the table's own empty state", () => {
    render(
      <DataTable
        data={[]}
        columns={COLUMNS}
        emptyState={<span>No movements yet.</span>}
      />,
    );
    expect(screen.getByText("No movements yet.")).toBeInTheDocument();
    expect(screen.queryByText(/No match for/)).toBeNull();
  });

  test("clearing the filter brings every row back", () => {
    const input = renderTable();
    type(input, "zzzzz");
    fireEvent.click(screen.getByRole("button", { name: /show all rows/i }));
    expect(screen.getByText(/Cold Brew Coffee/)).toBeInTheDocument();
    expect(screen.getByText(/Mineral Water 600ml/)).toBeInTheDocument();
    expect(screen.queryByText(/No match for/)).toBeNull();
  });
});
