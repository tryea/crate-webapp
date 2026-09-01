import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import { loadMovementFormData } from "../_lib/movement-form-data";
import { StockOutForm } from "@/features/stock-out";

export default async function StockOutPage() {
  await requireRole("staff");
  const { products, locations } = await loadMovementFormData();

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
          <p className="eyebrow">
            Movements · Issue
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Stock out</h1>
          <p className="text-sm text-muted-foreground">
            Record outgoing stock. The server blocks if the requested quantity
            exceeds what&apos;s on hand, so there is no negative stock.
          </p>
        </header>
      </div>

      <StockOutForm products={products} locations={locations} />
    </main>
  );
}
