"use client";

import { useMemo, useState, useTransition } from "react";
import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Supplier } from "@/db/schema";
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
import { deleteSupplierAction, recreateSupplierAction } from "@/entities/supplier";
import { SupplierFormDialog } from "./supplier-form-dialog";

type Mode = "create" | "edit";

export function SuppliersTable({
  initial,
  canManage,
}: {
  initial: Supplier[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [, startTransition] = useTransition();

  function openCreate() {
    setMode("create");
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: Supplier) {
    setMode("edit");
    setEditing(row);
    setOpen(true);
  }

  function handleDelete(row: Supplier) {
    startTransition(async () => {
      const res = await deleteSupplierAction(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.undoable(
        `Deleted "${row.name}"`,
        () => {
          startTransition(async () => {
            const r = await recreateSupplierAction(row);
            if (r.ok) toast.success("Restored");
            else toast.error(r.error);
          });
        },
        { description: "Undo within 6 seconds." },
      );
    });
  }

  const columns = useMemo<ColumnDef<Supplier>[]>(() => {
    const cols: ColumnDef<Supplier>[] = [
      { accessorKey: "name", header: "Name", size: 260 },
      {
        accessorKey: "contactEmail",
        header: "Email",
        size: 240,
        cell: ({ row }) =>
          row.original.contactEmail ? (
            <a
              href={`mailto:${row.original.contactEmail}`}
              className="text-foreground/90 hover:underline"
            >
              {row.original.contactEmail}
            </a>
          ) : (
            <span className="text-muted-foreground">none</span>
          ),
      },
      {
        accessorKey: "contactPhone",
        header: "Phone",
        size: 160,
        cell: ({ row }) =>
          row.original.contactPhone ? (
            <span className="font-mono text-xs">{row.original.contactPhone}</span>
          ) : (
            <span className="text-muted-foreground">none</span>
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
            <Plus className="size-3.5" /> New supplier
          </Button>
        </div>
      ) : null}

      <DataTable
        data={initial}
        columns={columns}
        filterPlaceholder="Filter by name, email, phone…"
        emptyState={
          <EmptyState
            icon={Building2}
            title="No suppliers yet"
            description={
              canManage
                ? "Add a supplier so you can link purchase orders to them."
                : "No suppliers have been added yet."
            }
            action={
              canManage ? (
                <Button onClick={openCreate}>Add supplier</Button>
              ) : null
            }
          />
        }
      />

      <SupplierFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        mode={mode}
        supplier={editing}
      />
    </>
  );
}
