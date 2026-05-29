/**
 * @jest-environment node
 *
 * Phase 8 coverage — dateStampedFilename. The UTC date suffix keeps
 * day-over-day report exports from overwriting each other. downloadCsv
 * itself is thin DOM/IO glue over Papa.unparse (RFC-4180 escaping is the
 * library's job) and is exercised in the browser, not unit-tested here.
 */
import { dateStampedFilename } from "../export";

describe("dateStampedFilename", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("appends a UTC YYYY-MM-DD stamp and .csv suffix", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-30T15:30:00Z"));
    expect(dateStampedFilename("stock-on-hand")).toBe("stock-on-hand-2026-05-30.csv");
  });

  test("zero-pads single-digit month and day", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-05T00:00:00Z"));
    expect(dateStampedFilename("valuation")).toBe("valuation-2026-01-05.csv");
  });

  test("uses UTC, not local time, for the stamp", () => {
    // 23:30Z on the 30th is still the 30th in UTC regardless of runner TZ.
    jest.useFakeTimers().setSystemTime(new Date("2026-12-31T23:30:00Z"));
    expect(dateStampedFilename("audit")).toBe("audit-2026-12-31.csv");
  });
});
