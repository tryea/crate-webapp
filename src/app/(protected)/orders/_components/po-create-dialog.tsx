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
import { Textarea } from "@/shared/ui/textarea";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { toast } from "@/shared/lib/toast/toast";
import {
  createPurchaseOrderAction,
  poHeaderFormSchema,
  type PoHeaderFormValues,
} from "@/entities/purchase-order";

export function PoCreateDialog({
  open,
  onOpenChange,
  suppliers,
  warehouses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Array<{ id: string; name: string }>;
  warehouses: Array<{ id: string; name: string; code: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<PoHeaderFormValues>({
    resolver: zodResolver(poHeaderFormSchema),
    defaultValues: {
      supplierId: "",
      warehouseId: "",
      expectedDate: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) form.reset({ supplierId: "", warehouseId: "", expectedDate: "", notes: "" });
  }, [open, form]);

  async function onSubmit(values: PoHeaderFormValues) {
    startTransition(async () => {
      const res = await createPurchaseOrderAction(values);
      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            form.setError(field as keyof PoHeaderFormValues, {
              message: msgs?.[0] ?? "Invalid value",
            });
          }
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success(`Drafted ${res.data.poNumber}`);
      onOpenChange(false);
      router.push(`/orders/${res.data.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
          <DialogDescription>
            Header first. Add line items on the detail page once the draft
            is created.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="supplierId"
            label="Supplier"
            required
            render={({ id, value, onChange }) => (
              <Select value={(value as string) ?? ""} onValueChange={onChange}>
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Pick a supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FormField
            control={form.control}
            name="warehouseId"
            label="Receive into warehouse"
            required
            render={({ id, value, onChange }) => (
              <Select value={(value as string) ?? ""} onValueChange={onChange}>
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Pick a warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {w.code}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FormField
            control={form.control}
            name="expectedDate"
            label="Expected date"
            description="Optional."
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                ref={ref as React.Ref<HTMLInputElement>}
                type="date"
                value={(value as string) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
