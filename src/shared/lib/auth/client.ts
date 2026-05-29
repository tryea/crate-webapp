import { createAuthClient } from "better-auth/react";

/**
 * BetterAuth React client — hooks for sign-in/sign-up/sign-out and session
 * reads from client components.
 *
 *   const { data: session, isPending } = authClient.useSession();
 *   await authClient.signIn.email({ email, password });
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});

export const { signIn, signUp, signOut, useSession } = authClient;
