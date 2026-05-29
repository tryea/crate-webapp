import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { categories, suppliers } from "./catalog";
import { id, timestamps } from "./_shared";

export const products = pgTable(
  "products",
  {
    id: id(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    unit: text("unit").notNull().default("pcs"),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    reorderPoint: integer("reorder_point").notNull().default(0),
    costPrice: numeric("cost_price", { precision: 14, scale: 2 })
      .notNull()
      .default("0.00"),
    sellingPrice: numeric("selling_price", { precision: 14, scale: 2 })
      .notNull()
      .default("0.00"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("products_sku_idx").on(t.sku)],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
