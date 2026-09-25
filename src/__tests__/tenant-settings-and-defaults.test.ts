/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/**
 * FR-29 (ticket 1009, "CPP-TENANT-7"): the last two things every company
 * shared stop being shared, and the scaffolding that hid an unowned write
 * comes off.
 *
 * THREE CLAIMS, AND EACH ONE NEEDS A DIFFERENT KIND OF EVIDENCE:
 *
 *   1. SETTINGS ARE THE COMPANY'S OWN. `settings` was keyed on `key` alone, so
 *      it held one row per config domain for the whole installation. Two
 *      companies here save opposite values and then read them back, and the
 *      values are read back through the surface that consumes them: the
 *      stock-out gate. A shared row would let one company's backorder switch
 *      decide whether another company's sale may go negative, and that is a
 *      behaviour, not a column.
 *
 *   2. PO NUMBERING IS THE COMPANY'S OWN SEQUENCE. Bravo holds five orders
 *      here and alfa holds one, so an unscoped `MAX` hands alfa `006`. The
 *      assertion is `002`. The gap matters twice over: it is a wrong number,
 *      and it tells alfa how many orders bravo has placed.
 *
 *   3. THE COLUMN DEFAULT IS GONE, AND WRITES STILL LAND. "Gone" is read from
 *      `pg_catalog` for all ten tables, and then made to bite: an insert that
 *      omits the column raises 23502 instead of being stamped with the first
 *      company. The other half of that claim is the one a migration can break,
 *      so every write path in the app runs here afterwards against a database
 *      with no default to fall back on, and a row is counted in each of the
 *      ten tables.
 *
 * WHY THIS IS NOT THE WRITE SUITE AGAIN. `tenant-write-ownership.test.ts`
 * proves a write names its company, and it does so by RE-ADDING a default and
 * pointing it at a trap, because on the database that shipped then a default
 * was always there. This suite is the opposite rig: nothing is altered after
 * the migrations run, so the tables are exactly as ticket 1009 leaves them,
 * and "the insert succeeded" means it succeeded with no default in reach.
 *
 * NEITHER COMPANY IS `SINGLE_COMPANY_ID`. A write or a read that reached for
 * that constant instead of the membership would otherwise be indistinguishable
 * from a correct one, the same trap tickets 1003 and 1004 set.
 *
 * PGlite is Postgres compiled to wasm and the schema is built by replaying the
 * real migration files, so the primary key, the missing defaults and the
 * composite indexes under test are the ones that ship.
 */
const MIGRATIONS_DIR = join(__dirname, "../db/migrations");

/** The ten domain tables the FR-29 survey names (TENANT-SEPARATION.md §2). */
const DOMAIN_TABLES = [
  "categories",
  "suppliers",
  "warehouses",
  "locations",
  "products",
  "stock_movements",
  "purchase_orders",
  "po_lines",
  "audit_log",
  "settings",
] as const;

/** Postgres raises 23502 (not_null_violation) for a missing NOT NULL value. */
const NOT_NULL_VIOLATION = "23502";

const YEAR = new Date().getUTCFullYear();

const ALFA = {
  companyId: "11111111-1111-4111-8111-00000000000a",
  supplierId: "00000000-0000-4000-8000-00000000a002",
  warehouseId: "00000000-0000-4000-8000-00000000a003",
  locationId: "00000000-0000-4000-8000-00000000a004",
} as const;

const BRAVO = {
  companyId: "22222222-2222-4222-8222-00000000000b",
  categoryId: "00000000-0000-4000-8000-00000000b001",
  supplierId: "00000000-0000-4000-8000-00000000b002",
  warehouseId: "00000000-0000-4000-8000-00000000b003",
  locationId: "00000000-0000-4000-8000-00000000b004",
  productId: "00000000-0000-4000-8000-00000000b005",
  poId: "00000000-0000-4000-8000-00000000b006",
} as const;

const ALFA_ADMIN = { id: "user-alfa-admin", role: "admin" } as const;
const BRAVO_ADMIN = { id: "user-bravo-admin", role: "admin" } as const;

