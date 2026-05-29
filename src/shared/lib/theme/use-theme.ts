"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "crate-theme";
const CHANGE_EVENT = "crate-theme-change";

function applyDarkClass(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  return dark;
}

function getServerSnapshot(): Theme {
  return "system";
}

function getSnapshot(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
  } catch {
    return "system";
  }
}

function subscribe(notify: () => void): () => void {
  // Cross-tab updates via the native storage event.
  window.addEventListener("storage", notify);
  // Same-tab updates via our dispatched event (setTheme below).
  window.addEventListener(CHANGE_EVENT, notify);
  // OS-level theme change while user is on "system".
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
    mql.removeEventListener("change", notify);
  };
}

/**
 * React 19 idiomatic: useSyncExternalStore reads localStorage without the
 * setState-in-effect anti-pattern. The store IS the localStorage entry,
 * subscribers are notified via a custom event when setTheme writes.
 *
 * Storage value is a flat string ("light" | "dark" | "system") so the
 * pre-hydration THEME_SCRIPT can read it without parsing.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const resolvedDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  function setTheme(next: Theme) {
    localStorage.setItem(STORAGE_KEY, next);
    applyDarkClass(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return { theme, setTheme, resolvedDark };
}
