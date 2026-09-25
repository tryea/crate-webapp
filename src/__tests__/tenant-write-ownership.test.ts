/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/**
 * FR-29 (ticket 1003, "CPP-TENANT-5"): every write names the company it
 * belongs to, instead of leaning on the column default.
 *
 * WHAT MAKES THIS SUITE ABLE TO FAIL. Migration 0005 gave all ten domain
 * tables `company_id uuid NOT NULL DEFAULT '<the one company>'`. On the
 * database that ships today that default is correct, so an insert that never
 * mentions `company_id` produces exactly the same row as one that names it,
 * and a test run against that database cannot tell the two apart. Every
 * assertion here would pass on the code as it stood before this ticket.
 *
 * So the database this suite builds is rigged in two ways at once:
 *
 *   1. THE DEFAULT POINTS SOMEWHERE ELSE. After the migrations are replayed,
 *      the `company_id` default on all ten tables is moved to
 *      `TRAP_COMPANY_ID`, a company that exists (so a row stamped with it is
 *      accepted rather than rejected by the foreign key, which would blame the
 *      wrong thing) and that nobody is a member of. Any row wearing that id
 *      got it from the default, and says so.
 *   2. THE CALLER IS NOT THE SEEDED COMPANY. The acting user belongs to
 *      `CALLER_COMPANY_ID`, not to `SINGLE_COMPANY_ID`. So a write that reached
 *      for the hard-coded constant instead of the membership fails here too,
 *      which the trap alone would not catch.
 *
 * WHY THE REAL ACTIONS AND NOT A STAND-IN. The claim is about the write path
 * the app runs, and the ways it can go wrong are ways a stand-in cannot have:
 * an insert that forgets the column, an undo path that re-inserts a row the
 * client handed back, an upsert whose ON CONFLICT names the wrong index. Each
 * entity's `api/actions.ts` is therefore imported and called, with only the db
 * client, the session and `revalidatePath` swapped.
 *
 * PGlite is Postgres compiled to wasm and the schema is built by replaying the
 * real migration files, so the defaults, the foreign keys and the composite
 * unique indexes under test are the ones that ship.
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

/** The company the acting user belongs to. Deliberately not the seeded one. */
const CALLER_COMPANY_ID = "11111111-1111-4111-8111-000000000011";
/** Where the column default is moved to. Nobody is a member of it. */
const TRAP_COMPANY_ID = "99999999-9999-4999-8999-000000000099";

const MEMBER = {
  id: "user-mia",
  name: "Mia",
  email: "mia@example.test",
  role: "admin",
} as const;
const STRANGER = {
  id: "user-nemo",
  name: "Nemo",
  email: "nemo@example.test",
  role: "admin",
} as const;

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

// `requireRole` reads the session through Better Auth and `next/headers`,
// neither of which exists outside a request. The role check itself is not what
// this suite is about (scripts/check-auth-guards.sh and the RBAC matrix cover
// it), so the gate is replaced by the session it would have resolved. The
// module also exports `getServerSession`, which is what `read-context.ts` and
// therefore `resolveCompanyId` call, so both halves have to be here.
jest.mock("@/shared/lib/auth/require-role", () => ({
  getServerSession: async () => session,
  requireRole: async () => {
    if (!session) throw new Error("no session");
    return { session, user: session.user };
  },
}));

import { SINGLE_COMPANY_ID } from "@/db/schema/companies";
import { createCategoryAction } from "@/entities/category/api/actions";
import {
  createProductAction,
  recreateProductAction,
} from "@/entities/product/api/actions";
import {
  addPoLineAction,
  createPurchaseOrderAction,
} from "@/entities/purchase-order/api/actions";
import { updateStockSettingsAction } from "@/entities/settings/api/actions";
import { stockInAction } from "@/entities/stock-movement/api/actions";
import { createSupplierAction } from "@/entities/supplier/api/actions";
import {
  createLocationAction,
  createWarehouseAction,
} from "@/entities/warehouse/api/actions";
import type { Product } from "@/db/schema";

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

const rowCount = (table: string) =>
  scalar<number>(`select count(*)::int as n from ${table}`);

/** Rows in `table` whose owner is not `companyId`. */
const foreignRowCount = (table: string, companyId: string) =>
  scalar<number>(
    `select count(*)::int as n from ${table} where company_id <> '${companyId}'`,
  );

/** What Postgres will write into `table.company_id` when an insert omits it. */
async function columnDefaultOf(table: string): Promise<string> {
  const raw = await scalar<string>(`
    select pg_get_expr(d.adbin, d.adrelid) as expr
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = '${table}'::regclass and a.attname = 'company_id'
  `);
  // `'<uuid>'::uuid` is how Postgres renders the stored expression.
  return raw.replace(/^'/, "").replace(/'::uuid$/, "");
}

