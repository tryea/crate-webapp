/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

import { SINGLE_COMPANY_ID } from "@/db/schema/companies";

/**
 * FR-29 (ticket 997), the migration half: a person belongs to a company, and
 * everyone who already had an account belongs to the one company that exists.
 *
 * WHY THE MIGRATIONS ARE REPLAYED IN TWO HALVES, the same reason
 * tenant-ownership.test.ts gives: "backfilled" is a claim about accounts that
 * were already there. A database built by running every migration at once has
 * an empty `user` table when 0006 runs, so the backfill would insert nothing,
 * every count would be zero and the assertion would pass whether the backfill
 * worked or not. This suite stops at the migration before this one, creates
 * three accounts while no membership table exists, and only then applies 0006.
 * That is the shape the live database was in, and it is the only shape in
 * which the claim can fail.
 *
 * PGlite is Postgres compiled to wasm and the schema under test is built by
 * replaying the real migration files, so deleting the INSERT from
 * 0006_company_membership.sql must make this suite fail.
 */
const MIGRATIONS_DIR = join(__dirname, "../migrations");
const MEMBERSHIP_MIGRATION = "0006_company_membership";

/** Accounts written before the membership table existed. */
const EXISTING_USERS = [
  { id: "user-admin", name: "Ada", email: "ada@example.test", role: "admin" },
  { id: "user-mgr", name: "Mira", email: "mira@example.test", role: "manager" },
  { id: "user-staff", name: "Sam", email: "sam@example.test", role: "staff" },
] as const;

/** Postgres raises 23505 (unique_violation) when a unique index refuses a row. */
const UNIQUE_VIOLATION = "23505";
/** 23503 (foreign_key_violation): the row points at a parent that is not there. */
const FOREIGN_KEY_VIOLATION = "23503";
/**
 * 23001 (restrict_violation), NOT 23503. `ON DELETE RESTRICT` and
 * `ON DELETE NO ACTION` refuse the same deletes and report them with different
 * codes, and the difference is invisible until something asserts on one.
 */
const RESTRICT_VIOLATION = "23001";

let pg: PGlite;

/**
 * Replay a slice of the committed migrations in the order the journal records.
 * `before` stops short of a tag, `from` starts at it.
 */
async function applyMigrations(
  target: PGlite,
  slice: { before?: string; from?: string } = {},
) {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };

  const tags = journal.entries.map((entry) => entry.tag);
  // A tag missing from the journal means the migration was renamed and this
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

async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
  const result = await pg.query<Record<string, T>>(text, params);
  return Object.values(result.rows[0])[0];
}

