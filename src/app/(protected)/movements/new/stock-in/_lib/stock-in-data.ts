import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { locations, products, warehouses } from "@/db/schema";

/**
 * Dropdown payloads for the stock-in form.
 *
 * Deliberately NOT folded into the sibling `loadMovementFormData`, which
 * carries the same two queries for stock-out, transfer and adjustment. The
 * duplication predates this move and merging the two is a behaviour question
 * for the route set, not part of binding the read path. Moved out of the page
 * unchanged so the route's read set has a name that a test can call.
 *
 * The company predicate is repeated here rather than shared for the same
 * reason: the copy is the thing that has to be scoped, and a reader comparing
 * the two files should see the same filter twice rather than wonder which of
 * them is the exception.
 */
export async function loadStockInFormData() {
  const [productRows, locationRows] = await withCompanyReadContext(
    async (tx, companyId) =>
      Promise.all([
        tx
          .select({ id: products.id, sku: products.sku, name: products.name })
          .from(products)
          .where(
            and(eq(products.isActive, true), eq(products.companyId, companyId)),
          )
          .orderBy(asc(products.name)),
        tx
          .select({
            id: locations.id,
            code: locations.code,
            warehouseName: warehouses.name,
          })
          .from(locations)
          .leftJoin(
            warehouses,
            and(
              eq(locations.warehouseId, warehouses.id),
              eq(warehouses.companyId, companyId),
            ),
          )
          .where(eq(locations.companyId, companyId))
          .orderBy(asc(warehouses.name), asc(locations.code)),
      ]),
    "loadStockInFormData",
  );

  const locationOptions = locationRows.map((l) => ({
    id: l.id,
    code: l.code,
    warehouseName: l.warehouseName ?? "none",
  }));

  return { products: productRows, locations: locationOptions };
}
