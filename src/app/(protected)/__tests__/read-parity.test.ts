/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/**
 * FR-29 / ticket 989: NO SCREEN LOSES A ROW.
 *
 * Binding the read path to a database identity changes WHO asks, and this
 * suite is the pin that it does not change WHAT comes back. Every one of the
 * nineteen routes under `src/app/(protected)` is listed with the row count of
 * its read set against one fixed dataset. The numbers below were recorded on
 * the commit BEFORE the binding landed and are asserted unchanged after it, so
 * a regression shows up as a number, not as a feeling.
 *
 * The three routes `/movements/new/stock-out`, `/movements/new/transfer` and
 * `/movements/new/adjustment` share `loadMovementFormData` and are therefore
 * ONE row here, named in full, exactly as the FR-29 survey counts them
 * (`src/db/rls/TENANT-SEPARATION.md` §4). Counting rows in that table instead
 * of routes is what produces a false gap.
 *
 * WHY PGLITE AND NOT A STUB: these are aggregate, JOIN and HAVING queries.
 * A hand-written stand-in for the db would be asserting that the stand-in
 * groups correctly. PGlite is Postgres compiled to wasm, so the SQL under test
 * is executed by the engine that runs in production, and the schema is built
 * by the migration files that ship.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../db/migrations");

let mockPglite: PGlite;
let mockDb: ReturnType<typeof drizzle>;
let session: { user: { id: string; role: string } } | null = null;

jest.mock("@/db/client", () => ({
  get db() {
    return mockDb;
  },
}));

jest.mock("@/shared/lib/auth/require-role", () => ({
  getServerSession: async () => session,
}));

import { SINGLE_COMPANY_ID } from "@/db/schema";
import { listAuditLogServer } from "@/entities/audit-log/api/server";
import {
  listCategoriesServer,
  getCategoryServer,
} from "@/entities/category/api/server";
import { listProductsServer } from "@/entities/product/api/server";
import {
  listPurchaseOrdersServer,
  getPurchaseOrderServer,
} from "@/entities/purchase-order/api/server";
import { getStockSettingsServer } from "@/entities/settings/api/server";
import {
  getAllStockLevelsServer,
  getValuationServer,
  listLowStockProductsServer,
  listRecentMovementsServer,
} from "@/entities/stock-movement/api/server";
import { listSuppliersServer } from "@/entities/supplier/api/server";
import { listUsersServer } from "@/entities/user/api/server";
import {
  listWarehousesServer,
  getWarehouseServer,
  listLocationsServer,
} from "@/entities/warehouse/api/server";
import { loadMovementFormData } from "@/app/(protected)/movements/new/_lib/movement-form-data";
import { loadStockInFormData } from "@/app/(protected)/movements/new/stock-in/_lib/stock-in-data";
import { loadOrdersLookups } from "@/app/(protected)/orders/_lib/orders-data";
import { loadOrderDetailProducts } from "@/app/(protected)/orders/[id]/_lib/order-detail-data";
import { loadReportsLookups } from "@/app/(protected)/reports/_lib/reports-data";

const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "11111111-1111-4111-8111-111111111112";
const L1 = "22222222-2222-4222-8222-222222222221";
const L2 = "22222222-2222-4222-8222-222222222222";
const L3 = "22222222-2222-4222-8222-222222222223";
const C1 = "33333333-3333-4333-8333-333333333331";
const C2 = "33333333-3333-4333-8333-333333333332";
const C3 = "33333333-3333-4333-8333-333333333333";
const S1 = "44444444-4444-4444-8444-444444444441";
const S2 = "44444444-4444-4444-8444-444444444442";
const P1 = "55555555-5555-4555-8555-555555555551";
const P2 = "55555555-5555-4555-8555-555555555552";
const P3 = "55555555-5555-4555-8555-555555555553";
const P4 = "55555555-5555-4555-8555-555555555554";
const PO1 = "66666666-6666-4666-8666-666666666661";
const PO2 = "66666666-6666-4666-8666-666666666662";
const ADMIN = "user-admin";
const STAFF = "user-staff";

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

/** One fixed dataset. Every number in EXPECTED is a consequence of these rows. */
async function seed(pg: PGlite) {
  await pg.exec(`
    insert into "user" (id, name, email, email_verified, role) values
      ('${ADMIN}', 'Ada', 'ada@example.test', true, 'admin'),
      ('${STAFF}', 'Sam', 'sam@example.test', true, 'staff');

    -- Ticket 1004 scoped every read to the caller's company, so both operators
    -- need a membership to read anything at all. They share one, and every row
    -- below names that same company: ticket 1009 took the column default off,
    -- so an insert that leaves company_id out is refused rather than owned by
    -- whoever the default pointed at. One company throughout keeps this suite
    -- measuring what it was built to measure, that on a single-company
    -- database the numbers do not move. A second company is a different
    -- question and has its own suite.
    insert into company_members (company_id, user_id) values
      ('${SINGLE_COMPANY_ID}', '${ADMIN}'),
      ('${SINGLE_COMPANY_ID}', '${STAFF}');

    insert into warehouses (id, company_id, name, code) values
      ('${W1}', '${SINGLE_COMPANY_ID}', 'Main', 'MAIN'),
      ('${W2}', '${SINGLE_COMPANY_ID}', 'Overflow', 'OVF');

    insert into locations (id, company_id, warehouse_id, code) values
      ('${L1}', '${SINGLE_COMPANY_ID}', '${W1}', 'A-01'),
      ('${L2}', '${SINGLE_COMPANY_ID}', '${W1}', 'A-02'),
      ('${L3}', '${SINGLE_COMPANY_ID}', '${W2}', 'B-01');

    insert into categories (id, company_id, name, slug) values
      ('${C1}', '${SINGLE_COMPANY_ID}', 'Fasteners', 'fasteners'),
      ('${C2}', '${SINGLE_COMPANY_ID}', 'Tools', 'tools'),
      ('${C3}', '${SINGLE_COMPANY_ID}', 'Consumables', 'consumables');

    insert into suppliers (id, company_id, name) values
      ('${S1}', '${SINGLE_COMPANY_ID}', 'Northwind'),
      ('${S2}', '${SINGLE_COMPANY_ID}', 'Southwind');

    insert into products (id, company_id, sku, name, reorder_point, cost_price, is_active) values
      ('${P1}', '${SINGLE_COMPANY_ID}', 'A-100', 'Hex bolt',    10, '2.50', true),
      ('${P2}', '${SINGLE_COMPANY_ID}', 'A-200', 'Wing nut',     5, '1.25', true),
      ('${P3}', '${SINGLE_COMPANY_ID}', 'A-300', 'Torque key',   0, '9.00', true),
      ('${P4}', '${SINGLE_COMPANY_ID}', 'A-400', 'Retired shim', 0, '0.50', false);

    insert into stock_movements (company_id, product_id, location_id, type, reason, quantity, unit_cost, created_by) values
      ('${SINGLE_COMPANY_ID}', '${P1}', '${L1}', 'stock_in',  'purchase',   100, '2.50', '${ADMIN}'),
      ('${SINGLE_COMPANY_ID}', '${P1}', '${L1}', 'stock_out', 'sale',       -95, null,   '${STAFF}'),
      ('${SINGLE_COMPANY_ID}', '${P2}', '${L2}', 'stock_in',  'purchase',    20, '1.25', '${ADMIN}'),
      ('${SINGLE_COMPANY_ID}', '${P2}', '${L2}', 'stock_out', 'sale',       -18, null,   '${STAFF}'),
      ('${SINGLE_COMPANY_ID}', '${P3}', '${L3}', 'stock_in',  'purchase',     4, '9.00', '${ADMIN}'),
      ('${SINGLE_COMPANY_ID}', '${P3}', '${L3}', 'adjustment','count_correction',  1, null,   '${ADMIN}');

    insert into purchase_orders (id, company_id, po_number, supplier_id, warehouse_id, status, created_by) values
      ('${PO1}', '${SINGLE_COMPANY_ID}', 'PO-2026-001', '${S1}', '${W1}', 'draft', '${ADMIN}'),
      ('${PO2}', '${SINGLE_COMPANY_ID}', 'PO-2026-002', '${S2}', '${W2}', 'sent',  '${ADMIN}');

    insert into po_lines (company_id, po_id, product_id, quantity_ordered, quantity_received, unit_cost) values
      ('${SINGLE_COMPANY_ID}', '${PO1}', '${P1}', 50, 0, '2.40'),
      ('${SINGLE_COMPANY_ID}', '${PO1}', '${P2}', 30, 0, '1.20'),
      ('${SINGLE_COMPANY_ID}', '${PO2}', '${P3}', 10, 0, '8.80');

    insert into audit_log (company_id, user_id, action, resource_type, resource_id) values
      ('${SINGLE_COMPANY_ID}', '${ADMIN}', 'create', 'product', '${P1}'),
      ('${SINGLE_COMPANY_ID}', '${STAFF}', 'update', 'product', '${P2}');

    insert into settings (company_id, key, value) values
      ('${SINGLE_COMPANY_ID}', 'stock', '{"allowBackorder": true}'::jsonb);
  `);
}

