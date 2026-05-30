"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Category, Product, Supplier } from "@/db/schema";
import { DataTable, type ColumnAlign } from "@/shared/ui/data-table";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Badge } from "@/shared/ui/badge";
import { toast } from "@/shared/lib/toast/toast";
import {
  deleteProductAction,
  recreateProductAction,
  setProductActiveAction,
} from "@/entities/product";
import { ProductFormDialog } from "./product-form-dialog";

type Mode = "create" | "edit";

const MONEY_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function ProductsTable({
  initial,
  categories,
  suppliers,
  canManage,
}: {
  initial: Product[];
  categories: Pick<Category, "id" | "name">[];
  suppliers: Pick<Supplier, "id" | "name">[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editing, setEditing] = useState<Product | null>(null);
  const [, startTransition] = useTransition();

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const suppliersById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );

  function openCreate() {
    setMode("create");
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: Product) {
    setMode("edit");
    setEditing(row);
    setOpen(true);
  }

  function handleArchiveToggle(row: Product) {
    startTransition(async () => {
      const res = await setProductActiveAction(row.id, !row.isActive);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(row.isActive ? "Archived" : "Unarchived");
    });
  }

  function handleDelete(row: Product) {
    startTransition(async () => {
      const res = await deleteProductAction(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.undoable(
        `Deleted "${row.name}"`,
        () => {
          startTransition(async () => {
            const r = await recreateProductAction(row);
            if (r.ok) toast.success("Restored");
            else toast.error(r.error);
          });
        },
        { description: "Undo within 6 seconds." },
      );
    });
  }

  const columns = useMemo<ColumnDef<Product>[]>(() => {
    const cols: ColumnDef<Product>[] = [
      {
        accessorKey: "sku",
        header: "SKU",
        size: 120,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.sku}</span>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        size: 260,
        cell: ({ row }) => (
          <span
            className={
              row.original.isActive ? "" : "text-muted-foreground italic"
            }
          >
            {row.original.name}
          </span>
        ),
      },
      {
        id: "category",
        header: "Category",
        size: 140,
        cell: ({ row }) =>
          row.original.categoryId ? (
            <span>{categoriesById.get(row.original.categoryId) ?? "—"}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "supplier",
        header: "Supplier",
        size: 160,
        cell: ({ row }) =>
          row.original.supplierId ? (
            <span>{suppliersById.get(row.original.supplierId) ?? "—"}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "reorderPoint",
        header: "Reorder",
        meta: { align: "right" as ColumnAlign },
        size: 90,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.reorderPoint}
          </span>
        ),
      },
      {
        accessorKey: "costPrice",
        header: "Cost",
        meta: { align: "right" as ColumnAlign },
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {MONEY_FMT.format(Number(row.original.costPrice))}
          </span>
        ),
      },
      {
        accessorKey: "sellingPrice",
        header: "Selling",
        meta: { align: "right" as ColumnAlign },
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {MONEY_FMT.format(Number(row.original.sellingPrice))}
          </span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        size: 100,
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="outline">Active</Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-muted-foreground/20 text-muted-foreground-strong"
            >
              Archived
            </Badge>
          ),
      },
    ];

    if (canManage) {
      cols.push({
        id: "actions",
        header: "",
        size: 56,
        enableSorting: false,
        meta: { align: "right" as ColumnAlign },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${row.original.name}`}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => openEdit(row.original)} className="gap-2">
                <Pencil className="size-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handleArchiveToggle(row.original)}
                className="gap-2"
              >
                {row.original.isActive ? (
                  <>
                    <Archive className="size-3.5" /> Archive
                  </>
                ) : (
                  <>
                    <ArchiveRestore className="size-3.5" /> Unarchive
                  </>
                )}
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
  }, [canManage, categoriesById, suppliersById]);

  return (
    <>
      {canManage ? (
        <div className="flex items-center justify-end pb-3">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-3.5" /> New product
          </Button>
        </div>
      ) : null}

      <DataTable
        data={initial}
        columns={columns}
        filterPlaceholder="Filter by SKU, name, category, supplier…"
        emptyState={
          <EmptyState
            icon={Package}
            title="No products yet"
            description={
              canManage
                ? "Create your first product to start tracking inventory."
                : "No products have been created yet."
            }
            action={
              canManage ? (
                <Button onClick={openCreate}>Create product</Button>
              ) : null
            }
          />
        }
      />

      <ProductFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        mode={mode}
        product={editing}
        categories={categories}
        suppliers={suppliers}
      />
    </>
  );
}
