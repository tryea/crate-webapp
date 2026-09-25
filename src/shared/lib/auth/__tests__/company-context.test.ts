/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/**
 * FR-29 (ticket 997), the session half: the acting user's company, or a
 * refusal. Both directions, on a real database.
 *
 * WHY THE REFUSAL NEEDS A TEST OF ITS OWN. There is an id in this schema that
 * would make every lookup succeed: `SINGLE_COMPANY_ID`, the default that
 * migration 0005 put on every `company_id` column. A helper that reached for
 * it when no membership was found would look correct on every screen and would
 * hand an account that belongs to nobody the first company's rows. So the
 * member case alone proves nothing: it is the pair, "a member resolves" and "a
 * stranger is refused, on the same database, with that default company sitting
 * right there", that says the separation is real.
 *
 * PGlite is Postgres compiled to wasm and the schema is built by replaying the
 * real migration files, so the table and column names this module spells out
 * in SQL are checked against the ones that ship.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../../db/migrations");

/** Mirrors SINGLE_COMPANY_ID in src/db/schema/companies.ts, see below. */
const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_COMPANY_ID = "22222222-2222-4222-8222-000000000002";

const MEMBER_OF_DEFAULT = "user-ada";
const MEMBER_OF_SECOND = "user-bo";
const MEMBER_OF_NOTHING = "user-carol";

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

import { SINGLE_COMPANY_ID } from "@/db/schema/companies";
import {
  NoCompanyError,
  resolveCompanyId,
} from "@/shared/lib/auth/company-context";

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
  // The accounts are created AFTER the migration trail, which is the point:
  // 0006 backfills the accounts that predate it (proved in
  // src/db/__tests__/company-membership.test.ts), and every account born after
  // it needs someone to say where it belongs. Carol is the one nobody said it
  // for, which is the state a seeded database or a future sign-up produces.
  await mockPglite.exec(`
    insert into companies (id, name) values
      ('${SECOND_COMPANY_ID}', 'Second company');
    insert into "user" (id, name, email, email_verified, role) values
      ('${MEMBER_OF_DEFAULT}', 'Ada', 'ada@example.test', true, 'admin'),
      ('${MEMBER_OF_SECOND}', 'Bo', 'bo@example.test', true, 'manager'),
      ('${MEMBER_OF_NOTHING}', 'Carol', 'carol@example.test', true, 'staff');
    insert into company_members (company_id, user_id) values
      ('${DEFAULT_COMPANY_ID}', '${MEMBER_OF_DEFAULT}'),
      ('${SECOND_COMPANY_ID}', '${MEMBER_OF_SECOND}');
  `);
  mockDb = drizzle(mockPglite);
}, 60_000);

afterAll(async () => {
  await mockPglite?.close();
});

beforeEach(() => {
  session = { user: { id: MEMBER_OF_DEFAULT, role: "admin" } };
});

describe("the id the schema defaults to and the id this suite uses", () => {
  it("are the same id", async () => {
    // The literal above exists because the suite writes SQL, not drizzle
    // inserts. If the two ever drift, every "not the default" assertion below
    // would be comparing against a company that is not the default and would
    // pass for the wrong reason.
    expect(DEFAULT_COMPANY_ID).toBe(SINGLE_COMPANY_ID);
  });
});

