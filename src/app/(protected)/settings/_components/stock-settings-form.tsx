"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { toast } from "@/shared/lib/toast/toast";
import {
  updateStockSettingsAction,
  type StockSettings,
} from "@/entities/settings";

export function StockSettingsForm({ initial }: { initial: StockSettings }) {
  const router = useRouter();
  const [allowBackorder, setAllowBackorder] = useState(initial.allowBackorder);
  const [isPending, startTransition] = useTransition();

  const dirty = allowBackorder !== initial.allowBackorder;

  async function handleSave() {
    startTransition(async () => {
      const res = await updateStockSettingsAction({ allowBackorder });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="allowBackorder" className="text-sm font-medium">
            Allow backorder
          </Label>
          <p className="text-xs text-muted-foreground max-w-prose">
            When ON, stock-out / transfer / negative-adjustment actions may
            drive a (product, location) level below zero. When OFF (default,
            per COUNCIL §0), the server rejects with{" "}
            <code className="font-mono text-[11px]">INSUFFICIENT_STOCK</code>{" "}
            and a field-level error. Affects the 34-spec stock-math gate
            already tested for both modes.
          </p>
        </div>
        <Switch
          id="allowBackorder"
          checked={allowBackorder}
          onCheckedChange={setAllowBackorder}
          disabled={isPending}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setAllowBackorder(initial.allowBackorder)}
          disabled={!dirty || isPending}
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isPending}
          className="gap-1.5"
        >
          <Save className="size-3.5" />
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
