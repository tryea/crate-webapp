import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { suppliers, type Supplier } from "@/db/schema";

export async function listSuppliersServer(): Promise<Supplier[]> {
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.companyId, companyId))
        .orderBy(asc(suppliers.name)),
    "listSuppliersServer",
  );
}

export async function getSupplierServer(id: string): Promise<Supplier | null> {
  const rows = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.companyId, companyId)))
        .limit(1),
    "getSupplierServer",
  );
  return rows[0] ?? null;
}
