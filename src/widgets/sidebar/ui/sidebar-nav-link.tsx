"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

/**
 * Icon is passed as a pre-rendered ReactNode (not a component reference)
 * so it survives the Server→Client boundary. Lucide icons are
 * forwardRef-based — passing the component itself trips
 * "Functions cannot be passed directly to Client Components" in Next 16.
 */
export function SidebarNavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  const pathname = usePathname();
  const active =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      data-active={active || undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        "data-[active]:bg-sidebar-accent data-[active]:text-sidebar-accent-foreground",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
