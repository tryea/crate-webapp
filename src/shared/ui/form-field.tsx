"use client";

import { useId } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";

/**
 * FormField: bridges React Hook Form's Controller to shadcn primitives
 * with a consistent label + error layout. Per COUNCIL §0 rule 5, Zod is
 * SSOT for validation; this component only handles UI plumbing.
 *
 * Usage:
 *   <FormField
 *     control={form.control}
 *     name="sku"
 *     label="SKU"
 *     description="Unique product code; cannot change after creation."
 *     required
 *     render={(field) => <Input {...field} placeholder="BEV-001" />}
 *   />
 *
 * Inline validation: error message shows BELOW the input as soon as RHF's
 * validation fires (per zodResolver). Optional description shows below
 * input when no error (COUNCIL §6 "forgiving forms", inline guidance).
 */
export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  description,
  required,
  className,
  render,
}: {
  // RHF 7.76+'s Control has 3 generics: <TFieldValues, TContext, TTransformedValues>.
  // Accept any context / transformed-output so callers can pass form.control
  // from useForm regardless of how they parameterize TContext / TOut.
  control: Control<TFieldValues, unknown, FieldValues>;
  name: TName;
  label: string;
  description?: string;
  required?: boolean;
  className?: string;
  render: (field: {
    id: string;
    name: TName;
    value: unknown;
    onChange: (...args: unknown[]) => void;
    onBlur: () => void;
    ref: (instance: HTMLElement | null) => void;
    "aria-invalid": boolean;
    "aria-describedby": string;
  }) => React.ReactNode;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className={cn("flex flex-col gap-1.5", className)}>
          <Label htmlFor={id} className="text-sm font-medium">
            {label}
            {required ? (
              <span
                aria-hidden="true"
                className="ml-0.5 text-destructive-text/80"
              >
                *
              </span>
            ) : null}
          </Label>

          {render({
            id,
            name,
            value: field.value,
            onChange: field.onChange as never,
            onBlur: field.onBlur,
            ref: field.ref as never,
            "aria-invalid": Boolean(fieldState.error),
            "aria-describedby": fieldState.error ? errorId : descriptionId,
          })}

          {fieldState.error ? (
            <p
              id={errorId}
              role="alert"
              className="text-xs text-destructive-text"
            >
              {fieldState.error.message}
            </p>
          ) : description ? (
            <p id={descriptionId} className="text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}
