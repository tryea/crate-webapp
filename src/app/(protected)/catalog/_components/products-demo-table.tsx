"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type ColumnAlign } from "@/shared/ui/data-table";
import { StockStatusBadge, type StockStatus } from "@/shared/ui/stock-status-badge";

type DemoProduct = {
  sku: string;
  name: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  onHand: number;
  reorderPoint: number;
  status: StockStatus;
};

const FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// Static demo data — not synthetic claims, just example structure.
// Real data lands in Phase 4 when product CRUD + DB are wired.
const DEMO_DATA: DemoProduct[] = [
  { sku: "BEV-001", name: "Mineral Water 600ml", category: "Beverages", costPrice: 1500, sellingPrice: 3500, onHand: 120, reorderPoint: 24, status: "in-stock" },
  { sku: "BEV-002", name: "Cold Brew Coffee 250ml", category: "Beverages", costPrice: 8500, sellingPrice: 18000, onHand: 18, reorderPoint: 12, status: "in-stock" },
  { sku: "SNK-001", name: "Mixed Nuts 200g", category: "Snacks", costPrice: 12000, sellingPrice: 25000, onHand: 8, reorderPoint: 10, status: "low-stock" },
  { sku: "STA-001", name: "A5 Notebook · 80gsm", category: "Stationery", costPrice: 9000, sellingPrice: 19500, onHand: 0, reorderPoint: 20, status: "out-of-stock" },
  { sku: "CLN-001", name: "All-Purpose Cleaner 1L", category: "Cleaning", costPrice: 18000, sellingPrice: 38000, onHand: 42, reorderPoint: 6, status: "in-stock" },
  { sku: "BEV-003", name: "Iced Tea 330ml", category: "Beverages", costPrice: 2500, sellingPrice: 6000, onHand: 64, reorderPoint: 18, status: "on-transit" },
];

export function ProductsDemoTable() {
  const columns = useMemo<ColumnDef<DemoProduct>[]>(
    () => [
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.sku}</span>
        ),
        size: 120,
      },
      { accessorKey: "name", header: "Name", size: 280 },
      { accessorKey: "category", header: "Category", size: 140 },
      {
        accessorKey: "onHand",
        header: "On hand",
        meta: { align: "right" as ColumnAlign },
        cell: ({ row }) => <span className="tabular-nums">{row.original.onHand}</span>,
        size: 90,
      },
      {
        accessorKey: "reorderPoint",
        header: "Reorder",
        meta: { align: "right" as ColumnAlign },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.reorderPoint}
          </span>
        ),
        size: 90,
      },
      {
        accessorKey: "costPrice",
        header: "Cost",
        meta: { align: "right" as ColumnAlign },
        cell: ({ row }) => (
          <span className="tabular-nums">{FORMATTER.format(row.original.costPrice)}</span>
        ),
        size: 110,
      },
      {
        accessorKey: "sellingPrice",
        header: "Selling",
        meta: { align: "right" as ColumnAlign },
        cell: ({ row }) => (
          <span className="tabular-nums">{FORMATTER.format(row.original.sellingPrice)}</span>
        ),
        size: 110,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StockStatusBadge status={row.original.status} />,
        size: 120,
      },
    ],
    [],
  );

  return (
    <DataTable
      data={DEMO_DATA}
      columns={columns}
      pageSize={50}
      filterPlaceholder="Filter SKU / name / category…"
    />
  );
}
