import type { Role } from "@/shared/lib/auth/require-role";
import { BRAND_ICON, filterNavForRole } from "./nav-items";
import { SidebarNavLink } from "./sidebar-nav-link";

export function Sidebar({ role }: { role: Role }) {
  const groups = filterNavForRole(role);
  const Brand = BRAND_ICON;

  return (
    <aside
      className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
      aria-label="Primary"
    >
      <div className="flex h-12 items-center gap-2 px-4 border-b border-sidebar-border">
        <Brand className="size-4 text-sidebar-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          Crate
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((g) => (
          <div key={g.label} className="mb-4 last:mb-0">
            <div
              className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 font-mono"
            >
              {g.label}
            </div>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <SidebarNavLink
                      href={item.href}
                      label={item.label}
                      icon={<Icon className="size-4 shrink-0" aria-hidden="true" />}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
