/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc, sql } from "drizzle-orm";

/**
 * FR-29 / ticket 989: A READ WITHOUT A DATABASE IDENTITY IS REFUSED.
 *
 * The FR-29 survey measured that every read in the app ran unbound, and that
 * the policy convention in this repo treats "nobody is asking" as "allow".
 * Together those two facts mean a tenant policy would hold on writes and be
 * ignored on every screen. This suite pins the fix from both sides.
 *
 * THE DIFFERENTIAL, AND WHY IT IS THE WHOLE POINT. Each case runs two gates
 * against the same database:
 *
 *   REAL:           `listProductsServer()`, the shipped read.
 *   BINDING REMOVED: the same SELECT issued on the bare `db` handle, which is
 *                    literally the code this ticket replaced (commit b0d9830).
 *
 * Bound, the two must agree row for row: binding changes WHO asks, not WHAT
 * comes back, and that equality is what keeps the counterfactual honest as the
 * query evolves. Unbound, they must DISAGREE: the real gate throws and the
 * binding-removed gate hands over every row. Take the refusal out of
 * `withReadContext` and the unbound case stops disagreeing, which is the test
 * going red.
 *
 * PGlite is Postgres compiled to wasm, so `set_config(..., true)` and its
 * transaction-local lifetime are the real ones, not a stand-in that always
 * agrees.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../../db/migrations");

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

import { db } from "@/db/client";
import { products } from "@/db/schema";
import { listProductsServer } from "@/entities/product/api/server";
import { listUsersServer } from "@/entities/user/api/server";
import { getStockSettingsServer } from "@/entities/settings/api/server";
import {
  UnboundReadError,
  withReadContext,
} from "@/shared/lib/auth/read-context";

const ADMIN = "user-admin";

/** The pre-989 read: same SELECT, no identity, no transaction. */
function readWithBindingRemoved() {
  return db.select().from(products).orderBy(asc(products.name));
}

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

beforeAll(async () => {
  mockPglite = await PGlite.create();
  await applyMigrations(mockPglite);
  await mockPglite.exec(`
    insert into "user" (id, name, email, email_verified, role) values
      ('${ADMIN}', 'Ada', 'ada@example.test', true, 'admin');
    insert into products (sku, name) values
      ('A-100', 'Hex bolt'),
      ('A-200', 'Wing nut'),
      ('A-300', 'Torque key');
    insert into settings (key, value) values
      ('stock', '{"allowBackorder": true}'::jsonb);
  `);
  mockDb = drizzle(mockPglite);
}, 60_000);

afterAll(async () => {
  await mockPglite?.close();
});

beforeEach(() => {
  session = { user: { id: ADMIN, role: "admin" } };
});

describe("a bound read", () => {
  it("carries the user id and role into the transaction", async () => {
    const seen = await withReadContext(async (tx) => {
      const result = await tx.execute(sql`
        select
          current_setting('app.current_user_id', true) as user_id,
          current_setting('app.current_user_role', true) as user_role
      `);
      // postgres.js hands back an array, PGlite hands back { rows }. Both
      // drivers are real, so read whichever shape arrived.
      const rows = (
        Array.isArray(result) ? result : (result as { rows: unknown[] }).rows
      ) as Array<{ user_id: string; user_role: string }>;
      return rows[0];
    });

    expect(seen.user_id).toBe(ADMIN);
    expect(seen.user_role).toBe("admin");
  });

  it("leaves no identity behind once the transaction ends", async () => {
    await withReadContext(async () => undefined);

    const after = (
      await mockPglite.query<{ user_id: string | null }>(
        "select current_setting('app.current_user_id', true) as user_id",
      )
    ).rows[0];

    // Transaction-local: a pooled connection must not carry one request's
    // identity into the next.
    expect(after.user_id === null || after.user_id === "").toBe(true);
  });

  it("returns exactly what the same read returned before it was bound", async () => {
    const real = await listProductsServer();
    const bindingRemoved = await readWithBindingRemoved();

    expect(real).toEqual(bindingRemoved);
    expect(real).toHaveLength(3);
  });
});

describe("an unbound read", () => {
  beforeEach(() => {
    session = null;
  });

  it("is refused, not silently allowed", async () => {
    await expect(listProductsServer()).rejects.toThrow(UnboundReadError);
  });

  it("is refused across every read surface, not just the product one", async () => {
    await expect(listUsersServer()).rejects.toThrow(UnboundReadError);
    await expect(getStockSettingsServer()).rejects.toThrow(UnboundReadError);
  });

  it("names the read it refused, so the failure points at a caller", async () => {
    await expect(listProductsServer()).rejects.toThrow(/listProductsServer/);
  });

  /**
   * The control. Without this, "refused" could just mean the table is empty
   * and every assertion above would pass for the wrong reason.
   */
  it("is what the binding buys: with the binding removed the same read hands over every row", async () => {
    const bindingRemoved = await readWithBindingRemoved();

    expect(bindingRemoved).toHaveLength(3);
    expect(bindingRemoved.map((p) => p.sku)).toEqual([
      "A-100",
      "A-300",
      "A-200",
    ]);
  });
});