let mockPglite: PGlite;
let mockDb: ReturnType<typeof drizzle>;
let session: { user: { id: string; role: string } } | null = null;

jest.mock("@/db/client", () => ({
  get db() {
    return mockDb;
  },
}));

jest.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

// `requireRole` gates the actions and `getServerSession` is what
// `read-context.ts`, and through it `resolveCompanyId`, reads the session
// with. Neither Better Auth nor `next/headers` exists outside a request, so
// both are replaced by the session they would have resolved. The role check
// itself is not what this suite is about.
jest.mock("@/shared/lib/auth/require-role", () => ({
  getServerSession: async () => session,
  requireRole: async () => {
    if (!session) throw new Error("no session");
    return { session, user: session.user };
  },
}));

import { SINGLE_COMPANY_ID } from "@/db/schema/companies";
import { createCategoryAction } from "@/entities/category/api/actions";
import { createProductAction } from "@/entities/product/api/actions";
import {
  addPoLineAction,
  createPurchaseOrderAction,
} from "@/entities/purchase-order/api/actions";
import { nextPoNumberServer } from "@/entities/purchase-order/api/server";
import { updateStockSettingsAction } from "@/entities/settings/api/actions";
import { getStockSettingsServer } from "@/entities/settings/api/server";
import {
  stockInAction,
  stockOutAction,
} from "@/entities/stock-movement/api/actions";
import { createSupplierAction } from "@/entities/supplier/api/actions";
import {
  createLocationAction,
  createWarehouseAction,
} from "@/entities/warehouse/api/actions";

async function applyMigrations(pg: PGlite) {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };

  for (const entry of journal.entries) {
    await pg.exec(
      readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8"),
    );
  }
}

async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
  const result = await mockPglite.query<Record<string, T>>(text, params);
  return Object.values(result.rows[0])[0];
}

const rowsOwnedBy = (table: string, companyId: string) =>
  scalar<number>(
    `select count(*)::int as n from ${table} where company_id = $1`,
    [companyId],
  );

function expectOk<T>(result: { ok: boolean; data?: T; error?: string }): T {
  if (!result.ok)
    throw new Error(`action refused unexpectedly: ${result.error}`);
  return result.data as T;
}

function actAs(who: { id: string; role: string }) {
  session = { user: { id: who.id, role: who.role } };
}

/** Ids minted by alfa's actions, reused by the blocks that follow. */
const alfa = { productId: "", poId: "" };

