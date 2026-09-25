/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/**
 * FR-29 (ticket 1004, "CPP-TENANT-6"): every read surface returns only the
 * rows of the company the caller belongs to.
 *
 * WHAT MAKES THIS SUITE ABLE TO FAIL, which is the whole question for a test
 * about rows that are absent. A suite run against a database holding ONE
 * company cannot tell a working filter from a missing one: both return
 * everything there is. So this database holds TWO full companies, alfa and
 * bravo, seeded symmetrically into all ten domain tables, and every natural
 * key is deliberately the SAME on both sides: one SKU `SKU-1`, one warehouse
 * code `WH1`, one category slug `beans`, one `PO-<year>-001`. Composite
 * uniqueness (migration 0005) is what lets those coexist, and it means a leak
 * arrives as a visible duplicate rather than as an extra row nobody counts.
 *
 * Names differ where keys do not, so a leaked row says which company it came
 * from: every one of bravo's carries the word `bravo`, and `expectNoBravo`
 * scans the whole serialised result of a surface for those markers rather than
 * inspecting the fields a reviewer thought to check.
 *
 * THE RIG IS ASSERTED BEFORE THE FILTER IS. `describe("the rig itself")` first
 * proves every one of the ten tables really does hold rows for BOTH companies.
 * Without that, "zero of bravo's rows" would also be true of a table bravo
 * never had rows in, and the sweep below would be measuring nothing.
 *
 * REFUSAL, NOT AN EMPTY LIST. The last block signs in as an account that
 * belongs to no company and asserts every surface THROWS. This is the design
 * verdict FR-29 rests on: a filter that returned nothing to such a caller
 * would render an empty table, and an empty table on screen cannot be told
 * apart from a company that genuinely owns nothing.
 *
 * PGlite is Postgres compiled to wasm and the schema is built by replaying the
 * real migration files, so the columns, foreign keys and composite indexes
 * under test are the ones that ship.
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

const YEAR = new Date().getUTCFullYear();

/**
 * Neither company is `SINGLE_COMPANY_ID`. A read that reached for that
 * constant instead of the membership would otherwise be indistinguishable
 * from a correct one, the same trap the write suite sets (ticket 1003).
 */
const ALFA = {
  companyId: "11111111-1111-4111-8111-00000000000a",
  categoryId: "00000000-0000-4000-8000-00000000a001",
  supplierId: "00000000-0000-4000-8000-00000000a002",
  warehouseId: "00000000-0000-4000-8000-00000000a003",
  locationId: "00000000-0000-4000-8000-00000000a004",
  productId: "00000000-0000-4000-8000-00000000a005",
  poId: "00000000-0000-4000-8000-00000000a006",
  poLineId: "00000000-0000-4000-8000-00000000a007",
  transferGroupId: "00000000-0000-4000-8000-00000000a008",
} as const;

const BRAVO = {
  companyId: "22222222-2222-4222-8222-00000000000b",
  categoryId: "00000000-0000-4000-8000-00000000b001",
  supplierId: "00000000-0000-4000-8000-00000000b002",
  warehouseId: "00000000-0000-4000-8000-00000000b003",
  locationId: "00000000-0000-4000-8000-00000000b004",
  productId: "00000000-0000-4000-8000-00000000b005",
  poId: "00000000-0000-4000-8000-00000000b006",
  poLineId: "00000000-0000-4000-8000-00000000b007",
  transferGroupId: "00000000-0000-4000-8000-00000000b008",
} as const;

const ALFA_ADMIN = { id: "user-alfa-admin", role: "admin" } as const;
const ALFA_STAFF = { id: "user-alfa-staff", role: "staff" } as const;
const BRAVO_ADMIN = { id: "user-bravo-admin", role: "admin" } as const;
/** Signed in, member of nothing. The account the refusal exists for. */
const STRANGER = { id: "user-stranger", role: "admin" } as const;

let mockPglite: PGlite;
let mockDb: ReturnType<typeof drizzle>;
let session: { user: { id: string; role: string } } | null = null;

