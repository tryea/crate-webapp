import { redirect } from "next/navigation";
import { getServerSession } from "@/shared/lib/auth/require-role";

/**
 * Layout-level belt-and-suspenders check.
 *
 * The cheap proxy.ts cookie-presence check at the edge catches 99% of
 * unauth requests cheaply. This server-side getServerSession() is the
 * authoritative validation — it hits the DB and returns the real session
 * object. If the cookie was forged or stale, we land here, see no session,
 * and redirect.
 *
 * Per DEC-003 §implementation gate.
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
  return <>{children}</>;
}
