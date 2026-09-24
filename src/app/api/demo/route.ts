import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/shared/lib/auth/server";
import {
  DEMO_FAILED_PARAM,
  DEMO_FAILED_VALUE,
  DEMO_LANDING_PATH,
  demoCredential,
} from "@/shared/lib/auth/demo-entry";
import {
  demoClientKey,
  takeDemoRateLimitSlot,
} from "@/shared/lib/auth/demo-rate-limit";

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

  // FR-31 leaves this door open to strangers on purpose; FR-35 is what keeps a
  // stranger from walking through it without end. The cap sits AFTER the 404 so
  // an unconfigured deployment stays a plain 404 and spends no state on probes,
  // and BEFORE the sign-in call so a refused caller mints nothing.
  const verdict = takeDemoRateLimitSlot(demoClientKey(req.headers));
  if (!verdict.allowed) return tooManyDemoSessions(verdict.retryAfterSeconds);

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

/**
 * 429, not the 303 the other refusals use. A visitor who clicks once never sees
 * this, so the realistic reader is a script, and `Retry-After` is the answer a
 * script can act on. Keeping it distinct from `?demo=unavailable` also keeps
 * the operator signal honest: that flag means the credential is wrong, and a
 * flood should not be able to dress itself up as a rotated password.
 */
function tooManyDemoSessions(retryAfterSeconds: number) {
  return new NextResponse(
    JSON.stringify({ message: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfterSeconds),
      },
    },
  );
}

function demoUnavailable() {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/sign-in?${DEMO_FAILED_PARAM}=${DEMO_FAILED_VALUE}`,
    },
  });
}
