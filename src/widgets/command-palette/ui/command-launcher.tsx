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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 rounded-md border border-input bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={t("launcherAria")}
      >
        <Search className="size-3.5" aria-hidden="true" />
        <span>{t("placeholder")}</span>
        <kbd
          className="ml-2 font-mono text-[10px] rounded border border-border/80 bg-background px-1 py-0.5"
          suppressHydrationWarning
        >
          {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
