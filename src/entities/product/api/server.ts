import "server-only";
import { asc, eq } from "drizzle-orm";
import { withReadContext } from "@/shared/lib/auth/read-context";
import { products, type Product } from "@/db/schema";

export async function listProductsServer(): Promise<Product[]> {
  return withReadContext(
    async (tx) => tx.select().from(products).orderBy(asc(products.name)),
    "listProductsServer",
  );
}

export async function getProductServer(id: string): Promise<Product | null> {
  const rows = await withReadContext(
    async (tx) =>
      tx.select().from(products).where(eq(products.id, id)).limit(1),
    "getProductServer",
  );
  return rows[0] ?? null;
}
