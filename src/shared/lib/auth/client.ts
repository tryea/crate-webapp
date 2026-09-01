import { createAuthClient } from "better-auth/react";

/**
 * BetterAuth React client: hooks for sign-in/sign-up/sign-out and session
 * reads from client components.
 *
 *   const { data: session, isPending } = authClient.useSession();
 *   await authClient.signIn.email({ email, password });
 *
 * baseURL resolution order: match runtime origin first so the same image
 * works on every host without rebuild. NEXT_PUBLIC_APP_URL is inlined at
 * `bun run build`, so a missing build-arg silently bakes in localhost:3000
 * (production bug observed 2026-05-29 on app.crate.ersaptaaristo.dev).
 */
function resolveBaseURL(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: resolveBaseURL(),
});

export const { signIn, signUp, signOut, useSession } = authClient;
