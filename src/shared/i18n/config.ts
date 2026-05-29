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

/**
 * Named date/time presets (DEC-008). Centralised so every table + page formats
 * dates identically and — crucially — locale-aware: the same preset renders
 * `30 May 2026` for `en` and `30 Mei 2026` for `id`, switched per-request by
 * the resolved locale. Reference by name: `format.dateTime(value, "date")`
 * (`useFormatter` on the client, `getFormatter` on the server).
 *
 * CURRENCY is deliberately NOT here — money stays fixed en-US/USD until a
 * currency-model [DECISION] exists (Vox veto: localising the symbol without a
 * stored currency misrepresents the amount). See DECISION LOG / Parking Lot.
 *
 * DEC-008a: time-bearing presets pin `hourCycle: "h23"` (24-hour, 00–23). We
 * localise the *words* (month names) and date *ordering* per locale, but keep
 * the *clock* fixed at 24h for operator scannability — `22:52` beats `10:52 PM`
 * in a data-dense ledger, and it keeps en/id consistent (en-US would otherwise
 * default to a 12-hour AM/PM clock). The `date` preset has no time, so no cycle.
 */
export const FORMATS = {
  dateTime: {
    /** Calendar date only — e.g. en "May 30, 2026" / id "30 Mei 2026". */
    date: { year: "numeric", month: "short", day: "2-digit" },
    /** Date + 24h minute — e.g. en "May 30, 2026, 14:05" / id "30 Mei 2026, 14.05". */
    dateTime: {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
    /** Audit-grade, second precision, 24h — e.g. "May 30, 2026, 14:05:09". */
    timestamp: {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    },
    /** Dense dashboard variant, no year, 24h — e.g. "May 30, 14:05". */
    compact: {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  },
} as const;
