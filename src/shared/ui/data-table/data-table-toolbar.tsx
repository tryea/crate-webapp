"use client";

import { LayoutGrid, Rows3, Rows4, Search, X } from "lucide-react";
import { useDensity, type Density } from "./density";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/utils";

export function DataTableToolbar({
  globalFilter,
  onGlobalFilterChange,
  filterPlaceholder = "Filter…",
  rightSlot,
  className,
}: {
  globalFilter: string;
  onGlobalFilterChange: (next: string) => void;
  filterPlaceholder?: string;
  rightSlot?: React.ReactNode;
  className?: string;
}) {
  const { density, setDensity } = useDensity();

  return (
    <div className={cn("flex items-center gap-2 px-1 pb-3", className)}>
      <div className="relative flex-1 max-w-sm">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          placeholder={filterPlaceholder}
          className="h-8 pl-7.5 pr-7 text-sm"
          aria-label="Filter table"
        />
        {globalFilter ? (
          <button
            type="button"
            onClick={() => onGlobalFilterChange("")}
            aria-label="Clear filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {rightSlot}
        <div
          role="radiogroup"
          aria-label="Row density"
          className="flex items-center rounded-md border border-input bg-background p-0.5"
        >
          {(["compact", "normal", "comfortable"] as Density[]).map((d) => {
            const Icon = d === "compact" ? Rows4 : d === "normal" ? Rows3 : LayoutGrid;
            const active = density === d;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDensity(d)}
                title={`${d.charAt(0).toUpperCase()}${d.slice(1)}`}
                className={cn(
                  "flex h-6 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors",
                  active && "bg-muted text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
