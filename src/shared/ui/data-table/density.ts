"use client";

import { useSyncExternalStore } from "react";

export type Density = "compact" | "normal" | "comfortable";
const STORAGE_KEY = "crate-table-density";
const CHANGE_EVENT = "crate-table-density-change";

export const DENSITY_CLASSES: Record<Density, { row: string; head: string; estPx: number }> = {
  compact: { row: "py-1.5 text-xs", head: "py-1.5 text-[11px]", estPx: 32 },
  normal: { row: "py-2.5 text-sm", head: "py-2 text-xs", estPx: 40 },
  comfortable: { row: "py-3.5 text-sm", head: "py-3 text-xs", estPx: 52 },
};

function getSnapshot(): Density {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "compact" || v === "normal" || v === "comfortable") return v;
  } catch {}
  return "normal";
}

function getServerSnapshot(): Density {
  return "normal";
}

function subscribe(notify: () => void): () => void {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

/**
 * React 19 idiomatic: useSyncExternalStore for the same reasons as
 * useTheme. Density persists across pages so an operator's compact
 * preference sticks.
 */
export function useDensity(): {
  density: Density;
  setDensity: (next: Density) => void;
} {
  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setDensity(next: Density) {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return { density, setDensity };
}
