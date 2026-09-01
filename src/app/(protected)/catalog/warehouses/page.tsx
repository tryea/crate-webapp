import { requireRole } from "@/shared/lib/auth/require-role";
import { listWarehousesServer } from "@/entities/warehouse/api/server";
import { WarehousesTable } from "./_components/warehouses-table";

export default async function WarehousesPage() {
  const { user } = await requireRole("staff");
  const warehouses = await listWarehousesServer();
  const canManage = user.role === "manager" || user.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">
          Catalog
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Warehouses</h1>
        <p className="text-sm text-muted-foreground">
          Physical sites that hold stock. Tap a warehouse to manage its
          locations (aisles, bins).
        </p>
      </header>

      <WarehousesTable initial={warehouses} canManage={canManage} />
    </main>
  );
}
