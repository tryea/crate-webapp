import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  FORMATS,
  LOCALE_COOKIE,
  isLocale,
} from "@/shared/i18n/config";

/**
 * Per-request i18n config (DEC-007). Cookie-based, NO URL-locale prefix, so
 * `src/proxy.ts` stays single-purpose (auth + tenancy) and we never add
 * `next-intl/middleware`. The locale comes from the `NEXT_LOCALE` cookie
 * written by the UserMenu switcher; absent/invalid falls back to `en`.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    formats: FORMATS,
  };
});
