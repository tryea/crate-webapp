#!/usr/bin/env bash
# Provision (or re-provision) the isolated test database the journey specs run
# against, then migrate + seed + apply RLS.
#
#   ./scripts/e2e-db.sh
#
# WHY THIS EXISTS
# ---------------
# DEC-012 created a VPS-hosted `crate_dev` database so dev and E2E never touch
# the live demo. That database and its role were later removed, and .env.local
# was pointed back at `crate`, which IS the live demo linked from the Upwork
# profile. In that state `bun run db:seed` truncates the demo, and every
# journey spec is unrunnable because the database it names is gone.
#
# HOW IT REACHES POSTGRES
# -----------------------
# `postgres-shared` is a container on portfolio-vps bound to 127.0.0.1:5434, so
# it is never on the public internet. Two paths are used, on purpose:
#   - admin work (CREATE ROLE / CREATE DATABASE) goes over ssh + `docker exec`,
#     because the container's `postgres` superuser is reachable that way without
#     a password ever crossing a command line;
#   - the app, drizzle and Playwright reach it through the SSH tunnel that
#     ./scripts/db-tunnel.sh opens on localhost:5436.
#
# SECRETS
# -------
# The password is generated once and written to .env.e2e, which the .env* rule
# in .gitignore already covers. It is passed to psql over STDIN, never as an
# argument, so it does not appear in `ps` on either machine. Nothing here prints
# it. .env.local is NOT modified: the E2E commands export their own values, and
# process env wins over dotenv.
set -euo pipefail

VPS="${CRATE_VPS_HOST:-portfolio-vps}"
CONTAINER="${CRATE_PG_CONTAINER:-postgres-shared}"
DB="${CRATE_TEST_DB:-crate_dev}"
ROLE="${CRATE_TEST_ROLE:-crate_dev}"
PORT="${CRATE_DB_LOCAL_PORT:-5436}"
ENV_FILE=".env.e2e"
E2E_PORT="${CRATE_E2E_PORT:-3010}"

if [ "$DB" = "crate" ] || [ "$ROLE" = "crate_app_user" ]; then
  echo "refusing: $DB / $ROLE is the live demo" >&2
  exit 1
fi

# --- 1. password: reuse the one on disk, or make one and keep it --------------
if [ -f "$ENV_FILE" ] && grep -q '^CRATE_TEST_PASSWORD=' "$ENV_FILE"; then
  PW="$(grep '^CRATE_TEST_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  echo "password: reusing the one already in $ENV_FILE"
else
  # openssl, not tr|head: head closes the pipe, tr takes SIGPIPE, and
  # `set -o pipefail` then kills the script with 141 before anything runs.
  PW="$(openssl rand -hex 20)"
  echo "password: generated a new one (${#PW} chars) and wrote $ENV_FILE"
fi

cat > "$ENV_FILE" <<EOF
# Written by scripts/e2e-db.sh. Gitignored by the .env* rule. Never commit.
# Used ONLY by the E2E commands below; .env.local keeps pointing at the demo.
CRATE_TEST_PASSWORD=$PW
DATABASE_URL=postgresql://$ROLE:$PW@localhost:$PORT/$DB
DATABASE_URL_DIRECT=postgresql://$ROLE:$PW@localhost:$PORT/$DB
# A worktree has no .env.local: the .env* ignore rule keeps it out, so nothing
# supplies these and BetterAuth falls back to its default secret and refuses to
# boot. This is a TEST secret on purpose, the same shape CI uses; the
# production one stays where it is and is never copied here.
BETTER_AUTH_SECRET=e2e-local-fixed-secret-32-bytes-ok
BETTER_AUTH_URL=http://localhost:$E2E_PORT
NEXT_PUBLIC_APP_URL=http://localhost:$E2E_PORT
NEXT_PUBLIC_APP_NAME=Crate
EOF
chmod 600 "$ENV_FILE"

# --- 2. role + database, over ssh, password via stdin -------------------------
echo "role: ensuring $ROLE exists"
{
  printf 'DO $do$\nBEGIN\n'
  printf "  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '%s') THEN\n" "$ROLE"
  printf "    EXECUTE format('ALTER ROLE %s LOGIN BYPASSRLS PASSWORD %%L', '%s');\n" "$ROLE" "$PW"
  printf '  ELSE\n'
  printf "    EXECUTE format('CREATE ROLE %s LOGIN BYPASSRLS PASSWORD %%L', '%s');\n" "$ROLE" "$PW"
  printf '  END IF;\nEND\n$do$;\n'
} | ssh -o ConnectTimeout=20 "$VPS" \
  "docker exec -i $CONTAINER psql -U postgres -v ON_ERROR_STOP=1 -q"

# Dropped and recreated every run, not reused. `db:rls` runs CREATE POLICY,
# which is not idempotent (src/db/rls/README.md says so), so a reused database
# makes the second run die on "policy already exists". A throwaway database
# that is not actually thrown away is a trap for whoever runs this next.
if [ "$DB" = "crate" ]; then
  echo "refusing to drop the live demo" >&2
  exit 1
fi
echo "database: dropping and recreating $DB"
printf 'DROP DATABASE IF EXISTS %s WITH (FORCE);\nCREATE DATABASE %s OWNER %s;\n' "$DB" "$DB" "$ROLE" |
  ssh -o ConnectTimeout=20 "$VPS" \
    "docker exec -i $CONTAINER psql -U postgres -v ON_ERROR_STOP=1 -q"

# The seed truncates, so the role needs full rights on its own schema.
printf 'GRANT ALL ON SCHEMA public TO %s;\nALTER SCHEMA public OWNER TO %s;\n' "$ROLE" "$ROLE" |
  ssh -o ConnectTimeout=20 "$VPS" \
    "docker exec -i $CONTAINER psql -U postgres -v ON_ERROR_STOP=1 -q -d $DB"

# --- 3. schema, data, policies. ORDER MATTERS --------------------------------
# migrate, seed, THEN rls. The other order fails: FORCE ROW LEVEL SECURITY is
# already on when the seed tries to TRUNCATE.
echo "tunnel: $(pg_isready -h localhost -p "$PORT" >/dev/null 2>&1 && echo up || echo 'DOWN, run ./scripts/db-tunnel.sh first')"
set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

bun run db:migrate
bun run db:seed
bun run db:rls

echo
echo "ready. Run one journey spec with:"
echo "  set -a; . ./$ENV_FILE; set +a"
echo "  SKIP_DB_E2E=0 E2E_PROD=1 bunx playwright test catalog.journey --workers=1"
