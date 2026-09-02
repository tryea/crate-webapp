import { safeCallbackPath } from "../safe-redirect";

const NUL = String.fromCharCode(0);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const TAB = String.fromCharCode(9);

describe("safeCallbackPath (DEC-026 open-redirect guard)", () => {
  describe("accepts safe same-site root-relative paths", () => {
    it.each([
      "/dashboard",
      "/orders",
      "/catalog/warehouses/123",
      "/orders?status=draft",
      "/orders?status=draft#tab",
      "/catalog/import?from=/orders", // an inner slash is fine; only the prefix matters
    ])("passes %p through unchanged", (path) => {
      expect(safeCallbackPath(path)).toBe(path);
    });
  });

  describe("falls back on empty / missing input", () => {
    it.each([null, undefined, ""])("maps %p to the default fallback", (raw) => {
      expect(safeCallbackPath(raw)).toBe("/dashboard");
    });

    it("honors a custom fallback", () => {
      expect(safeCallbackPath(null, "/sign-in")).toBe("/sign-in");
      expect(safeCallbackPath("https://evil.com", "/sign-in")).toBe("/sign-in");
    });
  });

  describe("rejects off-origin redirect payloads (the actual CWE-601 vectors)", () => {
    it.each([
      "https://evil.com",
      "http://evil.com/phish",
      "https://evil.com/sign-in?next=/dashboard",
      "//evil.com", // protocol-relative
      "//evil.com/path",
      "/\\evil.com", // backslash -> browsers normalize to "//"
      "/\\/evil.com",
      "javascript:alert(1)", // no leading slash
      "data:text/html,<script>1</script>",
      "  //evil.com", // leading whitespace -> first char is not "/"
      "\\/\\/evil.com", // both leading backslashes
      "mailto:a@b.c",
    ])("maps %p to the fallback", (payload) => {
      expect(safeCallbackPath(payload)).toBe("/dashboard");
    });

    it("rejects control-char-laced values that could re-expose a host", () => {
      expect(safeCallbackPath("/foo" + NUL + "//evil.com")).toBe("/dashboard");
      expect(safeCallbackPath("/foo" + CR + LF + "//evil")).toBe("/dashboard");
      expect(safeCallbackPath("/foo" + TAB + "bar")).toBe("/dashboard");
    });
  });
});