beforeAll(async () => {
  mockPglite = await PGlite.create();
  await applyMigrations(mockPglite);
  mockDb = drizzle(mockPglite);

  await mockPglite.exec(`
    insert into companies (id, name) values
      ('${ALFA.companyId}', 'Alfa Coffee'),
      ('${BRAVO.companyId}', 'Bravo Roasters');
    insert into "user" (id, name, email, email_verified, role) values
      ('${ALFA_ADMIN.id}', 'Ada', 'ada@alfa.test', true, 'admin'),
      ('${BRAVO_ADMIN.id}', 'Bo', 'bo@bravo.test', true, 'admin');
    insert into company_members (company_id, user_id) values
      ('${ALFA.companyId}', '${ALFA_ADMIN.id}'),
      ('${BRAVO.companyId}', '${BRAVO_ADMIN.id}');
  `);

  // Bravo's side is written as plain SQL naming its owner, which is the other
  // half of "inserts still work": the app is not the only thing that writes to
  // these tables (src/db/seed.ts and scripts/concurrency-check.ts do too), and
  // a statement that names the column has never needed the default.
  await mockPglite.exec(`
    insert into categories (id, company_id, name, slug) values
      ('${BRAVO.categoryId}', '${BRAVO.companyId}', 'Bravo Beans', 'beans');
    insert into suppliers (id, company_id, name) values
      ('${BRAVO.supplierId}', '${BRAVO.companyId}', 'Bravo Supplies');
    insert into warehouses (id, company_id, name, code) values
      ('${BRAVO.warehouseId}', '${BRAVO.companyId}', 'Bravo Main', 'WH1');
    insert into locations (id, company_id, warehouse_id, code) values
      ('${BRAVO.locationId}', '${BRAVO.companyId}', '${BRAVO.warehouseId}', 'A1');
    insert into products (id, company_id, sku, name, unit) values
      ('${BRAVO.productId}', '${BRAVO.companyId}', 'SKU-1', 'Bravo House Blend', 'kg');
    -- Five orders, so an unscoped MAX over this table answers 005 and the
    -- company that owns exactly one order would be handed 006.
    insert into purchase_orders (id, company_id, po_number, supplier_id, warehouse_id, status) values
      ('${BRAVO.poId}', '${BRAVO.companyId}', 'PO-${YEAR}-001', '${BRAVO.supplierId}', '${BRAVO.warehouseId}', 'draft'),
      (gen_random_uuid(), '${BRAVO.companyId}', 'PO-${YEAR}-002', '${BRAVO.supplierId}', '${BRAVO.warehouseId}', 'draft'),
      (gen_random_uuid(), '${BRAVO.companyId}', 'PO-${YEAR}-003', '${BRAVO.supplierId}', '${BRAVO.warehouseId}', 'draft'),
      (gen_random_uuid(), '${BRAVO.companyId}', 'PO-${YEAR}-004', '${BRAVO.supplierId}', '${BRAVO.warehouseId}', 'draft'),
      (gen_random_uuid(), '${BRAVO.companyId}', 'PO-${YEAR}-005', '${BRAVO.supplierId}', '${BRAVO.warehouseId}', 'draft');
  `);

  actAs(ALFA_ADMIN);
}, 120_000);

afterAll(async () => {
  await mockPglite?.close();
});

beforeEach(() => {
  actAs(ALFA_ADMIN);
});

describe("the rig itself", () => {
  it("gives both companies an id that is not the seeded constant", () => {
    expect(ALFA.companyId).not.toBe(SINGLE_COMPANY_ID);
    expect(BRAVO.companyId).not.toBe(SINGLE_COMPANY_ID);
    expect(ALFA.companyId).not.toBe(BRAVO.companyId);
  });

  it("leaves nobody a member of the company the default used to name", async () => {
    // `SINGLE_COMPANY_ID` is still in this database: migration 0005 inserts
    // it, and 0006 would have backfilled memberships into it had any account
    // predated it. None does here, so a row that ends up owned by it could
    // only have come from a fallback, which is what makes the sweep for it
    // below able to fail.
    expect(
      await scalar<number>(
        "select count(*)::int as n from companies where id = $1",
        [SINGLE_COMPANY_ID],
      ),
    ).toBe(1);
    expect(
      await scalar<number>(
        "select count(*)::int as n from company_members where company_id = $1",
        [SINGLE_COMPANY_ID],
      ),
    ).toBe(0);
  });
});

describe("the company_id default is gone from all ten tables", () => {
  it.each(DOMAIN_TABLES)("%s has no default on company_id", async (table) => {
    // pg_catalog, not information_schema: the runtime connects as a role that
    // information_schema filters by privilege, so a habit of reading the
    // catalogue directly is the one that survives outside a test.
    const defaults = await scalar<number>(
      `select count(*)::int as n
       from pg_attrdef d
       join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
       where d.adrelid = $1::regclass and a.attname = 'company_id'`,
      [table],
    );

    expect([table, defaults]).toEqual([table, 0]);
  });

  it.each(DOMAIN_TABLES)("%s still requires company_id", async (table) => {
    // Dropping the default without keeping NOT NULL would swap a wrongly
    // owned row for an unowned one, which is not the trade this ticket makes.
    const notNull = await scalar<boolean>(
      `select a.attnotnull as n
       from pg_attribute a
       where a.attrelid = $1::regclass and a.attname = 'company_id'`,
      [table],
    );

    expect([table, notNull]).toEqual([table, true]);
  });

  it("refuses an insert that does not name a company", async () => {
    // The catalogue readings above say the default is absent; this says what
    // its absence does. Before this ticket the same statement succeeded and
    // stamped the row with whichever company the default named.
    await expect(
      mockPglite.query(
        "insert into categories (name, slug) values ('Unowned', 'unowned')",
      ),
    ).rejects.toMatchObject({ code: NOT_NULL_VIOLATION });

    expect(
      await scalar<number>(
        "select count(*)::int as n from categories where slug = 'unowned'",
      ),
    ).toBe(0);
  });
});

