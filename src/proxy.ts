import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Per DEC-003 + Next 16 file convention: `proxy.ts` replaces `middleware.ts`.
 *
 * Cheap cookie-presence check only — the actual session validation happens
 * in the (protected) layout via getServerSession(). This split is intentional:
 * proxy runs at the edge and should not hit the DB on every navigation.
 *
 * Cookie naming is environment-dependent:
 *   dev (HTTP):       `crate.session_token`
 *   prod (HTTPS):     `__Secure-crate.session_token`
 *
 * RFC 6265bis: any cookie issued with the `Secure` flag and the `__Secure-`
 * prefix MUST keep that prefix in the Cookie header — browsers enforce.
 * BetterAuth auto-applies the prefix in production. Production deploy at
 * app.crate.ersaptaaristo.dev got bounced from /dashboard on 2026-05-29
 * because the proxy only knew the dev name.
 */
const SESSION_COOKIE_NAMES = ["__Secure-crate.session_token", "crate.session_token"];

export function proxy(req: NextRequest) {
  const hasSession = SESSION_COOKIE_NAMES.some(
    (name) => Boolean(req.cookies.get(name)?.value),
  );
  if (!hasSession) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
}

export const config = {
  /**
   * Expand this matcher as protected routes are added. Listing explicit
   * paths (instead of a "negative match-everything-except-auth" pattern)
   * keeps the guard auditable: a reviewer can read this and know exactly
   * which surfaces require auth.
   */
  matcher: [
    "/dashboard/:path*",
    "/products/:path*",
    "/movements/:path*",
    "/orders/:path*",
    "/catalog/:path*",
    "/warehouses/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/users/:path*",
    "/audit/:path*",
  ],
};
