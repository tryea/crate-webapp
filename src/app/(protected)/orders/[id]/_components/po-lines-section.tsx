"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ClipboardList } from "lucide-react";
import { toast } from "@/shared/lib/toast/toast";
import { deletePoLineAction } from "@/entities/purchase-order";
import { PoLineAddDialog } from "./po-line-add-dialog";

const MONEY_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export interface PoLineRow {
  id: string;
  productId: string;
  productSku: string | null;
  productName: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: string;
}

export function PoLinesSection({
  poId,
  lines,
  canEdit,
  products,
}: {
  poId: string;
  lines: PoLineRow[];
  canEdit: boolean;
  products: Array<{ id: string; sku: string; name: string; costPrice: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleDelete(lineId: string) {
    startTransition(async () => {
      const res = await deletePoLineAction(lineId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Line removed");
      router.refresh();
    });
  }

  const totalOrdered = lines.reduce(
    (acc, l) => acc + l.quantityOrdered * Number(l.unitCost),
    0,
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Lines</h2>
          <p className="text-xs text-muted-foreground">
            {lines.length} {lines.length === 1 ? "item" : "items"} · Total
            ordered value{" "}
            <span className="font-medium text-foreground">
              {MONEY_FMT.format(totalOrdered)}
            </span>
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
            <Plus className="size-3.5" /> Add line
          </Button>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No lines yet"
          description={
            canEdit
              ? "Add at least one product to send this PO."
              : "Lines will appear here when added."
          }
          action={
            canEdit ? (
              <Button onClick={() => setOpen(true)}>Add first line</Button>
            ) : null
          }
        />
      ) : (
        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-xs font-medium">Product</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Received</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Unit</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Line</th>
                {canEdit ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span>{l.productName ?? "none"}</span>
                      <span className="font-mono text-[10px]">
                        {l.productSku ?? "none"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.quantityOrdered}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.quantityReceived}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {MONEY_FMT.format(Number(l.unitCost))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {MONEY_FMT.format(l.quantityOrdered * Number(l.unitCost))}
                  </td>
                  {canEdit ? (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(l.id)}
                        aria-label={`Remove ${l.productName}`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PoLineAddDialog
        open={open}
        onOpenChange={setOpen}
        poId={poId}
        products={products}
      />
    </section>
  );
}
