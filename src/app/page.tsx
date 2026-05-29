import { redirect } from "next/navigation";
import { getServerSession } from "@/shared/lib/auth/require-role";

/*
 * Root entry. The marketing landing lives at a different domain
 * (crate.ersaptaaristo.dev, per DEC-005). app.crate.ersaptaaristo.dev
 * is purely the authenticated product surface — so the root just
 * routes the visitor into the correct app flow:
 *
 *   - Has a valid session → /dashboard
 *   - No session          → /sign-in
 *
 * Server Component so the redirect happens before any HTML ships
 * (no flash of unauthorized content). No client JS needed for this
 * route — it's a 307 from the server.
 */
export default async function Home() {
  const session = await getServerSession();
  redirect(session ? "/dashboard" : "/sign-in");
}
