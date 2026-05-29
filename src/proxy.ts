import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Per DEC-003 + Next 16 file convention: `proxy.ts` replaces `middleware.ts`.
 *
 * Cheap cookie-presence check only — the actual session validation happens
 * in the (protected) layout via getServerSession(). This split is intentional:
 * proxy runs at the edge and should not hit the DB on every navigation.
 *
 * Cookie name: BetterAuth default is `<prefix>.session_token`, we set
 * `cookiePrefix: "crate"` in shared/lib/auth/server.ts.
 */
const SESSION_COOKIE = "crate.session_token";

export function proxy(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
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
