import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import {
  getValuationServer,
  listLowStockProductsServer,
  listRecentMovementsServer,
} from "@/entities/stock-movement/api/server";
import { listProductsServer } from "@/entities/product/api/server";
import { listWarehousesServer } from "@/entities/warehouse/api/server";

/*
 * The shift-open screen. It answers ONE question, "what needs me right now",
 * and it answers it in the first line as a sentence, not as a grid of tiles.
 *
 * Two deliberate absences, both of them decisions:
 *  - No "(24h)" counters. Two of them sat permanently at 0 because the demo
 *    seed stops on 12 Aug, so they were a number nobody could verify. The
 *    right column carries facts that change only when the DATA changes,
 *    never because the clock moved.
 *  - No relative timestamps. Every time on this page is absolute.
 */

const STAMP_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const NUM_FMT = new Intl.NumberFormat("en-US");

const TYPE_LABEL: Record<string, string> = {
  stock_in: "Stock in",
  stock_out: "Stock out",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  adjustment: "Adjustment",
};

const COUNT_WORD = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];

function countWord(n: number): string {
  return COUNT_WORD[n] ?? NUM_FMT.format(n);
}

function stamp(d: Date): string {
  return `${DATE_FMT.format(d)} ${TIME_FMT.format(d)}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string }>;
}) {
  await requireRole("staff");
  const { warehouse } = await searchParams;

  // An unknown id in the URL must not silently pretend to be a filter, so it
  // is validated against the real list and otherwise falls back to "all".
  const warehouses = await listWarehousesServer();
  const scoped = warehouses.find((w) => w.id === warehouse);
  const warehouseId = scoped?.id;

  const [lowStock, recent, valuation, products] = await Promise.all([
    listLowStockProductsServer({ limit: 10, warehouseId }),
    listRecentMovementsServer({ limit: 8, warehouseId }),
    getValuationServer({ warehouseId }),
    listProductsServer(),
  ]);

  const lowStockCount = lowStock.length;
  const onHand = [...valuation.perProduct.values()].reduce(
    (sum, v) => sum + v.qty,
    0,
  );
  const tracked = products.filter((p) => p.isActive).length;
  const lastMovement = recent[0]?.createdAt ?? null;

  const verdict =
    lowStockCount === 0
      ? "Nothing is at or below reorder."
      : lowStockCount === 1
        ? "One product is at or below reorder."
        : `${countWord(lowStockCount)} products are at or below reorder.`;

  return (
    <main className="pad">
      <p className="stamp fig">{STAMP_FMT.format(new Date())}</p>
      <h1>{verdict}</h1>
      <p className="lede">
        {lowStockCount === 0
          ? "Nothing needs you today."
          : "Nothing else needs you today."}
      </p>

      <div className="work">
        <div>
          <section className="panel">
            <div className="panelhead">
              <h2>Needs you</h2>
              <span className="count fig">{lowStockCount}</span>
              {lowStockCount > 0 ? (
                <Link className="btn btn-act" href="/orders">
                  Raise purchase orders
                </Link>
              ) : null}
            </div>

            {lowStockCount === 0 ? (
              <div className="statebox">
                <strong>Every product is above its reorder point.</strong>
                <span>
                  Reorder points live on the product record, so this list fills
                  itself as stock moves.
                </span>
                <Link className="btn" href="/catalog">
                  Review reorder points
                </Link>
              </div>
            ) : (
              lowStock.map((p) => (
                <Link className="qrow" key={p.productId} href="/catalog">
                  <span className="qname">
                    <span className="nm">{p.name}</span>
                    <span className="sku fig">{p.sku}</span>
                  </span>
                  <span className="qlvl">
                    <b>{NUM_FMT.format(p.onHand)}</b> of{" "}
                    {NUM_FMT.format(p.reorderPoint)}
                  </span>
                  <span className="qgo">
                    <ArrowRight className="ic" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                </Link>
              ))
            )}
          </section>

          <section className="ledger">
            <div className="ledgerhead">
              <h2>What moved</h2>
              <span className="sub">
                {recent.length === 0 ? "nothing yet" : `${recent.length} latest`}
              </span>
              <Link href="/movements">
                All movements{" "}
                <ArrowRight className="ic" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className="panel">
                <div className="statebox">
                  <strong>The ledger is empty.</strong>
                  <span>
                    Every stock change is an append-only entry. Record the first
                    receipt and it shows up here.
                  </span>
                  <Link className="btn btn-act" href="/movements/new/stock-in">
                    Record stock-in
                  </Link>
                </div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Product</th>
                    <th className="s1">Bin</th>
                    <th>Qty</th>
                    <th className="s2">Reason</th>
                    <th className="s2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((m) => (
                    <tr key={m.id}>
                      <td className="fig">{stamp(new Date(m.createdAt))}</td>
                      <td>{TYPE_LABEL[m.type] ?? m.type}</td>
                      <td>
                        <span className="nm">{m.productName ?? "unknown"}</span>{" "}
                        <span className="sku fig">{m.productSku ?? ""}</span>
                      </td>
                      <td className="fig s1">{m.locationCode ?? "none"}</td>
                      <td className={m.quantity < 0 ? "q n" : "q p"}>
                        {m.quantity > 0 ? "+" : ""}
                        {NUM_FMT.format(m.quantity)}
                      </td>
                      <td className="s2">
                        {m.reason ? m.reason.replace(/_/g, " ") : "none"}
                      </td>
                      <td className="fig s2">{m.reference ?? "none"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <aside className="side">
          <h2>Standing facts</h2>
          <div className="fact">
            <span className="k">Stock on hand</span>
            <span className="v fig">{NUM_FMT.format(onHand)}</span>
          </div>
          <div className="fact">
            <span className="k">Products tracked</span>
            <span className="v fig">{NUM_FMT.format(tracked)}</span>
          </div>
          <div className="fact">
            <span className="k">Last movement</span>
            <span className="v fig">
              {lastMovement
                ? `${SHORT_DATE_FMT.format(new Date(lastMovement))}, ${TIME_FMT.format(new Date(lastMovement))}`
                : "none yet"}
            </span>
          </div>
          <div className="fact">
            <span className="k">Rows ever edited</span>
            <span className="v fig">0</span>
          </div>
          <p className="sidenote">
            These four do not expire. They change only when the data changes,
            never because the clock moved.
          </p>
        </aside>
      </div>
    </main>
  );
}
