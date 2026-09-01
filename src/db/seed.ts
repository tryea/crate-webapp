/**
 * Seed script: populates a fresh database with sane demo data so the app
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

/**
 * Replays the ledger in chronological order and throws if any
 * (product, location) balance would dip below zero.
 *
 * The no-negative-stock rule lives in the API layer, not in a CHECK
 * constraint, so a seed writing straight to the table can quietly produce a
 * state the application would have refused. That state looks fine on a
 * dashboard and then contradicts the product's central claim. Cheaper to
 * catch here than to notice it in a screenshot.
 */
function assertNeverNegative(rows: (typeof s.stockMovements.$inferInsert)[]) {
  const balances = new Map<string, number>();
  const sorted = [...rows].sort(
    (a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime(),
  );
  for (const r of sorted) {
    const key = `${r.productId}:${r.locationId}`;
    const next = (balances.get(key) ?? 0) + r.quantity;
    if (next < 0) {
      throw new Error(
        `seed ledger would drive ${key} negative (${next}) at ${(r.createdAt as Date).toISOString()}: ` +
          `ref ${r.reference ?? "none"}. Fix the quantities, not this check.`,
      );
    }
    balances.set(key, next);
  }
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
  // Eight SKUs across all four categories and all three suppliers. Reorder
  // points are derived from the sales velocity the ledger below actually
  // produces (roughly a week of cover), not picked at random, three SKUs are
  // meant to sit at or under their point so the low-stock badges and the
  // dashboard reorder KPI have something real to report.
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
        reorderPoint: 240,
      },
      {
        sku: "BEV-002",
        name: "Cold Brew Coffee 250ml",
        categoryId: cats[0].id,
        supplierId: sups[1].id,
        unit: "btl",
        costPrice: "8500.00",
        sellingPrice: "18000.00",
        reorderPoint: 60,
      },
      {
        sku: "SNK-001",
        name: "Mixed Nuts 200g",
        categoryId: cats[1].id,
        supplierId: sups[1].id,
        unit: "pack",
        costPrice: "12000.00",
        sellingPrice: "25000.00",
        reorderPoint: 50,
      },
      {
        sku: "SNK-002",
        name: "Cassava Chips 180g",
        categoryId: cats[1].id,
        supplierId: sups[2].id,
        unit: "pack",
        costPrice: "6250.00",
        sellingPrice: "14000.00",
        reorderPoint: 45,
      },
      {
        sku: "STA-001",
        name: "A5 Notebook · 80gsm",
        categoryId: cats[2].id,
        supplierId: sups[2].id,
        unit: "pcs",
        costPrice: "9000.00",
        sellingPrice: "19500.00",
        reorderPoint: 30,
      },
      {
        sku: "STA-002",
        name: "Gel Pen 0.5mm · Box of 12",
        categoryId: cats[2].id,
        supplierId: sups[0].id,
        unit: "box",
        costPrice: "21000.00",
        sellingPrice: "42000.00",
        reorderPoint: 24,
      },
      {
        sku: "CLN-001",
        name: "All-Purpose Cleaner 1L",
        categoryId: cats[3].id,
        supplierId: sups[2].id,
        unit: "btl",
        costPrice: "18000.00",
        sellingPrice: "38000.00",
        reorderPoint: 24,
      },
      {
        sku: "CLN-002",
        name: "Microfiber Cloth · 5-pack",
        categoryId: cats[3].id,
        supplierId: sups[0].id,
        unit: "pack",
        costPrice: "27500.00",
        sellingPrice: "55000.00",
        reorderPoint: 26,
      },
    ])
    .returning();

  // --- lookups -----------------------------------------------------------
  const bySku = new Map(prods.map((p) => [p.sku, p]));
  const whByCode = new Map(whs.map((w) => [w.code, w]));
  const bin = (wh: string, code: string) => {
    const w = whByCode.get(wh)!;
    return locs.find((l) => l.warehouseId === w.id && l.code === code)!;
  };
  const P = (sku: string) => bySku.get(sku)!;

  /**
   * Timestamps are anchored to the moment the seed runs, so a dev database
   * never ages into looking abandoned. `at(3, "14:05")` means three days ago
   * at 14:05 local time. Every row gets its own explicit `createdAt`, the
   * ledger is ordered by `desc(created_at)`, and letting 50+ rows fall back to
   * `defaultNow()` would stamp them all with the same instant, which is both
   * an arbitrary display order and a dead giveaway that nothing really moved.
   */
  const seededAt = new Date();
  const at = (daysAgo: number, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(seededAt);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d;
  };

  console.log("⟶ purchase orders (all five states)…");
  // Every receipt in the ledger below quotes one of these PO numbers, and the
  // quantity received on the line matches what the ledger actually booked,
  // so `partial` really is partial and `received` really is complete. A
  // reviewer who cross-checks the two tables finds the story holds.
  const poSpecs = [
    { no: "PO-2026-001", sup: 0, wh: "JKT-C", status: "received" as const, created: at(15, "09:12"), expected: at(14, "00:00"), received: at(14, "00:00"),
      lines: [["BEV-001", 600, 600, "1500.00"], ["STA-002", 60, 60, "21000.00"], ["CLN-002", 45, 45, "27500.00"]] },
    { no: "PO-2026-002", sup: 2, wh: "SBY-E", status: "received" as const, created: at(14, "11:35"), expected: at(13, "00:00"), received: at(13, "00:00"),
      lines: [["CLN-001", 90, 90, "18000.00"], ["SNK-002", 240, 240, "6250.00"]] },
    { no: "PO-2026-003", sup: 1, wh: "JKT-C", status: "received" as const, created: at(14, "16:04"), expected: at(13, "00:00"), received: at(13, "00:00"),
      lines: [["BEV-002", 180, 180, "8500.00"], ["SNK-001", 120, 120, "12000.00"]] },
    { no: "PO-2026-004", sup: 2, wh: "JKT-C", status: "received" as const, created: at(13, "08:50"), expected: at(12, "00:00"), received: at(12, "00:00"),
      lines: [["STA-001", 150, 150, "9000.00"]] },
    { no: "PO-2026-005", sup: 2, wh: "SBY-E", status: "partial" as const, created: at(12, "14:20"), expected: at(10, "00:00"), received: null,
      lines: [["CLN-001", 150, 60, "18500.00"]] },
    { no: "PO-2026-006", sup: 1, wh: "JKT-C", status: "partial" as const, created: at(10, "10:45"), expected: at(8, "00:00"), received: null,
      lines: [["BEV-002", 144, 96, "8200.00"], ["SNK-001", 120, 72, "12000.00"]] },
    { no: "PO-2026-007", sup: 0, wh: "JKT-C", status: "received" as const, created: at(6, "15:30"), expected: at(4, "00:00"), received: at(4, "00:00"),
      lines: [["STA-002", 36, 36, "21500.00"]] },
    { no: "PO-2026-008", sup: 0, wh: "SBY-E", status: "partial" as const, created: at(4, "09:55"), expected: at(2, "00:00"), received: null,
      lines: [["CLN-002", 60, 30, "27500.00"]] },
    { no: "PO-2026-009", sup: 1, wh: "JKT-C", status: "sent" as const, created: at(3, "13:15"), expected: at(-4, "00:00"), received: null,
      lines: [["SNK-001", 96, 0, "12000.00"], ["BEV-002", 48, 0, "8500.00"]] },
    { no: "PO-2026-010", sup: 2, wh: "JKT-C", status: "draft" as const, created: at(1, "16:40"), expected: null, received: null,
      lines: [["STA-001", 120, 0, "9000.00"], ["SNK-002", 180, 0, "6250.00"]] },
    { no: "PO-2026-011", sup: 0, wh: "JKT-C", status: "partial" as const, created: at(2, "11:05"), expected: at(0, "00:00"), received: null,
      lines: [["BEV-001", 600, 480, "1560.00"]] },
    { no: "PO-2026-012", sup: 0, wh: "SBY-E", status: "cancelled" as const, created: at(5, "10:25"), expected: at(1, "00:00"), received: null,
      lines: [["BEV-001", 240, 0, "1500.00"]] },
  ];

  const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const pos = await db
    .insert(s.purchaseOrders)
    .values(
      poSpecs.map((po) => ({
        poNumber: po.no,
        supplierId: sups[po.sup].id,
        warehouseId: whByCode.get(po.wh)!.id,
        status: po.status,
        expectedDate: isoDate(po.expected),
        receivedDate: isoDate(po.received),
        createdBy: manager.id,
        createdAt: po.created,
        updatedAt: po.created,
      })),
    )
    .returning();

  const poByNumber = new Map(pos.map((p) => [p.poNumber, p]));
  await db.insert(s.poLines).values(
    poSpecs.flatMap((po) =>
      po.lines.map(([sku, ordered, received, cost]) => ({
        poId: poByNumber.get(po.no)!.id,
        productId: P(sku as string).id,
        quantityOrdered: ordered as number,
        quantityReceived: received as number,
        unitCost: cost as string,
        createdAt: po.created,
        updatedAt: po.created,
      })),
    ),
  );

  console.log("⟶ movement ledger (15 days of activity)…");
  /**
   * A hand-written ledger rather than a generated one. Fifteen days of
   * receiving, selling, transferring, damage write-offs, one customer return
   * and a few cycle-count corrections, spread over eight SKUs and six bins.
   *
   * Two constraints this script satisfies deliberately:
   *   - No (product, location) balance ever goes negative at any point in the
   *     sequence, so the data is reachable through the real API, which refuses
   *     negative stock unless backorder is on.
   *   - task-#99's e2e regression `data-table-a11y.journey.spec.ts` asserts the
   *     /movements scroll region actually overflows. That needs roughly 29+
   *     rows in the default Playwright viewport; this produces 55.
   *
   * Receipt unit costs drift from the product's standing cost on purpose
   * (a supplier price rise on CLN-001, a volume discount on BEV-002). Perpetual
   * weighted-average costing is a headline feature, and it can only be seen
   * working if inbound cost actually varies.
   */
  type Row = typeof s.stockMovements.$inferInsert;
  const ledger: Row[] = [];

  const receive = (
    when: Date, sku: string, wh: string, code: string, qty: number, po: string, cost: string,
  ) => {
    ledger.push({
      productId: P(sku).id, locationId: bin(wh, code).id,
      type: "stock_in", reason: "purchase", quantity: qty, unitCost: cost,
      reference: po, notes: `Goods received against ${po}`,
      createdBy: admin.id, createdAt: when,
    });
  };

  const sell = (when: Date, sku: string, wh: string, code: string, qty: number, so: string) => {
    ledger.push({
      productId: P(sku).id, locationId: bin(wh, code).id,
      type: "stock_out", reason: "sale", quantity: -qty,
      reference: so, notes: "Sale fulfillment",
      createdBy: manager.id, createdAt: when,
    });
  };

  const writeOff = (when: Date, sku: string, wh: string, code: string, qty: number, note: string) => {
    ledger.push({
      productId: P(sku).id, locationId: bin(wh, code).id,
      type: "stock_out", reason: "damage", quantity: -qty,
      notes: note, createdBy: staff.id, createdAt: when,
    });
  };

  const recount = (when: Date, sku: string, wh: string, code: string, delta: number, note: string) => {
    ledger.push({
      productId: P(sku).id, locationId: bin(wh, code).id,
      type: "adjustment", reason: "count_correction", quantity: delta,
      notes: note, createdBy: staff.id, createdAt: when,
    });
  };

  // Two rows, one transferGroupId, per the pairing contract in
  // src/db/schema/movements.ts. Both sides carry the same timestamp.
  const transfer = (
    when: Date, sku: string, from: [string, string], to: [string, string], qty: number, ref: string,
  ) => {
    const group = crypto.randomUUID();
    ledger.push({
      productId: P(sku).id, locationId: bin(from[0], from[1]).id,
      type: "transfer_out", reason: "transfer", quantity: -qty,
      reference: ref, transferGroupId: group,
      notes: `Transfer to ${to[0]} · ${to[1]}`,
      createdBy: manager.id, createdAt: when,
    });
    ledger.push({
      productId: P(sku).id, locationId: bin(to[0], to[1]).id,
      type: "transfer_in", reason: "transfer", quantity: qty,
      reference: ref, transferGroupId: group,
      notes: `Transfer from ${from[0]} · ${from[1]}`,
      createdBy: manager.id, createdAt: when,
    });
  };

  const customerReturn = (
    when: Date, sku: string, wh: string, code: string, qty: number, rma: string,
  ) => {
    ledger.push({
      productId: P(sku).id, locationId: bin(wh, code).id,
      type: "stock_in", reason: "return_from_customer", quantity: qty,
      unitCost: P(sku).costPrice, reference: rma,
      notes: "Unopened, returned to sellable stock",
      createdBy: staff.id, createdAt: when,
    });
  };

  receive(at(14, "08:15"), "BEV-001", "JKT-C", "A1", 600, "PO-2026-001", "1500.00");
  receive(at(14, "08:22"), "STA-002", "JKT-C", "B1", 60, "PO-2026-001", "21000.00");
  receive(at(14, "08:31"), "CLN-002", "JKT-C", "A1", 45, "PO-2026-001", "27500.00");

  receive(at(13, "09:40"), "CLN-001", "SBY-E", "A1", 90, "PO-2026-002", "18000.00");
  receive(at(13, "09:48"), "SNK-002", "SBY-E", "A2", 240, "PO-2026-002", "6250.00");
  receive(at(13, "14:05"), "BEV-002", "JKT-C", "A1", 180, "PO-2026-003", "8500.00");
  receive(at(13, "14:12"), "SNK-001", "JKT-C", "A2", 120, "PO-2026-003", "12000.00");

  receive(at(12, "10:20"), "STA-001", "JKT-C", "B1", 150, "PO-2026-004", "9000.00");
  transfer(at(12, "15:50"), "BEV-001", ["JKT-C", "A1"], ["SBY-E", "A1"], 120, "TRF-2026-0041");

  sell(at(11, "08:55"), "BEV-001", "JKT-C", "A1", 45, "SO-2026-0148");
  transfer(at(11, "11:30"), "SNK-002", ["SBY-E", "A2"], ["JKT-C", "A2"], 80, "TRF-2026-0043");
  sell(at(11, "16:10"), "SNK-001", "JKT-C", "A2", 18, "SO-2026-0151");

  receive(at(10, "09:05"), "CLN-001", "SBY-E", "A1", 60, "PO-2026-005", "18500.00");
  writeOff(at(10, "13:25"), "BEV-002", "JKT-C", "A1", 6, "Crushed carton, discarded at receiving");
  sell(at(10, "16:40"), "BEV-001", "SBY-E", "A1", 60, "SO-2026-0155");

  sell(at(9, "08:30"), "STA-001", "JKT-C", "B1", 35, "SO-2026-0158");
  recount(at(9, "11:45"), "STA-002", "JKT-C", "B1", -3, "Cycle count B1, three boxes short");
  sell(at(9, "15:20"), "CLN-002", "JKT-C", "A1", 8, "SO-2026-0161");

  receive(at(8, "09:15"), "BEV-002", "JKT-C", "A1", 96, "PO-2026-006", "8200.00");
  transfer(at(8, "12:40"), "STA-001", ["JKT-C", "B1"], ["SBY-E", "B1"], 40, "TRF-2026-0047");
  sell(at(8, "16:05"), "SNK-002", "SBY-E", "A2", 40, "SO-2026-0166");

  sell(at(7, "08:45"), "BEV-001", "JKT-C", "A1", 130, "SO-2026-0169");
  customerReturn(at(7, "10:50"), "STA-001", "SBY-E", "B1", 4, "RMA-2026-011");
  writeOff(at(7, "14:35"), "SNK-002", "SBY-E", "A2", 9, "Torn packaging, supplier credit pending");

  receive(at(6, "09:20"), "SNK-001", "JKT-C", "A2", 72, "PO-2026-006", "12000.00");
  sell(at(6, "13:10"), "CLN-001", "SBY-E", "A1", 38, "SO-2026-0174");
  sell(at(6, "16:55"), "BEV-002", "JKT-C", "A1", 84, "SO-2026-0176");

  transfer(at(5, "08:40"), "CLN-002", ["JKT-C", "A1"], ["SBY-E", "A1"], 15, "TRF-2026-0052");
  sell(at(5, "11:25"), "STA-002", "JKT-C", "B1", 22, "SO-2026-0180");
  sell(at(5, "15:00"), "BEV-001", "SBY-E", "A1", 35, "SO-2026-0182");

  receive(at(4, "09:30"), "STA-002", "JKT-C", "B1", 36, "PO-2026-007", "21500.00");
  recount(at(4, "12:15"), "CLN-001", "SBY-E", "A1", 2, "Cycle count A1, two bottles found behind pallet");
  sell(at(4, "16:20"), "SNK-001", "JKT-C", "A2", 64, "SO-2026-0187");

  transfer(at(3, "08:50"), "BEV-002", ["JKT-C", "A1"], ["SBY-E", "A1"], 60, "TRF-2026-0056");
  sell(at(3, "13:35"), "SNK-002", "JKT-C", "A2", 12, "SO-2026-0191");
  sell(at(3, "16:45"), "CLN-002", "SBY-E", "A1", 14, "SO-2026-0193");

  receive(at(2, "09:10"), "CLN-002", "SBY-E", "A1", 30, "PO-2026-008", "27500.00");
  sell(at(2, "11:55"), "BEV-001", "JKT-C", "A1", 180, "SO-2026-0197");
  sell(at(2, "15:30"), "SNK-001", "JKT-C", "A2", 55, "SO-2026-0199");

  sell(at(1, "08:25"), "STA-001", "SBY-E", "B1", 12, "SO-2026-0203");
  sell(at(1, "10:40"), "BEV-002", "SBY-E", "A1", 24, "SO-2026-0205");
  writeOff(at(1, "14:15"), "CLN-001", "SBY-E", "A1", 3, "Leaking cap, disposed");
  sell(at(1, "17:00"), "CLN-002", "SBY-E", "A1", 28, "SO-2026-0209");

  receive(at(0, "08:20"), "BEV-001", "JKT-C", "A1", 480, "PO-2026-011", "1560.00");
  sell(at(0, "10:05"), "SNK-001", "JKT-C", "A2", 21, "SO-2026-0212");
  transfer(at(0, "11:50"), "STA-002", ["JKT-C", "B1"], ["SBY-E", "B1"], 12, "TRF-2026-0061");
  sell(at(0, "13:30"), "STA-002", "JKT-C", "B1", 52, "SO-2026-0215");
  sell(at(0, "15:10"), "CLN-001", "SBY-E", "A1", 9, "SO-2026-0217");
  recount(at(0, "16:35"), "BEV-002", "JKT-C", "A1", -2, "Cycle count A1, two bottles unaccounted");

  // Fail loudly rather than seed a state the API itself would have rejected.
  assertNeverNegative(ledger);

  await db.insert(s.stockMovements).values(ledger);

  console.log("⟶ done. Inserted:");
  console.log(
    `   users: ${[admin, manager, staff].length} (admin/manager/staff) · categories: ${cats.length} · suppliers: ${sups.length}`,
  );
  console.log(
    `   warehouses: ${whs.length} · locations: ${locs.length} · products: ${prods.length}`,
  );
  console.log(
    `   purchase orders: ${pos.length} (draft/sent/partial/received/cancelled) · movements: ${ledger.length} over 15 days`,
  );

  await client.end();
}

main().catch(async (err) => {
  console.error("seed failed:", err);
  await client.end();
  process.exit(1);
});
