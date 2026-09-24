import "server-only";
import { asc, eq } from "drizzle-orm";
import { withReadContext } from "@/shared/lib/auth/read-context";
import {
  locations,
  warehouses,
  type Location,
  type Warehouse,
} from "@/db/schema";

export async function listWarehousesServer(): Promise<Warehouse[]> {
  return withReadContext(
    async (tx) => tx.select().from(warehouses).orderBy(asc(warehouses.name)),
    "listWarehousesServer",
  );
}

export async function getWarehouseServer(
  id: string,
): Promise<Warehouse | null> {
  const rows = await withReadContext(
    async (tx) =>
      tx.select().from(warehouses).where(eq(warehouses.id, id)).limit(1),
    "getWarehouseServer",
  );
  return rows[0] ?? null;
}

export async function listLocationsServer(
  warehouseId: string,
): Promise<Location[]> {
  return withReadContext(
    async (tx) =>
      tx
        .select()
        .from(locations)
        .where(eq(locations.warehouseId, warehouseId))
        .orderBy(asc(locations.code)),
    "listLocationsServer",
  );
}
