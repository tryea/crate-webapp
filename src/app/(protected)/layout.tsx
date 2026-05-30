import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Sidebar, MobileNav } from "@/widgets/sidebar";
import { Topbar } from "@/widgets/topbar";
import { CommandLauncher } from "@/widgets/command-palette";
import { Toaster } from "@/shared/ui/sonner";
import { getServerSession } from "@/shared/lib/auth/require-role";
import type { Role } from "@/shared/lib/auth/require-role";

/**
 * Authoritative server-side session check (proxy.ts at the edge is the
 * cheap pre-filter). Renders the app shell — sidebar + topbar — around
 * the route content.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
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

  return (
    <div className="flex min-h-svh w-full">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t("skipToContent")}
      </a>
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          actions={<CommandLauncher />}
          leading={<MobileNav role={role} />}
        />
        <div id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          {children}
        </div>
      </div>
      <Toaster />
    </div>
  );
}
