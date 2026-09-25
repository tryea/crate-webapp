import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { locations, products, warehouses } from "@/db/schema";

/**
 * The two reads the reports page issues itself, next to the three it gets
 * from the stock-movement entity. Moved out of the page unchanged so the
 * route's read set has a name that a test can call.
 *
 * These rows label the CSV exports (FR-09), so an unscoped read here does not
 * just show another company's catalogue on screen, it writes it into a file
 * the operator downloads.
 */
export async function loadReportsLookups() {
  const [productRows, locationRows] = await withCompanyReadContext(
    async (tx, companyId) =>
      Promise.all([
        tx
          .select({
            id: products.id,
            sku: products.sku,
            name: products.name,
            reorderPoint: products.reorderPoint,
          })
          .from(products)
          .where(eq(products.companyId, companyId))
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
          .where(eq(locations.companyId, companyId)),
      ]),
    "loadReportsLookups",
  );

  return { productRows, locationRows };
}
