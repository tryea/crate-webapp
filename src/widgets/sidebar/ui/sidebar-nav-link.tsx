"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Icon is passed as a pre-rendered ReactNode (not a component reference)
 * so it survives the Server→Client boundary. Lucide icons are
 * forwardRef-based, so passing the component itself trips
 * "Functions cannot be passed directly to Client Components" in Next 16.
 *
 * Styling lives on `.rail nav a` in globals.css: the rail is constant chrome
 * in BOTH themes, so its ink comes from the rail tokens, never from the
 * theme tokens. A `text-sidebar-foreground/80` here would be grey text by
 * another name and would go missing in one of the two modes.
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
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
