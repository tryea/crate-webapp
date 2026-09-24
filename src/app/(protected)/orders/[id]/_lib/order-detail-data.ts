import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products } from "@/db/schema";

/**
 * Active products offered by the add-line picker on a purchase order.
 * Moved out of the page unchanged so the route's read set has a name that a
 * test can call.
 */
export async function loadOrderDetailProducts() {
  return db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      costPrice: products.costPrice,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name));
}
