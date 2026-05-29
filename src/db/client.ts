import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

declare global {
  var __cratePgClient: ReturnType<typeof postgres> | undefined;
}

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required at runtime (Supabase pooler URL on :6543, or local docker Postgres).",
    );
  }

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
