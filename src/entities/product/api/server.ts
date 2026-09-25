import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { products, type Product } from "@/db/schema";

export async function listProductsServer(): Promise<Product[]> {
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(products)
        .where(eq(products.companyId, companyId))
        .orderBy(asc(products.name)),
    "listProductsServer",
  );
}

/**
 * Scoped by company as well as by id: since migration 0005 the SKU index is
 * `(company_id, sku)`, so two companies can hold the same SKU and only the
 * company predicate decides which of the two rows this page is looking at.
 */
export async function getProductServer(id: string): Promise<Product | null> {
  const rows = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.companyId, companyId)))
        .limit(1),
    "getProductServer",
  );
  return rows[0] ?? null;
}
