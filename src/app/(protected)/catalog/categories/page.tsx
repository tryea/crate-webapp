import { requireRole } from "@/shared/lib/auth/require-role";
import { listCategoriesServer } from "@/entities/category/api/server";
import { CategoriesTable } from "./_components/categories-table";

export default async function CategoriesPage() {
  const { user } = await requireRole("staff");
  const categories = await listCategoriesServer();
  const canManage = user.role === "manager" || user.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Catalog
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Organise products into a hierarchy. Slugs appear in URLs and should
          be stable.
        </p>
      </header>

      <CategoriesTable initial={categories} canManage={canManage} />
    </main>
  );
}
