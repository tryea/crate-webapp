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
