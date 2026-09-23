/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/**
 * FR-32 pin: an address left on the page is actually kept, and leaving it
 * twice does not leave two of it.
 *
 * WHY A REAL POSTGRES AND NOT A STUB: the "one row" half of this is held by a
 * UNIQUE constraint and `ON CONFLICT DO NOTHING`, which is behaviour the
 * DATABASE performs. A hand-written stand-in for the db would be asserting
 * that the stand-in dedupes, which proves nothing about the column that ships.
 * PGlite is Postgres itself compiled to wasm, so the constraint under test is
 * the real one, created by the real migration file that will run against the
 * real server. Rewriting the DDL inline here would break that link: delete the
 * constraint from the migration and this suite must notice.
 *
 * The db client module is swapped for that Postgres rather than the handler
 * being given a seam, so the code path exercised below is the one that runs in
 * production, route handler included.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../db/migrations");

let mockPglite: PGlite;
let mockDb: ReturnType<typeof drizzle>;

jest.mock("@/db/client", () => ({
  get db() {
    return mockDb;
  },
}));

import { POST } from "@/app/api/waitlist/route";
import { listWaitlistSignups } from "@/entities/waitlist/api/server";

/** Apply every committed migration, in the order the journal records. */
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

function submit(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://app.crate.test/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );
}

const submitEmail = (email: string) => submit(JSON.stringify({ email }));

async function rowCount(): Promise<number> {
  const result = await mockPglite.query<{ n: number }>(
    "select count(*)::int as n from waitlist_signup",
  );
  return result.rows[0].n;
}

beforeAll(async () => {
  mockPglite = await PGlite.create();
  await applyMigrations(mockPglite);
  mockDb = drizzle(mockPglite);
}, 60_000);

afterAll(async () => {
  await mockPglite?.close();
});

beforeEach(async () => {
  await mockPglite.exec("truncate table waitlist_signup");
});

describe("an address left on the page is kept", () => {
  it("is readable back after it was submitted", async () => {
    const response = await submitEmail("stranger@example.com");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const kept = await listWaitlistSignups();
    expect(kept.map((entry) => entry.email)).toEqual(["stranger@example.com"]);
  });

  it("records the moment it arrived", async () => {
    const before = Date.now();
    await submitEmail("timed@example.com");
    const after = Date.now();

    const [kept] = await listWaitlistSignups();
    const arrived = Date.parse(kept.createdAt);

    expect(Number.isNaN(arrived)).toBe(false);
    // Allow a second of slack on each side: the row's clock is the database's.
    expect(arrived).toBeGreaterThanOrEqual(before - 1000);
    expect(arrived).toBeLessThanOrEqual(after + 1000);
  });
});

describe("the same address twice leaves one row", () => {
  it("accepts the second submission and still stores one row", async () => {
    const first = await submitEmail("twice@example.com");
    const second = await submitEmail("twice@example.com");

    // Both are accepted: telling the caller "you are already on the list"
    // would answer whether a given address has signed up.
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ ok: true });

    expect(await rowCount()).toBe(1);
  });

  it("treats case and surrounding whitespace as the same address", async () => {
    await submitEmail("Mixed.Case@Example.COM");
    await submitEmail("  mixed.case@example.com  ");

    expect(await rowCount()).toBe(1);
    const kept = await listWaitlistSignups();
    expect(kept.map((entry) => entry.email)).toEqual([
      "mixed.case@example.com",
    ]);
  });

  it("keeps the FIRST arrival time, not the latest", async () => {
    await submitEmail("early@example.com");
    const [afterFirst] = await listWaitlistSignups();

    await new Promise((resolve) => setTimeout(resolve, 25));
    await submitEmail("early@example.com");
    const [afterSecond] = await listWaitlistSignups();

    expect(afterSecond.createdAt).toBe(afterFirst.createdAt);
  });
});

describe("the endpoint is not a hole for arbitrary content", () => {
  it("refuses a body carrying keys the page never sends, and stores nothing", async () => {
    const response = await submit(
      JSON.stringify({
        email: "relay@example.com",
        subject: "Buy now",
        to: "victim@example.com",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Enter a valid email address.",
    });
    expect(await rowCount()).toBe(0);
  });

  it("refuses something that is not an address", async () => {
    const response = await submitEmail("not-an-address");

    expect(response.status).toBe(400);
    expect(await rowCount()).toBe(0);
  });

  it("refuses a body that is not JSON", async () => {
    const response = await submit("email=someone@example.com");

    expect(response.status).toBe(400);
    expect(await rowCount()).toBe(0);
  });

  it("refuses a body past the size ceiling without parsing it", async () => {
    const oversized = JSON.stringify({
      email: `${"a".repeat(4000)}@example.com`,
    });
    const response = await submit(oversized);

    expect(response.status).toBe(413);
    expect(await rowCount()).toBe(0);
  });

  it("never echoes what was submitted back to the caller", async () => {
    const marker = "reflect-me-9f3a@example.com";
    const response = await submit(
      JSON.stringify({ email: marker, note: marker }),
    );

    expect(await response.text()).not.toContain(marker);
  });
});

describe("the page's origin can read the answer", () => {
  it("names the landing origin instead of allowing every origin", async () => {
    const response = await submit(
      JSON.stringify({ email: "cors@example.com" }),
      {
        origin: "https://crate.ersaptaaristo.dev",
      },
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://crate.ersaptaaristo.dev",
    );
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("gives an unlisted origin no allow-origin header at all", async () => {
    const response = await submit(
      JSON.stringify({ email: "elsewhere@example.com" }),
      {
        origin: "https://not-our-landing.example",
      },
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
