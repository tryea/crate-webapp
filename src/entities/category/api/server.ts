import "server-only";
import { asc, eq } from "drizzle-orm";
import { withReadContext } from "@/shared/lib/auth/read-context";
import { categories, type Category } from "@/db/schema";

export async function listCategoriesServer(): Promise<Category[]> {
  return withReadContext(
    async (tx) => tx.select().from(categories).orderBy(asc(categories.name)),
    "listCategoriesServer",
  );
}

export async function getCategoryServer(id: string): Promise<Category | null> {
  const rows = await withReadContext(
    async (tx) =>
      tx.select().from(categories).where(eq(categories.id, id)).limit(1),
    "getCategoryServer",
  );
  return rows[0] ?? null;
}
