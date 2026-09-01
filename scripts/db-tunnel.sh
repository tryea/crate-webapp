#!/usr/bin/env bash
# DEC-012: SSH tunnel to the VPS-hosted crate_dev Postgres.
#
# Maps local  localhost:5436  ->  portfolio-vps  ->  postgres-shared container
# (published on the VPS host's localhost:5434). The DB port is bound to
# 127.0.0.1 on the VPS, so it is never exposed to the public internet, the
# tunnel is the only way in.
#
# The tunnel MUST be running for `bun dev`, `db:migrate/seed/rls`, and the
# Playwright E2E suite to reach the database. Run this in a dedicated terminal
# (it blocks) or background it with `&`.
#
#   ./scripts/db-tunnel.sh
#
# Health: `pg_isready -h localhost -p 5436` (or just open the app).
set -euo pipefail

VPS_HOST="${CRATE_VPS_HOST:-portfolio-vps}"
LOCAL_PORT="${CRATE_DB_LOCAL_PORT:-5436}"
REMOTE_PORT="${CRATE_DB_REMOTE_PORT:-5434}"

echo "tunnel: localhost:${LOCAL_PORT} -> ${VPS_HOST} -> localhost:${REMOTE_PORT} (Ctrl-C to stop)"
exec ssh -N \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -L "${LOCAL_PORT}:localhost:${REMOTE_PORT}" \
  "${VPS_HOST}"
