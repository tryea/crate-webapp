import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  // Per-test budget (covers beforeEach). Default 30s isn't enough when several
  // parallel workers each trigger a cold Turbopack compile of /dashboard and
  // /users against the single `next dev` server — the first wave serializes on
  // those compiles. 90s absorbs that; warm routes finish in well under a second.
  timeout: 90_000,
  // The webServer runs `next dev`, which compiles each route lazily on first
  // request — the first navigation to /dashboard or /users can take ~10s while
  // Turbopack compiles it. The default 5s expect timeout fires before that
  // finishes, so navigation assertions flake. 30s absorbs cold compiles.
  // (Phase 8: switch the webServer to a prod build for deterministic timing.)
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://localhost:3010",
    trace: "on-first-retry",
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev -- --port 3010",
    url: "http://localhost:3010",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
