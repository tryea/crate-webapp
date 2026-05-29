import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/shared/lib/auth/require-role";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { getPurchaseOrderServer } from "@/entities/purchase-order/api/server";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import { PoHeaderActions } from "./_components/po-header-actions";
import { PoLinesSection } from "./_components/po-lines-section";
import { PoReceiveForm } from "./_components/po-receive-form";

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-info/10 text-info border-info/20",
  partial: "bg-warning/10 text-warning border-warning/30",
  received: "bg-success/10 text-success border-success/20",
  cancelled: "bg-muted text-muted-foreground border-border line-through",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireRole("staff");
  const { id } = await params;

  const [detail, productRows] = await Promise.all([
    getPurchaseOrderServer(id),
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        costPrice: products.costPrice,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.name)),
  ]);

  if (!detail) notFound();

  const { po, supplier, lines } = detail;
  const canManage = user.role === "manager" || user.role === "admin";
  const canEdit = canManage && po.status === "draft";
  const canReceive =
    (po.status === "sent" || po.status === "partial") && lines.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" /> All POs
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Purchase order
            </p>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
              <span className="font-mono">{po.poNumber}</span>
              <Badge
                variant="outline"
                className={cn("font-medium border", STATUS_CLASSES[po.status])}
              >
                {STATUS_LABEL[po.status]}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {supplier?.name ?? "—"}
              {po.expectedDate ? (
                <>
                  {" · Expected "}
                  {DATE_FMT.format(new Date(po.expectedDate))}
                </>
              ) : null}
              {po.receivedDate ? (
                <>
                  {" · Received "}
                  {DATE_FMT.format(new Date(po.receivedDate))}
                </>
              ) : null}
            </p>
          </div>
          {canManage ? (
            <PoHeaderActions
              poId={po.id}
              status={po.status}
              hasLines={lines.length > 0}
            />
          ) : null}
        </header>
        {po.notes ? (
          <p className="mt-3 rounded-md border border-border bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            {po.notes}
          </p>
        ) : null}
      </div>

      <PoLinesSection
        poId={po.id}
        lines={lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          quantityOrdered: l.quantityOrdered,
          quantityReceived: l.quantityReceived,
          unitCost: l.unitCost,
        }))}
        canEdit={canEdit}
        products={productRows}
      />

      {canReceive ? (
        <PoReceiveForm
          poId={po.id}
          lines={lines.map((l) => ({
            id: l.id,
            productSku: l.productSku,
            productName: l.productName,
            quantityOrdered: l.quantityOrdered,
            quantityReceived: l.quantityReceived,
            unitCost: l.unitCost,
          }))}
        />
      ) : null}
    </main>
  );
}
