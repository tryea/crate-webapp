import { requireRole } from "@/shared/lib/auth/require-role";
import { ProductsDemoTable } from "./_components/products-demo-table";

export default async function CatalogPage() {
  await requireRole("staff");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Catalog
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          Demo table on static data — Phase 4 wires this to the Drizzle product
          query with create / edit / delete + storyblok content overlay.
        </p>
      </header>

      <ProductsDemoTable />
    </main>
  );
}
