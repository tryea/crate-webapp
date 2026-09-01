import { asc, eq } from "drizzle-orm";
import { requireRole } from "@/shared/lib/auth/require-role";
import { db } from "@/db/client";
import { locations, products, warehouses } from "@/db/schema";
import {
  getAllStockLevelsServer,
  getValuationServer,
  listLowStockProductsServer,
} from "@/entities/stock-movement/api/server";
import { ReportSection } from "./_components/report-section";

const MONEY_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export default async function ReportsPage() {
  await requireRole("staff");

  const [levels, valuation, lowStock, productRows, locationRows] = await Promise.all([
    getAllStockLevelsServer(),
    getValuationServer(),
    listLowStockProductsServer({ limit: 500 }),
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        reorderPoint: products.reorderPoint,
      })
      .from(products)
      .orderBy(asc(products.name)),
    db
      .select({
        id: locations.id,
        code: locations.code,
        warehouseName: warehouses.name,
      })
      .from(locations)
      .leftJoin(warehouses, eq(locations.warehouseId, warehouses.id)),
  ]);

  const productsById = new Map(productRows.map((p) => [p.id, p]));
  const locationsById = new Map(locationRows.map((l) => [l.id, l]));

  // Stock-on-hand rows: one per (product, location) where level > 0
  const stockOnHandRows = levels
    .filter((l) => l.level > 0)
    .map((l) => {
      const p = productsById.get(l.productId);
      const loc = locationsById.get(l.locationId);
      return {
        sku: p?.sku ?? "",
        product: p?.name ?? "",
        warehouse: loc?.warehouseName ?? "",
        location: loc?.code ?? "",
        on_hand: l.level,
      };
    })
    .sort((a, b) => (a.sku < b.sku ? -1 : 1));

  // Valuation rows: one per product with current state
  const valuationRows = Array.from(valuation.perProduct.entries())
    .map(([productId, state]) => {
      const p = productsById.get(productId);
      return {
        sku: p?.sku ?? "",
        product: p?.name ?? "",
        on_hand: state.qty,
        wac: Number(state.wac.toFixed(2)),
        total_value: Number(state.totalValue.toFixed(2)),
      };
    })
    .filter((r) => r.on_hand > 0)
    .sort((a, b) => b.total_value - a.total_value);

  const lowStockRows = lowStock.map((p) => ({
    sku: p.sku,
    product: p.name,
    on_hand: p.onHand,
    reorder_point: p.reorderPoint,
    deficit: p.reorderPoint - p.onHand,
  }));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">
          Insights
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot exports. Each card downloads a CSV of the full dataset
          (RFC 4180, UTF-8). Total value across stock:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {MONEY_FMT.format(Math.round(valuation.totalValue))}
          </span>
          .
        </p>
      </header>

      <ReportSection
        title="Stock on hand"
        description={`${stockOnHandRows.length} (product × location) pairings with level > 0.`}
        rows={stockOnHandRows}
        filenameBase="stock-on-hand"
        preview={<ReportPreview rows={stockOnHandRows.slice(0, 8)} numericKeys={["on_hand"]} />}
      />

      <ReportSection
        title="Inventory valuation"
        description={`${valuationRows.length} products with current on-hand × WAC. Sorted descending.`}
        rows={valuationRows}
        filenameBase="valuation"
        preview={<ReportPreview rows={valuationRows.slice(0, 8)} numericKeys={["on_hand", "wac", "total_value"]} />}
      />

      <ReportSection
        title="Low stock"
        description={`${lowStockRows.length} products at or below reorder point.`}
        rows={lowStockRows}
        filenameBase="low-stock"
        preview={<ReportPreview rows={lowStockRows.slice(0, 8)} numericKeys={["on_hand", "reorder_point", "deficit"]} />}
      />
    </main>
  );
}

function ReportPreview({
  rows,
  numericKeys = [],
}: {
  rows: ReadonlyArray<Record<string, unknown>>;
  numericKeys?: ReadonlyArray<string>;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing to report yet.
      </p>
    );
  }
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/20 text-muted-foreground">
          <tr className="border-b border-border">
            {cols.map((c) => (
              <th
                key={c}
                className={
                  "px-3 py-2 text-xs font-medium " +
                  (numericKeys.includes(c) ? "text-right" : "text-left")
                }
              >
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              {cols.map((c) => {
                const value = r[c];
                const isNumeric = numericKeys.includes(c);
                return (
                  <td
                    key={c}
                    className={
                      "px-3 py-2 " +
                      (isNumeric ? "text-right tabular-nums" : "")
                    }
                  >
                    {value == null || value === ""
                      ? "none"
                      : isNumeric && typeof value === "number"
                        ? value.toLocaleString()
                        : String(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
