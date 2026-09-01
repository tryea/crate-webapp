"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Location } from "@/db/schema";
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
  createLocationAction,
  locationFormSchema,
  updateLocationAction,
  type LocationFormValues,
} from "@/entities/warehouse";

type Mode = "create" | "edit";

export function LocationFormDialog({
  open,
  onOpenChange,
  mode,
  warehouseId,
  location,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  warehouseId: string;
  location?: Location | null;
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: { code: "", name: null },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      code: location?.code ?? "",
      name: location?.name ?? null,
    });
  }, [open, location, form]);

  async function onSubmit(values: LocationFormValues) {
    startTransition(async () => {
      const res =
        mode === "edit" && location
          ? await updateLocationAction(location.id, values)
          : await createLocationAction(warehouseId, values);

      if (!res.ok) {
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            form.setError(field as keyof LocationFormValues, {
              message: msgs?.[0] ?? "Invalid value",
            });
          }
        } else {
          toast.error(res.error);
        }
        return;
      }

      toast.success(mode === "create" ? "Location added" : "Location updated");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New location" : "Edit location"}
          </DialogTitle>
          <DialogDescription>
            A location is a bin / aisle / slot within this warehouse. Code is
            unique per warehouse.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="code"
            label="Code"
            required
            description="Short identifier: uppercase letters/numbers + dashes."
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                ref={ref as React.Ref<HTMLInputElement>}
                value={(value as string) ?? ""}
                onChange={(e) => onChange(e.target.value.toUpperCase())}
                onBlur={onBlur}
                placeholder="A1"
                className="font-mono"
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          />

          <FormField
            control={form.control}
            name="name"
            label="Label"
            description="Optional human-readable name (e.g. Aisle A · Bin 1)."
            render={({ id, value, onChange, ref, onBlur, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                ref={ref as React.Ref<HTMLInputElement>}
                value={(value as string | null) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder="Aisle A · Bin 1"
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
              {isPending ? "Saving…" : mode === "create" ? "Add location" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
