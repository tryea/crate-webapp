import { requireRole } from "@/shared/lib/auth/require-role";

/**
 * Placeholder dashboard for Phase 2.2 plumbing test. Phase 3+ fills the
 * KPI cards, low-stock list, recent movements, etc.
 *
 * `requireRole("staff")` = anyone signed in can see this surface. CI grep
 * guardrail enforces the call.
 */
export default async function DashboardPage() {
  const { user } = await requireRole("staff");
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Crate · Dashboard</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome, {user.name ?? user.email}
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium">{user.role}</span>. Phase
          3 will fill this surface with KPIs and recent activity.
        </p>
      </header>
    </main>
  );
}
