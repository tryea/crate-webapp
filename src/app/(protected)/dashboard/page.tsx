import { PackageOpen } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { StockStatusBadge } from "@/shared/ui/stock-status-badge";
import Link from "next/link";
import { buttonVariants } from "@/shared/ui/button";

/**
 * Placeholder dashboard for Phase 2.2/3 plumbing. Demonstrates the Phase 3.1
 * token system + 3.2 primitives in their natural context (KPI card row +
 * empty list state with guided next action) without faking data.
 *
 * Phase 6 fills the real KPIs (total stock value, low-stock count, recent
 * movements, top items).
 */
export default async function DashboardPage() {
  const { user } = await requireRole("staff");

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
          Signed in as <span className="font-medium">{user.role}</span>. Phase
          6 will fill this surface with KPIs.
        </p>
      </header>

      {/* KPI row — placeholder, but uses Phase 3.1 token-driven status chips */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total stock value</CardDescription>
            <CardTitle className="text-2xl font-semibold">—</CardTitle>
          </CardHeader>
          <CardContent>
            <StockStatusBadge status="in-stock" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>SKUs at or below reorder</CardDescription>
            <CardTitle className="text-2xl font-semibold">—</CardTitle>
          </CardHeader>
          <CardContent>
            <StockStatusBadge status="low-stock" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Stock-outs (24h)</CardDescription>
            <CardTitle className="text-2xl font-semibold">—</CardTitle>
          </CardHeader>
          <CardContent>
            <StockStatusBadge status="out-of-stock" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active transfers</CardDescription>
            <CardTitle className="text-2xl font-semibold">—</CardTitle>
          </CardHeader>
          <CardContent>
            <StockStatusBadge status="on-transit" />
          </CardContent>
        </Card>
      </section>

      {/* Recent movements panel — empty state guides next action */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent movements</CardTitle>
          <CardDescription>
            Stock-in, stock-out, transfers, and adjustments will land here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={PackageOpen}
            title="No movements yet"
            description="Receive a purchase order or record a stock-in to start the ledger."
            action={
              <Link
                href="/movements/new?type=stock_in"
                className={buttonVariants({ variant: "default" })}
              >
                Record stock-in
              </Link>
            }
          />
        </CardContent>
      </Card>
    </main>
  );
}