jest.mock("@/db/client", () => ({
  get db() {
    return mockDb;
  },
}));

// `read-context.ts`, and through it `resolveCompanyId`, reads the session with
// `getServerSession`, which needs Better Auth and `next/headers`. Neither
// exists outside a request, so the gate is replaced by the session it would
// have resolved. `requireRole` comes from the same module and is mocked with
// it so nothing in an import chain reaches the real one.
jest.mock("@/shared/lib/auth/require-role", () => ({
  getServerSession: async () => session,
  requireRole: async () => {
    if (!session) throw new Error("no session");
    return { session, user: session.user };
  },
}));

import { SINGLE_COMPANY_ID } from "@/db/schema/companies";
import { listAuditLogServer } from "@/entities/audit-log/api/server";
import {
  getCategoryServer,
  listCategoriesServer,
} from "@/entities/category/api/server";
import {
  getProductServer,
  listProductsServer,
} from "@/entities/product/api/server";
import {
  getPurchaseOrderServer,
  listPurchaseOrdersServer,
  nextPoNumberServer,
} from "@/entities/purchase-order/api/server";
import { getStockSettingsServer } from "@/entities/settings/api/server";
import {
  countActiveTransfersServer,
  countStockOutsServer,
  getAllStockLevelsServer,
  getStockLevelServer,
  getTotalStockByProductServer,
  getValuationServer,
  listLowStockProductsServer,
  listRecentMovementsServer,
} from "@/entities/stock-movement/api/server";
import {
  getSupplierServer,
  listSuppliersServer,
} from "@/entities/supplier/api/server";
import { listUsersServer } from "@/entities/user/api/server";
import {
  getWarehouseServer,
  listLocationsServer,
  listWarehousesServer,
} from "@/entities/warehouse/api/server";
import { STOCK_SETTINGS_DEFAULTS } from "@/entities/settings/model/settings-schema";
import { loadMovementFormData } from "@/app/(protected)/movements/new/_lib/movement-form-data";
import { loadStockInFormData } from "@/app/(protected)/movements/new/stock-in/_lib/stock-in-data";
import { loadOrderDetailProducts } from "@/app/(protected)/orders/[id]/_lib/order-detail-data";
import { loadOrdersLookups } from "@/app/(protected)/orders/_lib/orders-data";
import { loadReportsLookups } from "@/app/(protected)/reports/_lib/reports-data";

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

async function scalar<T>(text: string): Promise<T> {
  const result = await mockPglite.query<Record<string, T>>(text);
  return Object.values(result.rows[0])[0];
}

const rowsOwnedBy = (table: string, companyId: string) =>
  scalar<number>(
    `select count(*)::int as n from ${table} where company_id = '${companyId}'`,
  );

/**
 * Seed one complete company. Called twice with different ids and the same
 * natural keys, which is what makes the two halves interchangeable except for
 * their owner.
 */
