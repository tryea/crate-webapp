import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load env from .env.local first (Next.js convention), fall back to .env.
config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL_DIRECT) {
  throw new Error(
    "DATABASE_URL_DIRECT is required for drizzle-kit migrations (Supabase direct port 5432, not the pooler).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT,
  },
  strict: true,
  verbose: true,
});
