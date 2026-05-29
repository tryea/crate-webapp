import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import { db } from "@/db/client";
import { locations, products, warehouses } from "@/db/schema";
import { StockInForm } from "@/features/stock-in";

export default async function StockInPage() {
  await requireRole("staff");

  const [productRows, locationRows] = await Promise.all([
    db
      .select({ id: products.id, sku: products.sku, name: products.name })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.name)),
    db
      .select({
        id: locations.id,
        code: locations.code,
        warehouseName: warehouses.name,
      })
      .from(locations)
      .leftJoin(warehouses, eq(locations.warehouseId, warehouses.id))
      .orderBy(asc(warehouses.name), asc(locations.code)),
  ]);

  const locationOptions = locationRows.map((l) => ({
    id: l.id,
    code: l.code,
    warehouseName: l.warehouseName ?? "—",
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/movements"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" /> Movements
        </Link>
        <header className="flex flex-col gap-1 pt-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Movements · Receive
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Stock in</h1>
          <p className="text-sm text-muted-foreground">
            Record incoming stock at a location. The movement is appended to
            the ledger and audit-logged in a single transaction.
          </p>
        </header>
      </div>

      <StockInForm products={productRows} locations={locationOptions} />
    </main>
  );
}
