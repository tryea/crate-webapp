import "server-only";
import { asc } from "drizzle-orm";
import { withReadContext } from "@/shared/lib/auth/read-context";
import { suppliers, warehouses } from "@/db/schema";

/**
 * Supplier and warehouse pickers for the purchase-order table filters.
 * Moved out of the page unchanged so the route's read set has a name that a
 * test can call.
 */
export async function loadOrdersLookups() {
  const [supplierRows, warehouseRows] = await withReadContext(
    async (tx) =>
      Promise.all([
        tx
          .select({ id: suppliers.id, name: suppliers.name })
          .from(suppliers)
          .orderBy(asc(suppliers.name)),
        tx
          .select({
            id: warehouses.id,
            name: warehouses.name,
            code: warehouses.code,
          })
          .from(warehouses)
          .orderBy(asc(warehouses.name)),
      ]),
    "loadOrdersLookups",
  );

  return { supplierRows, warehouseRows };
}
