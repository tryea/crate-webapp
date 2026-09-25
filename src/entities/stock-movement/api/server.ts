import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import type { Tx } from "@/shared/lib/auth/session-binding";
import {
  locations,
  products,
  stockMovements,
  type StockMovement,
} from "@/db/schema";

/**
 * Warehouse scope for the dashboard queries (S4).
 *
 * `warehouseId: undefined` means EVERY warehouse, and that is the behaviour
 * these five functions have always had, so the default is a no-op by
 * construction.
 *
 * The options are an object rather than positional arguments on purpose:
 * `countStockOutsServer` and `countActiveTransfersServer` already carried an
 * optional `hours`, and a second optional positional would have forced every
 * caller to write `(24, id)` with two interchangeable-looking values next to
 * each other.
 */
export interface WarehouseScope {
  /** undefined = all warehouses. */
  warehouseId?: string;
}

/**
 * Movements do not carry a warehouse; they carry a location, and a location
 * belongs to one warehouse. Scoping is therefore always "locationId IN (the
 * locations of this warehouse)". Returned as a subquery so the filter stays
 * inside one round trip.
 *
 * Takes the bound `tx` rather than the bare `db` handle. The subquery is
 * inlined into the outer statement either way, so this is about reading the
 * file and seeing one executor, not about a second round trip.
 *
 * The company is a parameter for the same reason it is everywhere else in this
 * file: this subquery is the id list three of the filters below are built on,
 * so leaving it unscoped would let a warehouse id from the other company widen
 * those filters instead of narrowing them.
 */
function locationsOf(tx: Tx, warehouseId: string, companyId: string) {
  return tx
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.warehouseId, warehouseId),
        eq(locations.companyId, companyId),
      ),
    );
}

/**
 * Aggregate stock level for one (product, location). Returns 0 when no
 * movements exist. The append-only ledger means SUM is always correct.
 */
export async function getStockLevelServer(
  productId: string,
  locationId: string,
): Promise<number> {
  const [row] = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          total: sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)::int`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.productId, productId),
            eq(stockMovements.locationId, locationId),
            eq(stockMovements.companyId, companyId),
          ),
        ),
    "getStockLevelServer",
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
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          productId: stockMovements.productId,
          locationId: stockMovements.locationId,
          level: sql<number>`SUM(${stockMovements.quantity})::int`,
        })
        .from(stockMovements)
        .where(eq(stockMovements.companyId, companyId))
        .groupBy(stockMovements.productId, stockMovements.locationId),
    "getAllStockLevelsServer",
  );
}

/**
 * Compute per-product TOTAL stock (across all locations). Cheaper for
 * catalog list views than fetching per-location and reducing in JS.
 */
export async function getTotalStockByProductServer(): Promise<
  Map<string, number>
> {
  const rows = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          productId: stockMovements.productId,
          level: sql<number>`SUM(${stockMovements.quantity})::int`,
        })
        .from(stockMovements)
        .where(eq(stockMovements.companyId, companyId))
        .groupBy(stockMovements.productId),
    "getTotalStockByProductServer",
  );
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.productId, r.level);
  return map;
}

/**
 * Recent movements feed for the history view + dashboard recent-activity.
 * Joins to product+location for human-readable display without N+1.
 */
export async function listRecentMovementsServer(
  opts: WarehouseScope & { limit?: number } = {},
): Promise<
  Array<
    StockMovement & {
      productName: string | null;
      productSku: string | null;
      locationCode: string | null;
    }
  >
> {
  const { limit = 50, warehouseId } = opts;
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          id: stockMovements.id,
          companyId: stockMovements.companyId,
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
        // Product name and location code are columns this query RETURNS, so
        // both joins carry the predicate as well. In the ON clause, not the
        // WHERE: a movement whose product row was removed keeps its line in
        // the ledger with a null name, which is how it read before.
        .leftJoin(
          products,
          and(
            eq(stockMovements.productId, products.id),
            eq(products.companyId, companyId),
          ),
        )
        .leftJoin(
          locations,
          and(
            eq(stockMovements.locationId, locations.id),
            eq(locations.companyId, companyId),
          ),
        )
        .where(
          and(
            eq(stockMovements.companyId, companyId),
            warehouseId ? eq(locations.warehouseId, warehouseId) : undefined,
          ),
        )
        .orderBy(desc(stockMovements.createdAt))
        .limit(limit),
    "listRecentMovementsServer",
  );
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
  opts: WarehouseScope & { limit?: number } = {},
): Promise<LowStockProductRow[]> {
  const { limit = 50, warehouseId } = opts;
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          productId: products.id,
          sku: products.sku,
          name: products.name,
          reorderPoint: products.reorderPoint,
          onHand: sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)::int`,
        })
        .from(products)
        // The warehouse filter belongs in the JOIN condition, not in WHERE: a
        // product with zero movements in this warehouse must still surface, at
        // on-hand 0, because "nothing here at all" is the most urgent low-stock
        // case there is. In WHERE the NULL row from the LEFT JOIN would drop it.
        //
        // The company predicate on the movements side therefore goes in the
        // JOIN too, for the same reason and with the same consequence: in the
        // WHERE it would drop exactly the products this company holds none of
        // yet. The one on `products` is a genuine filter and belongs in the
        // WHERE, which is where it is.
        .leftJoin(
          stockMovements,
          warehouseId
            ? and(
                eq(stockMovements.productId, products.id),
                eq(stockMovements.companyId, companyId),
                inArray(
                  stockMovements.locationId,
                  locationsOf(tx, warehouseId, companyId),
                ),
              )
            : and(
                eq(stockMovements.productId, products.id),
                eq(stockMovements.companyId, companyId),
              ),
        )
        .where(
          and(eq(products.isActive, true), eq(products.companyId, companyId)),
        )
        .groupBy(products.id)
        .having(
          sql`COALESCE(SUM(${stockMovements.quantity}), 0) <= ${products.reorderPoint}`,
        )
        .orderBy(
          asc(
            sql`COALESCE(SUM(${stockMovements.quantity}), 0) - ${products.reorderPoint}`,
          ),
        )
        .limit(limit),
    "listLowStockProductsServer",
  );
}

