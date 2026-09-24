import "server-only";
import { asc, eq } from "drizzle-orm";
import { withReadContext } from "@/shared/lib/auth/read-context";
import { locations, products, warehouses } from "@/db/schema";

/**
 * Dropdown payloads for the stock-in form.
 *
 * Deliberately NOT folded into the sibling `loadMovementFormData`, which
 * carries the same two queries for stock-out, transfer and adjustment. The
 * duplication predates this move and merging the two is a behaviour question
 * for the route set, not part of binding the read path. Moved out of the page
 * unchanged so the route's read set has a name that a test can call.
 */
export async function loadStockInFormData() {
  const [productRows, locationRows] = await withReadContext(
    async (tx) =>
      Promise.all([
        tx
          .select({ id: products.id, sku: products.sku, name: products.name })
          .from(products)
          .where(eq(products.isActive, true))
          .orderBy(asc(products.name)),
        tx
          .select({
            id: locations.id,
            code: locations.code,
            warehouseName: warehouses.name,
          })
          .from(locations)
          .leftJoin(warehouses, eq(locations.warehouseId, warehouses.id))
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
