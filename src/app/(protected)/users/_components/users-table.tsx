"use client";

import { useMemo } from "react";
import { UsersRound } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/shared/ui/data-table";
import { EmptyState } from "@/shared/ui/empty-state";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";

export interface UsersTableRow {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "staff";
  createdAt: Date | string;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const ROLE_CLASSES: Record<UsersTableRow["role"], string> = {
  admin: "bg-info/10 text-info border-info/20",
  manager: "bg-warning/10 text-warning border-warning/30",
  staff: "bg-muted text-muted-foreground border-border",
};

const ROLE_BLURB: Record<UsersTableRow["role"], string> = {
  admin: "Full access · settings & users",
  manager: "Catalog, stock & purchasing",
  staff: "Read + record movements",
};

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UsersTable({ rows }: { rows: UsersTableRow[] }) {
  const columns = useMemo<ColumnDef<UsersTableRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        size: 240,
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              {monogram(row.original.name)}
            </span>
            <span className="text-sm">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        size: 240,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.email}
          </span>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        size: 220,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <Badge
              variant="outline"
              className={cn("w-fit border font-medium", ROLE_CLASSES[row.original.role])}
            >
              {row.original.role}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {ROLE_BLURB[row.original.role]}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Joined",
        size: 120,
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {DATE_FMT.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      filterPlaceholder="Filter by name, email, role…"
      emptyState={
        <EmptyState
          icon={UsersRound}
          title="No users yet"
          description="Accounts that can sign in to this workspace will appear here."
        />
      }
    />
  );
}
