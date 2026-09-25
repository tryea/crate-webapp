import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { products } from "@/db/schema";

/**
 * Active products offered by the add-line picker on a purchase order.
 * Moved out of the page unchanged so the route's read set has a name that a
 * test can call.
 */
export async function loadOrderDetailProducts() {
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          costPrice: products.costPrice,
        })
        .from(products)
        .where(
          and(eq(products.isActive, true), eq(products.companyId, companyId)),
        )
        .orderBy(asc(products.name)),
    "loadOrderDetailProducts",
  );
}
