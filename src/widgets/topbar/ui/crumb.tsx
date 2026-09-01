"use client";

import { usePathname } from "next/navigation";

/**
 * The topbar states WHERE you are, in the same words the rail uses. Labels
 * are passed in from the server as a plain path→label record so this stays a
 * lookup, not a second copy of the nav tree.
 */
export function Crumb({ labels }: { labels: Record<string, string> }) {
  const pathname = usePathname();
  const match = Object.keys(labels)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return <span className="crumb">{match ? labels[match] : "Crate"}</span>;
}