/**
 * Active transfer count: last N hours' worth of unique transferGroupIds.
 * A transfer = one row pair sharing the same group_id, so distinct count
 * = number of actual transfer events.
 */
export async function countActiveTransfersServer(
  opts: WarehouseScope & { hours?: number } = {},
): Promise<number> {
  const { hours = 24, warehouseId } = opts;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [row] = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          total: sql<number>`COUNT(DISTINCT ${stockMovements.transferGroupId})::int`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.type, "transfer_out"),
            gte(stockMovements.createdAt, since),
            eq(stockMovements.companyId, companyId),
            warehouseId
              ? inArray(
                  stockMovements.locationId,
                  locationsOf(tx, warehouseId, companyId),
                )
              : undefined,
          ),
        ),
    "countActiveTransfersServer",
  );
  return row?.total ?? 0;
}

/**
 * Stock-out movement count in the last N hours. Used for the dashboard's
 * "Stock-outs (24h)" KPI.
 */
export async function countStockOutsServer(
  opts: WarehouseScope & { hours?: number } = {},
): Promise<number> {
  const { hours = 24, warehouseId } = opts;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [row] = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.type, "stock_out"),
            gte(stockMovements.createdAt, since),
            eq(stockMovements.companyId, companyId),
            warehouseId
              ? inArray(
                  stockMovements.locationId,
                  locationsOf(tx, warehouseId, companyId),
                )
              : undefined,
          ),
        ),
    "countStockOutsServer",
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
export async function getValuationServer(opts: WarehouseScope = {}): Promise<{
  perProduct: Map<string, ProductValuationState>;
  totalValue: number;
}> {
  const { warehouseId } = opts;
  const rows = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          productId: stockMovements.productId,
          type: stockMovements.type,
          quantity: stockMovements.quantity,
          unitCost: stockMovements.unitCost,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.companyId, companyId),
            warehouseId
              ? inArray(
                  stockMovements.locationId,
                  locationsOf(tx, warehouseId, companyId),
                )
              : undefined,
          ),
        ),
    "getValuationServer",
  );

  const movements = rows.map((r) => ({
    productId: r.productId,
    type: r.type as
      | "stock_in"
      | "stock_out"
      | "transfer_in"
      | "transfer_out"
      | "adjustment",
    quantity: r.quantity,
    unitCost: r.unitCost == null ? null : Number(r.unitCost),
    createdAt: r.createdAt,
  }));

  const perProduct = computeProductValuations(movements);
  let totalValue = 0;
  for (const v of perProduct.values()) totalValue += v.totalValue;
  return { perProduct, totalValue };
}