describe("every write path still lands with no default to fall back on", () => {
  beforeAll(async () => {
    actAs(ALFA_ADMIN);

    expectOk(
      await createCategoryAction({
        name: "Alfa Beans",
        slug: "beans",
        parentId: null,
      }),
    );

    const supplier = expectOk(
      await createSupplierAction({ name: "Alfa Supplies" }),
    );
    const warehouse = expectOk(
      await createWarehouseAction({
        name: "Alfa Main",
        code: "WH1",
        address: null,
      }),
    );
    const location = expectOk(
      await createLocationAction((warehouse as { id: string }).id, {
        code: "A1",
        name: "Aisle A",
      }),
    );
    const product = expectOk(
      await createProductAction({
        sku: "SKU-1",
        name: "Alfa House Blend",
        unit: "kg",
        reorderPoint: 5,
        costPrice: "10.00",
        sellingPrice: "15.00",
        isActive: true,
      }),
    );
    alfa.productId = (product as { id: string }).id;

    const po = expectOk(
      await createPurchaseOrderAction({
        supplierId: (supplier as { id: string }).id,
        warehouseId: (warehouse as { id: string }).id,
      }),
    );
    alfa.poId = (po as { id: string }).id;

    expectOk(
      await addPoLineAction(alfa.poId, {
        productId: alfa.productId,
        quantityOrdered: 10,
        unitCost: "10.00",
      }),
    );

    // stock_movements and audit_log in one transaction.
    expectOk(
      await stockInAction({
        productId: alfa.productId,
        locationId: (location as { id: string }).id,
        quantity: 7,
        reason: "purchase",
      }),
    );

    // The tenth table.
    expectOk(await updateStockSettingsAction({ allowBackorder: false }));
  }, 120_000);

  it.each(DOMAIN_TABLES)(
    "wrote a %s row owned by the caller",
    async (table) => {
      // Without this, "no row belongs to anyone else" would also be true of a
      // table nothing ever wrote to, and the sweep below would measure nothing.
      const owned = await rowsOwnedBy(table, ALFA.companyId);
      expect([table, owned > 0]).toEqual([table, true]);
    },
  );

  it.each(DOMAIN_TABLES)(
    "left no %s row owned by the constant the default used to name",
    async (table) => {
      // A row wearing SINGLE_COMPANY_ID could only have come from a fallback,
      // because nobody in this database is a member of that company.
      expect([table, await rowsOwnedBy(table, SINGLE_COMPANY_ID)]).toEqual([
        table,
        0,
      ]);
    },
  );
});

