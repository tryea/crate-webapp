import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { locations, products, warehouses } from "@/db/schema";

/**
 * Shared server loader for the new-movement form pages. All three flows
 * (stock-in, stock-out, transfer) need the same dropdown payloads.
 *
 * Scoping these two reads is what stops the form from offering a product or a
 * location the acting company does not own. The write path would refuse such a
 * movement anyway (ticket 1003 stamps the row with the caller's own company),
 * so an unscoped dropdown offers a choice that can only end in an error, on
 * top of naming rows the operator was never meant to see.
 */
export async function loadMovementFormData() {
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
    "loadMovementFormData",
  );

  const locationOptions = locationRows.map((l) => ({
    id: l.id,
    code: l.code,
    warehouseName: l.warehouseName ?? "none",
  }));

  return { products: productRows, locations: locationOptions };
}
