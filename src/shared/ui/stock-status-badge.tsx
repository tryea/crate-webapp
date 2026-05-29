import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";

/**
 * Single-signal status chip for stock state. Uses the Phase 3.1 semantic
 * tokens (success/warning/destructive/info) as soft tints — not saturated
 * fills (ui-audit principle 7 SUB-RULE).
 *
 * Status policy:
 *  - in-stock      → "all good", success, low visual weight
 *  - low-stock     → reorder needed, warning
 *  - out-of-stock  → blocked, destructive (but soft tint, not "delete" loud)
 *  - on-transit    → mid-transfer, info
 */
export type StockStatus = "in-stock" | "low-stock" | "out-of-stock" | "on-transit";

const VARIANTS: Record<
  StockStatus,
  { label: string; classes: string }
> = {
  "in-stock": {
    label: "In stock",
    classes: "bg-success/10 text-success border-success/20",
  },
  "low-stock": {
    label: "Low stock",
    classes: "bg-warning/10 text-warning border-warning/30",
  },
  "out-of-stock": {
    label: "Out of stock",
    classes: "bg-destructive/10 text-destructive border-destructive/20",
  },
  "on-transit": {
    label: "On transit",
    classes: "bg-info/10 text-info border-info/20",
  },
};

export function StockStatusBadge({
  status,
  className,
}: {
  status: StockStatus;
  className?: string;
}) {
  const v = VARIANTS[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border",
        v.classes,
        className,
      )}
    >
      {v.label}
    </Badge>
  );
}
