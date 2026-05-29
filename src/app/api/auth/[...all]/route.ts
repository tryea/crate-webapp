import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/shared/lib/auth/server";

/**
 * BetterAuth catch-all handler. Exposes /api/auth/sign-in/email,
 * /api/auth/sign-up/email, /api/auth/sign-out, /api/auth/session, etc.
 * Per BetterAuth's Next.js App Router integration.
 */
export const { POST, GET } = toNextJsHandler(auth);