/** Ids created through the actions in the member phase, reused afterwards. */
const created = {
  supplierId: "",
  warehouseId: "",
  locationId: "",
  productId: "",
  poId: "",
  productRow: null as Product | null,
};

function expectOk<T>(result: { ok: boolean; data?: T; error?: string }): T {
  if (!result.ok)
    throw new Error(`action refused unexpectedly: ${result.error}`);
  return result.data as T;
}

beforeAll(async () => {
  mockPglite = await PGlite.create();
  await applyMigrations(mockPglite);
  mockDb = drizzle(mockPglite);

  await mockPglite.exec(`
    insert into companies (id, name) values
      ('${CALLER_COMPANY_ID}', 'Caller company'),
      ('${TRAP_COMPANY_ID}', 'Trap company');
    insert into "user" (id, name, email, email_verified, role) values
      ('${MEMBER.id}', '${MEMBER.name}', '${MEMBER.email}', true, '${MEMBER.role}'),
      ('${STRANGER.id}', '${STRANGER.name}', '${STRANGER.email}', true, '${STRANGER.role}');
    insert into company_members (company_id, user_id) values
      ('${CALLER_COMPANY_ID}', '${MEMBER.id}');
  `);

  // The rig. From here on, an insert that omits company_id lands in the trap.
  for (const table of DOMAIN_TABLES) {
    await mockPglite.exec(
      `alter table ${table} alter column company_id set default '${TRAP_COMPANY_ID}'`,
    );
  }
}, 120_000);

afterAll(async () => {
  await mockPglite?.close();
});

beforeEach(() => {
  session = { user: { id: MEMBER.id, role: MEMBER.role } };
});

describe("the rig itself", () => {
  it("points the column default at a company the caller does not belong to", async () => {
    for (const table of DOMAIN_TABLES) {
      expect([table, await columnDefaultOf(table)]).toEqual([
        table,
        TRAP_COMPANY_ID,
      ]);
    }
  });

  it("gives the caller a company that is not the seeded one", () => {
    // Without this, a write that reached for the hard-coded constant instead of
    // the membership would be indistinguishable from a correct one.
    expect(CALLER_COMPANY_ID).not.toBe(SINGLE_COMPANY_ID);
    expect(TRAP_COMPANY_ID).not.toBe(SINGLE_COMPANY_ID);
    expect(TRAP_COMPANY_ID).not.toBe(CALLER_COMPANY_ID);
  });
});

describe("a member writing through the real actions", () => {
  beforeAll(async () => {
    session = { user: { id: MEMBER.id, role: MEMBER.role } };

    expectOk(
      await createCategoryAction({
        name: "Cold Brews",
        slug: "cold-brews",
        parentId: null,
      }),
    );

    const supplier = expectOk(
      await createSupplierAction({ name: "Acme Supplies" }),
    );
    created.supplierId = (supplier as { id: string }).id;

    const warehouse = expectOk(
      await createWarehouseAction({
        name: "Main",
        code: "MAIN",
        address: null,
      }),
    );
    created.warehouseId = (warehouse as { id: string }).id;

    const location = expectOk(
      await createLocationAction(created.warehouseId, {
        code: "A1",
        name: "Aisle A",
      }),
    );
    created.locationId = (location as { id: string }).id;

    const product = expectOk(
      await createProductAction({
        sku: "BREW-001",
        name: "House Blend",
        unit: "kg",
        reorderPoint: 5,
        costPrice: "10.00",
        sellingPrice: "15.00",
        isActive: true,
      }),
    );
    created.productRow = product as Product;
    created.productId = created.productRow.id;

    const po = expectOk(
      await createPurchaseOrderAction({
        supplierId: created.supplierId,
        warehouseId: created.warehouseId,
      }),
    );
    created.poId = (po as { id: string }).id;

    expectOk(
      await addPoLineAction(created.poId, {
        productId: created.productId,
        quantityOrdered: 10,
        unitCost: "10.00",
      }),
    );

    // stock_movements and audit_log in one transaction.
    expectOk(
      await stockInAction({
        productId: created.productId,
        locationId: created.locationId,
        quantity: 7,
        reason: "purchase",
      }),
    );

    // settings and a second audit_log row.
    expectOk(await updateStockSettingsAction({ allowBackorder: true }));
  }, 120_000);

  it.each(DOMAIN_TABLES)("writes at least one %s row", async (table) => {
    // Without this, "no row belongs to another company" would pass for a table
    // nothing ever wrote to, and the sweep below would be measuring nothing.
    expect(await rowCount(table)).toBeGreaterThan(0);
  });

  it.each(DOMAIN_TABLES)(
    "stamps every %s row with the caller's own company",
    async (table) => {
      expect(await foreignRowCount(table, CALLER_COMPANY_ID)).toBe(0);
    },
  );

  it("leaves nothing wearing the column default", async () => {
    for (const table of DOMAIN_TABLES) {
      const fromDefault = await scalar<number>(
        `select count(*)::int as n from ${table} where company_id = '${TRAP_COMPANY_ID}'`,
      );
      expect([table, fromDefault]).toEqual([table, 0]);
    }
  });

  it("overrides a company id the caller supplies instead of trusting it", async () => {
    // The undo paths (`recreate*Action`) re-insert a row handed back by the
    // client, and that row now carries a `companyId` field. Taking it at face
    // value would let a caller write into any company whose id they can name,
    // which is the same hole the default is, pointed by hand.
    const smuggled = {
      ...(created.productRow as Product),
      id: "00000000-0000-4000-8000-0000000000aa",
      sku: "BREW-002",
      companyId: TRAP_COMPANY_ID,
    };

    const restored = expectOk(await recreateProductAction(smuggled));

    expect((restored as Product).companyId).toBe(CALLER_COMPANY_ID);
    expect(
      await scalar<string>(
        `select company_id from products where sku = 'BREW-002'`,
      ),
    ).toBe(CALLER_COMPANY_ID);
  });
});

