import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import { loadMovementFormData } from "../_lib/movement-form-data";
import { TransferForm } from "@/features/transfer";

export default async function TransferPage() {
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
            Movements · Transfer
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Transfer</h1>
          <p className="text-sm text-muted-foreground">
            Move stock between locations. Inserted as a paired
            transfer_out + transfer_in within a single transaction, never
            partial.
          </p>
        </header>
      </div>

      <TransferForm products={products} locations={locations} />
    </main>
  );
}
