"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Warehouse } from "@/db/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { toast } from "@/shared/lib/toast/toast";
import {
  createWarehouseAction,
  updateWarehouseAction,
  warehouseFormSchema,
  type WarehouseFormValues,
} from "@/entities/warehouse";

type Mode = "create" | "edit";

export function WarehouseFormDialog({
  open,
  onOpenChange,
  mode,
  warehouse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  warehouse?: Warehouse | null;
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseFormSchema),
    defaultValues: { name: "", code: "", address: null },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: warehouse?.name ?? "",
      code: warehouse?.code ?? "",
      address: warehouse?.address ?? null,
    });
  }, [open, warehouse, form]);

  async function onSubmit(values: WarehouseFormValues) {
    startTransition(async () => {
      const res =
        mode === "edit" && warehouse
          ? await updateWarehouseAction(warehouse.id, values)
          : await createWarehouseAction(values);

      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            form.setError(field as keyof WarehouseFormValues, {
              message: msgs?.[0] ?? "Invalid value",
            });
          }
        } else {
          toast.error(res.error);
        }
        return;
      }

      toast.success(mode === "create" ? "Warehouse created" : "Warehouse updated");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New warehouse" : "Edit warehouse"}
          </DialogTitle>
          <DialogDescription>
            Each warehouse holds a set of locations (aisles, bins). Code shows
            in references like JKT-C / A1.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="name"
            label="Name"
            required
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                ref={ref as React.Ref<HTMLInputElement>}
                value={(value as string) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder="Jakarta Central"
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          />

          <FormField
            control={form.control}
            name="code"
            label="Code"
            required
            description="Short identifier — uppercase letters/numbers + dashes."
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                ref={ref as React.Ref<HTMLInputElement>}
                value={(value as string) ?? ""}
                onChange={(e) => onChange(e.target.value.toUpperCase())}
                onBlur={onBlur}
                placeholder="JKT-C"
                className="font-mono"
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          />

          <FormField
            control={form.control}
            name="address"
            label="Address"
            description="Optional."
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Textarea
                id={id}
                ref={ref as React.Ref<HTMLTextAreaElement>}
                value={(value as string | null) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                rows={2}
                placeholder="Street, city, postal"
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
              {isPending ? "Saving…" : mode === "create" ? "Create warehouse" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
