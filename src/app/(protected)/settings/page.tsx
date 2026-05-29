import { requireRole } from "@/shared/lib/auth/require-role";
import { getStockSettingsServer } from "@/entities/settings/api/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { StockSettingsForm } from "./_components/stock-settings-form";

export default async function SettingsPage() {
  await requireRole("admin");

  const stockSettings = await getStockSettingsServer();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Admin
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Operational toggles. Changes apply immediately to every protected
          mutation that reads the relevant setting.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock</CardTitle>
          <CardDescription>
            Inventory-side behavior — guards against negative stock and the
            standing COUNCIL §0 rule.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StockSettingsForm initial={stockSettings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Valuation method</CardTitle>
          <CardDescription>
            Inventory valuation is computed via perpetual weighted-average
            cost (WAC). Documented + 16-spec Jest-tested in{" "}
            <code className="font-mono text-[11px]">
              src/entities/stock-movement/domain/valuation.ts
            </code>
            . FIFO / LIFO alternatives deferred to a future DEC.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Locations defaults</CardTitle>
          <CardDescription>
            Per-warehouse default-location is the first location ordered by
            code (used by PO receive). Deferred polish:{" "}
            <a
              href="https://github.com/tryea/crate-webapp/issues/new?title=feat(settings): per-warehouse default location picker"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              open an issue
            </a>{" "}
            if this becomes friction.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
