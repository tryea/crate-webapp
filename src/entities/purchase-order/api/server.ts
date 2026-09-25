import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
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
  const rows = await withCompanyReadContext(
    async (tx, companyId) =>
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
          // The two subqueries carry the company predicate of their own. The
          // foreign key already ties a line to a PO of this company, so this
          // is belt and braces rather than a second filter doing new work; it
          // costs one AND on an already scoped index and it means a total on
          // screen cannot be inflated by a row this company may not see.
          totalOrdered: sql<string>`COALESCE((SELECT SUM(quantity_ordered::numeric * unit_cost) FROM po_lines WHERE po_lines.po_id = ${purchaseOrders.id} AND po_lines.company_id = ${companyId}), 0)::text`,
          lineCount: sql<number>`COALESCE((SELECT COUNT(*) FROM po_lines WHERE po_lines.po_id = ${purchaseOrders.id} AND po_lines.company_id = ${companyId}), 0)::int`,
        })
        .from(purchaseOrders)
        // The supplier name is a column this query RETURNS, so the join gets
        // the predicate too. It sits in the ON clause rather than the WHERE so
        // the join stays LEFT: a PO whose supplier was deleted keeps its row
        // and shows a null name, which is the behaviour before this change.
        .leftJoin(
          suppliers,
          and(
            eq(purchaseOrders.supplierId, suppliers.id),
            eq(suppliers.companyId, companyId),
          ),
        )
        .where(eq(purchaseOrders.companyId, companyId))
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
  //
  // The id arrives from the URL. With the company predicate on the header, a
  // PO id belonging to the other company returns null here and the route
  // renders its not-found page, which is what it already does for an id that
  // does not exist at all.
  return withCompanyReadContext(async (tx, companyId) => {
    const [po] = await tx
      .select()
      .from(purchaseOrders)
      .where(
        and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)),
      )
      .limit(1);
    if (!po) return null;

    const [supplier] = po.supplierId
      ? await tx
          .select()
          .from(suppliers)
          .where(
            and(
              eq(suppliers.id, po.supplierId),
              eq(suppliers.companyId, companyId),
            ),
          )
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
      .leftJoin(
        products,
        and(
          eq(poLines.productId, products.id),
          eq(products.companyId, companyId),
        ),
      )
      .where(and(eq(poLines.poId, id), eq(poLines.companyId, companyId)));

    return { po, supplier: supplier ?? null, lines };
  }, "getPurchaseOrderServer");
}

/**
 * Generate the next PO number: "PO-YYYY-NNN" where NNN is monotonically
 * incremented across the current year. Race-safe because the unique index
 * on po_number rejects duplicates; the INSERT in createPurchaseOrderAction
 * catches conflict + retries with next number.
 *
 * THE COMPANY PREDICATE IS NOT COSMETIC HERE. Without it the highest number
 * comes from every company's orders at once, so each new company would start
 * numbering where the busiest one left off and the gaps in its own sequence
 * would tell it how many orders the others placed. Since migration 0005 the
 * uniqueness this retries against is `(company_id, po_number)`, so numbering
 * per company is what the index expects: two companies may both hold
 * `PO-2026-001`, and neither can see the other's.
 */
export async function nextPoNumberServer(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const [row] = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          maxN: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(po_number, '-', 3) AS INT)), 0)::int`,
        })
        .from(purchaseOrders)
        .where(
          and(
            sql`po_number LIKE ${"PO-" + year + "-%"}`,
            eq(purchaseOrders.companyId, companyId),
          ),
        ),
    "nextPoNumberServer",
  );
  const n = (row?.maxN ?? 0) + 1;
  return `PO-${year}-${String(n).padStart(3, "0")}`;
}
