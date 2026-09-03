# scripts

## Running the DB-gated E2E specs

The journey specs mutate data. They must never run against the database behind
`crate.ersaptaaristo.dev`, which is the live demo linked from the Upwork
profile. `.env.local` currently points at exactly that database, so running the
seed with the ambient environment truncates the demo.

Two terminals:

```bash
# 1. tunnel to the VPS Postgres, blocks
./scripts/db-tunnel.sh

# 2. provision the isolated test DB, then migrate + seed + RLS
./scripts/e2e-db.sh

# 3. run the specs against it
set -a; . ./.env.e2e; set +a
SKIP_DB_E2E=0 E2E_PROD=1 bunx playwright test --workers=1
```

### What each piece is for

- **`db-tunnel.sh`** maps `localhost:5436` to the `postgres-shared` container on
  `portfolio-vps`, which binds `127.0.0.1` and is never publicly reachable.
- **`e2e-db.sh`** drops and recreates `crate_dev`, owned by a non-superuser
  `crate_dev` role with `BYPASSRLS`, then runs migrate, seed and RLS **in that
  order**. Any other order fails: `FORCE ROW LEVEL SECURITY` is on before the
  seed tries to `TRUNCATE`.
- **`.env.e2e`** is written by `e2e-db.sh` and covered by the `.env*` ignore
  rule. `.env.local` is never modified: these values are exported into the
  environment, and process env wins over dotenv. Losing `.env.e2e` costs
  nothing, re-run `e2e-db.sh` and it regenerates the password and the database.

### Things that will bite

- **`SKIP_DB_E2E=0` is not optional.** Without it the setup and journeys
  projects are never registered, the heavy specs are skipped silently, and the
  run looks green. `bunx playwright test --list` answers 25 tests in 17 files
  with the flag and 11 in 7 without it.
- **`E2E_PROD=1` is needed here.** `next dev` dies with EPERM on this machine,
  so the harness serves a production build instead.
- **A worktree has no `.env.local`.** The `.env*` ignore rule keeps it out, so
  BetterAuth falls back to its default secret and refuses to boot. `.env.e2e`
  carries a test-only secret for that reason; the production secret is never
  copied into it.
- **Delete `.next` between a build and an E2E run** in the same directory, or
  the dev server inherits build artefacts and specs fail at random.
- **One E2E run per machine.** The Playwright port is fixed; a second run kills
  the first one's server.

### Proving the demo is untouched

Before and after, from the server side, never through the app:

```bash
ssh portfolio-vps "docker exec postgres-shared psql -U postgres -d crate -tAc \
  \"SELECT count(*), max(created_at) FROM public.stock_movements\""
# 55 | 2026-08-12 16:35:00+00
```

`E2E-` prefixed rows must appear in `crate_dev` and never in `crate`.
