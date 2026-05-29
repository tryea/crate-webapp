import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  locations,
  products,
  stockMovements,
  type StockMovement,
} from "@/db/schema";

/**
 * Aggregate stock level for one (product, location). Returns 0 when no
 * movements exist. The append-only ledger means SUM is always correct.
 */
export async function getStockLevelServer(
  productId: string,
  locationId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)::int` })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.productId, productId),
        eq(stockMovements.locationId, locationId),
      ),
    );
  return row?.total ?? 0;
}

/**
 * All current stock levels per (product, location). Used by dashboard
 * KPIs and low-stock alerts. The HAVING-clause filter could exclude rows
 * with zero level but we include them so the UI can show "0" explicitly.
 */
export async function getAllStockLevelsServer(): Promise<
  Array<{ productId: string; locationId: string; level: number }>
> {
  const rows = await db
    .select({
      productId: stockMovements.productId,
      locationId: stockMovements.locationId,
      level: sql<number>`SUM(${stockMovements.quantity})::int`,
    })
    .from(stockMovements)
    .groupBy(stockMovements.productId, stockMovements.locationId);
  return rows;
}

/**
 * Compute per-product TOTAL stock (across all locations). Cheaper for
 * catalog list views than fetching per-location and reducing in JS.
 */
export async function getTotalStockByProductServer(): Promise<
  Map<string, number>
> {
  const rows = await db
    .select({
      productId: stockMovements.productId,
      level: sql<number>`SUM(${stockMovements.quantity})::int`,
    })
    .from(stockMovements)
    .groupBy(stockMovements.productId);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.productId, r.level);
  return map;
}

/**
 * Recent movements feed for the history view + dashboard recent-activity.
 * Joins to product+location for human-readable display without N+1.
 */
export async function listRecentMovementsServer(
  limit = 50,
): Promise<
  Array<
    StockMovement & {
      productName: string | null;
      productSku: string | null;
      locationCode: string | null;
    }
  >
> {
  return db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      locationId: stockMovements.locationId,
      type: stockMovements.type,
      reason: stockMovements.reason,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      reference: stockMovements.reference,
      transferGroupId: stockMovements.transferGroupId,
      notes: stockMovements.notes,
      createdBy: stockMovements.createdBy,
      createdAt: stockMovements.createdAt,
      productName: products.name,
      productSku: products.sku,
      locationCode: locations.code,
    })
    .from(stockMovements)
    .leftJoin(products, eq(stockMovements.productId, products.id))
    .leftJoin(locations, eq(stockMovements.locationId, locations.id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

// --- Phase 5.5: reorder + low-stock alerts ----------------------------

export interface LowStockProductRow {
  productId: string;
  sku: string;
  name: string;
  reorderPoint: number;
  onHand: number;
}

/**
 * Active products whose total on-hand (summed across all locations) is at
 * or below the reorder point. Sorted by deficit (most-urgent first).
 *
 * Pure SQL: aggregates inside the query, no JS-side filtering. CHECK
 * constraints + classifyStockHealth (pure-fn, tested) keep the math
 * consistent across this query and the dashboard badge logic.
 */
export async function listLowStockProductsServer(
  limit = 50,
): Promise<LowStockProductRow[]> {
  return db
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      reorderPoint: products.reorderPoint,
      onHand: sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)::int`,
    })
    .from(products)
    .leftJoin(stockMovements, eq(stockMovements.productId, products.id))
    .where(eq(products.isActive, true))
    .groupBy(products.id)
    .having(
      sql`COALESCE(SUM(${stockMovements.quantity}), 0) <= ${products.reorderPoint}`,
    )
    .orderBy(
      asc(
        sql`COALESCE(SUM(${stockMovements.quantity}), 0) - ${products.reorderPoint}`,
      ),
    )
    .limit(limit);
}

/**
 * Active transfer count — last N hours' worth of unique transferGroupIds.
 * A transfer = one row pair sharing the same group_id, so distinct count
 * = number of actual transfer events.
 */
export async function countActiveTransfersServer(hours = 24): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: sql<number>`COUNT(DISTINCT ${stockMovements.transferGroupId})::int`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.type, "transfer_out"),
        gte(stockMovements.createdAt, since),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Stock-out movement count in the last N hours. Used for the dashboard's
 * "Stock-outs (24h)" KPI.
 */
export async function countStockOutsServer(hours = 24): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [row] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.type, "stock_out"),
        gte(stockMovements.createdAt, since),
      ),
    );
  return row?.total ?? 0;
}

// --- Phase 6.4: valuation server query --------------------------------

import {
  computeProductValuations,
  type ProductValuationState,
} from "../domain/valuation";

/**
 * Pull every movement and walk the pure-fn valuator. The same math
 * 16 Jest specs cover runs in production. For very large ledgers
 * we'd switch to an incremental aggregate (materialized view); the
 * cutoff is ~50k movements where the round-trip + JS walk gets slow.
 */
export async function getValuationServer(): Promise<{
  perProduct: Map<string, ProductValuationState>;
  totalValue: number;
}> {
  const rows = await db
    .select({
      productId: stockMovements.productId,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements);

  const movements = rows.map((r) => ({
    productId: r.productId,
    type: r.type as "stock_in" | "stock_out" | "transfer_in" | "transfer_out" | "adjustment",
    quantity: r.quantity,
    unitCost: r.unitCost == null ? null : Number(r.unitCost),
    createdAt: r.createdAt,
  }));

  const perProduct = computeProductValuations(movements);
  let totalValue = 0;
  for (const v of perProduct.values()) totalValue += v.totalValue;
  return { perProduct, totalValue };
}

/**
 * Top N products by current inventory value. Joins to product
 * for SKU + name so the chart can label without a second roundtrip.
 */
export async function listTopProductsByValueServer(
  limit = 8,
): Promise<Array<{ productId: string; sku: string; name: string; value: number; qty: number; wac: number }>> {
  const { perProduct } = await getValuationServer();
  if (perProduct.size === 0) return [];

  const ids = Array.from(perProduct.keys());
  const productRows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
    })
    .from(products)
    .where(sql`${products.id} IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
  const productById = new Map(productRows.map((p) => [p.id, p]));

  const arr: Array<{ productId: string; sku: string; name: string; value: number; qty: number; wac: number }> = [];
  for (const [productId, v] of perProduct) {
    if (v.qty <= 0) continue;
    const p = productById.get(productId);
    if (!p) continue;
    arr.push({
      productId,
      sku: p.sku,
      name: p.name,
      value: v.totalValue,
      qty: v.qty,
      wac: v.wac,
    });
  }
  return arr.sort((a, b) => b.value - a.value).slice(0, limit);
}