function seedCompany(c: typeof ALFA | typeof BRAVO, label: string): string {
  const stockIn = label === "alfa" ? 10 : 100;
  const stockOut = label === "alfa" ? -1 : -3;
  const transferOut = label === "alfa" ? -2 : -5;
  return `
    insert into categories (id, company_id, name, slug) values
      ('${c.categoryId}', '${c.companyId}', '${label} Beans', 'beans');
    insert into suppliers (id, company_id, name, contact_email) values
      ('${c.supplierId}', '${c.companyId}', '${label} Supplies', '${label}@supplier.test');
    insert into warehouses (id, company_id, name, code) values
      ('${c.warehouseId}', '${c.companyId}', '${label} Main', 'WH1');
    insert into locations (id, company_id, warehouse_id, code, name) values
      ('${c.locationId}', '${c.companyId}', '${c.warehouseId}', 'A1', '${label} Aisle');
    insert into products
      (id, company_id, sku, name, unit, category_id, supplier_id, reorder_point, cost_price, selling_price, is_active)
    values
      ('${c.productId}', '${c.companyId}', 'SKU-1', '${label} House Blend', 'kg',
       '${c.categoryId}', '${c.supplierId}', 100, '5.00', '9.00', true);
    insert into stock_movements
      (company_id, product_id, location_id, type, reason, quantity, unit_cost, transfer_group_id, created_at)
    values
      ('${c.companyId}', '${c.productId}', '${c.locationId}', 'stock_in', 'purchase', ${stockIn}, '5.00', null, now() - interval '3 hours'),
      ('${c.companyId}', '${c.productId}', '${c.locationId}', 'stock_out', 'sale', ${stockOut}, null, null, now() - interval '2 hours'),
      ('${c.companyId}', '${c.productId}', '${c.locationId}', 'transfer_out', 'transfer', ${transferOut}, null, '${c.transferGroupId}', now() - interval '1 hour');
    insert into purchase_orders (id, company_id, po_number, supplier_id, warehouse_id, status, notes) values
      ('${c.poId}', '${c.companyId}', 'PO-${YEAR}-001', '${c.supplierId}', '${c.warehouseId}', 'draft', '${label} order');
    insert into po_lines (id, company_id, po_id, product_id, quantity_ordered, unit_cost) values
      ('${c.poLineId}', '${c.companyId}', '${c.poId}', '${c.productId}', 10, '5.00');
    insert into audit_log (company_id, user_id, action, resource_type, resource_id, diff) values
      ('${c.companyId}', ${label === "alfa" ? `'${ALFA_ADMIN.id}'` : `'${BRAVO_ADMIN.id}'`},
       'create', 'product', '${c.productId}', '{"name":"${label} House Blend"}'::jsonb);
  `;
}

beforeAll(async () => {
  mockPglite = await PGlite.create();
  await applyMigrations(mockPglite);
  mockDb = drizzle(mockPglite);

  await mockPglite.exec(`
    insert into companies (id, name) values
      ('${ALFA.companyId}', 'Alfa Coffee'),
      ('${BRAVO.companyId}', 'bravo Roasters');
    insert into "user" (id, name, email, email_verified, role) values
      ('${ALFA_ADMIN.id}', 'Ada', 'ada@alfa.test', true, 'admin'),
      ('${ALFA_STAFF.id}', 'Sam', 'sam@alfa.test', true, 'staff'),
      ('${BRAVO_ADMIN.id}', 'bravo Bo', 'bo@bravo.test', true, 'admin'),
      ('${STRANGER.id}', 'Nemo', 'nemo@nowhere.test', true, 'admin');
    insert into company_members (company_id, user_id) values
      ('${ALFA.companyId}', '${ALFA_ADMIN.id}'),
      ('${ALFA.companyId}', '${ALFA_STAFF.id}'),
      ('${BRAVO.companyId}', '${BRAVO_ADMIN.id}');
  `);

  await mockPglite.exec(seedCompany(ALFA, "alfa"));
  await mockPglite.exec(seedCompany(BRAVO, "bravo"));

  await mockPglite.exec(`
    -- Four more orders for bravo. nextPoNumberServer reads the highest number
    -- in the table, so an unscoped read would hand alfa 006 while its own
    -- sequence is at 001.
    insert into purchase_orders (company_id, po_number, supplier_id, warehouse_id, status) values
      ('${BRAVO.companyId}', 'PO-${YEAR}-002', '${BRAVO.supplierId}', '${BRAVO.warehouseId}', 'draft'),
      ('${BRAVO.companyId}', 'PO-${YEAR}-003', '${BRAVO.supplierId}', '${BRAVO.warehouseId}', 'draft'),
      ('${BRAVO.companyId}', 'PO-${YEAR}-004', '${BRAVO.supplierId}', '${BRAVO.warehouseId}', 'draft'),
      ('${BRAVO.companyId}', 'PO-${YEAR}-005', '${BRAVO.supplierId}', '${BRAVO.warehouseId}', 'draft');
    -- A second transfer group for bravo, so a leaked count is 3 and not 2.
    insert into stock_movements
      (company_id, product_id, location_id, type, reason, quantity, transfer_group_id, created_at)
    values
      ('${BRAVO.companyId}', '${BRAVO.productId}', '${BRAVO.locationId}', 'transfer_out', 'transfer', -4,
       '00000000-0000-4000-8000-00000000b009', now() - interval '1 hour');
    -- settings holds ONE row for the whole installation: its primary key is
    -- still the key column (src/db/schema/settings.ts, item 4 of
    -- TENANT-SEPARATION.md). Giving that row to bravo is what lets this suite
    -- ask the only question the table can answer today: does alfa read a
    -- switch it does not own.
    insert into settings (key, company_id, value) values
      ('stock', '${BRAVO.companyId}', '{"allowBackorder":true}'::jsonb);
  `);
}, 120_000);

