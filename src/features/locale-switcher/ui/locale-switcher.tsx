"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/shared/ui/dropdown-menu";
import { LOCALES, type Locale } from "@/shared/i18n/config";
import { setLocale } from "../model/actions";

/**
 * Language radio group for the UserMenu (DEC-007). Writes the NEXT_LOCALE
 * cookie via the server action, then router.refresh() so Server Components
 * re-render in the new locale, the documented cookie-mode switch (no URL
 * change, persists across sessions).
 */
export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const current = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onValueChange(value: string) {
    const next = value as Locale;
    if (next === current) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <DropdownMenuRadioGroup value={current} onValueChange={onValueChange}>
      <DropdownMenuLabel className="eyebrow">
        {t("label")}
      </DropdownMenuLabel>
      {LOCALES.map((loc) => (
        <DropdownMenuRadioItem
          key={loc}
          value={loc}
          disabled={isPending}
          className="gap-2"
        >
          {t(loc)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
