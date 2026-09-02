import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./server";
import { resolveSessionWithRetry } from "./session-retry";

export type Role = "admin" | "manager" | "staff";

const ROLE_RANK: Record<Role, number> = {
  staff: 1,
  manager: 2,
  admin: 3,
};

/**
 * Resolve the current session from request cookies (server-side).
 *
 * Returns null when no session (caller can choose redirect vs JSON 401).
 */
export async function getServerSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * DEC-024 — resilient variant for the authenticated shell layout.
 *
 * BetterAuth's `getSession` returns `null` for no/expired session but THROWS
 * `APIError(INTERNAL_SERVER_ERROR)` on a DB/infra failure. The bare
 * `getServerSession` lets that throw escape, which crashes the entire shell to
 * the root error boundary (`<Toaster>` included). This wrapper retries a
 * transient throw (the common cold-tunnel blip becomes invisible) and FAILS
 * CLOSED to `null` on sustained failure — so the layout's existing
 * `if (!session) redirect("/sign-in")` covers infra failure too, without ever
 * rendering authed chrome unverified. See `session-retry.ts` for the contract.
 */
export async function getServerSessionResilient(): Promise<Session | null> {
  return resolveSessionWithRetry(
    async () => auth.api.getSession({ headers: await headers() }),
    { context: "protected-layout" },
  );
}

/**
 * Gate a Server Action / route handler. Throws by redirecting to /sign-in
 * if unauthenticated; throws a 403 if authenticated but role-insufficient.
 *
 * Usage in every protected mutation (DEC-003 invariant):
 *
 *   "use server";
 *   export async function deleteProduct(id: string) {
 *     const { user } = await requireRole("manager");
 *     // ... safe to mutate
 *   }
 *
 * CI grep guardrail (DEC-003 §implementation gate, scripts/check-auth-guards.sh)
 * enforces that every route.ts / actions.ts across the FSD layout — src/app,
 * src/entities, src/features, src/widgets, src/screens (the real mutation
 * surface is each entity's api/actions.ts) — contains `requireRole`.
 */
export async function requireRole(min: Role): Promise<{
  session: Session;
  user: Session["user"] & { role: Role };
}> {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const role = ((session.user as { role?: Role }).role ?? "staff") as Role;
  if (ROLE_RANK[role] < ROLE_RANK[min]) {
    // 403 path — re-thrown to the nearest error boundary.
    throw new Error(
      `Forbidden: ${role} cannot perform action requiring ${min}.`,
    );
  }

  return { session, user: { ...session.user, role } };
}

/**
 * PAGE-level role gate (the counterpart to `requireRole`, which is for
 * actions/route handlers). Use this at the top of a Server Component page.
 *
 * Why a separate helper: `requireRole` THROWS on insufficient role, which
 * surfaces as the generic `error.tsx` boundary ("Something went wrong"). For
 * a *page* that's a poor dead-end, and — critically — Next.js strips Server
 * Component error messages in production, so `error.tsx` can't tell a 403
 * apart from a real crash to render a tailored message. Redirecting is both
 * better UX and works identically in dev and prod. The sidebar is already
 * RBAC-filtered, so the only way to hit this is typing the URL directly.
 *
 *   export default async function UsersPage() {
 *     const { user } = await requireRolePage("admin");
 *     // ... render
 *   }
 */
export async function requireRolePage(
  min: Role,
  opts: { redirectTo?: string } = {},
): Promise<{ session: Session; user: Session["user"] & { role: Role } }> {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const role = ((session.user as { role?: Role }).role ?? "staff") as Role;
  if (ROLE_RANK[role] < ROLE_RANK[min]) {
    redirect(opts.redirectTo ?? "/dashboard");
  }

  return { session, user: { ...session.user, role } };
}
