"use client";

import { useEffect, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Category, Product, Supplier } from "@/db/schema";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { FormField } from "@/shared/ui/form-field";
import { toast } from "@/shared/lib/toast/toast";
import {
  createProductAction,
  productFormSchema,
  updateProductAction,
  type ProductFormValues,
} from "@/entities/product";

type Mode = "create" | "edit";

const NONE = "__none__";

export function ProductFormDialog({
  open,
  onOpenChange,
  mode,
  product,
  categories,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  product?: Product | null;
  categories: Pick<Category, "id" | "name">[];
  suppliers: Pick<Supplier, "id" | "name">[];
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<ProductFormValues>({
    // RHF 7.76 + @hookform/resolvers 5 + Zod 4 has a Resolver generic
    // asymmetry (TIn vs TOut) that doesn't surface for our simpler forms.
    // Cast here is a deliberate, isolated workaround for the Products form
    // with its larger schema. See Category/Supplier dialogs — they have no
    // transforms in scope so the cast isn't needed there.
    resolver: zodResolver(productFormSchema) as unknown as Resolver<ProductFormValues>,
    defaultValues: {
      sku: "",
      name: "",
      description: "",
      imageUrl: "",
      unit: "pcs",
      categoryId: "",
      supplierId: "",
      barcode: "",
      reorderPoint: 0,
      costPrice: "0.00",
      sellingPrice: "0.00",
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      description: product?.description ?? "",
      imageUrl: product?.imageUrl ?? "",
      unit: product?.unit ?? "pcs",
      categoryId: product?.categoryId ?? "",
      supplierId: product?.supplierId ?? "",
      barcode: product?.barcode ?? "",
      reorderPoint: product?.reorderPoint ?? 0,
      costPrice: product?.costPrice ?? "0.00",
      sellingPrice: product?.sellingPrice ?? "0.00",
      isActive: product?.isActive ?? true,
    });
  }, [open, product, form]);

  async function onSubmit(values: ProductFormValues) {
    startTransition(async () => {
      const res =
        mode === "edit" && product
          ? await updateProductAction(product.id, values)
          : await createProductAction(values);

      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            form.setError(field as keyof ProductFormValues, {
              message: msgs?.[0] ?? "Invalid value",
            });
          }
        } else {
          toast.error(res.error);
        }
        return;
      }

      toast.success(mode === "create" ? "Product created" : "Product updated");
      onOpenChange(false);
    });
  }

  const isActive = form.watch("isActive");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New product" : "Edit product"}
          </DialogTitle>
          <DialogDescription>
            SKU + Name are required. All other fields can be filled later.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit as Parameters<typeof form.handleSubmit>[0])}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="sku"
              label="SKU"
              required
              render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <Input
                  id={id}
                  ref={ref as React.Ref<HTMLInputElement>}
                  value={(value as string) ?? ""}
                  onChange={(e) => onChange(e.target.value.toUpperCase())}
                  onBlur={onBlur}
                  placeholder="BEV-001"
                  className="font-mono"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            />

            <FormField
              control={form.control}
              name="barcode"
              label="Barcode"
              render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <Input
                  id={id}
                  ref={ref as React.Ref<HTMLInputElement>}
                  value={(value as string | null) ?? ""}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={onBlur}
                  placeholder="8991002101013"
                  className="font-mono"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            />
          </div>

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
                placeholder="Mineral Water 600ml"
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="categoryId"
              label="Category"
              render={({ id, value, onChange }) => (
                <Select
                  value={(value as string | null) ?? NONE}
                  onValueChange={(v) => onChange(v === NONE ? null : v)}
                >
                  <SelectTrigger id={id}>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormField
              control={form.control}
              name="supplierId"
              label="Supplier"
              render={({ id, value, onChange }) => (
                <Select
                  value={(value as string | null) ?? NONE}
                  onValueChange={(v) => onChange(v === NONE ? null : v)}
                >
                  <SelectTrigger id={id}>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="unit"
              label="Unit"
              required
              render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <Input
                  id={id}
                  ref={ref as React.Ref<HTMLInputElement>}
                  value={(value as string) ?? ""}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={onBlur}
                  placeholder="pcs"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            />
            <FormField
              control={form.control}
              name="reorderPoint"
              label="Reorder pt"
              render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <Input
                  id={id}
                  ref={ref as React.Ref<HTMLInputElement>}
                  type="number"
                  min={0}
                  step={1}
                  value={(value as number | null) ?? 0}
                  onChange={(e) => onChange(Number(e.target.value))}
                  onBlur={onBlur}
                  className="tabular-nums"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            />
            <div className="col-span-2 sm:col-span-1 flex items-end gap-3">
              <Label htmlFor="isActive" className="text-sm font-medium">
                Active
              </Label>
              <Switch
                id="isActive"
                checked={Boolean(isActive)}
                onCheckedChange={(v) => form.setValue("isActive", v)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="costPrice"
              label="Cost price"
              description="Per-unit acquisition cost."
              render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <Input
                  id={id}
                  ref={ref as React.Ref<HTMLInputElement>}
                  inputMode="decimal"
                  value={(value as string) ?? "0.00"}
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
              name="sellingPrice"
              label="Selling price"
              description="Per-unit list price."
              render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <Input
                  id={id}
                  ref={ref as React.Ref<HTMLInputElement>}
                  inputMode="decimal"
                  value={(value as string) ?? "0.00"}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={onBlur}
                  placeholder="0.00"
                  className="tabular-nums"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            label="Description"
            description="Optional."
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Textarea
                id={id}
                ref={ref as React.Ref<HTMLTextAreaElement>}
                value={(value as string | null) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                rows={3}
                placeholder="Short marketing copy or internal notes."
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
              {isPending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
