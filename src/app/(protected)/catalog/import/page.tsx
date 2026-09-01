import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import { ProductImportForm } from "./_components/product-import-form";

export default async function ProductImportPage() {
  await requireRole("manager");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" /> Back to catalog
        </Link>
        <header className="flex flex-col gap-1 pt-2">
          <p className="eyebrow">
            Catalog · Import
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bulk product import
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a CSV. Each row is validated client-side, then submitted in
            one server-side transaction so a single bad row rolls back the
            whole batch. Existing SKUs are updated; new ones inserted.
          </p>
        </header>
      </div>

      <ProductImportForm />
    </main>
  );
}