afterAll(async () => {
  await mockPglite?.close();
});

beforeEach(() => {
  session = { user: { id: ALFA_ADMIN.id, role: ALFA_ADMIN.role } };
});

/** Maps do not survive JSON.stringify; two surfaces return them. */
const jsonSafe = (_key: string, value: unknown) =>
  value instanceof Map ? Object.fromEntries(value) : value;

/**
 * Everything only bravo's rows carry. `bravo` alone catches every seeded name
 * and email; the ids are listed because a surface can return an id without a
 * name (`getAllStockLevelsServer` returns nothing else).
 */
const BRAVO_MARKERS = [
  "bravo",
  ...Object.values(BRAVO),
  BRAVO_ADMIN.id,
  "00000000-0000-4000-8000-00000000b009",
];

function expectNoBravo(label: string, value: unknown) {
  const json = JSON.stringify(value ?? null, jsonSafe);
  const found = BRAVO_MARKERS.filter((m) => json.includes(m));
  expect([label, found]).toEqual([label, []]);
}

/**
 * One entry per read surface. `alfa` is a string the result MUST contain, so
 * that "no bravo" is never satisfied by a surface that returned nothing at
 * all; `null` marks the one surface whose correct answer for alfa is the
 * absence of a row (settings, which has its own test below).
 */
