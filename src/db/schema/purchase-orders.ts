import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { suppliers } from "./catalog";
import { user } from "./_auth";
import { warehouses } from "./warehouses";
import { id, timestamps } from "./_shared";

export const poStatusEnum = pgEnum("po_status", [
  "draft",
  "sent",
  "partial",
  "received",
  "cancelled",
]);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    poNumber: text("po_number").notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    status: poStatusEnum("status").notNull().default("draft"),
    expectedDate: date("expected_date"),
    receivedDate: date("received_date"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("po_number_idx").on(t.poNumber)],
);

/**
 * po_lines — one row per (PO, product). qty_received accumulates as receipts
 * land. CHECK ensures we never receive more than ordered and never receive
 * negative.
 */
export const poLines = pgTable(
  "po_lines",
  {
    id: id(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantityOrdered: integer("quantity_ordered").notNull(),
    quantityReceived: integer("quantity_received").notNull().default(0),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
    ...timestamps(),
  },
  (t) => [
    check(
      "po_lines_qty_ordered_positive",
      sql`${t.quantityOrdered} > 0`,
    ),
    check(
      "po_lines_qty_received_nonneg",
      sql`${t.quantityReceived} >= 0`,
    ),
    check(
      "po_lines_qty_received_le_ordered",
      sql`${t.quantityReceived} <= ${t.quantityOrdered}`,
    ),
  ],
);

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type PoLine = typeof poLines.$inferSelect;
export type NewPoLine = typeof poLines.$inferInsert;
