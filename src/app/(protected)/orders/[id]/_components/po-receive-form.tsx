"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { toast } from "@/shared/lib/toast/toast";
import { receivePoAction } from "@/entities/purchase-order";

const MONEY_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export interface ReceivableLine {
  id: string;
  productSku: string | null;
  productName: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: string;
}

export function PoReceiveForm({
  poId,
  lines,
}: {
  poId: string;
  lines: ReceivableLine[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initial = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) {
      m[l.id] = Math.max(0, l.quantityOrdered - l.quantityReceived);
    }
    return m;
  }, [lines]);

  const [drafts, setDrafts] = useState<Record<string, number>>(initial);

  function setDraft(lineId: string, value: number) {
    setDrafts((prev) => ({ ...prev, [lineId]: Math.max(0, Math.floor(value)) }));
  }

  const totalUnits = lines.reduce((acc, l) => acc + (drafts[l.id] ?? 0), 0);
  const totalValue = lines.reduce(
    (acc, l) => acc + (drafts[l.id] ?? 0) * Number(l.unitCost),
    0,
  );

  async function onSubmit() {
    const payload = {
      poId,
      lines: lines.map((l) => ({
        lineId: l.id,
        receiveNow: drafts[l.id] ?? 0,
      })),
    };
    startTransition(async () => {
      const res = await receivePoAction(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Recorded ${res.data.movementsCreated} receipt(s), status: ${res.data.newStatus}`,
      );
      router.refresh();
    });
  }

  if (lines.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <h2 className="text-sm font-semibold">Receive</h2>
        <p className="text-xs text-muted-foreground">
          Default: remaining = ordered − already received.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-xs font-medium">Product</th>
            <th className="px-3 py-2 text-right text-xs font-medium">Ordered</th>
            <th className="px-3 py-2 text-right text-xs font-medium">Received</th>
            <th className="px-3 py-2 text-right text-xs font-medium">Receive now</th>
            <th className="px-3 py-2 text-right text-xs font-medium">Line value</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const remaining = l.quantityOrdered - l.quantityReceived;
            const value = (drafts[l.id] ?? 0) * Number(l.unitCost);
            return (
              <tr key={l.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2">
                  <div className="flex flex-col">
                    <span>{l.productName ?? "none"}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {l.productSku ?? "none"}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.quantityOrdered}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {l.quantityReceived}
                </td>
                <td className="px-3 py-2 text-right">
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    step={1}
                    value={drafts[l.id] ?? 0}
                    onChange={(e) => setDraft(l.id, Number(e.target.value))}
                    disabled={remaining === 0 || isPending}
                    className="h-7 w-20 ml-auto text-right tabular-nums"
                    aria-label={`Receive now for ${l.productName}`}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {MONEY_FMT.format(value)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/10">
            <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={3}>
              {totalUnits} unit{totalUnits === 1 ? "" : "s"} receiving
            </td>
            <td className="px-3 py-2 text-right text-xs text-muted-foreground">
              Total:
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
              {MONEY_FMT.format(totalValue)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/10 px-3 py-2.5">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isPending || totalUnits === 0}
          className="gap-1.5"
        >
          <Send className="size-3.5" />
          {isPending ? "Receiving…" : "Record receipt"}
        </Button>
      </div>
    </div>
  );
}
