"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Supplier } from "@/db/schema";
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
  createSupplierAction,
  supplierFormSchema,
  updateSupplierAction,
  type SupplierFormValues,
} from "@/entities/supplier";

type Mode = "create" | "edit";

export function SupplierFormDialog({
  open,
  onOpenChange,
  mode,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  supplier?: Supplier | null;
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: "",
      contactEmail: null,
      contactPhone: null,
      address: null,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: supplier?.name ?? "",
      contactEmail: supplier?.contactEmail ?? null,
      contactPhone: supplier?.contactPhone ?? null,
      address: supplier?.address ?? null,
    });
  }, [open, supplier, form]);

  async function onSubmit(values: SupplierFormValues) {
    startTransition(async () => {
      const res =
        mode === "edit" && supplier
          ? await updateSupplierAction(supplier.id, values)
          : await createSupplierAction(values);

      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            form.setError(field as keyof SupplierFormValues, {
              message: msgs?.[0] ?? "Invalid value",
            });
          }
        } else {
          toast.error(res.error);
        }
        return;
      }

      toast.success(
        mode === "create" ? "Supplier created" : "Supplier updated",
      );
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New supplier" : "Edit supplier"}
          </DialogTitle>
          <DialogDescription>
            Track who sources each product. Email + phone help your team reach
            them when a PO needs follow-up.
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
                placeholder="Aria Distributors"
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          />

          <FormField
            control={form.control}
            name="contactEmail"
            label="Email"
            description="Optional — used for PO notifications."
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                ref={ref as React.Ref<HTMLInputElement>}
                type="email"
                value={(value as string | null) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder="orders@supplier.example"
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          />

          <FormField
            control={form.control}
            name="contactPhone"
            label="Phone"
            description="Optional."
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                ref={ref as React.Ref<HTMLInputElement>}
                type="tel"
                value={(value as string | null) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder="+62 21 555 0101"
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
                placeholder="Street, city, postal"
                rows={2}
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Saving…"
                : mode === "create"
                  ? "Create supplier"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