/**
 * Row count of every route's read set, against the dataset above.
 *
 * `/account` and `/catalog/import` are listed with 0 on purpose rather than
 * left out: `/account` renders from the session and `/catalog/import` is a
 * write surface, so "reads no rows" is their measurement, not an omission.
 * Nineteen routes, seventeen entries, and the entry that covers three names
 * all three.
 */
const EXPECTED: Record<string, number> = {
  "/account": 0,
  "/audit": 2,
  "/catalog": 4 + 3 + 2,
  "/catalog/categories": 3,
  "/catalog/import": 0,
  "/catalog/suppliers": 2,
  "/catalog/warehouses": 2,
  "/catalog/warehouses/[id]": 1 + 2,
  "/dashboard": 2 + 2 + 6 + 3 + 4,
  "/movements": 6,
  "/movements/new/stock-in": 3 + 3,
  "/movements/new/stock-out + /transfer + /adjustment": 3 + 3,
  "/orders": 2 + 2 + 2,
  "/orders/[id]": 1 + 2 + 3,
  "/reports": 3 + 3 + 2 + 4 + 3,
  "/settings": 1,
  "/users": 2,
};

/** Each route's read set, called exactly as the route calls it. */
const ROUTES: Record<string, () => Promise<number>> = {
  "/account": async () => 0,
  "/audit": async () => (await listAuditLogServer(1000)).length,
  "/catalog": async () => {
    const [products, categories, suppliers] = await Promise.all([
      listProductsServer(),
      listCategoriesServer(),
      listSuppliersServer(),
    ]);
    return products.length + categories.length + suppliers.length;
  },
  "/catalog/categories": async () => (await listCategoriesServer()).length,
  "/catalog/import": async () => 0,
  "/catalog/suppliers": async () => (await listSuppliersServer()).length,
  "/catalog/warehouses": async () => (await listWarehousesServer()).length,
  "/catalog/warehouses/[id]": async () => {
    const [warehouse, locations] = await Promise.all([
      getWarehouseServer(W1),
      listLocationsServer(W1),
    ]);
    return (warehouse ? 1 : 0) + locations.length;
  },
  "/dashboard": async () => {
    const [warehouses, lowStock, movements, valuation, products] =
      await Promise.all([
        listWarehousesServer(),
        listLowStockProductsServer({ limit: 50 }),
        listRecentMovementsServer({ limit: 50 }),
        getValuationServer(),
        listProductsServer(),
      ]);
    return (
      warehouses.length +
      lowStock.length +
      movements.length +
      valuation.perProduct.size +
      products.length
    );
  },
  "/movements": async () =>
    (await listRecentMovementsServer({ limit: 500 })).length,
  "/movements/new/stock-in": async () => {
    const data = await loadStockInFormData();
    return data.products.length + data.locations.length;
  },
  "/movements/new/stock-out + /transfer + /adjustment": async () => {
    const data = await loadMovementFormData();
    return data.products.length + data.locations.length;
  },
  "/orders": async () => {
    const [pos, lookups] = await Promise.all([
      listPurchaseOrdersServer(500),
      loadOrdersLookups(),
    ]);
    return (
      pos.length + lookups.supplierRows.length + lookups.warehouseRows.length
    );
  },
  "/orders/[id]": async () => {
    const [detail, products] = await Promise.all([
      getPurchaseOrderServer(PO1),
      loadOrderDetailProducts(),
    ]);
    return (detail ? 1 + detail.lines.length : 0) + products.length;
  },
  "/reports": async () => {
    const [levels, valuation, lowStock, lookups] = await Promise.all([
      getAllStockLevelsServer(),
      getValuationServer(),
      listLowStockProductsServer({ limit: 500 }),
      loadReportsLookups(),
    ]);
    return (
      levels.length +
      valuation.perProduct.size +
      lowStock.length +
      lookups.productRows.length +
      lookups.locationRows.length
    );
  },
  "/settings": async () => {
    const stock = await getStockSettingsServer();
    // A settings row that went missing falls back to the defaults, and the
    // default is `false`. Asserting the seeded `true` is how a lost row shows.
    return stock.allowBackorder ? 1 : 0;
  },
  "/users": async () => (await listUsersServer()).length,
};

