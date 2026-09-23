import { NextResponse } from "next/server";

import { addToWaitlist } from "@/entities/waitlist/api/server";
import { waitlistSignupSchema } from "@/entities/waitlist/model/waitlist-schema";
import {
  WAITLIST_MAX_BODY_BYTES,
  corsHeadersFor,
} from "@/shared/lib/waitlist/cors";

/**
 * FR-32: the public waitlist door.
 *
 * This handler is deliberately PUBLIC, which is why it is listed in the
 * PUBLIC_ALLOWLIST of `scripts/check-auth-guards.sh`. A waitlist that requires
 * an account is not a waitlist. The marketing page at crate.ersaptaaristo.dev
 * is the only caller it exists for, and the row it writes belongs to nobody,
 * so there is no session to bind and no `requireRole` that would make sense.
 *
 * Node runtime, stated rather than inherited: the write goes through
 * postgres.js, which is not an edge-compatible driver.
 */
export const runtime = "nodejs";

/**
 * Never cached, never statically collected: this route exists to take writes.
 */
export const dynamic = "force-dynamic";

/**
 * Same body for a new address and for one already on the list.
 *
 * Answering "you are already on the list" would turn the endpoint into an
 * address oracle: anyone could ask it, one request at a time, whether a given
 * person has signed up. The page has no use for the difference either, it says
 * thank you in both cases.
 */
const ACCEPTED = { ok: true } as const;

function json(body: unknown, status: number, origin: string | null) {
  return NextResponse.json(body, {
    status,
    headers: corsHeadersFor(origin),
  });
}

/**
 * CORS preflight. The landing page lives on a different host from this app
 * (crate.ersaptaaristo.dev vs app.crate.ersaptaaristo.dev), so a JSON fetch
 * from it is preflighted. Answering with a named origin rather than `*` keeps
 * the allowlist auditable; see the note in shared/lib/waitlist/cors on why CORS
 * is what makes the page work and NOT what keeps the endpoint safe.
 */
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersFor(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  /**
   * Refuse oversized bodies before reading them. `Content-Length` is checked
   * first so a large payload is rejected without being pulled into memory; the
   * byte length of what actually arrived is checked again afterwards, because
   * a chunked request carries no length to check up front.
   */
  const declaredLength = Number(request.headers.get("content-length") ?? NaN);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > WAITLIST_MAX_BODY_BYTES
  ) {
    return json({ ok: false, error: "Request body too large." }, 413, origin);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(
      { ok: false, error: "Could not read the request body." },
      400,
      origin,
    );
  }

  if (Buffer.byteLength(raw, "utf8") > WAITLIST_MAX_BODY_BYTES) {
    return json({ ok: false, error: "Request body too large." }, 413, origin);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Expected a JSON body." }, 400, origin);
  }

  const parsed = waitlistSignupSchema.safeParse(parsedBody);
  if (!parsed.success) {
    /**
     * One fixed sentence, and never the submitted value. Echoing input back is
     * how a JSON endpoint becomes a reflection gadget; the caller knows what it
     * sent, and the page only has one field to highlight.
     */
    return json(
      { ok: false, error: "Enter a valid email address." },
      400,
      origin,
    );
  }

  try {
    await addToWaitlist(parsed.data);
  } catch {
    /**
     * Domain boundary: a Postgres error message can name tables, constraints
     * and hosts. The caller gets a sentence, the operator gets the stack in the
     * server log.
     */
    return json(
      { ok: false, error: "Could not record that address." },
      500,
      origin,
    );
  }

  return json(ACCEPTED, 200, origin);
}
