import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import { loadMovementFormData } from "../_lib/movement-form-data";
import { AdjustmentForm } from "@/features/adjustment";

export default async function AdjustmentPage() {
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
            Movements · Adjust
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Adjustment</h1>
          <p className="text-sm text-muted-foreground">
            Reconcile what the system thinks against what&apos;s physically on
            hand. A signed delta is appended to the ledger with a mandatory
            note so the correction is explainable in the audit log.
          </p>
        </header>
      </div>

      <AdjustmentForm products={products} locations={locations} />
    </main>
  );
}
