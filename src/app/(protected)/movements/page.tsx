import Link from "next/link";
import { ArrowDown, ArrowDownUp, ArrowUp, Wrench } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import { listRecentMovementsServer } from "@/entities/stock-movement/api/server";
import { buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { MovementsTable, type MovementRow } from "./_components/movements-table";

const QUICK_ACTIONS = [
  { href: "/movements/new/stock-in", label: "Stock in", icon: ArrowDown },
  { href: "/movements/new/stock-out", label: "Stock out", icon: ArrowUp },
  { href: "/movements/new/transfer", label: "Transfer", icon: ArrowDownUp },
  { href: "/movements/new/adjustment", label: "Adjustment", icon: Wrench },
];

export default async function MovementsPage() {
  await requireRole("staff");
  const rows = await listRecentMovementsServer(500);

  // Coerce the JOIN result rows to the MovementRow type expected by the table.
  const data: MovementRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    reason: r.reason,
    quantity: r.quantity,
    reference: r.reference,
    notes: r.notes,
    transferGroupId: r.transferGroupId,
    createdAt: r.createdAt,
    productSku: r.productSku,
    productName: r.productName,
    locationCode: r.locationCode,
  }));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Inventory
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Movements</h1>
          <p className="text-sm text-muted-foreground">
            Append-only ledger of every stock change. Filter, scroll, audit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-1.5",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {a.label}
              </Link>
            );
          })}
        </div>
      </header>

      <MovementsTable initial={data} />
    </main>
  );
}
