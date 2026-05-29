import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, type Category } from "@/db/schema";

export async function listCategoriesServer(): Promise<Category[]> {
  return db.select().from(categories).orderBy(asc(categories.name));
}

export async function getCategoryServer(id: string): Promise<Category | null> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  return rows[0] ?? null;
}
