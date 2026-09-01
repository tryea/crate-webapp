import { getTranslations } from "next-intl/server";
import type { Role } from "@/shared/lib/auth/require-role";
import { listWarehousesServer } from "@/entities/warehouse/api/server";
import { filterNavForRole } from "./nav-items";
import { SidebarNavLink } from "./sidebar-nav-link";
import { BrandMark } from "./brand-mark";
import { ScopeBlock } from "./scope-block";

/**
 * The rail is near-black in BOTH themes. That is structure, not taste: light
 * mode only has white and near-white to work with, so without one constant
 * dark spine the page has no backbone. Navigation is the constant; the work
 * area is what swaps. Everything inside here therefore uses the rail tokens
 * (see globals.css), never the theme tokens.
 */
export async function Sidebar({ role }: { role: Role }) {
  const groups = filterNavForRole(role);
  const t = await getTranslations("nav");
  const warehouses = await listWarehousesServer();

  return (
    <div className="rail">
      <span className="top">
        <BrandMark />
        Crate
      </span>

      <ScopeBlock
        warehouses={warehouses.map((w) => ({
          id: w.id,
          name: w.name,
          code: w.code,
        }))}
      />

      <nav aria-label="Primary">
        {groups.map((g) => (
          <div key={g.labelKey}>
            <p className="navgrp">{t(`groups.${g.labelKey}`)}</p>
            {g.items.map((item) => {
              const Icon = item.icon;
              return (
                <SidebarNavLink
                  key={item.href}
                  href={item.href}
                  label={t(`items.${item.labelKey}`)}
                  icon={
                    <Icon className="ic" strokeWidth={1.75} aria-hidden="true" />
                  }
                />
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
