# Crate — Inventory Management System

[![CI](https://github.com/tryea/crate-webapp/actions/workflows/ci.yml/badge.svg)](https://github.com/tryea/crate-webapp/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/jest-90%2F90-success?logo=jest)](https://github.com/tryea/crate-webapp/actions/workflows/ci.yml)
[![Council](https://img.shields.io/badge/built%20by-5%2Dvoice%20Council-blueviolet)](https://github.com/tryea/crate-webapp/blob/main/.github/issues-template.md)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

A production-grade IMS — not a CRUD toy. Real transactional stock
integrity: append-only movements, atomic transfers, no negative stock
(unless backorder is explicitly toggled), SQL-level RLS, audit log.

**Live demo:** `https://app.crate.ersaptaaristo.dev` (deployed via Coolify; see [setup doc](../docs/setup/03-coolify-deploy.md))
**Marketing surface:** `https://crate.ersaptaaristo.dev` (Astro, separate repo per [DEC-005](../docs/decisions/DEC-005-github-workflow-and-deployment.md))

---

## What's inside

- **Catalog CRUD** — products, categories, suppliers, warehouses + locations. Bulk CSV import (papaparse + per-row Zod + per-row error report).
- **Inventory core** — Stock In / Out / Transfer (atomic two-sided) / Adjustment. **34 Jest specs** prove the math; **row locks + checkDecrementAllowed** prove the concurrency.
- **Purchase orders** — draft → sent → partial → received state machine. Per-line receive in a single transaction. DB-level CHECK constraints + sentinel-error → field-level UX.
- **Perpetual weighted-average cost valuation** — `16 Jest specs` prove it; dashboard surfaces the live total.
- **Audit log** — every protected mutation appended in the same tx as the action. Read-only `/audit` view with virtualized DataTable + CSV export.
- **Settings** — admin backorder toggle, wired through stockOut/Transfer/Adjustment in real time.
- **Reports** — stock-on-hand, valuation, low-stock — all CSV-exportable.

## Architecture highlights

- **FSD (Feature-Sliced Design)** under `src/`, enforced by `eslint-plugin-boundaries` with a 7-element direction matrix. Lint fails any upward import.
- **Defense in depth** — `proxy.ts` (edge) → `(protected)/layout.tsx` (server) → page-level `requireRole(...)` → action-level `requireRole(...)` → Zod re-parse → SQL CHECK + FK + RLS.
- **CI grep guardrail** — `scripts/check-auth-guards.sh` fails any `route.ts` / `actions.ts` that omits a `requireRole(...)` call. **8 handlers scanned, all guarded** as of the latest CI run.
- **Two-role Postgres** — `postgres` (superuser, migrations only) + `app_user` (non-superuser, runtime). RLS policies fire on app_user; superuser bypasses by design.

## Stack

- **Runtime:** [Bun](https://bun.sh) 1.3
- **Framework:** [Next.js 16](https://nextjs.org) (App Router · Turbopack · standalone build) · React 19 · TypeScript
- **Architecture:** Feature-Sliced Design under `src/`
- **State:** TanStack Query (server) · Zustand (UI) · React Hook Form + zodResolver (forms) · URL search params (shareable view state)
- **Validation:** Zod 4 (single source of truth for runtime + types)
- **UI:** Tailwind v4 (`@theme` tokens) · shadcn/ui (base-nova / neutral oklch) · lucide-react · Recharts
- **Data grids:** TanStack Table 8 + TanStack Virtual
- **DB:** Postgres 16 (independent docker-compose) · Drizzle ORM · drizzle-zod · drizzle-kit · postgres.js
- **Auth:** [BetterAuth](https://better-auth.com) + Drizzle adapter
- **CSV:** PapaParse (RFC 4180)
- **Tests:** Jest 30 (unit) · Playwright 1.60 (E2E)

## Quick start (local)

```bash
# 1. Boot the INDEPENDENT Postgres stack (lives outside this dir)
cd ../infra/postgres && docker compose up -d

# 2. Inside this dir
cd ../../crate-webapp
bun install
cp .env.example .env.local      # fill in DATABASE_URL + DATABASE_URL_DIRECT
bun run db:migrate              # Drizzle migrations as superuser
bun run db:rls                  # apply RLS policies
bun run db:seed                 # dev only (refuses if NODE_ENV=production)

# 3. Run dev
bun run dev                     # http://localhost:3000
```

## Quality gates (matches CI)

```bash
bun run typecheck               # tsc --noEmit
bun run lint                    # eslint + FSD boundaries
bun run test                    # jest — 90 specs
bun run test:e2e                # playwright — 4 pass + 3 RBAC (skip unless SKIP_DB_E2E=0)
bun run build                   # production build (standalone)
bun run check:auth-guards       # grep-level requireRole check
```

## How this repo is built

This project is built by a 5-voice **Council** (Architect, Designer,
Engineer, QA, Red Team) following a strict deliberation protocol at every
`[DECISION]` task. Issue-driven development per **DEC-005** — every
GitHub issue references its parent Decision Record.

- [`docs/COUNCIL.md`](../docs/COUNCIL.md) — The Constitution (read-only mandate)
- [`docs/PROGRESS.md`](../docs/PROGRESS.md) — The loop ledger (phase plan + decision log)
- [`docs/decisions/`](../docs/decisions/) — Per-decision records (DEC-001 .. DEC-005)
- [`docs/council/`](../docs/council/) — Full deliberation transcripts
- [`docs/design/`](../docs/design/) — UI direction locks + token system + DataTable API
- [`docs/setup/`](../docs/setup/) — Setup notes + Docker + Coolify deploy guide
- [`docs/issues/`](../docs/issues/) — GitHub issue drafts (audit trail outside the GH timeline)

## License

MIT — see [LICENSE](./LICENSE).
