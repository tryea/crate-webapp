/**
 * Seed script — populates a fresh database with sane demo data so the app
 * boots into a "lived-in" state (not an empty grid).
 *
 * Idempotency: this script DELETES all data first (in dependency order),
 * then inserts. Safe to run repeatedly in dev. NEVER run in production.
 *
 * Per DEC-003 R1: users are created via BetterAuth's sign-up API so
 * passwords are properly hashed and the account/session machinery is
 * consistent with the runtime flow.
 *
 * Usage: `bun run db:seed`
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });
config({ path: ".env" });

import * as s from "./schema";
import { auth } from "@/shared/lib/auth/server";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run the seed.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run seed in production.");
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema: s });

async function signUpDemoUser(input: {
  email: string;
  name: string;
  password: string;
  role: "admin" | "manager" | "staff";
}) {
  await auth.api.signUpEmail({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
    },
  });
  // BetterAuth's `additionalFields.role.input = false` blocks role-on-signup,
  // so we promote the row directly after creation.
  await db.update(s.user).set({ role: input.role }).where(eq(s.user.email, input.email));
  const [row] = await db.select().from(s.user).where(eq(s.user.email, input.email));
  return row;
}

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
      ${s.verification},
      ${s.session},
      ${s.account},
      ${s.user}
      RESTART IDENTITY CASCADE`,
  );

  console.log("⟶ users (via BetterAuth sign-up)…");
  const admin = await signUpDemoUser({
    email: "admin@crate.local",
    name: "Admin",
    password: "ChangeMe!Admin",
    role: "admin",
  });
  const manager = await signUpDemoUser({
    email: "manager@crate.local",
    name: "Mira Manager",
    password: "ChangeMe!Manager",
    role: "manager",
  });
  const staff = await signUpDemoUser({
    email: "staff@crate.local",
    name: "Sam Staff",
    password: "ChangeMe!Staff",
    role: "staff",
  });

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

  console.log("⟶ replenishment + sale activity (overflow guard)…");
  // task-#99 e2e regression `data-table-a11y.journey.spec.ts` asserts the
  // /movements table's scrollable region actually overflows in CI (it must
  // be > 459px scrollHeight in the default Playwright viewport, where the
  // 70svh clamp lands around 459px). The 5 INITIAL-SEED rows above only
  // produce ~200px — not enough. Adding a richer ledger here keeps the
  // "lived-in state" intent while guaranteeing overflow ≥ 29 extra rows
  // across remaining locations + a small sale batch.
  const otherLocs = locs.filter((l) => l.id !== jktA1.id);
  const extraMovements: (typeof s.stockMovements.$inferInsert)[] = [];
  for (const loc of otherLocs) {
    for (const p of prods) {
      extraMovements.push({
        productId: p.id,
        locationId: loc.id,
        type: "stock_in" as const,
        reason: "purchase" as const,
        quantity: 50,
        unitCost: p.costPrice,
        reference: `PO-2026-${loc.code}-${p.sku}`,
        notes: `Replenishment receiving · ${loc.code}`,
        createdBy: admin.id,
      });
    }
  }
  // Small sale batch from JKT-C A1 — negative quantity per the sign
  // convention documented in src/db/schema/movements.ts.
  for (const p of prods.slice(0, 4)) {
    extraMovements.push({
      productId: p.id,
      locationId: jktA1.id,
      type: "stock_out" as const,
      reason: "sale" as const,
      quantity: -5,
      reference: `SO-2026-${p.sku}`,
      notes: "Sale fulfillment",
      createdBy: manager.id,
    });
  }
  await db.insert(s.stockMovements).values(extraMovements);

  console.log("⟶ done. Inserted:");
  console.log(
    `   users: ${[admin, manager, staff].length} (admin/manager/staff) · categories: ${cats.length} · suppliers: ${sups.length}`,
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