describe("a caller who belongs to no company", () => {
  const before: Record<string, number> = {};

  beforeAll(async () => {
    for (const table of DOMAIN_TABLES) {
      before[table] = await rowCount(table);
    }

    session = { user: { id: STRANGER.id, role: STRANGER.role } };
  }, 120_000);

  // Every input below is valid and every name is new, so the only thing that
  // can stop these writes is the missing membership. A refusal that came from
  // a unique index instead would prove nothing.
  const attempts: Array<[string, () => Promise<{ ok: boolean }>]> = [
    [
      "createCategory",
      () =>
        createCategoryAction({
          name: "Teas",
          slug: "teas",
          parentId: null,
        }),
    ],
    ["createSupplier", () => createSupplierAction({ name: "Other Supplies" })],
    [
      "createWarehouse",
      () =>
        createWarehouseAction({ name: "Annex", code: "ANNEX", address: null }),
    ],
    [
      "createLocation",
      () =>
        createLocationAction(created.warehouseId, { code: "B2", name: null }),
    ],
    [
      "createProduct",
      () =>
        createProductAction({
          sku: "BREW-999",
          name: "Stranger Blend",
          unit: "kg",
          reorderPoint: 1,
          costPrice: "1.00",
          sellingPrice: "2.00",
          isActive: true,
        }),
    ],
    [
      "createPurchaseOrder",
      () =>
        createPurchaseOrderAction({
          supplierId: created.supplierId,
          warehouseId: created.warehouseId,
        }),
    ],
    [
      "addPoLine",
      () =>
        addPoLineAction(created.poId, {
          productId: created.productId,
          quantityOrdered: 1,
          unitCost: "1.00",
        }),
    ],
    [
      "stockIn",
      () =>
        stockInAction({
          productId: created.productId,
          locationId: created.locationId,
          quantity: 1,
          reason: "purchase",
        }),
    ],
    [
      "updateStockSettings",
      () => updateStockSettingsAction({ allowBackorder: false }),
    ],
  ];

  it.each(attempts)("is refused by %s", async (_name, run) => {
    session = { user: { id: STRANGER.id, role: STRANGER.role } };
    await expect(run()).resolves.toMatchObject({ ok: false });
  });

  it.each(DOMAIN_TABLES)("leaves %s exactly as it was", async (table) => {
    expect(await rowCount(table)).toBe(before[table]);
  });

  it("does not quietly hand the stranger the default company", async () => {
    for (const table of DOMAIN_TABLES) {
      const fromDefault = await scalar<number>(
        `select count(*)::int as n from ${table} where company_id = '${TRAP_COMPANY_ID}'`,
      );
      expect([table, fromDefault]).toEqual([table, 0]);
    }
  });

  it("does not let the stranger overwrite the member's settings row", async () => {
    // settings is the one table where a refused write would be invisible to a
    // row count: its upsert targets an existing row, so a write that got
    // through would change a value rather than add a row.
    expect(
      await scalar<{ allowBackorder: boolean }>(
        `select value from settings where key = 'stock'`,
      ),
    ).toEqual({ allowBackorder: true });
  });
});
