import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

declare global {
  var __cratePgClient: ReturnType<typeof postgres> | undefined;
}

/**
 * Build-time-safe URL fallback. postgres.js is lazy, it does not open a
 * connection on construction, only on first query. So providing a dummy
 * URL during `next build` (when env may be absent for route metadata
 * collection) is safe. The first real query against a dummy URL will fail
 * with a connection error, surfacing the misconfig at runtime.
 */
const FALLBACK_URL = "postgres://_unset:_unset@127.0.0.1:5432/_unset";

function makeClient() {
  const url = process.env.DATABASE_URL ?? FALLBACK_URL;

  // Per DEC-001 R2: on Supabase pooler, postgres.js must be configured with
  // `prepare: false` because the pooler runs in transaction mode and does not
  // support session-level prepared statements.
  const isPooler = url.includes(":6543") || url.includes(".pooler.");

  return postgres(url, {
    prepare: !isPooler,
    max: isPooler ? 1 : 10,
    idle_timeout: 20,
  });
}

const client = globalThis.__cratePgClient ?? makeClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__cratePgClient = client;
}

export const db = drizzle(client, { schema, logger: false });
export type DB = typeof db;
