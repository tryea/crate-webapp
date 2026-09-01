"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { CommandPalette } from "./command-palette";

export function CommandLauncher() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("command");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* `.find` (globals.css) carries the shape AND hides itself below 900px,
          so there are no display utilities here to fight the media query. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="find"
        aria-label={t("launcherAria")}
      >
        <Search className="ic" strokeWidth={1.75} aria-hidden="true" />
        <span>{t("placeholder")}</span>
        <kbd suppressHydrationWarning>
          {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
