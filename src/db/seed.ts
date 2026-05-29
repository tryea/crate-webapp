/**
 * Seed script — populates a fresh database with sane demo data so the app
 * boots into a "lived-in" state (not an empty grid).
 *
 * Idempotency: this script DELETES all data first (in dependency order),
 * then inserts. Safe to run repeatedly in dev. NEVER run in production.
 *
 * Usage: `bun run db:seed`
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });
config({ path: ".env" });

import * as s from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run the seed.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run seed in production.");
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema: s });

async function main() {
  console.log("⟶ wiping existing data (dev only)…");
  await db.execute(
    sql`TRUNCATE TABLE
      ${s.auditLog},
      ${s.stockMovements},
      ${s.poLines},
      ${s.purchaseOrders},
      ${s.products},
      ${s.locations},
      ${s.warehouses},
      ${s.suppliers},
      ${s.categories},
      ${s.users}
      RESTART IDENTITY CASCADE`,
  );

  console.log("⟶ users…");
  const [admin, manager, staff] = await db
    .insert(s.users)
    .values([
      { email: "admin@crate.local", name: "Admin", role: "admin" },
      { email: "manager@crate.local", name: "Mira Manager", role: "manager" },
      { email: "staff@crate.local", name: "Sam Staff", role: "staff" },
    ])
    .returning();

  console.log("⟶ categories…");
  const cats = await db
    .insert(s.categories)
    .values([
      { name: "Beverages", slug: "beverages" },
      { name: "Snacks", slug: "snacks" },
      { name: "Stationery", slug: "stationery" },
      { name: "Cleaning", slug: "cleaning" },
    ])
    .returning();

  console.log("⟶ suppliers…");
  const sups = await db
    .insert(s.suppliers)
    .values([
      {
        name: "Aria Distributors",
        contactEmail: "orders@aria-dist.example",
        contactPhone: "+62 21 555 0101",
      },
      {
        name: "Nadia Wholesale",
        contactEmail: "sales@nadia-wholesale.example",
        contactPhone: "+62 21 555 0202",
      },
      {
        name: "Reza Trading Co",
        contactEmail: "po@reza-trading.example",
        contactPhone: "+62 21 555 0303",
      },
    ])
    .returning();

  console.log("⟶ warehouses + locations…");
  const whs = await db
    .insert(s.warehouses)
    .values([
      { name: "Jakarta Central", code: "JKT-C", address: "Jl. Sudirman 1" },
      { name: "Surabaya East", code: "SBY-E", address: "Jl. Tunjungan 1" },
    ])
    .returning();

  const locs = await db
    .insert(s.locations)
    .values(
      whs.flatMap((w) => [
        { warehouseId: w.id, code: "A1", name: "Aisle A · Bin 1" },
        { warehouseId: w.id, code: "A2", name: "Aisle A · Bin 2" },
        { warehouseId: w.id, code: "B1", name: "Aisle B · Bin 1" },
      ]),
    )
    .returning();

  console.log("⟶ products…");
  const prods = await db
    .insert(s.products)
    .values([
      {
        sku: "BEV-001",
        name: "Mineral Water 600ml",
        categoryId: cats[0].id,
        supplierId: sups[0].id,
        unit: "btl",
        costPrice: "1500.00",
        sellingPrice: "3500.00",
        reorderPoint: 24,
      },
      {
        sku: "BEV-002",
        name: "Cold Brew Coffee 250ml",
        categoryId: cats[0].id,
        supplierId: sups[1].id,
        unit: "btl",
        costPrice: "8500.00",
        sellingPrice: "18000.00",
        reorderPoint: 12,
      },
      {
        sku: "SNK-001",
        name: "Mixed Nuts 200g",
        categoryId: cats[1].id,
        supplierId: sups[1].id,
        unit: "pack",
        costPrice: "12000.00",
        sellingPrice: "25000.00",
        reorderPoint: 10,
      },
      {
        sku: "STA-001",
        name: "A5 Notebook · 80gsm",
        categoryId: cats[2].id,
        supplierId: sups[2].id,
        unit: "pcs",
        costPrice: "9000.00",
        sellingPrice: "19500.00",
        reorderPoint: 20,
      },
      {
        sku: "CLN-001",
        name: "All-Purpose Cleaner 1L",
        categoryId: cats[3].id,
        supplierId: sups[2].id,
        unit: "btl",
        costPrice: "18000.00",
        sellingPrice: "38000.00",
        reorderPoint: 6,
      },
    ])
    .returning();

  console.log("⟶ seed stock_in for each product at JKT-C A1…");
  const jktA1 = locs.find(
    (l) => l.warehouseId === whs[0].id && l.code === "A1",
  )!;
  await db.insert(s.stockMovements).values(
    prods.map((p) => ({
      productId: p.id,
      locationId: jktA1.id,
      type: "stock_in" as const,
      reason: "purchase" as const,
      quantity: 100,
      unitCost: p.costPrice,
      reference: "INITIAL-SEED",
      notes: "Seed receiving — initial dev stock",
      createdBy: admin.id,
    })),
  );

  console.log("⟶ done. Inserted:");
  console.log(
    `   users: ${[admin, manager, staff].length} · categories: ${cats.length} · suppliers: ${sups.length}`,
  );
  console.log(
    `   warehouses: ${whs.length} · locations: ${locs.length} · products: ${prods.length}`,
  );

  await client.end();
}

main().catch(async (err) => {
  console.error("seed failed:", err);
  await client.end();
  process.exit(1);
});
