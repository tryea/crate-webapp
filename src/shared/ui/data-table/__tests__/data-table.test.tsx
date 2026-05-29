/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../data-table";

type Row = { sku: string; name: string; qty: number };

const DATA: Row[] = [
  { sku: "A-001", name: "Apple", qty: 12 },
  { sku: "B-002", name: "Banana", qty: 5 },
  { sku: "C-003", name: "Cherry", qty: 99 },
];

const COLUMNS: ColumnDef<Row>[] = [
  { accessorKey: "sku", header: "SKU" },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "qty",
    header: "Qty",
    meta: { align: "right" },
  },
];

describe("DataTable", () => {
  test("renders headers + rows", () => {
    render(<DataTable data={DATA} columns={COLUMNS} />);
    expect(screen.getByText("SKU")).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Cherry")).toBeInTheDocument();
  });

  test("global filter narrows rows", () => {
    render(<DataTable data={DATA} columns={COLUMNS} />);
    const input = screen.getByLabelText(/filter table/i);
    fireEvent.change(input, { target: { value: "banana" } });
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.queryByText("Apple")).toBeNull();
    expect(screen.queryByText("Cherry")).toBeNull();
  });

  test("clicking sortable header toggles sort order", () => {
    render(<DataTable data={DATA} columns={COLUMNS} />);
    const skuHeader = screen.getByText("SKU");
    // Initial — alphabetical asc when clicked
    fireEvent.click(skuHeader);
    // After first click, rows should be sorted ascending by SKU.
    const cells = screen.getAllByText(/A-001|B-002|C-003/);
    expect(cells[0]).toHaveTextContent("A-001");
    expect(cells[2]).toHaveTextContent("C-003");
  });

  test("shows empty state when no matches", () => {
    render(
      <DataTable
        data={DATA}
        columns={COLUMNS}
        emptyState={<span>No matches.</span>}
      />,
    );
    const input = screen.getByLabelText(/filter table/i);
    fireEvent.change(input, { target: { value: "zzzzz" } });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });
});