const SURFACES: Array<{
  name: string;
  run: () => Promise<unknown>;
  alfa: string | null;
}> = [
  {
    name: "listCategoriesServer",
    run: listCategoriesServer,
    alfa: ALFA.categoryId,
  },
  {
    name: "getCategoryServer(own id)",
    run: () => getCategoryServer(ALFA.categoryId),
    alfa: ALFA.categoryId,
  },
  { name: "listProductsServer", run: listProductsServer, alfa: ALFA.productId },
  {
    name: "getProductServer(own id)",
    run: () => getProductServer(ALFA.productId),
    alfa: ALFA.productId,
  },
  {
    name: "listSuppliersServer",
    run: listSuppliersServer,
    alfa: ALFA.supplierId,
  },
  {
    name: "getSupplierServer(own id)",
    run: () => getSupplierServer(ALFA.supplierId),
    alfa: ALFA.supplierId,
  },
  {
    name: "listWarehousesServer",
    run: listWarehousesServer,
    alfa: ALFA.warehouseId,
  },
  {
    name: "getWarehouseServer(own id)",
    run: () => getWarehouseServer(ALFA.warehouseId),
    alfa: ALFA.warehouseId,
  },
  {
    name: "listLocationsServer(own warehouse)",
    run: () => listLocationsServer(ALFA.warehouseId),
    alfa: ALFA.locationId,
  },
  { name: "listAuditLogServer", run: listAuditLogServer, alfa: ALFA.productId },
  { name: "getStockSettingsServer", run: getStockSettingsServer, alfa: null },
  {
    name: "listPurchaseOrdersServer",
    run: listPurchaseOrdersServer,
    alfa: ALFA.poId,
  },
  {
    name: "getPurchaseOrderServer(own id)",
    run: () => getPurchaseOrderServer(ALFA.poId),
    alfa: ALFA.poLineId,
  },
  {
    name: "nextPoNumberServer",
    run: nextPoNumberServer,
    alfa: `PO-${YEAR}-002`,
  },
  {
    name: "getStockLevelServer(own product and location)",
    run: () => getStockLevelServer(ALFA.productId, ALFA.locationId),
    alfa: "7",
  },
  {
    name: "getAllStockLevelsServer",
    run: getAllStockLevelsServer,
    alfa: ALFA.locationId,
  },
  {
    name: "getTotalStockByProductServer",
    run: getTotalStockByProductServer,
    alfa: ALFA.productId,
  },
  {
    name: "listRecentMovementsServer",
    run: () => listRecentMovementsServer(),
    alfa: ALFA.productId,
  },
  {
    name: "listRecentMovementsServer(own warehouse)",
    run: () => listRecentMovementsServer({ warehouseId: ALFA.warehouseId }),
    alfa: ALFA.productId,
  },
  {
    name: "listLowStockProductsServer",
    run: () => listLowStockProductsServer(),
    alfa: ALFA.productId,
  },
  {
    name: "listLowStockProductsServer(own warehouse)",
    run: () => listLowStockProductsServer({ warehouseId: ALFA.warehouseId }),
    alfa: ALFA.productId,
  },
  {
    name: "countActiveTransfersServer",
    run: () => countActiveTransfersServer(),
    alfa: "1",
  },
  {
    name: "countStockOutsServer",
    run: () => countStockOutsServer(),
    alfa: "1",
  },
  {
    name: "getValuationServer",
    run: () => getValuationServer(),
    alfa: ALFA.productId,
  },
  { name: "listUsersServer", run: listUsersServer, alfa: ALFA_ADMIN.id },
  { name: "loadOrdersLookups", run: loadOrdersLookups, alfa: ALFA.supplierId },
  {
    name: "loadOrderDetailProducts",
    run: loadOrderDetailProducts,
    alfa: ALFA.productId,
  },
  {
    name: "loadReportsLookups",
    run: loadReportsLookups,
    alfa: ALFA.locationId,
  },
  {
    name: "loadMovementFormData",
    run: loadMovementFormData,
    alfa: ALFA.locationId,
  },
  {
    name: "loadStockInFormData",
    run: loadStockInFormData,
    alfa: ALFA.locationId,
  },
];

describe("the rig itself", () => {
  it.each(DOMAIN_TABLES.filter((t) => t !== "settings"))(
    "holds rows for both companies in %s",
    async (table) => {
      expect([
        table,
        await rowsOwnedBy(table, ALFA.companyId),
        await rowsOwnedBy(table, BRAVO.companyId),
      ]).toEqual([table, expect.any(Number), expect.any(Number)]);
      expect(await rowsOwnedBy(table, ALFA.companyId)).toBeGreaterThan(0);
      expect(await rowsOwnedBy(table, BRAVO.companyId)).toBeGreaterThan(0);
    },
  );

  it("holds the one settings row the table can hold, owned by bravo", async () => {
    // `key` is the primary key, so two companies cannot both keep a `stock`
    // row today. One owner is the most this table can be rigged with, and
    // bravo is the useful one: it is what lets the settings test below ask
    // whether alfa reads a switch that is not its own.
    expect(
      await scalar<number>(`select count(*)::int as n from settings`),
    ).toBe(1);
    expect(await rowsOwnedBy("settings", BRAVO.companyId)).toBe(1);
  });

  it("gives neither company the id the column default points at", () => {
    expect(ALFA.companyId).not.toBe(SINGLE_COMPANY_ID);
    expect(BRAVO.companyId).not.toBe(SINGLE_COMPANY_ID);
    expect(ALFA.companyId).not.toBe(BRAVO.companyId);
  });

  it("gives both companies the same natural keys", async () => {
    // If these had drifted, the composite indexes would not be under test and
    // a leak would look like an ordinary extra row rather than a duplicate.
    expect(
      await scalar<number>(
        `select count(*)::int as n from products where sku = 'SKU-1'`,
      ),
    ).toBe(2);
    expect(
      await scalar<number>(
        `select count(*)::int as n from warehouses where code = 'WH1'`,
      ),
    ).toBe(2);
    expect(
      await scalar<number>(
        `select count(*)::int as n from categories where slug = 'beans'`,
      ),
    ).toBe(2);
    expect(
      await scalar<number>(
        `select count(*)::int as n from purchase_orders where po_number = 'PO-${YEAR}-001'`,
      ),
    ).toBe(2);
  });
});

