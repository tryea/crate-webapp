"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { Role } from "@/shared/lib/auth/require-role";
import { BRAND_ICON, filterNavForRole } from "./nav-items";
import { SidebarNavLink } from "./sidebar-nav-link";

/**
 * Mobile counterpart of <Sidebar />. The desktop sidebar is `hidden md:flex`,
 * so below md there must be SOME way to reach the nav — without this, mobile
 * had no menu trigger at all. Fully client-side: it recomputes the RBAC nav
 * with filterNavForRole(role) (a pure fn) and renders lucide icons directly,
 * which is allowed inside a client component (the Server→Client "can't pass a
 * component reference" rule only bites when icons cross the boundary as props).
 */
export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");
  const groups = filterNavForRole(role);
  const Brand = BRAND_ICON;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="-ml-1 flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden"
        aria-label={t("openMenu")}
      >
        <Menu className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 duration-150 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 md:hidden" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80%] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg outline-none duration-150 md:hidden",
            "data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("menuTitle")}
          </DialogPrimitive.Title>
          <div className="flex h-12 items-center justify-between gap-2 border-b border-sidebar-border px-4">
            <div className="flex items-center gap-2">
              <Brand className="size-4 text-sidebar-foreground" aria-hidden="true" />
              <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
                Crate
              </span>
            </div>
            <DialogPrimitive.Close
              className="flex size-7 items-center justify-center rounded-md hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={t("closeMenu")}
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          {/* Close on link tap (event delegation) — navigation is the only way
              to change route from inside the drawer, so this covers it without
              a setState-in-effect on pathname. */}
          <nav
            className="flex-1 overflow-y-auto px-2 py-3"
            aria-label="Primary"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            {groups.map((g) => (
              <div key={g.labelKey} className="mb-4 last:mb-0">
                <div className="px-2 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t(`groups.${g.labelKey}`)}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <SidebarNavLink
                          href={item.href}
                          label={t(`items.${item.labelKey}`)}
                          icon={<Icon className="size-4 shrink-0" aria-hidden="true" />}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