describe("a member", () => {
  it("resolves to the company they belong to", async () => {
    await expect(resolveCompanyId()).resolves.toBe(DEFAULT_COMPANY_ID);
  });

  it("resolves to their own company, not to the default one", async () => {
    // Bo is the case that separates "reads the membership" from "returns the
    // default and happens to be right". Ada's company IS the default, so her
    // case alone cannot tell those two implementations apart.
    session = { user: { id: MEMBER_OF_SECOND, role: "manager" } };

    await expect(resolveCompanyId()).resolves.toBe(SECOND_COMPANY_ID);
  });

  it("reads inside a database identity, so a policy could judge the lookup", async () => {
    // The lookup goes through withReadContext like every other read in the app
    // (ticket 989). Proving that by watching for a set_config call would be
    // asserting on an implementation detail; proving it with the mechanism it
    // exists for is stronger, so this case writes the kind of policy that
    // would one day guard company_members and lets the database answer.
    //
    // THE ROLE IS NOT OPTIONAL. PGlite connects as a superuser, and a
    // superuser bypasses row-level security outright, FORCE included
    // (src/db/rls/README.md, the two-role table, which is why the app runs as
    // `app_user`). Measured here first: with the policy on and no role switch,
    // both the bound and the unbound read still see the row, so the whole case
    // would pass without proving anything. `SET ROLE` is what makes the policy
    // bite, and it is session-wide on this single connection, so the helper's
    // own transaction runs under it too.
    await mockPglite.exec(`
      ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_membership ON company_members FOR SELECT
        USING (user_id = current_setting('app.current_user_id', true));
      CREATE ROLE membership_probe;
      GRANT SELECT ON company_members TO membership_probe;
      SET ROLE membership_probe;
    `);

    try {
      await expect(resolveCompanyId()).resolves.toBe(DEFAULT_COMPANY_ID);

      // The counterfactual, and the reason the line above means anything: the
      // same SELECT with no identity is judged and handed nothing. That is
      // what the helper would receive the day someone takes the binding out.
      const unbound = await mockPglite.query(
        "select company_id from company_members where user_id = $1",
        [MEMBER_OF_DEFAULT],
      );
      expect(unbound.rows).toEqual([]);
    } finally {
      await mockPglite.exec(`
        RESET ROLE;
        DROP POLICY IF EXISTS own_membership ON company_members;
        ALTER TABLE company_members DISABLE ROW LEVEL SECURITY;
        REVOKE SELECT ON company_members FROM membership_probe;
        DROP ROLE IF EXISTS membership_probe;
      `);
    }
  });
});

describe("an account that belongs to no company", () => {
  beforeEach(() => {
    session = { user: { id: MEMBER_OF_NOTHING, role: "staff" } };
  });

  it("is refused", async () => {
    await expect(resolveCompanyId()).rejects.toThrow(NoCompanyError);
  });

  it("is not quietly given the default company", async () => {
    // Stated as its own case because "throws" and "returns the wrong id" are
    // different failures and only one of them is caught by the case above.
    const result = await resolveCompanyId().catch((error: unknown) => error);

    expect(result).toBeInstanceOf(NoCompanyError);
    expect(result).not.toBe(DEFAULT_COMPANY_ID);
  });

  it("says which of the two ways it failed, and names the account", async () => {
    // A caller has to tell "sign in" apart from "you are in no company", and a
    // log has to point at an account rather than at a stack.
    await expect(resolveCompanyId()).rejects.toMatchObject({
      reason: "no-membership",
    });
    await expect(resolveCompanyId()).rejects.toThrow(
      new RegExp(MEMBER_OF_NOTHING),
    );
  });

  /**
   * The control. Without it, "refused" could mean the membership table is
   * empty, the database is broken, or the default company does not exist, and
   * every assertion above would pass for one of those reasons instead.
   */
  it("is refused on a database where that company is right there and reachable", async () => {
    const present = await mockPglite.query<{ id: string }>(
      "select id from companies where id = $1",
      [DEFAULT_COMPANY_ID],
    );
    expect(present.rows).toEqual([{ id: DEFAULT_COMPANY_ID }]);

    session = { user: { id: MEMBER_OF_DEFAULT, role: "admin" } };
    await expect(resolveCompanyId()).resolves.toBe(DEFAULT_COMPANY_ID);

    session = { user: { id: MEMBER_OF_NOTHING, role: "staff" } };
    await expect(resolveCompanyId()).rejects.toThrow(NoCompanyError);
  });
});

describe("a request with no session", () => {
  beforeEach(() => {
    session = null;
  });

  it("is refused, and says so as a different reason", async () => {
    await expect(resolveCompanyId()).rejects.toMatchObject({
      reason: "no-session",
    });
  });
});