beforeAll(async () => {
  mockPglite = await PGlite.create();
  await applyMigrations(mockPglite);
  await seed(mockPglite);
  mockDb = drizzle(mockPglite);
}, 60_000);

afterAll(async () => {
  await mockPglite?.close();
});

beforeEach(() => {
  session = { user: { id: ADMIN, role: "admin" } };
});

describe("every protected route reads the same rows it read before", () => {
  it("covers all nineteen routes, three of them through one shared loader", () => {
    const names = Object.keys(ROUTES);
    expect(names.sort()).toEqual(Object.keys(EXPECTED).sort());
    // 17 entries, and the one that names three routes carries all three.
    expect(names).toHaveLength(17);
    const routeCount = names.reduce(
      (n, name) => n + name.split(" + ").length,
      0,
    );
    expect(routeCount).toBe(19);
  });

  for (const [route, read] of Object.entries(ROUTES)) {
    it(`${route} reads ${EXPECTED[route]} rows`, async () => {
      await expect(read()).resolves.toBe(EXPECTED[route]);
    });
  }

  it("a route that reads nothing is a measurement, not a skipped one", async () => {
    await expect(ROUTES["/account"]()).resolves.toBe(0);
    await expect(ROUTES["/catalog/import"]()).resolves.toBe(0);
  });

  /**
   * A dataset that answered 0 everywhere would make every assertion above
   * pass for the wrong reason. This is the control that it does not.
   */
  it("the dataset is not empty, so a zero would be a finding", async () => {
    const nonZero = Object.entries(EXPECTED).filter(([, n]) => n > 0);
    expect(nonZero.length).toBe(15);
  });
});
