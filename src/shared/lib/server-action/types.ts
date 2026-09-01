/**
 * Generic Server Action discriminated-union return type. Used across
 * all entity-level mutation actions (Category, Supplier, Warehouse, …).
 *
 * The shape:
 *  - ok: true  → `data` carries the row
 *  - ok: false → `error` is a one-line human message + optional
 *                `fieldErrors` for inline RHF field mapping
 *
 * Pattern lives in shared because every entity returns one (entity↔entity
 * imports are disallowed by FSD boundaries, DEC-002).
 */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };
