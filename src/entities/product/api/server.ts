import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products, type Product } from "@/db/schema";

export async function listProductsServer(): Promise<Product[]> {
  return db.select().from(products).orderBy(asc(products.name));
}

export async function getProductServer(id: string): Promise<Product | null> {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return rows[0] ?? null;
}
