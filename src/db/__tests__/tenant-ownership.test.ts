/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

import { SINGLE_COMPANY_ID } from "@/db/schema/companies";

/**
 * FR-29 pin, first half: every domain row has an owner, and a SKU is unique
 * per company rather than per installation.
 *
 * WHY A REAL POSTGRES AND NOT A STUB: both halves of this are behaviour the
 * DATABASE performs. The backfill is what `ADD COLUMN ... NOT NULL DEFAULT`
 * writes into rows that already exist, and the "accepted / refused" pair is a
 * unique index raising 23505. A hand-written stand-in would be asserting that
 * the stand-in refuses duplicates, which proves nothing about the index that
 * ships. PGlite is Postgres compiled to wasm, and the schema under test is
 * built by replaying the real migration files, so deleting a line from
 * 0005_company_ownership.sql must make this suite fail. Restating the DDL
 * inline here would cut exactly that link.
 *
 * WHY THE MIGRATIONS ARE REPLAYED IN TWO HALVES: "backfilled" is a claim about
 * rows that were already there. A database built by running every migration at
 * once has no such rows, so every count would be zero and the assertion would
 * pass whether the backfill worked or not. The suite therefore stops at the
 * migration before this one, writes a row into each of the ten domain tables
 * while no owner column exists, and only then applies 0005. That is the shape
 * the live database is in, and it is the only shape in which the claim can
 * fail.
 */
const MIGRATIONS_DIR = join(__dirname, "../migrations");
const OWNERSHIP_MIGRATION = "0005_company_ownership";

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

/**
 * The four indexes that were global before this migration, each with the
 * column that had to stay unique somewhere and the value used to collide it.
 * `insert` writes one row for the given company, so the same helper can be
 * pointed at two different owners.
 */
const GLOBAL_UNIQUE_INDEXES = [
  {
    index: "products_sku_idx",
    table: "products",
    column: "sku",
    value: "A-100",
    insert: (company: string, value: string) => ({
      text: `INSERT INTO products (company_id, sku, name) VALUES ($1, $2, 'Widget')`,
      params: [company, value],
    }),
  },
  {
    index: "warehouses_code_idx",
    table: "warehouses",
    column: "code",
    value: "WH-1",
    insert: (company: string, value: string) => ({
      text: `INSERT INTO warehouses (company_id, name, code) VALUES ($1, 'Main', $2)`,
      params: [company, value],
    }),
  },
  {
    index: "categories_slug_idx",
    table: "categories",
    column: "slug",
    value: "tools",
    insert: (company: string, value: string) => ({
      text: `INSERT INTO categories (company_id, name, slug) VALUES ($1, 'Tools', $2)`,
      params: [company, value],
    }),
  },
  {
    index: "po_number_idx",
    table: "purchase_orders",
    column: "po_number",
    value: "PO-0001",
    insert: (company: string, value: string) => ({
      text: `INSERT INTO purchase_orders (company_id, po_number, supplier_id, warehouse_id)
             VALUES ($1, $2,
                     (SELECT id FROM suppliers WHERE company_id = $1 LIMIT 1),
                     (SELECT id FROM warehouses WHERE company_id = $1 AND code <> 'WH-1' LIMIT 1))`,
      params: [company, value],
    }),
  },
] as const;

/** Postgres raises 23505 (unique_violation) when a unique index refuses a row. */
const UNIQUE_VIOLATION = "23505";

let pg: PGlite;

/**
 * Replay a slice of the committed migrations, in the order the journal
 * records. `before` stops short of a tag, `from` starts at it, so the suite
 * can stand in the database's own history rather than only at its end.
 */
async function applyMigrations(
  target: PGlite,
  slice: { before?: string; from?: string } = {},
) {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };

  const tags = journal.entries.map((entry) => entry.tag);
  // A tag that is not in the journal means the migration was renamed and this
  // suite would silently replay the wrong slice, so say so instead.
  for (const tag of [slice.before, slice.from].filter(Boolean)) {
    if (!tags.includes(tag as string)) {
      throw new Error(`migration ${tag} is not in the journal`);
    }
  }

  const start = slice.from ? tags.indexOf(slice.from) : 0;
  const end = slice.before ? tags.indexOf(slice.before) : tags.length;

  for (const tag of tags.slice(start, end)) {
    await target.exec(readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), "utf8"));
  }
}

/**
 * One row in each of the ten domain tables, written while the owner column
 * does not exist yet. The FK chain decides the order: a location needs its
 * warehouse, a PO line needs its PO and its product, a movement needs both a
 * product and a location.
 */
