import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Sidebar, MobileNav, NAV } from "@/widgets/sidebar";
import { Topbar } from "@/widgets/topbar";
import { CommandLauncher } from "@/widgets/command-palette";
import { Toaster } from "@/shared/ui/sonner";
import { getServerSessionResilient } from "@/shared/lib/auth/require-role";
import type { Role } from "@/shared/lib/auth/require-role";

/**
 * Authoritative server-side session check (proxy.ts at the edge is the
 * cheap pre-filter). Renders the app shell, rail + topbar, around the route
 * content.
 *
 * Shell contract (S3), and every line of it is load-bearing:
 *   - `data-app-shell` is what globals.css keys the page-level scroll lock
 *     off, so the marketing page and sign-in keep their own document scroll.
 *   - `.app-shell` is 100dvh; the rail and `.scroll` scroll independently
 *     with `overscroll-behavior: contain`.
 *   - EVERY child in that chain carries `min-height: 0`. Without it a grid or
 *     flex child refuses to shrink below its content and the overflow is
 *     clipped SILENTLY: the page still does not scroll, the gate still passes,
 *     and the content underneath is simply unreachable.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // DEC-024: resilient fetch, a transient DB throw is retried (invisible to
  // the operator); sustained failure fails closed to null then redirects
  // below, instead of throwing and crashing the whole shell to the root
  // boundary.
  const session = await getServerSessionResilient();
  if (!session) {
    redirect("/sign-in");
  }

  const t = await getTranslations("nav");
  const role = ((session.user as { role?: Role }).role ?? "staff") as Role;
  const user = {
    name: session.user.name,
    email: session.user.email,
    role,
  };

  // Built here, not inside the topbar: the nav tree belongs to the sidebar
  // widget and DEC-002 forbids a widget importing a sibling widget.
  const crumbLabels: Record<string, string> = {};
  for (const group of NAV) {
    for (const item of group.items) {
      crumbLabels[item.href] = t(`items.${item.labelKey}`);
    }
  }

  return (
    <div className="app-shell" data-app-shell>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t("skipToContent")}
      </a>
      <Sidebar role={role} />
      <div className="col">
        <Topbar
          crumbLabels={crumbLabels}
          user={user}
          actions={<CommandLauncher />}
          leading={<MobileNav role={role} />}
        />
        <div id="main-content" tabIndex={-1} className="scroll">
          {children}
        </div>
      </div>
      <Toaster />
    </div>
  );
}
