import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./warehouses";
import { products } from "./products";
import { user } from "./_auth";
import { createdAtOnly, id } from "./_shared";

/**
 * MovementType encodes the categorical kind of stock change.
 *   - stock_in       : increase from receiving (PO, return)
 *   - stock_out      : decrease from sale / issue / damage
 *   - transfer_in    : paired increase (target location of a transfer)
 *   - transfer_out   : paired decrease (source location of a transfer)
 *   - adjustment     : positive or negative reconciliation from stock count
 */
export const movementTypeEnum = pgEnum("movement_type", [
  "stock_in",
  "stock_out",
  "transfer_in",
  "transfer_out",
  "adjustment",
]);

/**
 * MovementReason refines `type` with the business event behind it. Audit /
 * analytics-friendly. NOT exhaustive — extendable via migration.
 */
export const movementReasonEnum = pgEnum("movement_reason", [
  "purchase",
  "sale",
  "return_to_supplier",
  "return_from_customer",
  "damage",
  "lost",
  "count_correction",
  "transfer",
  "other",
]);

/**
 * stock_movements — append-only ledger. ALL stock changes go through this table.
 * Current stock level for (product, location) = SUM(quantity) across all rows.
 *
 * Integrity invariants:
 *   - INSERT-only. No UPDATE, no DELETE (enforced at API layer; later RLS/policy).
 *   - quantity != 0 (CHECK constraint; nothing-happened = no row).
 *   - Sign convention:
 *       stock_in / transfer_in / adjustment(positive)  → quantity > 0
 *       stock_out / transfer_out / adjustment(negative) → quantity < 0
 *     Enforced at API layer per type because CHECK can't reference enum logic
 *     cleanly. Domain tests in Phase 5 cover all cases.
 *   - Transfers store `transferGroupId` so the paired in/out rows can be
 *     reconciled atomically. Phase 5 wraps the pair in a transaction.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    type: movementTypeEnum("type").notNull(),
    reason: movementReasonEnum("reason").notNull(),
    quantity: integer("quantity").notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
    reference: text("reference"),
    transferGroupId: uuid("transfer_group_id"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...createdAtOnly(),
  },
  (t) => [
    check("stock_movements_qty_nonzero", sql`${t.quantity} != 0`),
    index("stock_movements_product_location_created_idx").on(
      t.productId,
      t.locationId,
      t.createdAt,
    ),
    index("stock_movements_type_created_idx").on(t.type, t.createdAt),
    index("stock_movements_transfer_group_idx").on(t.transferGroupId),
  ],
);

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
