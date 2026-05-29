/**
 * Apply the RLS .sql files in src/db/rls/ in lexicographic order.
 * Runs AFTER `drizzle-kit migrate` because RLS targets tables that must
 * already exist.
 *
 * Uses DATABASE_URL_DIRECT (superuser) — RLS is configured by the
 * owner, not by app_user.
 *
 * Idempotent-ish: ALTER TABLE ... ENABLE ROW LEVEL SECURITY is safe to
 * re-run; CREATE POLICY is NOT (errors on existing policy name). For
 * dev, drop the DB and start over via the docker volume reset.
 *
 * Usage: `bun run db:rls`
 */
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL_DIRECT) {
  throw new Error(
    "DATABASE_URL_DIRECT is required to apply RLS (must connect as superuser).",
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "rls");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.log("No .sql files in src/db/rls/.");
  process.exit(0);
}

const sql = postgres(process.env.DATABASE_URL_DIRECT, { max: 1 });

try {
  for (const file of files) {
    const path = join(dir, file);
    const body = readFileSync(path, "utf8");
    console.log(`⟶ ${file}…`);
    await sql.unsafe(body);
    console.log(`  ok`);
  }
  console.log("⟶ RLS applied.");
} catch (err) {
  console.error("RLS apply failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
