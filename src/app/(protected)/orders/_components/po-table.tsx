"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type ColumnAlign } from "@/shared/ui/data-table";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { EmptyState } from "@/shared/ui/empty-state";
import { cn } from "@/shared/lib/utils";
import { PoCreateDialog } from "./po-create-dialog";

export interface PoTableRow {
  id: string;
  poNumber: string;
  supplierName: string | null;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  expectedDate: string | null;
  createdAt: Date | string;
  totalOrdered: string;
  lineCount: number;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const MONEY_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const STATUS_CLASSES: Record<PoTableRow["status"], string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-info/10 text-info border-info/20",
  partial: "bg-warning/10 text-warning border-warning/30",
  received: "bg-success/10 text-success border-success/20",
  cancelled: "bg-muted text-muted-foreground border-border line-through",
};

const STATUS_LABEL: Record<PoTableRow["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};

export function PoTable({
  initial,
  canManage,
  suppliers,
  warehouses,
}: {
  initial: PoTableRow[];
  canManage: boolean;
  suppliers: Array<{ id: string; name: string }>;
  warehouses: Array<{ id: string; name: string; code: string }>;
}) {
  const [open, setOpen] = useState(false);

  const columns = useMemo<ColumnDef<PoTableRow>[]>(
    () => [
      {
        accessorKey: "poNumber",
        header: "PO",
        size: 130,
        cell: ({ row }) => (
          <Link
            href={`/orders/${row.original.id}`}
            className="font-mono text-xs underline-offset-2 hover:underline decoration-muted-foreground/30"
          >
            {row.original.poNumber}
          </Link>
        ),
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        size: 220,
        cell: ({ row }) =>
          row.original.supplierName ?? (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 110,
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn("font-medium border", STATUS_CLASSES[row.original.status])}
          >
            {STATUS_LABEL[row.original.status]}
          </Badge>
        ),
      },
      {
        accessorKey: "lineCount",
        header: "Lines",
        meta: { align: "right" as ColumnAlign },
        size: 70,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.lineCount}
          </span>
        ),
      },
      {
        accessorKey: "totalOrdered",
        header: "Ordered value",
        meta: { align: "right" as ColumnAlign },
        size: 140,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {MONEY_FMT.format(Number(row.original.totalOrdered))}
          </span>
        ),
      },
      {
        accessorKey: "expectedDate",
        header: "Expected",
        size: 130,
        cell: ({ row }) =>
          row.original.expectedDate ? (
            <span className="text-xs">
              {DATE_FMT.format(new Date(row.original.expectedDate))}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 130,
        cell: ({ row }) => (
          <span className="font-mono text-[10px] text-muted-foreground">
            {DATE_FMT.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      {canManage ? (
        <div className="flex items-center justify-end pb-3">
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="size-3.5" /> New PO
          </Button>
        </div>
      ) : null}

      <DataTable
        data={initial}
        columns={columns}
        filterPlaceholder="Filter by PO number, supplier, status…"
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title="No purchase orders yet"
            description={
              canManage
                ? "Draft a PO to start tracking incoming stock."
                : "No POs created yet."
            }
            action={
              canManage ? (
                <Button onClick={() => setOpen(true)}>Draft PO</Button>
              ) : null
            }
          />
        }
      />

      <PoCreateDialog
        open={open}
        onOpenChange={setOpen}
        suppliers={suppliers}
        warehouses={warehouses}
      />
    </>
  );
}
