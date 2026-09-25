import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { withReadContext } from "@/shared/lib/auth/read-context";
import {
  poLines,
  products,
  purchaseOrders,
  suppliers,
  type PoLine,
  type PurchaseOrder,
  type Supplier,
} from "@/db/schema";

/**
 * List POs joined with supplier name + computed total ordered value
 * (SUM(quantity_ordered × unit_cost) across lines).
 */
export interface PoListRow extends PurchaseOrder {
  supplierName: string | null;
  totalOrdered: string; // numeric → string from Drizzle
  lineCount: number;
}

export async function listPurchaseOrdersServer(
  limit = 200,
): Promise<PoListRow[]> {
  const rows = await withReadContext(
    async (tx) =>
      tx
        .select({
          id: purchaseOrders.id,
          companyId: purchaseOrders.companyId,
          poNumber: purchaseOrders.poNumber,
          supplierId: purchaseOrders.supplierId,
          warehouseId: purchaseOrders.warehouseId,
          status: purchaseOrders.status,
          expectedDate: purchaseOrders.expectedDate,
          receivedDate: purchaseOrders.receivedDate,
          notes: purchaseOrders.notes,
          createdBy: purchaseOrders.createdBy,
          createdAt: purchaseOrders.createdAt,
          updatedAt: purchaseOrders.updatedAt,
          supplierName: suppliers.name,
          totalOrdered: sql<string>`COALESCE((SELECT SUM(quantity_ordered::numeric * unit_cost) FROM po_lines WHERE po_lines.po_id = ${purchaseOrders.id}), 0)::text`,
          lineCount: sql<number>`COALESCE((SELECT COUNT(*) FROM po_lines WHERE po_lines.po_id = ${purchaseOrders.id}), 0)::int`,
        })
        .from(purchaseOrders)
        .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .orderBy(desc(purchaseOrders.createdAt))
        .limit(limit),
    "listPurchaseOrdersServer",
  );
  return rows;
}

export async function getPurchaseOrderServer(id: string): Promise<{
  po: PurchaseOrder;
  supplier: Supplier | null;
  lines: Array<
    PoLine & { productName: string | null; productSku: string | null }
  >;
} | null> {
  // One transaction for all three reads: the header, its supplier and its
  // lines now come from a single bound snapshot instead of three unbound ones.
  return withReadContext(async (tx) => {
    const [po] = await tx
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1);
    if (!po) return null;

    const [supplier] = po.supplierId
      ? await tx
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, po.supplierId))
          .limit(1)
      : [null];

    const lines = await tx
      .select({
        id: poLines.id,
        companyId: poLines.companyId,
        poId: poLines.poId,
        productId: poLines.productId,
        quantityOrdered: poLines.quantityOrdered,
        quantityReceived: poLines.quantityReceived,
        unitCost: poLines.unitCost,
        createdAt: poLines.createdAt,
        updatedAt: poLines.updatedAt,
        productName: products.name,
        productSku: products.sku,
      })
      .from(poLines)
      .leftJoin(products, eq(poLines.productId, products.id))
      .where(eq(poLines.poId, id));

    return { po, supplier: supplier ?? null, lines };
  }, "getPurchaseOrderServer");
}

/**
 * Generate the next PO number: "PO-YYYY-NNN" where NNN is monotonically
 * incremented across the current year. Race-safe because the unique index
 * on po_number rejects duplicates; the INSERT in createPurchaseOrderAction
 * catches conflict + retries with next number.
 */
export async function nextPoNumberServer(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const [row] = await withReadContext(
    async (tx) =>
      tx
        .select({
          maxN: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(po_number, '-', 3) AS INT)), 0)::int`,
        })
        .from(purchaseOrders)
        .where(sql`po_number LIKE ${"PO-" + year + "-%"}`),
    "nextPoNumberServer",
  );
  const n = (row?.maxN ?? 0) + 1;
  return `PO-${year}-${String(n).padStart(3, "0")}`;
}
