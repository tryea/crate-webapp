"use client";

import Papa from "papaparse";

/**
 * Browser-side CSV export. Serializes rows via PapaParse (RFC 4180
 * compliant quoting / escaping) and triggers a download.
 *
 * `escapeFormulae: true` (DEC-022) neutralizes CSV/formula injection:
 * a string cell leading with `= + - @` TAB or CR is prefixed with `'`
 * so spreadsheets treat it as text, not an executable formula. RFC-4180
 * quoting alone does NOT mitigate this — it fixes parsing, not evaluation.
 * Only string cells are escaped; numbers (e.g. a valuation `-5`) pass
 * through untouched. Any future server-side `Papa.unparse` caller must
 * pass `escapeFormulae: true` too — the library default is `false`.
 *
 * Server-side routes can call Papa.unparse directly and return the
 * string from a route handler if we ever need server-rendered CSV
 * (e.g. very large reports). For now, dashboard / reports surfaces
 * are small enough to serialize in the browser.
 */
export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: ReadonlyArray<T>,
  options?: { fields?: ReadonlyArray<keyof T & string> },
) {
  const csv = Papa.unparse(rows as T[], {
    columns: options?.fields as string[] | undefined,
    header: true,
    skipEmptyLines: false,
    escapeFormulae: true,
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the click handler time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Generates a filename with a stable date suffix (YYYY-MM-DD) so reports
 * across days don't overwrite each other.
 */
export function dateStampedFilename(base: string): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${base}-${stamp}.csv`;
}