describe("two companies each keep their own settings", () => {
  it("gives each company its own row rather than one shared row", async () => {
    // Alfa saved `false` above. Bravo saves the opposite, and before this
    // ticket that save landed on alfa's row through `ON CONFLICT (key)`.
    actAs(BRAVO_ADMIN);
    expectOk(await updateStockSettingsAction({ allowBackorder: true }));

    expect(await scalar<number>("select count(*)::int from settings")).toBe(2);
    expect(await rowsOwnedBy("settings", ALFA.companyId)).toBe(1);
    expect(await rowsOwnedBy("settings", BRAVO.companyId)).toBe(1);
  });

  it("reads back what each company saved, not what the other did", async () => {
    actAs(ALFA_ADMIN);
    expect(await getStockSettingsServer()).toEqual({ allowBackorder: false });

    actAs(BRAVO_ADMIN);
    expect(await getStockSettingsServer()).toEqual({ allowBackorder: true });
  });

  it("swaps cleanly, so neither reading is a value that happened to be there", async () => {
    // Both companies now overwrite their own row with the other's answer. A
    // save that reached the wrong row would collapse the two values into one.
    actAs(ALFA_ADMIN);
    expectOk(await updateStockSettingsAction({ allowBackorder: true }));
    actAs(BRAVO_ADMIN);
    expectOk(await updateStockSettingsAction({ allowBackorder: false }));

    actAs(ALFA_ADMIN);
    expect(await getStockSettingsServer()).toEqual({ allowBackorder: true });
    actAs(BRAVO_ADMIN);
    expect(await getStockSettingsServer()).toEqual({ allowBackorder: false });

    expect(await scalar<number>("select count(*)::int from settings")).toBe(2);
  });

  it("lets each company's switch decide only its own stock-out", async () => {
    // The switch is not a column on a screen, it is the gate that decides
    // whether a sale may go negative. Alfa allows backorder and bravo does
    // not, and both ask for more than they hold: a lookup by key alone would
    // hand one of them the other's answer.
    actAs(BRAVO_ADMIN);
    expectOk(
      await stockInAction({
        productId: BRAVO.productId,
        locationId: BRAVO.locationId,
        quantity: 7,
        reason: "purchase",
      }),
    );

    const bravoRefused = await stockOutAction({
      productId: BRAVO.productId,
      locationId: BRAVO.locationId,
      quantity: 10,
      reason: "sale",
    });
    expect(bravoRefused.ok).toBe(false);

    actAs(ALFA_ADMIN);
    const alfaLocation = await scalar<string>(
      `select id from locations where company_id = $1 limit 1`,
      [ALFA.companyId],
    );
    expectOk(
      await stockOutAction({
        productId: alfa.productId,
        locationId: alfaLocation,
        quantity: 10,
        reason: "sale",
      }),
    );
  });
});

describe("purchase order numbering starts from each company's own sequence", () => {
  it("hands alfa the number after its own last one, not after bravo's", async () => {
    // Bravo holds 001 to 005 and alfa holds the single order it created
    // above, 001. An unscoped MAX over this table answers 005, so an unscoped
    // reader would hand alfa 006 and tell it how many orders bravo has placed.
    actAs(ALFA_ADMIN);
    expect(await nextPoNumberServer()).toBe(`PO-${YEAR}-002`);

    actAs(BRAVO_ADMIN);
    expect(await nextPoNumberServer()).toBe(`PO-${YEAR}-006`);
  });

  it("writes that number through the real create action, on both sides", async () => {
    actAs(ALFA_ADMIN);
    const alfaSupplier = await scalar<string>(
      `select id from suppliers where company_id = $1 limit 1`,
      [ALFA.companyId],
    );
    const alfaWarehouse = await scalar<string>(
      `select id from warehouses where company_id = $1 limit 1`,
      [ALFA.companyId],
    );
    const alfaPo = expectOk(
      await createPurchaseOrderAction({
        supplierId: alfaSupplier,
        warehouseId: alfaWarehouse,
      }),
    );
    expect((alfaPo as { poNumber: string }).poNumber).toBe(`PO-${YEAR}-002`);

    actAs(BRAVO_ADMIN);
    const bravoPo = expectOk(
      await createPurchaseOrderAction({
        supplierId: BRAVO.supplierId,
        warehouseId: BRAVO.warehouseId,
      }),
    );
    expect((bravoPo as { poNumber: string }).poNumber).toBe(`PO-${YEAR}-006`);

    // The same number now exists twice, once per company, which is what the
    // composite index from migration 0005 is for and what a shared sequence
    // could never produce.
    expect(
      await scalar<number>(
        `select count(*)::int as n from purchase_orders where po_number = $1`,
        [`PO-${YEAR}-002`],
      ),
    ).toBe(2);
  });
});
