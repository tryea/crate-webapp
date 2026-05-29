import { defineConfig, devices } from "@playwright/test";

// DEC-010 — harness modes.
//  - useDb: SKIP_DB_E2E=0 → seeded local DB present. Adds the `setup` project
//    (per-role storageState sign-in) + the `journeys` project. Default runs keep
//    exactly the existing 5 specs against `next dev` — no regression.
//  - prodBuild: E2E_PROD=1 → serve a precompiled production build for
//    deterministic timing (no Turbopack cold compile), so we can run tight
//    timeouts. Default stays `next dev` (wide timeouts) for fast feedback.
const useDb = process.env.SKIP_DB_E2E === "0";
const prodBuild = process.env.E2E_PROD === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  // Prod build serves precompiled routes → deterministic timing, tight budgets.
  // `next dev` lazily compiles each route on first hit (~10s), so dev keeps the
  // wide budgets that absorb cold compiles.
  timeout: prodBuild ? 30_000 : 90_000,
  expect: { timeout: prodBuild ? 10_000 : 30_000 },
  use: {
    baseURL: "http://localhost:3010",
    trace: "on-first-retry",
    navigationTimeout: prodBuild ? 15_000 : 30_000,
  },
  projects: [
    // DEC-010: sign in once per role → storageState. Only with a seeded DB.
    // Emits playwright/.auth/<role>.json (gitignored, regenerated every run).
    ...(useDb ? [{ name: "setup", testMatch: /auth\.setup\.ts/ }] : []),
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Existing specs self-manage login (or need none); journey specs run in
      // the dedicated `journeys` project so they can reuse a role session.
      testIgnore: /\.journey\.spec\.ts/,
    },
    // Critical-journey specs (DB-gated): reuse a role session via per-spec
    // `test.use({ storageState: authFile("manager") })`. Depend on `setup`.
    ...(useDb
      ? [
          {
            name: "journeys",
            testMatch: /\.journey\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
            dependencies: ["setup"],
          },
        ]
      : []),
  ],
  webServer: {
    command: prodBuild
      ? "bun run build && bun run start -- --port 3010"
      : "bun run dev -- --port 3010",
    url: "http://localhost:3010",
    // Reuse a warm local server (kills repeated cold starts); CI starts fresh.
    reuseExistingServer: !process.env.CI,
    timeout: prodBuild ? 240_000 : 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
