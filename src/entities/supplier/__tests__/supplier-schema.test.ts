/**
 * @jest-environment node
 *
 * Phase 8 coverage: supplierFormSchema optional-contact coercion. The
 * blank-string → null transform is the subtle bit: a form submits "" for an
 * untouched email field, and naive z.email() would reject it. Bima's gate.
 */
import { supplierFormSchema } from "../model/supplier-schema";

describe("supplierFormSchema: name", () => {
  test("name only is valid (all contact fields optional)", () => {
    const r = supplierFormSchema.safeParse({ name: "Acme Distributors" });
    expect(r.success).toBe(true);
  });

  test("blank name fails", () => {
    expect(supplierFormSchema.safeParse({ name: "" }).success).toBe(false);
  });

  test("name over 160 chars fails", () => {
    expect(supplierFormSchema.safeParse({ name: "x".repeat(161) }).success).toBe(false);
  });
});

describe("supplierFormSchema: optional email coercion", () => {
  test("blank email coerces to null", () => {
    const r = supplierFormSchema.safeParse({ name: "Acme", contactEmail: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contactEmail).toBeNull();
  });

  test("valid email passes through unchanged", () => {
    const r = supplierFormSchema.safeParse({ name: "Acme", contactEmail: "ops@acme.com" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contactEmail).toBe("ops@acme.com");
  });

  test("malformed email fails", () => {
    const r = supplierFormSchema.safeParse({ name: "Acme", contactEmail: "not-an-email" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("contactEmail"))).toBe(true);
    }
  });

  test("explicit null email is allowed", () => {
    const r = supplierFormSchema.safeParse({ name: "Acme", contactEmail: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contactEmail).toBeNull();
  });
});

describe("supplierFormSchema: optional text coercion", () => {
  test("blank phone / address coerce to null", () => {
    const r = supplierFormSchema.safeParse({
      name: "Acme",
      contactPhone: "",
      address: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contactPhone).toBeNull();
      expect(r.data.address).toBeNull();
    }
  });

  test("non-blank phone / address pass through", () => {
    const r = supplierFormSchema.safeParse({
      name: "Acme",
      contactPhone: "+62 812 0000",
      address: "Jl. Mawar 1",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contactPhone).toBe("+62 812 0000");
      expect(r.data.address).toBe("Jl. Mawar 1");
    }
  });

  test("over-length text fails", () => {
    expect(
      supplierFormSchema.safeParse({ name: "Acme", address: "x".repeat(201) }).success,
    ).toBe(false);
  });
});
