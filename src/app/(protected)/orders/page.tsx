import { asc } from "drizzle-orm";
import { requireRole } from "@/shared/lib/auth/require-role";
import { listPurchaseOrdersServer } from "@/entities/purchase-order/api/server";
import { db } from "@/db/client";
import { suppliers, warehouses } from "@/db/schema";
import { PoTable, type PoTableRow } from "./_components/po-table";

export default async function OrdersPage() {
  const { user } = await requireRole("staff");
  const [pos, supplierRows, warehouseRows] = await Promise.all([
    listPurchaseOrdersServer(500),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
    db
      .select({ id: warehouses.id, name: warehouses.name, code: warehouses.code })
      .from(warehouses)
      .orderBy(asc(warehouses.name)),
  ]);

  const canManage = user.role === "manager" || user.role === "admin";

  const data: PoTableRow[] = pos.map((p) => ({
    id: p.id,
    poNumber: p.poNumber,
    supplierName: p.supplierName,
    status: p.status,
    expectedDate: p.expectedDate,
    createdAt: p.createdAt,
    totalOrdered: p.totalOrdered,
    lineCount: p.lineCount,
  }));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">
          Inventory
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Purchase orders</h1>
        <p className="text-sm text-muted-foreground">
          Track what you&apos;ve ordered, what&apos;s landed, what&apos;s
          still outstanding.
        </p>
      </header>

      <PoTable
        initial={data}
        canManage={canManage}
        suppliers={supplierRows}
        warehouses={warehouseRows}
      />
    </main>
  );
}