describe("a member of alfa reading through every read surface", () => {
  it.each(SURFACES.map((s) => [s.name, s] as const))(
    "%s returns none of bravo's rows",
    async (_name, surface) => {
      expectNoBravo(surface.name, await surface.run());
    },
  );

  it.each(
    SURFACES.filter((s) => s.alfa !== null).map((s) => [s.name, s] as const),
  )("%s returns alfa's own rows", async (_name, surface) => {
    const json = JSON.stringify((await surface.run()) ?? null, jsonSafe);
    expect([surface.name, json.includes(surface.alfa as string)]).toEqual([
      surface.name,
      true,
    ]);
  });

  it("counts only its own stock, not the sum of both companies", async () => {
    // 10 in, 1 out, 2 transferred out. Bravo's ledger sums to 88 at the same
    // product and location keys, and 95 is what an unscoped read returns.
    expect(await getStockLevelServer(ALFA.productId, ALFA.locationId)).toBe(7);
    expect(await getAllStockLevelsServer()).toEqual([
      { productId: ALFA.productId, locationId: ALFA.locationId, level: 7 },
    ]);
    expect([...(await getTotalStockByProductServer()).entries()]).toEqual([
      [ALFA.productId, 7],
    ]);
  });

  it("values only its own ledger", async () => {
    const { perProduct } = await getValuationServer();
    expect([...perProduct.keys()]).toEqual([ALFA.productId]);
  });

  it("numbers its next purchase order from its own sequence", async () => {
    // Bravo holds 001 to 005. Unscoped, the highest number in the table is
    // 005 and alfa would be handed 006, which would also tell alfa how many
    // orders bravo has placed.
    expect(await nextPoNumberServer()).toBe(`PO-${YEAR}-002`);
  });

  it("lists only the accounts of its own company", async () => {
    const rows = await listUsersServer();
    expect(rows.map((r) => r.id).sort()).toEqual(
      [ALFA_ADMIN.id, ALFA_STAFF.id].sort(),
    );
  });

  it("reads the settings row of its own company and not the other's", async () => {
    // The seeded row belongs to bravo and says backorder is allowed. Alfa
    // owns no row, so it falls back to the defaults, which forbid it.
    expect(await getStockSettingsServer()).toEqual(STOCK_SETTINGS_DEFAULTS);
    expect(STOCK_SETTINGS_DEFAULTS.allowBackorder).toBe(false);

    // Hand the same row to alfa and the same call reads it, which is what
    // proves the assertion above came from the company predicate rather than
    // from a query that is broken in some other way.
    await mockPglite.exec(
      `update settings set company_id = '${ALFA.companyId}' where key = 'stock'`,
    );
    expect(await getStockSettingsServer()).toEqual({ allowBackorder: true });

    await mockPglite.exec(
      `update settings set company_id = '${BRAVO.companyId}' where key = 'stock'`,
    );
  });

  it("refuses bravo's ids handed to it through the URL", async () => {
    // Every id below is real and readable, just not by this caller. These are
    // the IDOR surfaces TENANT-SEPARATION.md §4 names: the id comes from the
    // address bar and nothing but the company predicate checks ownership.
    expect(await getCategoryServer(BRAVO.categoryId)).toBeNull();
    expect(await getProductServer(BRAVO.productId)).toBeNull();
    expect(await getSupplierServer(BRAVO.supplierId)).toBeNull();
    expect(await getWarehouseServer(BRAVO.warehouseId)).toBeNull();
    expect(await getPurchaseOrderServer(BRAVO.poId)).toBeNull();
    expect(await listLocationsServer(BRAVO.warehouseId)).toEqual([]);
    expect(await getStockLevelServer(BRAVO.productId, BRAVO.locationId)).toBe(
      0,
    );
  });

  it("reads the same way for a staff member as for an admin", async () => {
    // The company predicate comes from the membership, not from the role, so
    // a lower-privileged member of the same company must see the same rows.
    session = { user: { id: ALFA_STAFF.id, role: ALFA_STAFF.role } };
    expectNoBravo("listProductsServer as staff", await listProductsServer());
    expect((await listProductsServer()).map((p) => p.id)).toEqual([
      ALFA.productId,
    ]);
  });
});

