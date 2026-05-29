"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { toast } from "@/shared/lib/toast/toast";
import {
  stockInAction,
  stockInFormSchema,
  type StockInFormValues,
} from "@/entities/stock-movement";

const REASON_OPTIONS = [
  { value: "purchase", label: "Purchase / Receiving" },
  { value: "return_from_customer", label: "Customer return" },
  { value: "other", label: "Other" },
] as const;

export function StockInForm({
  products,
  locations,
}: {
  products: Array<{ id: string; sku: string; name: string }>;
  locations: Array<{ id: string; warehouseName: string; code: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<StockInFormValues>({
    resolver: zodResolver(stockInFormSchema),
    defaultValues: {
      productId: "",
      locationId: "",
      quantity: 1,
      reason: "purchase",
      unitCost: "",
      reference: "",
      notes: "",
    },
  });

  async function onSubmit(values: StockInFormValues) {
    startTransition(async () => {
      const res = await stockInAction(values);
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            form.setError(field as keyof StockInFormValues, {
              message: msgs?.[0] ?? "Invalid value",
            });
          }
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success(`Received ${values.quantity} unit(s)`);
      router.push("/movements");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="productId"
          label="Product"
          required
          render={({ id, value, onChange }) => (
            <Select value={(value as string) ?? ""} onValueChange={onChange}>
              <SelectTrigger id={id}>
                <SelectValue placeholder="Pick a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-mono text-xs mr-2">{p.sku}</span>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />

        <FormField
          control={form.control}
          name="locationId"
          label="Receive into"
          required
          render={({ id, value, onChange }) => (
            <Select value={(value as string) ?? ""} onValueChange={onChange}>
              <SelectTrigger id={id}>
                <SelectValue placeholder="Pick a location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="text-muted-foreground">{l.warehouseName}</span>
                    <span className="ml-2 font-mono text-xs">{l.code}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField
          control={form.control}
          name="quantity"
          label="Quantity"
          required
          render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              ref={ref as React.Ref<HTMLInputElement>}
              type="number"
              min={1}
              step={1}
              value={(value as number | null) ?? 1}
              onChange={(e) => onChange(Number(e.target.value))}
              onBlur={onBlur}
              className="tabular-nums"
              aria-invalid={invalid}
              aria-describedby={describedBy}
            />
          )}
        />

        <FormField
          control={form.control}
          name="unitCost"
          label="Unit cost"
          description="Optional. For weighted-average valuation."
          render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              ref={ref as React.Ref<HTMLInputElement>}
              inputMode="decimal"
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
              placeholder="0.00"
              className="tabular-nums"
              aria-invalid={invalid}
              aria-describedby={describedBy}
            />
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          label="Reason"
          required
          render={({ id, value, onChange }) => (
            <Select value={(value as string) ?? "purchase"} onValueChange={onChange}>
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="reference"
        label="Reference"
        description="Optional. PO number, packing slip ID, etc."
        render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
          <Input
            id={id}
            ref={ref as React.Ref<HTMLInputElement>}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder="PO-2026-001"
            className="font-mono"
            aria-invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      />

      <FormField
        control={form.control}
        name="notes"
        label="Notes"
        description="Optional."
        render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
          <Textarea
            id={id}
            ref={ref as React.Ref<HTMLTextAreaElement>}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            rows={2}
            placeholder="Anything worth recording on the ledger."
            aria-invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      />

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Recording…" : "Record stock-in"}
        </Button>
      </div>
    </form>
  );
}
