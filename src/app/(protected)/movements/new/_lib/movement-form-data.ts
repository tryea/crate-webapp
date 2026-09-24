import "server-only";
import { asc, eq } from "drizzle-orm";
import { withReadContext } from "@/shared/lib/auth/read-context";
import { locations, products, warehouses } from "@/db/schema";

/**
 * Shared server loader for the new-movement form pages. All three flows
 * (stock-in, stock-out, transfer) need the same dropdown payloads.
 */
export async function loadMovementFormData() {
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
    "loadMovementFormData",
  );

  const locationOptions = locationRows.map((l) => ({
    id: l.id,
    code: l.code,
    warehouseName: l.warehouseName ?? "none",
  }));

  return { products: productRows, locations: locationOptions };
}
