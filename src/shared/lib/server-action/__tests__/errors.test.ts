/**
 * DEC-023 — pins the fail-closed seam every entity action delegates to.
 *
 * The catch blocks themselves need a live DB to fire, and our Jest tier is
 * pure-unit / no-DB (Bima/DEC-011) — so we do NOT fake a DB. Instead we pin
 * the HELPER, which is the actual security boundary: if it holds (generic
 * out, raw cause never in the returned `error`, real cause logged), then
 * every site that delegates to it holds by construction.
 */
import { unexpectedActionError } from "../errors";

describe("unexpectedActionError (DEC-023 info-disclosure seam)", () => {
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  test("returns the generic { ok:false } message by default", () => {
    const res = unexpectedActionError(new Error("boom"), "stockIn");
    expect(res).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
  });

  test("does NOT leak the raw cause (SQL/schema text) into the returned error", () => {
    // A real leaked cause from the DEC-013 RED: raw SQL, table/column names.
    const rawCause = new Error(
      'Failed query: select COALESCE(SUM("stock_movements"."quantity"), 0) from "stock_movements"',
    );
    const res = unexpectedActionError(rawCause, "stockOut");

    expect(res.ok).toBe(false);
    // The whole point: none of the raw cause survives into the client payload.
    expect(res.error).toBe("Something went wrong. Please try again.");
    expect(res.error).not.toContain("select");
    expect(res.error).not.toContain("stock_movements");
    expect(res.error).not.toContain("COALESCE");
    expect(res.error).not.toContain("Failed query");
  });

  test("preserves diagnostics — the real cause IS logged server-side (not swallowed)", () => {
    const rawCause = new Error('relation "po_lines" does not exist');
    unexpectedActionError(rawCause, "receivePo");

    // We close the leak without going blind: on-call can still find the cause.
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith("[action:receivePo]", rawCause);
  });

  test("tags the log with the call-site context, but never returns it to the client", () => {
    const res = unexpectedActionError(new Error("x"), "importProducts");
    expect(errSpy.mock.calls[0][0]).toBe("[action:importProducts]");
    expect(res.error).not.toContain("importProducts");
  });

  test("honors a domain override message but still logs the raw cause", () => {
    const rawCause = new Error("deadlock detected on table products");
    const res = unexpectedActionError(
      rawCause,
      "importProducts",
      "Import failed and was rolled back. Please check your file and try again.",
    );
    expect(res.error).toBe(
      "Import failed and was rolled back. Please check your file and try again.",
    );
    expect(res.error).not.toContain("deadlock");
    expect(res.error).not.toContain("products");
    expect(errSpy).toHaveBeenCalledWith("[action:importProducts]", rawCause);
  });

  test("handles a non-Error thrown value without leaking it", () => {
    // A `throw "some raw string"` must not become the client message either.
    const res = unexpectedActionError("raw thrown string with secret", "setPoStatus");
    expect(res.error).toBe("Something went wrong. Please try again.");
    expect(res.error).not.toContain("secret");
    expect(errSpy).toHaveBeenCalledWith(
      "[action:setPoStatus]",
      "raw thrown string with secret",
    );
  });
});
