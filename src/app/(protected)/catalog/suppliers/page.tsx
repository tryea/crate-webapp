import { requireRole } from "@/shared/lib/auth/require-role";
import { listSuppliersServer } from "@/entities/supplier/api/server";
import { SuppliersTable } from "./_components/suppliers-table";

export default async function SuppliersPage() {
  const { user } = await requireRole("staff");
  const suppliers = await listSuppliersServer();
  const canManage = user.role === "manager" || user.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Catalog
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="text-sm text-muted-foreground">
          People you source products from. Linked to purchase orders.
        </p>
      </header>

      <SuppliersTable initial={suppliers} canManage={canManage} />
    </main>
  );
}
