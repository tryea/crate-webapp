/**
 * Locale constants — the single source of truth for which languages exist,
 * the default, and the cookie that carries the choice (DEC-007: cookie-based,
 * no URL prefix). Lives in `shared` so the server request config, the locale
 * switcher feature, and any client component can all import it without a
 * cross-layer boundary violation.
 */
export const LOCALES = ["en", "id"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Matches next-intl's de-facto cookie name; written by the locale switcher. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}
