/**
 * next-intl type augmentation (DEC-008). Registers our named date/time presets
 * with `AppConfig["Formats"]` so `format.dateTime(value, "date")` autocompletes
 * the preset name and rejects unknown ones at compile time.
 *
 * We augment ONLY `Formats`. We deliberately do NOT add `Messages` here: doing
 * so would type-check every existing `t("…")` call against `en.json`, a large
 * out-of-scope surface. Keep message-key safety as a separate future decision.
 */
declare module "next-intl" {
  interface AppConfig {
    Formats: typeof import("@/shared/i18n/config").FORMATS;
  }
}

export {};
