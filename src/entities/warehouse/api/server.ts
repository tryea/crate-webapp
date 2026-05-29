import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  locations,
  warehouses,
  type Location,
  type Warehouse,
} from "@/db/schema";

export async function listWarehousesServer(): Promise<Warehouse[]> {
  return db.select().from(warehouses).orderBy(asc(warehouses.name));
}

export async function getWarehouseServer(id: string): Promise<Warehouse | null> {
  const rows = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listLocationsServer(
  warehouseId: string,
): Promise<Location[]> {
  return db
    .select()
    .from(locations)
    .where(eq(locations.warehouseId, warehouseId))
    .orderBy(asc(locations.code));
}
