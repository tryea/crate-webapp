import "server-only";
import { asc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { suppliers, warehouses } from "@/db/schema";

/**
 * Supplier and warehouse pickers for the purchase-order table filters.
 * Moved out of the page unchanged so the route's read set has a name that a
 * test can call.
 *
 * A picker is a leak with a smaller audience, not a smaller leak: the names in
 * these two dropdowns are the other company's supplier list and warehouse
 * list, and a filter built from them would then select against rows this
 * company cannot see anyway.
 */
export async function loadOrdersLookups() {
  const [supplierRows, warehouseRows] = await withCompanyReadContext(
    async (tx, companyId) =>
      Promise.all([
        tx
          .select({ id: suppliers.id, name: suppliers.name })
          .from(suppliers)
          .where(eq(suppliers.companyId, companyId))
          .orderBy(asc(suppliers.name)),
        tx
          .select({
            id: warehouses.id,
            name: warehouses.name,
            code: warehouses.code,
          })
          .from(warehouses)
          .where(eq(warehouses.companyId, companyId))
          .orderBy(asc(warehouses.name)),
      ]),
    "loadOrdersLookups",
  );

  return { supplierRows, warehouseRows };
}
