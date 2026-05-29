import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { locations, products, warehouses } from "@/db/schema";

/**
 * Shared server loader for the new-movement form pages. All three flows
 * (stock-in, stock-out, transfer) need the same dropdown payloads.
 */
export async function loadMovementFormData() {
  const [productRows, locationRows] = await Promise.all([
    db
      .select({ id: products.id, sku: products.sku, name: products.name })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.name)),
    db
      .select({
        id: locations.id,
        code: locations.code,
        warehouseName: warehouses.name,
      })
      .from(locations)
      .leftJoin(warehouses, eq(locations.warehouseId, warehouses.id))
      .orderBy(asc(warehouses.name), asc(locations.code)),
  ]);

  const locationOptions = locationRows.map((l) => ({
    id: l.id,
    code: l.code,
    warehouseName: l.warehouseName ?? "—",
  }));

  return { products: productRows, locations: locationOptions };
}
