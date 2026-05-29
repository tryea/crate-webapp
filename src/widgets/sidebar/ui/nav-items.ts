import {
  ArrowDownUp,
  Building2,
  ClipboardList,
  FileBarChart,
  FolderTree,
  Gauge,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  UsersRound,
  Warehouse,
} from "lucide-react";
import type { Role } from "@/shared/lib/auth/require-role";

export type NavItem = {
  href: string;
  /** Message key under `nav.items.*` (resolved in the sidebar via getTranslations). */
  labelKey: string;
  icon: typeof Gauge;
  minRole: Role;
};

export type NavGroup = {
  /** Message key under `nav.groups.*`. */
  labelKey: string;
  items: NavItem[];
};

/**
 * Sidebar nav, RBAC-aware. Items filtered server-side in the sidebar
 * widget so HTML never ships admin links to staff (defense in depth).
 * Labels are i18n keys (DEC-007) resolved at render time, not literals.
 *
 * Order + grouping per docs/design/01-app-shell-direction.md.
 */
export const NAV: NavGroup[] = [
  {
    labelKey: "inventory",
    items: [
      { href: "/dashboard", labelKey: "dashboard", icon: Gauge, minRole: "staff" },
      { href: "/catalog", labelKey: "products", icon: Package, minRole: "staff" },
      { href: "/movements", labelKey: "movements", icon: ArrowDownUp, minRole: "staff" },
      { href: "/orders", labelKey: "orders", icon: ClipboardList, minRole: "staff" },
    ],
  },
  {
    labelKey: "insights",
    items: [
      { href: "/reports", labelKey: "reports", icon: FileBarChart, minRole: "staff" },
      { href: "/audit", labelKey: "audit", icon: ScrollText, minRole: "manager" },
    ],
  },
  {
    labelKey: "setup",
    items: [
      { href: "/catalog/categories", labelKey: "categories", icon: FolderTree, minRole: "staff" },
      { href: "/catalog/suppliers", labelKey: "suppliers", icon: Building2, minRole: "staff" },
      { href: "/catalog/warehouses", labelKey: "warehouses", icon: Warehouse, minRole: "staff" },
      { href: "/users", labelKey: "users", icon: UsersRound, minRole: "admin" },
      { href: "/settings", labelKey: "settings", icon: Settings, minRole: "admin" },
    ],
  },
];

const ROLE_RANK: Record<Role, number> = { staff: 1, manager: 2, admin: 3 };

export function filterNavForRole(role: Role): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => ROLE_RANK[role] >= ROLE_RANK[i.minRole]),
  })).filter((g) => g.items.length > 0);
}

export const BRAND_ICON = ShieldCheck;
