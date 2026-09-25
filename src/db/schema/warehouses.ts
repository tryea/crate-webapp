import {
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companyId } from "./companies";
import { id, timestamps } from "./_shared";

export const warehouses = pgTable(
  "warehouses",
  {
    id: id(),
    ...companyId(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    address: text("address"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("warehouses_code_idx").on(t.companyId, t.code)],
);

/**
 * Locations are bin/aisle codes within a warehouse. Unique by (warehouse, code).
 */
export const locations = pgTable(
  "locations",
  {
    id: id(),
    ...companyId(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("locations_warehouse_code_idx").on(t.warehouseId, t.code),
  ],
);

export type Warehouse = typeof warehouses.$inferSelect;
export type NewWarehouse = typeof warehouses.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
