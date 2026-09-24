import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { locations, products, warehouses } from "@/db/schema";

/**
 * The two reads the reports page issues itself, next to the three it gets
 * from the stock-movement entity. Moved out of the page unchanged so the
 * route's read set has a name that a test can call.
 */
export async function loadReportsLookups() {
  const [productRows, locationRows] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        reorderPoint: products.reorderPoint,
      })
      .from(products)
      .orderBy(asc(products.name)),
    db
      .select({
        id: locations.id,
        code: locations.code,
        warehouseName: warehouses.name,
      })
      .from(locations)
      .leftJoin(warehouses, eq(locations.warehouseId, warehouses.id)),
  ]);

  return { productRows, locationRows };
}
