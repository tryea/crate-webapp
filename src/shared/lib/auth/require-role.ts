import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./server";

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
 * CI grep guardrail (DEC-003 §implementation gate) enforces every file in
 * src/app/<area>/{route.ts,actions.ts} contains `requireRole`.
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