describe("a member of bravo reading the same surfaces", () => {
  beforeEach(() => {
    session = { user: { id: BRAVO_ADMIN.id, role: BRAVO_ADMIN.role } };
  });

  it("sees its own rows and none of alfa's", async () => {
    // The mirror image, so that "alfa sees only alfa" cannot be passing
    // because the filter happens to hard-code alfa's id.
    const json = JSON.stringify(
      {
        products: await listProductsServer(),
        warehouses: await listWarehousesServer(),
        orders: await listPurchaseOrdersServer(),
        users: await listUsersServer(),
      },
      jsonSafe,
    );
    expect(json.includes("bravo")).toBe(true);
    const alfaMarkers = [...Object.values(ALFA), ALFA_ADMIN.id, ALFA_STAFF.id];
    expect(alfaMarkers.filter((m) => json.includes(m))).toEqual([]);
  });

  it("reads its own settings row", async () => {
    expect(await getStockSettingsServer()).toEqual({ allowBackorder: true });
  });

  it("numbers its next purchase order from its own sequence", async () => {
    expect(await nextPoNumberServer()).toBe(`PO-${YEAR}-006`);
  });
});

describe("a caller who belongs to no company", () => {
  beforeEach(() => {
    session = { user: { id: STRANGER.id, role: STRANGER.role } };
  });

  it.each(SURFACES.map((s) => [s.name, s] as const))(
    "%s refuses instead of returning an empty result",
    async (_name, surface) => {
      session = { user: { id: STRANGER.id, role: STRANGER.role } };
      await expect(surface.run()).rejects.toMatchObject({
        name: "NoCompanyError",
        reason: "no-membership",
      });
    },
  );

  it("is refused for a reason that names the account", async () => {
    await expect(listProductsServer()).rejects.toThrow(
      new RegExp(`no-membership.*${STRANGER.id}`),
    );
  });

  it("would have been handed rows had the refusal been a filter", async () => {
    // The point of the sweep above, stated as its own measurement: the tables
    // these surfaces read are NOT empty. A refusal that arrived as an empty
    // list would be indistinguishable on screen from this database being
    // bare, and it is not bare.
    expect(
      await scalar<number>(`select count(*)::int as n from products`),
    ).toBeGreaterThan(0);
    expect(
      await scalar<number>(`select count(*)::int as n from stock_movements`),
    ).toBeGreaterThan(0);
  });
});

describe("a caller with no session at all", () => {
  beforeEach(() => {
    session = null;
  });

  /**
   * Signed out is a DIFFERENT refusal from signed in with no company, and the
   * class is what says which. This one is ticket 989's `UnboundReadError`,
   * kept intact rather than folded into `NoCompanyError`: one is a sign-in
   * redirect, the other is an account an administrator has not placed yet, and
   * a single error class would leave a reader unable to tell them apart.
   */
  it("is refused before any statement runs, and the refusal names the read", async () => {
    session = null;
    await expect(listProductsServer()).rejects.toMatchObject({
      name: "UnboundReadError",
    });
    await expect(listProductsServer()).rejects.toThrow(/listProductsServer/);
  });
});
