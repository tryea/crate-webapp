import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { categories, type Category } from "@/db/schema";

export async function listCategoriesServer(): Promise<Category[]> {
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(categories)
        .where(eq(categories.companyId, companyId))
        .orderBy(asc(categories.name)),
    "listCategoriesServer",
  );
}

/**
 * The id comes from a URL, so the company predicate is what turns "a row with
 * this id" into "a row with this id that is mine". Without it this is an IDOR
 * surface: another company's category id typed into the address bar renders
 * its name (TENANT-SEPARATION.md §4).
 */
export async function getCategoryServer(id: string): Promise<Category | null> {
  const rows = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.companyId, companyId)))
        .limit(1),
    "getCategoryServer",
  );
  return rows[0] ?? null;
}
