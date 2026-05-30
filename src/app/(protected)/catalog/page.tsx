import { requireRole } from "@/shared/lib/auth/require-role";
import { listProductsServer } from "@/entities/product/api/server";
import { listCategoriesServer } from "@/entities/category/api/server";
import { listSuppliersServer } from "@/entities/supplier/api/server";
import { ProductsTable } from "./_components/products-table";

export default async function CatalogPage() {
  const { user } = await requireRole("staff");
  const [products, categories, suppliers] = await Promise.all([
    listProductsServer(),
    listCategoriesServer(),
    listSuppliersServer(),
  ]);
  const canManage = user.role === "manager" || user.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Catalog
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          Every SKU you stock. Archive products you no longer carry instead
          of deleting — preserves stock-movement history.
        </p>
      </header>

      <ProductsTable
        initial={products}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        canManage={canManage}
      />
    </main>
  );
}
