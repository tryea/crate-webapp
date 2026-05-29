import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { suppliers, type Supplier } from "@/db/schema";

export async function listSuppliersServer(): Promise<Supplier[]> {
  return db.select().from(suppliers).orderBy(asc(suppliers.name));
}

export async function getSupplierServer(id: string): Promise<Supplier | null> {
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .limit(1);
  return rows[0] ?? null;
}
