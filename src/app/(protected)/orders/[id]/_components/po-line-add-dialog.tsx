"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { toast } from "@/shared/lib/toast/toast";
import {
  addPoLineAction,
  poLineFormSchema,
  type PoLineFormValues,
} from "@/entities/purchase-order";

export function PoLineAddDialog({
  open,
  onOpenChange,
  poId,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poId: string;
  products: Array<{ id: string; sku: string; name: string; costPrice: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<PoLineFormValues>({
    resolver: zodResolver(poLineFormSchema),
    defaultValues: { productId: "", quantityOrdered: 1, unitCost: "0.00" },
  });

  useEffect(() => {
    if (!open)
      form.reset({ productId: "", quantityOrdered: 1, unitCost: "0.00" });
  }, [open, form]);

  // Auto-fill unitCost from product.costPrice when selection changes.
  const productId = form.watch("productId");
  useEffect(() => {
    const p = products.find((p) => p.id === productId);
    if (p && !form.formState.dirtyFields.unitCost) {
      form.setValue("unitCost", p.costPrice);
    }
  }, [productId, products, form]);

  async function onSubmit(values: PoLineFormValues) {
    startTransition(async () => {
      const res = await addPoLineAction(poId, values);
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            form.setError(field as keyof PoLineFormValues, {
              message: msgs?.[0] ?? "Invalid value",
            });
          }
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success("Line added");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add line</DialogTitle>
          <DialogDescription>
            Picking a product fills unit cost from its catalog price. Override
            as needed.
          </DialogDescription>
        </DialogHeader>

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

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="quantityOrdered"
              label="Qty"
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
              required
              render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <Input
                  id={id}
                  ref={ref as React.Ref<HTMLInputElement>}
                  inputMode="decimal"
                  value={(value as string) ?? ""}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={onBlur}
                  className="tabular-nums"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add line"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
