"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Warehouse } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export type ScopeWarehouse = { id: string; name: string; code: string };

/**
 * Scope sits ABOVE the nav because everything under it is subject to it, and
 * it is shaped differently from the brand on purpose: the brand is a glyph +
 * wordmark with no container, scope is a contained block with an icon, a
 * small caption and a chevron.
 *
 * The chevron is rendered ONLY where the choice actually changes what is on
 * screen, which today is the dashboard. Elsewhere the block states the scope
 * without offering a control, because an affordance that promises filtering
 * the page cannot do is the same class of defect as a link to a 404.
 */
export function ScopeBlock({ warehouses }: { warehouses: ScopeWarehouse[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  const interactive = pathname === "/dashboard" && warehouses.length > 0;
  const activeId = params.get("warehouse");
  const active = warehouses.find((w) => w.id === activeId);
  const label = active ? `${active.name} (${active.code})` : "All warehouses";

  const body = (
    <>
      <span className="sic">
        <Warehouse className="ic" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="stx">
        <span className="sk">Scope</span>
        <span className="sv">{label}</span>
      </span>
      {interactive ? (
        <span className="sch">
          <ChevronDown className="ic" strokeWidth={1.75} aria-hidden="true" />
        </span>
      ) : null}
    </>
  );

  if (!interactive) {
    return <div className="scope">{body}</div>;
  }

  function select(id: string | null) {
    router.push(id ? `/dashboard?warehouse=${encodeURIComponent(id)}` : "/dashboard");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="scope"
        aria-label={`Scope: ${label}. Change scope`}
      >
        {body}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onSelect={() => select(null)} className="gap-2">
          <Check
            className={active ? "size-3.5 invisible" : "size-3.5"}
            aria-hidden="true"
          />
          All warehouses
        </DropdownMenuItem>
        {warehouses.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onSelect={() => select(w.id)}
            className="gap-2"
          >
            <Check
              className={active?.id === w.id ? "size-3.5" : "size-3.5 invisible"}
              aria-hidden="true"
            />
            {w.name} ({w.code})
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
