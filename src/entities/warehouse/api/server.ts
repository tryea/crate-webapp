import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import {
  locations,
  warehouses,
  type Location,
  type Warehouse,
} from "@/db/schema";

export async function listWarehousesServer(): Promise<Warehouse[]> {
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(warehouses)
        .where(eq(warehouses.companyId, companyId))
        .orderBy(asc(warehouses.name)),
    "listWarehousesServer",
  );
}

export async function getWarehouseServer(
  id: string,
): Promise<Warehouse | null> {
  const rows = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(warehouses)
        .where(and(eq(warehouses.id, id), eq(warehouses.companyId, companyId)))
        .limit(1),
    "getWarehouseServer",
  );
  return rows[0] ?? null;
}

/**
 * `locations` carries its own `company_id` (migration 0005) rather than
 * inheriting through `warehouse_id`, so the predicate goes on the column that
 * is actually read. Filtering only by `warehouseId` would hand another
 * company's aisles to anyone who can name its warehouse id, and the warehouse
 * detail page takes that id straight from the URL.
 */
export async function listLocationsServer(
  warehouseId: string,
): Promise<Location[]> {
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(locations)
        .where(
          and(
            eq(locations.warehouseId, warehouseId),
            eq(locations.companyId, companyId),
          ),
        )
        .orderBy(asc(locations.code)),
    "listLocationsServer",
  );
}
