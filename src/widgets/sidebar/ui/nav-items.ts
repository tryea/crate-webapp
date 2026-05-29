import {
  ArrowDownUp,
  ClipboardList,
  FileBarChart,
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
  label: string;
  icon: typeof Gauge;
  minRole: Role;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * Sidebar nav, RBAC-aware. Items filtered server-side in the sidebar
 * widget so HTML never ships admin links to staff (defense in depth).
 *
 * Order + grouping per docs/design/01-app-shell-direction.md.
 */
export const NAV: NavGroup[] = [
  {
    label: "Inventory",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Gauge, minRole: "staff" },
      { href: "/catalog", label: "Catalog", icon: Package, minRole: "staff" },
      { href: "/movements", label: "Movements", icon: ArrowDownUp, minRole: "staff" },
      { href: "/orders", label: "Purchase orders", icon: ClipboardList, minRole: "staff" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: FileBarChart, minRole: "staff" },
      { href: "/audit", label: "Audit log", icon: ScrollText, minRole: "manager" },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/warehouses", label: "Warehouses", icon: Warehouse, minRole: "manager" },
      { href: "/users", label: "Users", icon: UsersRound, minRole: "admin" },
      { href: "/settings", label: "Settings", icon: Settings, minRole: "admin" },
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
