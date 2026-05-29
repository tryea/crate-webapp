/**
 * @jest-environment node
 *
 * Phase 8 coverage — warehouse + location form schemas. Codes are
 * uppercase-dashed (CODE_REGEX) and the optional text fields use the
 * blank-string → null transform so a blank input persists as NULL.
 */
import {
  warehouseFormSchema,
  locationFormSchema,
} from "../model/warehouse-schema";

describe("warehouseFormSchema — code regex", () => {
  test.each(["WH", "WH-1", "A1", "MAIN-DC-01"])("accepts %p", (code) => {
    expect(warehouseFormSchema.safeParse({ name: "Main", code }).success).toBe(true);
  });

  test.each(["wh-1", "-WH", "WH 1", "WH_1", ""])("rejects %p", (code) => {
    expect(warehouseFormSchema.safeParse({ name: "Main", code }).success).toBe(false);
  });
});

describe("warehouseFormSchema — name + address", () => {
  test("blank name fails", () => {
    expect(warehouseFormSchema.safeParse({ name: "", code: "WH" }).success).toBe(false);
  });

  test("blank address coerces to null", () => {
    const r = warehouseFormSchema.safeParse({ name: "Main", code: "WH", address: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.address).toBeNull();
  });

  test("non-blank address passes through", () => {
    const r = warehouseFormSchema.safeParse({
      name: "Main",
      code: "WH",
      address: "Jl. Industri 5",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.address).toBe("Jl. Industri 5");
  });
});

describe("locationFormSchema", () => {
  test("code only is valid; name optional", () => {
    expect(locationFormSchema.safeParse({ code: "A1" }).success).toBe(true);
  });

  test("blank name coerces to null", () => {
    const r = locationFormSchema.safeParse({ code: "A1", name: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBeNull();
  });

  test("lowercase code rejected", () => {
    expect(locationFormSchema.safeParse({ code: "a1" }).success).toBe(false);
  });
});
