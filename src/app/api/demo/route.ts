import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/shared/lib/auth/server";
import {
  DEMO_FAILED_PARAM,
  DEMO_FAILED_VALUE,
  DEMO_LANDING_PATH,
  demoCredential,
} from "@/shared/lib/auth/demo-entry";

/**
 * FR-31: the demo door. The visitor presses a button, the server holds the
 * credential, and the browser comes back holding a session cookie.
 *
 * POST only, and reached by a plain `<form method="post">` rather than a
 * `fetch`: the entry then works before the sign-in page has hydrated, which is
 * exactly when an impatient visitor clicks (same race as NEXT-GOTCHAS 13).
 *
 * Public by design, so it is on the `check:auth-guards` allowlist: requiring a
 * role here would defeat the one thing it exists to do.
 */
export async function POST(req: NextRequest) {
  const credential = demoCredential();
  // No credential configured means the demo does not exist in this deployment.
  // 404 rather than 503: there is nothing here to come back for.
  if (!credential) return new NextResponse(null, { status: 404 });

  let signedIn: Response;
  try {
    signedIn = await auth.api.signInEmail({
      body: { email: credential.email, password: credential.password },
      headers: req.headers,
      asResponse: true,
    });
  } catch {
    return demoUnavailable();
  }
  // A wrong or rotated demo password is an operator problem, not a visitor
  // problem, so say so on the sign-in screen instead of showing a raw error.
  if (!signedIn.ok) return demoUnavailable();

  const res = new NextResponse(null, {
    // 303 so the browser turns the POST into a GET of the landing page.
    status: 303,
    // A RELATIVE Location, deliberately. Building an absolute URL out of
    // `req.url` would hand the visitor the origin this container sees rather
    // than the one they typed, which is the trap in NEXT-GOTCHAS 9.
    headers: { Location: DEMO_LANDING_PATH },
  });
  for (const cookie of signedIn.headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}

function demoUnavailable() {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/sign-in?${DEMO_FAILED_PARAM}=${DEMO_FAILED_VALUE}`,
    },
  });
}
