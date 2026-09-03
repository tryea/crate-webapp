"use client";

import { useMemo } from "react";
import { useFormatter } from "next-intl";
import { Download, History } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/shared/ui/data-table";
import { EmptyState } from "@/shared/ui/empty-state";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { dateStampedFilename, downloadCsv } from "@/shared/lib/csv/export";

export interface AuditTableRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userName: string | null;
  userEmail: string | null;
  diff: unknown;
  createdAt: Date | string;
}

const ACTION_CLASSES: Record<string, string> = {
  create: "bg-success/10 text-success-text border-success/20",
  update: "bg-info/10 text-info-text border-info/20",
  delete: "bg-destructive/10 text-destructive-text border-destructive/20",
  login: "bg-muted text-muted-foreground-strong border-border",
  logout: "bg-muted text-muted-foreground-strong border-border",
  stock_movement: "bg-warning/10 text-warning-text border-warning/30",
  po_receive: "bg-warning/10 text-warning-text border-warning/30",
  po_status_change: "bg-info/10 text-info-text border-info/20",
};

export function AuditTable({ rows }: { rows: AuditTableRow[] }) {
  const format = useFormatter();
  const columns = useMemo<ColumnDef<AuditTableRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        size: 180,
        cell: ({ row }) => (
          <span className="font-mono text-[11px]">
            {format.dateTime(new Date(row.original.createdAt), "timestamp")}
          </span>
        ),
      },
      {
        id: "user",
        header: "Who",
        size: 220,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm">{row.original.userName ?? "none"}</span>
            <span className="text-[10px]">
              {row.original.userEmail ?? "none"}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        size: 140,
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              "font-medium border",
              ACTION_CLASSES[row.original.action] ?? "bg-muted text-muted-foreground-strong border-border",
            )}
          >
            {row.original.action.replace(/_/g, " ")}
          </Badge>
        ),
      },
      {
        accessorKey: "resourceType",
        header: "Resource",
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.resourceType}
          </span>
        ),
      },
      {
        accessorKey: "resourceId",
        header: "ID",
        size: 110,
        cell: ({ row }) =>
          row.original.resourceId ? (
            <span className="font-mono text-[10px]">
              {row.original.resourceId.slice(0, 8)}
            </span>
          ) : (
            <span className="text-muted-foreground">none</span>
          ),
      },
      {
        id: "diff",
        header: "Diff",
        size: 360,
        cell: ({ row }) => {
          const summary = summarizeDiff(row.original.diff);
          return (
            <span className="text-xs line-clamp-2">
              {summary}
            </span>
          );
        },
      },
    ],
    [format],
  );

  function handleExport() {
    const flat = rows.map((r) => ({
      when: new Date(r.createdAt).toISOString(),
      action: r.action,
      resource_type: r.resourceType,
      resource_id: r.resourceId ?? "",
      user_name: r.userName ?? "",
      user_email: r.userEmail ?? "",
      diff: typeof r.diff === "object" && r.diff !== null ? JSON.stringify(r.diff) : "",
    }));
    downloadCsv(dateStampedFilename("audit-log"), flat);
  }

  return (
    <DataTable
      data={rows}
      columns={columns}
      virtualize
      filterPlaceholder="Filter by user, action, resource type…"
      toolbarRightSlot={
        rows.length > 0 ? (
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-1.5">
            <Download className="size-3.5" /> Export CSV
          </Button>
        ) : null
      }
      emptyState={
        <EmptyState
          icon={History}
          title="No audit entries yet"
          description="Every protected mutation lands here. Sign in / out, stock movements, PO receipts, all of it."
        />
      }
    />
  );
}

function summarizeDiff(diff: unknown): string {
  if (diff == null) return "none";
  if (typeof diff !== "object") return String(diff);
  try {
    const obj = diff as Record<string, unknown>;
    const op = obj.op ?? obj.action;
    const summaryParts: string[] = [];
    if (op) summaryParts.push(String(op));
    for (const k of ["productId", "locationId", "quantity", "reason", "from", "to", "poNumber", "quantityReceivedDelta"]) {
      if (k in obj) summaryParts.push(`${k}=${String(obj[k]).slice(0, 24)}`);
    }
    return summaryParts.join(" · ") || JSON.stringify(diff);
  } catch {
    return JSON.stringify(diff);
  }
}
