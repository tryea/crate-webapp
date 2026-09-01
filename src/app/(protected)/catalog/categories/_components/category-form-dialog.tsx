"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Category } from "@/db/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { toast } from "@/shared/lib/toast/toast";
import {
  categoryFormSchema,
  createCategoryAction,
  suggestSlug,
  updateCategoryAction,
  type CategoryFormValues,
} from "@/entities/category";

type Mode = "create" | "edit";

export function CategoryFormDialog({
  open,
  onOpenChange,
  mode,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  category?: Category | null;
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      parentId: null,
    },
  });

  // When the dialog opens for edit, hydrate from the row.
  useEffect(() => {
    if (!open) return;
    form.reset({
      name: category?.name ?? "",
      slug: category?.slug ?? "",
      parentId: category?.parentId ?? null,
    });
  }, [open, category, form]);

  async function onSubmit(values: CategoryFormValues) {
    startTransition(async () => {
      const res =
        mode === "edit" && category
          ? await updateCategoryAction(category.id, values)
          : await createCategoryAction(values);

      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            const k = field as keyof CategoryFormValues;
            form.setError(k, { message: msgs?.[0] ?? "Invalid value" });
          }
        } else {
          toast.error(res.error);
        }
        return;
      }

      toast.success(
        mode === "create" ? "Category created" : "Category updated",
      );
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New category" : "Edit category"}
          </DialogTitle>
          <DialogDescription>
            Categories group products in the catalog. Slug appears in URLs and
            should be stable.
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
            render={({ id, value, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                ref={ref as React.Ref<HTMLInputElement>}
                value={(value as string) ?? ""}
                onChange={(e) => {
                  form.setValue("name", e.target.value, { shouldValidate: false });
                  if (mode === "create" && !form.formState.dirtyFields.slug) {
                    form.setValue("slug", suggestSlug(e.target.value), {
                      shouldValidate: false,
                    });
                  }
                }}
                onBlur={onBlur}
                placeholder="Beverages"
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          />

          <FormField
            control={form.control}
            name="slug"
            label="Slug"
            required
            description="URL-safe: lowercase letters/numbers + dashes."
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                ref={ref as React.Ref<HTMLInputElement>}
                value={(value as string) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder="beverages"
                className="font-mono"
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
                  ? "Create category"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
