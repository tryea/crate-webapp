"use client";

import { useMemo, useState, useTransition } from "react";
import { Boxes, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Location } from "@/db/schema";
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
  deleteLocationAction,
  recreateLocationAction,
} from "@/entities/warehouse";
import { LocationFormDialog } from "./location-form-dialog";

type Mode = "create" | "edit";

export function LocationsTable({
  warehouseId,
  initial,
  canManage,
}: {
  warehouseId: string;
  initial: Location[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editing, setEditing] = useState<Location | null>(null);
  const [, startTransition] = useTransition();

  function openCreate() {
    setMode("create");
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: Location) {
    setMode("edit");
    setEditing(row);
    setOpen(true);
  }

  function handleDelete(row: Location) {
    startTransition(async () => {
      const res = await deleteLocationAction(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.undoable(
        `Removed "${row.code}"`,
        () => {
          startTransition(async () => {
            const r = await recreateLocationAction(row);
            if (r.ok) toast.success("Restored");
            else toast.error(r.error);
          });
        },
        { description: "Undo within 6 seconds." },
      );
    });
  }

  const columns = useMemo<ColumnDef<Location>[]>(() => {
    const cols: ColumnDef<Location>[] = [
      {
        accessorKey: "code",
        header: "Code",
        size: 120,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.code}</span>
        ),
      },
      {
        accessorKey: "name",
        header: "Label",
        cell: ({ row }) =>
          row.original.name ? (
            <span>{row.original.name}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
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
              aria-label={`Actions for ${row.original.code}`}
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
          <Button onClick={openCreate} className="gap-2" size="sm">
            <Plus className="size-3.5" /> Add location
          </Button>
        </div>
      ) : null}

      <DataTable
        data={initial}
        columns={columns}
        filterPlaceholder="Filter by code or label…"
        emptyState={
          <EmptyState
            icon={Boxes}
            title="No locations yet"
            description={
              canManage
                ? "Add bin / aisle codes so movements can record where stock lives."
                : "No locations in this warehouse yet."
            }
            action={
              canManage ? (
                <Button onClick={openCreate}>Add location</Button>
              ) : null
            }
          />
        }
      />

      <LocationFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        mode={mode}
        warehouseId={warehouseId}
        location={editing}
      />
    </>
  );
}
