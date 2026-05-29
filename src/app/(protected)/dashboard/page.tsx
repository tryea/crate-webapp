import Link from "next/link";
import { ChevronRight, PackageOpen } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import {
  countActiveTransfersServer,
  countStockOutsServer,
  listLowStockProductsServer,
  listRecentMovementsServer,
} from "@/entities/stock-movement/api/server";
import { classifyStockHealth } from "@/entities/stock-movement/domain/stock-math";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { StockStatusBadge } from "@/shared/ui/stock-status-badge";
import { Badge } from "@/shared/ui/badge";
import { buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  day: "2-digit",
});

export default async function DashboardPage() {
  const { user } = await requireRole("staff");

  const [lowStock, stockOuts24h, activeTransfers, recent] = await Promise.all([
    listLowStockProductsServer(10),
    countStockOutsServer(24),
    countActiveTransfersServer(24),
    listRecentMovementsServer(8),
  ]);

  const lowStockCount = lowStock.length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Dashboard
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {user.name ?? user.email}
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium">{user.role}</span>.
        </p>
      </header>

      {/* KPI row — real data driven. Total stock value still pending Phase 6 valuation. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total stock value</CardDescription>
            <CardTitle className="text-2xl font-semibold">—</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">
              Wires up in Phase 6 (weighted-average valuation).
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>SKUs at or below reorder</CardDescription>
            <CardTitle
              className={cn(
                "text-2xl font-semibold tabular-nums",
                lowStockCount > 0 && "text-warning",
              )}
            >
              {lowStockCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockCount > 0 ? (
              <StockStatusBadge status="low-stock" />
            ) : (
              <StockStatusBadge status="in-stock" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Stock-outs (24h)</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {stockOuts24h}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">
              Issuances recorded since yesterday.
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Active transfers (24h)</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {activeTransfers}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">
              Distinct paired transfers in the last day.
            </span>
          </CardContent>
        </Card>
      </section>

      {/* Low-stock + recent activity side-by-side */}
      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">Low stock</CardTitle>
              <CardDescription>
                Products at or below their reorder point.
              </CardDescription>
            </div>
            {lowStockCount > 0 ? (
              <Link
                href="/catalog"
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Catalog <ChevronRight className="size-3.5" />
              </Link>
            ) : null}
          </CardHeader>
          <CardContent>
            {lowStockCount === 0 ? (
              <EmptyState
                icon={PackageOpen}
                title="Everything stocked"
                description="No products at or below their reorder point."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {lowStock.map((p) => {
                  const health = classifyStockHealth(p.onHand, p.reorderPoint);
                  return (
                    <li
                      key={p.productId}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{p.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {p.sku}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-xs text-muted-foreground">
                          {p.onHand} / {p.reorderPoint}
                        </span>
                        {health === "out-of-stock" ? (
                          <Badge
                            variant="outline"
                            className="border-destructive/20 bg-destructive/10 text-destructive"
                          >
                            Out
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-warning/30 bg-warning/10 text-warning"
                          >
                            Low
                          </Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">Recent movements</CardTitle>
              <CardDescription>The append-only ledger, fresh top.</CardDescription>
            </div>
            <Link
              href="/movements"
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              All <ChevronRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState
                icon={PackageOpen}
                title="No movements yet"
                description="Record a stock-in to start the ledger."
                action={
                  <Link
                    href="/movements/new/stock-in"
                    className={buttonVariants({ variant: "default" })}
                  >
                    Record stock-in
                  </Link>
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {recent.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{m.productName ?? "—"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {m.type.replace(/_/g, " ")} · {m.locationCode ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={cn(
                          "tabular-nums text-sm font-medium",
                          m.quantity > 0 && "text-success",
                          m.quantity < 0 && "text-destructive",
                        )}
                      >
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {TIME_FMT.format(new Date(m.createdAt))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
