/**
 * @jest-environment node
 *
 * Phase 8 coverage: categoryFormSchema slug rules + the pure suggestSlug
 * helper. Bima's gate per COUNCIL §0 rule 5 (Zod = validation SSOT). The
 * slug regex is a business rule SQL can't express, so it MUST be unit-tested.
 */
import {
  categoryFormSchema,
  suggestSlug,
} from "../model/category-schema";

describe("suggestSlug", () => {
  test("basic two words lowercased and dash-joined", () => {
    expect(suggestSlug("Cold Brews")).toBe("cold-brews");
  });

  test("trims and collapses runs of whitespace", () => {
    expect(suggestSlug("  Mixed   Nuts  ")).toBe("mixed-nuts");
  });

  test("strips characters outside [a-z0-9\\s-]", () => {
    expect(suggestSlug("Café & Tea!")).toBe("caf-tea");
  });

  test("collapses repeated dashes and trims edge dashes", () => {
    expect(suggestSlug("--Leading--Trailing--")).toBe("leading-trailing");
  });

  test("already-slug input is idempotent", () => {
    expect(suggestSlug("already-slug")).toBe("already-slug");
  });

  test("digits are preserved", () => {
    expect(suggestSlug("123 ABC")).toBe("123-abc");
  });

  test("all-symbol input yields empty string", () => {
    expect(suggestSlug("@#$%")).toBe("");
  });

  test("output (when non-empty) satisfies the schema slug regex", () => {
    for (const name of ["Cold Brews", "123 ABC", "Mixed   Nuts"]) {
      const slug = suggestSlug(name);
      const r = categoryFormSchema.safeParse({ name, slug });
      expect(r.success).toBe(true);
    }
  });
});

describe("categoryFormSchema: slug regex", () => {
  const valid = ["cold-brews", "ok123", "a", "a-b-c", "x1-y2"];
  const invalid = ["Cold-Brews", "-leading", "trailing-", "double--dash", "has space", "UPPER"];

  test.each(valid)("accepts well-formed slug %p", (slug) => {
    expect(categoryFormSchema.safeParse({ name: "X", slug }).success).toBe(true);
  });

  test.each(invalid)("rejects malformed slug %p", (slug) => {
    const r = categoryFormSchema.safeParse({ name: "X", slug });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("slug"))).toBe(true);
    }
  });
});

describe("categoryFormSchema: name + parentId", () => {
  test("blank name fails", () => {
    const r = categoryFormSchema.safeParse({ name: "", slug: "ok" });
    expect(r.success).toBe(false);
  });

  test("name over 120 chars fails", () => {
    const r = categoryFormSchema.safeParse({ name: "x".repeat(121), slug: "ok" });
    expect(r.success).toBe(false);
  });

  test("parentId is optional and nullable", () => {
    expect(categoryFormSchema.safeParse({ name: "X", slug: "ok" }).success).toBe(true);
    expect(
      categoryFormSchema.safeParse({ name: "X", slug: "ok", parentId: null }).success,
    ).toBe(true);
  });
});
