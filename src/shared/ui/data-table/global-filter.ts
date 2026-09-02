/**
 * Global filter for `DataTable`.
 *
 * TanStack's default loses whole columns in two silent ways. Both were measured
 * against table-core 8.21.3 in CPP-FILTER-1 (3 Sep 2026) before this was written:
 *
 * 1. `getCanGlobalFilter` ends in `&& !!column.accessorFn`, so a column declared
 *    with `id` + `cell` alone is never searched at all. On the movements ledger
 *    that silently cost `type`, `product` and `location`.
 * 2. the default `getColumnCanGlobalFilter` reads
 *    `getCoreRowModel().flatRows[0]` and keeps a column only when THAT row's
 *    value is a string or a number. `reference` was dropped because the newest
 *    movement happens to have none, and `createdAt` because a Date is neither.
 *    Which columns were searchable therefore depended on one row's data, so the
 *    same code could behave differently tomorrow.
 *
 * The replacement searches the ROW rather than the column, so eligibility stops
 * depending on how a column was declared. Two normalisations carry their weight:
 *
 * - underscores become spaces. `count_correction` is stored with an underscore
 *   and displayed with a space, and people search for what they can see.
 * - the query is matched token by token, so word order and stray spaces do not
 *   decide the outcome.
 *
 * Deliberately NOT searchable: keys that hold an id, because a query like `a1`
 * would otherwise match any row whose uuid contains those characters, and Date
 * values, because their text form depends on locale and runtime (NEXT-GOTCHAS
 * 20: Intl answers differently under Bun and Node).
 */

/** Supplies a searchable value for a column whose text is not in the row. */
export type RowSearchValue<TData> = (
  row: TData,
) => string | number | null | undefined;

/** How deep a nested value is walked. Enough for `{ diff: { field: value } }`. */
const MAX_DEPTH = 2;

function isIdKey(key: string): boolean {
  // Case-sensitive on purpose: `categoryId` yes, `valid` no.
  return key === "id" || key.endsWith("Id") || key.endsWith("_id");
}

function collect(value: unknown, depth: number, out: string[]): void {
  if (value === null || value === undefined) return;

  if (typeof value === "string" || typeof value === "number") {
    out.push(String(value));
    return;
  }

  // Booleans read as "true"/"false" to nobody, and Dates are locale-dependent.
  if (typeof value === "boolean" || value instanceof Date) return;

  if (depth >= MAX_DEPTH) return;

  if (Array.isArray(value)) {
    for (const item of value) collect(item, depth + 1, out);
    return;
  }

  if (typeof value === "object") {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (isIdKey(key)) continue;
      collect(inner, depth + 1, out);
    }
  }
}

/** Lowercase, underscores to spaces, whitespace collapsed. */
export function normaliseSearchText(text: string): string {
  return text.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The searchable text of one row: every primitive it carries, plus whatever the
 * `searchValue` column metas contribute for text that is rendered from outside
 * the row (a lookup map, for instance).
 */
export function rowHaystack<TData>(
  original: TData,
  searchValues: readonly RowSearchValue<TData>[] = [],
): string {
  const parts: string[] = [];
  collect(original, 0, parts);

  for (const read of searchValues) {
    const value = read(original);
    if (value !== null && value !== undefined) parts.push(String(value));
  }

  return normaliseSearchText(parts.join(" "));
}

/** Every token of the query must appear somewhere in the row. */
export function matchesSearchQuery(haystack: string, query: string): boolean {
  const tokens = normaliseSearchText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => haystack.includes(token));
}
