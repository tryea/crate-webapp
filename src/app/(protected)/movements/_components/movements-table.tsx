"use client";

import { useMemo } from "react";
import { useFormatter } from "next-intl";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Boxes,
  ScrollText,
  Wrench,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type ColumnAlign } from "@/shared/ui/data-table";
import { Badge } from "@/shared/ui/badge";
import { EmptyState } from "@/shared/ui/empty-state";
import { cn } from "@/shared/lib/utils";

export interface MovementRow {
  id: string;
  type: "stock_in" | "stock_out" | "transfer_in" | "transfer_out" | "adjustment";
  reason: string;
  quantity: number;
  reference: string | null;
  notes: string | null;
  transferGroupId: string | null;
  createdAt: Date | string;
  productSku: string | null;
  productName: string | null;
  locationCode: string | null;
}

const TYPE_META: Record<
  MovementRow["type"],
  { label: string; icon: React.ComponentType<{ className?: string }>; classes: string }
> = {
  stock_in: { label: "Stock in", icon: ArrowDown, classes: "bg-success/10 text-success-text border-success/20" },
  stock_out: { label: "Stock out", icon: ArrowUp, classes: "bg-destructive/10 text-destructive-text border-destructive/20" },
  transfer_in: { label: "Transfer in", icon: ArrowDown, classes: "bg-info/10 text-info-text border-info/20" },
  transfer_out: { label: "Transfer out", icon: ArrowUp, classes: "bg-info/10 text-info-text border-info/20" },
  adjustment: { label: "Adjustment", icon: Wrench, classes: "bg-warning/10 text-warning-text border-warning/30" },
};

export function MovementsTable({ initial }: { initial: MovementRow[] }) {
  const format = useFormatter();
  const columns = useMemo<ColumnDef<MovementRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        size: 160,
        cell: ({ row }) => (
          <span className="font-mono text-[11px]">
            {format.dateTime(new Date(row.original.createdAt), "dateTime")}
          </span>
        ),
      },
      {
        id: "type",
        header: "Type",
        size: 130,
        cell: ({ row }) => {
          const meta = TYPE_META[row.original.type];
          const Icon = meta.icon;
          return (
            <Badge
              variant="outline"
              className={cn("font-medium border gap-1", meta.classes)}
            >
              <Icon className="size-3" aria-hidden="true" />
              {meta.label}
            </Badge>
          );
        },
      },
      {
        id: "product",
        header: "Product",
        size: 260,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm">{row.original.productName ?? "none"}</span>
            <span className="font-mono text-[10px]">
              {row.original.productSku ?? "none"}
            </span>
          </div>
        ),
      },
      {
        id: "location",
        header: "Location",
        size: 110,
        cell: ({ row }) =>
          row.original.locationCode ? (
            <span className="font-mono text-xs">{row.original.locationCode}</span>
          ) : (
            <span className="text-muted-foreground">none</span>
          ),
      },
      {
        accessorKey: "quantity",
        header: "Qty",
        meta: { align: "right" as ColumnAlign },
        size: 90,
        cell: ({ row }) => (
          <span
            className={cn(
              "tabular-nums font-medium",
              row.original.quantity > 0 && "text-success-text",
              row.original.quantity < 0 && "text-destructive-text",
            )}
          >
            {row.original.quantity > 0 ? "+" : ""}
            {row.original.quantity}
          </span>
        ),
      },
      {
        accessorKey: "reason",
        header: "Reason",
        size: 140,
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.reason.replace(/_/g, " ")}
          </span>
        ),
      },
      {
        accessorKey: "reference",
        header: "Reference",
        size: 130,
        cell: ({ row }) =>
          row.original.reference ? (
            <span className="font-mono text-xs">{row.original.reference}</span>
          ) : row.original.transferGroupId ? (
            <span className="font-mono text-[10px]">
              tx-{row.original.transferGroupId.slice(0, 8)}
            </span>
          ) : (
            <span className="text-muted-foreground">none</span>
          ),
      },
    ],
    [format],
  );

  return (
    <DataTable
      data={initial}
      columns={columns}
      virtualize
      filterPlaceholder="Filter by product, SKU, reason, reference…"
      emptyState={
        <EmptyState
          icon={ScrollText}
          title="No movements yet"
          description="When you record stock-in, stock-out, transfer or adjustment, every row lands here."
        />
      }
    />
  );
}

export const MOVEMENT_TYPE_LABELS = Object.fromEntries(
  Object.entries(TYPE_META).map(([k, v]) => [k, v.label]),
) as Record<MovementRow["type"], string>;

export const MOVEMENT_ICONS = { Boxes, ArrowDownUp };