async function seedRowsWithoutAnOwner(target: PGlite) {
  await target.exec(`
    INSERT INTO categories (id, name, slug)
      VALUES ('11111111-1111-4111-8111-000000000001', 'Hand tools', 'hand-tools');
    INSERT INTO suppliers (id, name)
      VALUES ('11111111-1111-4111-8111-000000000002', 'Acme Supply');
    INSERT INTO warehouses (id, name, code)
      VALUES ('11111111-1111-4111-8111-000000000003', 'North', 'NORTH');
    INSERT INTO locations (id, warehouse_id, code)
      VALUES ('11111111-1111-4111-8111-000000000004',
              '11111111-1111-4111-8111-000000000003', 'A-01');
    INSERT INTO products (id, sku, name, category_id, supplier_id)
      VALUES ('11111111-1111-4111-8111-000000000005', 'LEGACY-1', 'Hammer',
              '11111111-1111-4111-8111-000000000001',
              '11111111-1111-4111-8111-000000000002');
    INSERT INTO purchase_orders (id, po_number, supplier_id, warehouse_id)
      VALUES ('11111111-1111-4111-8111-000000000006', 'PO-LEGACY',
              '11111111-1111-4111-8111-000000000002',
              '11111111-1111-4111-8111-000000000003');
    INSERT INTO po_lines (po_id, product_id, quantity_ordered, unit_cost)
      VALUES ('11111111-1111-4111-8111-000000000006',
              '11111111-1111-4111-8111-000000000005', 10, '4.50');
    INSERT INTO stock_movements (product_id, location_id, type, reason, quantity)
      VALUES ('11111111-1111-4111-8111-000000000005',
              '11111111-1111-4111-8111-000000000004', 'stock_in', 'purchase', 10);
    INSERT INTO audit_log (action, resource_type)
      VALUES ('create', 'product');
    INSERT INTO settings (key, value)
      VALUES ('stock', '{"allowBackorder": false}'::jsonb);
  `);
}

async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
  const result = await pg.query<Record<string, T>>(text, params);
  return Object.values(result.rows[0])[0];
}

beforeAll(async () => {
  pg = await PGlite.create();
  await applyMigrations(pg, { before: OWNERSHIP_MIGRATION });
  await seedRowsWithoutAnOwner(pg);
  await applyMigrations(pg, { from: OWNERSHIP_MIGRATION });
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

describe("the migration is the source of the id the schema defaults to", () => {
  it("inserts exactly the company that SINGLE_COMPANY_ID names", async () => {
    const rows = await pg.query<{ id: string; name: string }>(
      "SELECT id, name FROM companies",
    );

    expect(rows.rows).toEqual([
      { id: SINGLE_COMPANY_ID, name: "Default company" },
    ]);
  });
});

describe("every domain table carries its owner", () => {
  it.each(DOMAIN_TABLES)("%s has a NOT NULL company_id", async (table) => {
    const column = await pg.query<{ is_nullable: string; data_type: string }>(
      `SELECT is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'company_id'`,
      [table],
    );

    expect(column.rows).toEqual([{ is_nullable: "NO", data_type: "uuid" }]);
  });

  it.each(DOMAIN_TABLES)(
    "%s points its company_id at the companies table",
    async (table) => {
      const constraint = await scalar<number>(
        `SELECT count(*)::int
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_name = $1
           AND kcu.column_name = 'company_id'
           AND ccu.table_name = 'companies'`,
        [table],
      );

      expect(constraint).toBe(1);
    },
  );
});

describe("rows that predate the column are backfilled to the one company", () => {
  it.each(DOMAIN_TABLES)(
    "%s has no row left without the single company",
    async (table) => {
      // Written before 0005 ran, so this is the backfill being measured and
      // not a default applied at insert time.
      const total = await scalar<number>(`SELECT count(*)::int FROM ${table}`);
      const owned = await scalar<number>(
        `SELECT count(*)::int FROM ${table} WHERE company_id = $1`,
        [SINGLE_COMPANY_ID],
      );

      expect(total).toBeGreaterThan(0);
      expect(owned).toBe(total);
    },
  );
});

describe("a value is unique per company, not per installation", () => {
  const SECOND_COMPANY_ID = "22222222-2222-4222-8222-000000000002";

  beforeAll(async () => {
    await pg.query(
      "INSERT INTO companies (id, name) VALUES ($1, 'Second company')",
      [SECOND_COMPANY_ID],
    );
    // The PO number case needs a supplier and a warehouse on each side, and
    // its own warehouse cannot be the one the code collision uses.
    for (const company of [SINGLE_COMPANY_ID, SECOND_COMPANY_ID]) {
      await pg.query(
        "INSERT INTO suppliers (company_id, name) VALUES ($1, 'Ordering supplier')",
        [company],
      );
      await pg.query(
        "INSERT INTO warehouses (company_id, name, code) VALUES ($1, 'Receiving', $2)",
        [company, `RECV-${company.slice(0, 8)}`],
      );
    }
  });

  it.each(GLOBAL_UNIQUE_INDEXES)(
    "$index accepts $column $value under two different companies",
    async ({ insert, value }) => {
      const first = insert(SINGLE_COMPANY_ID, value);
      const second = insert(SECOND_COMPANY_ID, value);

      await expect(
        pg.query(first.text, [...first.params]),
      ).resolves.toBeDefined();
      await expect(
        pg.query(second.text, [...second.params]),
      ).resolves.toBeDefined();
    },
  );

  it.each(GLOBAL_UNIQUE_INDEXES)(
    "$index still refuses a second $column $value inside one company",
    async ({ index, insert, value }) => {
      // The row inserted by the test above is still there, so this is the
      // duplicate. Both directions matter: an index that accepted everything
      // would pass the test above on its own.
      const duplicate = insert(SINGLE_COMPANY_ID, value);

      await expect(
        pg.query(duplicate.text, [...duplicate.params]),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

      const stillOne = await scalar<number>(
        `SELECT count(*)::int FROM ${
          GLOBAL_UNIQUE_INDEXES.find((c) => c.index === index)!.table
        } WHERE company_id = $1 AND ${
          GLOBAL_UNIQUE_INDEXES.find((c) => c.index === index)!.column
        } = $2`,
        [SINGLE_COMPANY_ID, value],
      );
      expect(stillOne).toBe(1);
    },
  );
});
