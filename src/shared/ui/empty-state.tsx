import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

/**
 * EmptyState — per COUNCIL §6: "every empty state guides the next action."
 * Pattern: icon → headline → 1-line explanation → primary action.
 *
 * Variant guidance:
 *  - `default` for empty lists ("No products yet — Add your first.")
 *  - `search` for empty filter results ("No matches — Try different filters.")
 *  - `error` for failed loads ("Couldn't load — Retry.")
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "default",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  variant?: "default" | "search" | "error";
  className?: string;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        "mx-auto flex max-w-md flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon
          aria-hidden="true"
          className={cn(
            "size-8 mb-1",
            variant === "error"
              ? "text-destructive"
              : "text-muted-foreground/60",
          )}
        />
      ) : null}
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
