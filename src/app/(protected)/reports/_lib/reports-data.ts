import "server-only";
import { asc, eq } from "drizzle-orm";
import { withReadContext } from "@/shared/lib/auth/read-context";
import { locations, products, warehouses } from "@/db/schema";

/**
 * The two reads the reports page issues itself, next to the three it gets
 * from the stock-movement entity. Moved out of the page unchanged so the
 * route's read set has a name that a test can call.
 */
export async function loadReportsLookups() {
  const [productRows, locationRows] = await withReadContext(
    async (tx) =>
      Promise.all([
        tx
          .select({
            id: products.id,
            sku: products.sku,
            name: products.name,
            reorderPoint: products.reorderPoint,
          })
          .from(products)
          .orderBy(asc(products.name)),
        tx
          .select({
            id: locations.id,
            code: locations.code,
            warehouseName: warehouses.name,
          })
          .from(locations)
          .leftJoin(warehouses, eq(locations.warehouseId, warehouses.id)),
      ]),
    "loadReportsLookups",
  );

  return { productRows, locationRows };
}
