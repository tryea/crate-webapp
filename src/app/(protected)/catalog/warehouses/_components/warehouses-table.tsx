"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Warehouse } from "@/db/schema";
import { DataTable } from "@/shared/ui/data-table";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { toast } from "@/shared/lib/toast/toast";
import {
  deleteWarehouseAction,
  recreateWarehouseAction,
} from "@/entities/warehouse";
import { WarehouseFormDialog } from "./warehouse-form-dialog";

type Mode = "create" | "edit";

export function WarehousesTable({
  initial,
  canManage,
}: {
  initial: Warehouse[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [, startTransition] = useTransition();

  function openCreate() {
    setMode("create");
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: Warehouse) {
    setMode("edit");
    setEditing(row);
    setOpen(true);
  }

  function handleDelete(row: Warehouse) {
    startTransition(async () => {
      const res = await deleteWarehouseAction(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.undoable(
        `Deleted "${row.name}"`,
        () => {
          startTransition(async () => {
            const r = await recreateWarehouseAction(row);
            if (r.ok) toast.success("Restored");
            else toast.error(r.error);
          });
        },
        { description: "Undo within 6 seconds." },
      );
    });
  }

  const columns = useMemo<ColumnDef<Warehouse>[]>(() => {
    const cols: ColumnDef<Warehouse>[] = [
      {
        accessorKey: "name",
        header: "Name",
        size: 240,
        cell: ({ row }) => (
          <Link
            href={`/catalog/warehouses/${row.original.id}`}
            className="font-medium hover:underline underline-offset-2 decoration-muted-foreground/30"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "code",
        header: "Code",
        size: 120,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.code}</span>
        ),
      },
      {
        accessorKey: "address",
        header: "Address",
        cell: ({ row }) =>
          row.original.address ? (
            <span className="truncate">
              {row.original.address}
            </span>
          ) : (
            <span className="text-muted-foreground">none</span>
          ),
      },
      {
        id: "locations",
        header: "",
        enableSorting: false,
        size: 56,
        meta: { align: "right" },
        cell: ({ row }) => (
          <Link
            href={`/catalog/warehouses/${row.original.id}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Locations <ChevronRight className="size-3.5" />
          </Link>
        ),
      },
    ];

    if (canManage) {
      cols.push({
        id: "actions",
        header: "",
        size: 56,
        enableSorting: false,
        meta: { align: "right" },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${row.original.name}`}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => openEdit(row.original)} className="gap-2">
                <Pencil className="size-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => handleDelete(row.original)}
                className="gap-2 text-destructive-text focus:text-destructive-text"
              >
                <Trash2 className="size-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      });
    }

    return cols;
  }, [canManage]);

  return (
    <>
      {canManage ? (
        <div className="flex items-center justify-end pb-3">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-3.5" /> New warehouse
          </Button>
        </div>
      ) : null}

      <DataTable
        data={initial}
        columns={columns}
        filterPlaceholder="Filter by name, code, address…"
        emptyState={
          <EmptyState
            icon={WarehouseIcon}
            title="No warehouses yet"
            description={
              canManage
                ? "Add a warehouse before you can create stock movements."
                : "No warehouses have been added yet."
            }
            action={
              canManage ? (
                <Button onClick={openCreate}>Add warehouse</Button>
              ) : null
            }
          />
        }
      />

      <WarehouseFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        mode={mode}
        warehouse={editing}
      />
    </>
  );
}
