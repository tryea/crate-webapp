import "server-only";
import { asc, eq } from "drizzle-orm";
import { withReadContext } from "@/shared/lib/auth/read-context";
import { suppliers, type Supplier } from "@/db/schema";

export async function listSuppliersServer(): Promise<Supplier[]> {
  return withReadContext(
    async (tx) => tx.select().from(suppliers).orderBy(asc(suppliers.name)),
    "listSuppliersServer",
  );
}

export async function getSupplierServer(id: string): Promise<Supplier | null> {
  const rows = await withReadContext(
    async (tx) =>
      tx.select().from(suppliers).where(eq(suppliers.id, id)).limit(1),
    "getSupplierServer",
  );
  return rows[0] ?? null;
}