beforeAll(async () => {
  pg = await PGlite.create();
  await applyMigrations(pg, { before: MEMBERSHIP_MIGRATION });
  for (const u of EXISTING_USERS) {
    await pg.query(
      `INSERT INTO "user" (id, name, email, email_verified, role)
       VALUES ($1, $2, $3, true, $4)`,
      [u.id, u.name, u.email, u.role],
    );
  }
  await applyMigrations(pg, { from: MEMBERSHIP_MIGRATION });
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

describe("a membership table joins a user to a company", () => {
  it("points user_id at the accounts table and company_id at the companies table", async () => {
    const targets = await pg.query<{ column_name: string; table_name: string }>(
      `SELECT kcu.column_name, ccu.table_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = 'company_members'
       ORDER BY kcu.column_name`,
    );

    expect(targets.rows).toEqual([
      { column_name: "company_id", table_name: "companies" },
      { column_name: "user_id", table_name: "user" },
    ]);
  });

  it("refuses a membership in a company that does not exist", async () => {
    // A fresh account, not one of the three above: those were backfilled, so
    // the unique index on user_id would refuse this row first and the foreign
    // key would never be reached. The test would still be green and would be
    // measuring the wrong constraint.
    await pg.query(
      `INSERT INTO "user" (id, name, email, email_verified, role)
       VALUES ('user-unowned', 'Nico', 'nico@example.test', true, 'staff')`,
    );

    await expect(
      pg.query(
        `INSERT INTO company_members (company_id, user_id)
         VALUES ('33333333-3333-4333-8333-000000000003', $1)`,
        ["user-unowned"],
      ),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });

    // This suite shares one database across its cases, and the backfill count
    // below is a claim about the accounts that existed when 0006 ran. An
    // account created here and left behind would make that count wrong for a
    // reason that has nothing to do with the backfill.
    await pg.query(`DELETE FROM "user" WHERE id = 'user-unowned'`);
  });
});

describe("every account that predates the table is backfilled", () => {
  it.each(EXISTING_USERS)(
    "$id belongs to the one company that exists",
    async ({ id }) => {
      // Written before 0006 ran, so this is the backfill being measured.
      const companies = await pg.query<{ company_id: string }>(
        "SELECT company_id FROM company_members WHERE user_id = $1",
        [id],
      );

      expect(companies.rows).toEqual([{ company_id: SINGLE_COMPANY_ID }]);
    },
  );

  it("leaves no account without a membership", async () => {
    // The count comparison is what catches a backfill that ran but missed
    // rows: asserting only on the three ids above would still pass if a
    // fourth account existed and was skipped.
    const accounts = await scalar<number>(`SELECT count(*)::int FROM "user"`);
    const members = await scalar<number>(
      "SELECT count(*)::int FROM company_members",
    );
    const orphans = await scalar<number>(
      `SELECT count(*)::int FROM "user" u
       WHERE NOT EXISTS (SELECT 1 FROM company_members m WHERE m.user_id = u.id)`,
    );

    expect(accounts).toBe(EXISTING_USERS.length);
    expect(members).toBe(accounts);
    expect(orphans).toBe(0);
  });
});

describe("a person belongs to exactly one company", () => {
  const SECOND_COMPANY_ID = "22222222-2222-4222-8222-000000000002";

  beforeAll(async () => {
    await pg.query(
      "INSERT INTO companies (id, name) VALUES ($1, 'Second company')",
      [SECOND_COMPANY_ID],
    );
  });

  it("refuses a second membership for an account that already has one", async () => {
    // Without this index `resolveCompanyId` would have two answers and no way
    // to choose, which is the silent failure the helper exists to prevent.
    await expect(
      pg.query(
        "INSERT INTO company_members (company_id, user_id) VALUES ($1, $2)",
        [SECOND_COMPANY_ID, "user-admin"],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("still lets two different accounts sit in two different companies", async () => {
    // The control: the index above must refuse a second company for ONE
    // person, not refuse the second company itself.
    await pg.query(
      `INSERT INTO "user" (id, name, email, email_verified, role)
       VALUES ('user-other', 'Bo', 'bo@example.test', true, 'admin')`,
    );

    await expect(
      pg.query(
        "INSERT INTO company_members (company_id, user_id) VALUES ($1, $2)",
        [SECOND_COMPANY_ID, "user-other"],
      ),
    ).resolves.toBeDefined();
  });
});

describe("what happens when either side is deleted", () => {
  it("takes the membership with the account", async () => {
    await pg.query(
      `INSERT INTO "user" (id, name, email, email_verified, role)
       VALUES ('user-temp', 'Tess', 'tess@example.test', true, 'staff')`,
    );
    await pg.query(
      "INSERT INTO company_members (company_id, user_id) VALUES ($1, $2)",
      [SINGLE_COMPANY_ID, "user-temp"],
    );

    await pg.query(`DELETE FROM "user" WHERE id = 'user-temp'`);

    const left = await scalar<number>(
      "SELECT count(*)::int FROM company_members WHERE user_id = 'user-temp'",
    );
    expect(left).toBe(0);
  });

  it("refuses to delete a company while people still belong to it", async () => {
    // The message is asserted as well as the code: every domain table also
    // points at companies with `restrict`, so a bare code would still pass if
    // some other table were the one doing the refusing.
    await expect(
      pg.query("DELETE FROM companies WHERE id = $1", [SINGLE_COMPANY_ID]),
    ).rejects.toMatchObject({
      code: RESTRICT_VIOLATION,
      message: expect.stringContaining("company_members"),
    });
  });
});
