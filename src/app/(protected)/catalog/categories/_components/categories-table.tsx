"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter } from "next-intl";
import { FolderTree, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Category } from "@/db/schema";
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
import { deleteCategoryAction, recreateCategoryAction } from "@/entities/category";
import { CategoryFormDialog } from "./category-form-dialog";

type Mode = "create" | "edit";

export function CategoriesTable({
  initial,
  canManage,
}: {
  initial: Category[];
  canManage: boolean;
}) {
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editing, setEditing] = useState<Category | null>(null);
  const [, startTransition] = useTransition();

  function openCreate() {
    setMode("create");
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: Category) {
    setMode("edit");
    setEditing(row);
    setOpen(true);
  }

  function handleDelete(row: Category) {
    startTransition(async () => {
      const res = await deleteCategoryAction(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.undoable(
        `Deleted "${row.name}"`,
        () => {
          startTransition(async () => {
            const r = await recreateCategoryAction(row);
            if (r.ok) toast.success("Restored");
            else toast.error(r.error);
          });
        },
        { description: "Undo within 6 seconds." },
      );
    });
  }

  const columns = useMemo<ColumnDef<Category>[]>(() => {
    const cols: ColumnDef<Category>[] = [
      { accessorKey: "name", header: "Name", size: 280 },
      {
        accessorKey: "slug",
        header: "Slug",
        size: 200,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.slug}</span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 140,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {format.dateTime(new Date(row.original.createdAt), "date")}
          </span>
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
    // openEdit + handleDelete are stable enough for our table; intentional dep list.

  }, [canManage, format]);

  return (
    <>
      {canManage ? (
        <div className="flex items-center justify-end pb-3">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-3.5" /> New category
          </Button>
        </div>
      ) : null}

      <DataTable
        data={initial}
        columns={columns}
        filterPlaceholder="Filter by name or slug…"
        emptyState={
          <EmptyState
            icon={FolderTree}
            title="No categories yet"
            description={
              canManage
                ? "Create your first category to organise products."
                : "No categories have been created yet."
            }
            action={
              canManage ? (
                <Button onClick={openCreate}>Create category</Button>
              ) : null
            }
          />
        }
      />

      <CategoryFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        mode={mode}
        category={editing}
      />
    </>
  );
}
