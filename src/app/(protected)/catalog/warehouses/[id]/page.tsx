import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import {
  getWarehouseServer,
  listLocationsServer,
} from "@/entities/warehouse/api/server";
import { LocationsTable } from "./_components/locations-table";

export default async function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireRole("staff");
  const { id } = await params;

  const [warehouse, locs] = await Promise.all([
    getWarehouseServer(id),
    listLocationsServer(id),
  ]);

  if (!warehouse) notFound();

  const canManage = user.role === "manager" || user.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/catalog/warehouses"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" /> All warehouses
        </Link>
        <header className="flex flex-col gap-1 pt-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Warehouse · <span className="not-italic">{warehouse.code}</span>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{warehouse.name}</h1>
          {warehouse.address ? (
            <p className="text-sm text-muted-foreground">{warehouse.address}</p>
          ) : null}
        </header>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">Locations</h2>
          <span className="text-xs text-muted-foreground">
            ({locs.length} {locs.length === 1 ? "location" : "locations"})
          </span>
        </div>
        <LocationsTable warehouseId={id} initial={locs} canManage={canManage} />
      </section>
    </main>
  );
}
