"use server";

import { cookies } from "next/headers";
import { requireRole } from "@/shared/lib/auth/require-role";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/shared/i18n/config";

/**
 * Persist the user's UI language to the NEXT_LOCALE cookie (DEC-007).
 *
 * Presentation-only and self-scoped (affects only the caller's own
 * rendering), but still gated to any authenticated user via requireRole so
 * the DEC-003 auth-guard invariant holds for every actions.ts. Tampered
 * values are ignored rather than written, the cookie can only ever hold a
 * known locale.
 */
export async function setLocale(locale: Locale): Promise<void> {
  await requireRole("staff");
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year, persists across sessions
    sameSite: "lax",
  });
}
