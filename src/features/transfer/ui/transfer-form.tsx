"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
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
  transferAction,
  transferFormSchema,
  type TransferFormValues,
} from "@/entities/stock-movement";

export function TransferForm({
  products,
  locations,
}: {
  products: Array<{ id: string; sku: string; name: string }>;
  locations: Array<{ id: string; warehouseName: string; code: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      productId: "",
      sourceLocationId: "",
      destLocationId: "",
      quantity: 1,
      reference: "",
      notes: "",
    },
  });

  async function onSubmit(values: TransferFormValues) {
    startTransition(async () => {
      const res = await transferAction(values);
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            form.setError(field as keyof TransferFormValues, {
              message: msgs?.[0] ?? "Invalid value",
            });
          }
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success(`Transferred ${values.quantity} unit(s)`);
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

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <FormField
          control={form.control}
          name="sourceLocationId"
          label="From"
          required
          render={({ id, value, onChange }) => (
            <Select value={(value as string) ?? ""} onValueChange={onChange}>
              <SelectTrigger id={id}>
                <SelectValue placeholder="Source" />
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
        <div className="pb-2.5 text-muted-foreground">
          <ArrowRight className="size-4" aria-hidden="true" />
        </div>
        <FormField
          control={form.control}
          name="destLocationId"
          label="To"
          required
          render={({ id, value, onChange }) => (
            <Select value={(value as string) ?? ""} onValueChange={onChange}>
              <SelectTrigger id={id}>
                <SelectValue placeholder="Destination" />
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

      <FormField
        control={form.control}
        name="quantity"
        label="Quantity"
        required
        description="Server blocks if higher than available at source."
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
            className="tabular-nums max-w-xs"
            aria-invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      />

      <FormField
        control={form.control}
        name="reference"
        label="Reference"
        description="Optional."
        render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
          <Input
            id={id}
            ref={ref as React.Ref<HTMLInputElement>}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder="TX-2026-001"
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
          {isPending ? "Transferring…" : "Record transfer"}
        </Button>
      </div>
    </form>
  );
}
