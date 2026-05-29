import { redirect } from "next/navigation";
import { Sidebar } from "@/widgets/sidebar";
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

  const role = ((session.user as { role?: Role }).role ?? "staff") as Role;
  const user = {
    name: session.user.name,
    email: session.user.email,
    role,
  };

  return (
    <div className="flex min-h-svh w-full">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} actions={<CommandLauncher />} />
        {children}
      </div>
      <Toaster />
    </div>
  );
}
