# Crate — Inventory Management System

A production-grade IMS — not a CRUD toy. Real transactional stock integrity:
append-only movements, atomic transfers, no negative stock, optimistic
locking, audit log.

## Stack

- **Runtime:** Bun
- **Framework:** Next.js 16 (App Router) · React 19 · TypeScript
- **Architecture:** Feature-Sliced Design (FSD) under `src/`
- **State:** TanStack Query (server) · Zustand (UI) · React Hook Form +
  zodResolver (forms) · URL search params (shareable view state)
- **Validation:** Zod 4 (single source of truth for runtime + types)
- **UI:** Tailwind v4 (`@theme` tokens) · shadcn/ui (base-nova / neutral
  oklch) · lucide-react
- **Data grids:** TanStack Table 8
- **CMS:** Storyblok (content/images — pending DEC-001 confirmation)
- **DB:** TBD by DEC-001 (proposed: Supabase Postgres + Drizzle)
- **Tests:** Jest 30 (unit/integration) · Playwright 1.60 (E2E)

## Quick start

```bash
# 1. Install deps
bun install

# 2. Copy env and fill in (see .env.example)
cp .env.example .env.local

# 3. Run dev
bun run dev                # http://localhost:3000

# 4. Quality gates
bun run typecheck          # tsc --noEmit
bun run lint               # eslint
bun run test               # jest
bun run test:e2e           # playwright (uses port 3010 to avoid collisions)
bun run build              # production build
bun run format             # prettier write
```

## Project structure

Final FSD layout is locked in **DEC-002** (Phase 1 of the build plan). For
now, `src/app/` holds routing only; feature slices land under `src/` per the
[Council Constitution](../docs/COUNCIL.md) §4.1.

## How this repo is built

This project is built by a 5-voice **Council** (Architect, Designer,
Engineer, QA, Red Team) following a strict deliberation protocol at every
`[DECISION]` task. See:

- [`docs/COUNCIL.md`](../docs/COUNCIL.md) — The Constitution (read-only mandate)
- [`docs/PROGRESS.md`](../docs/PROGRESS.md) — The loop ledger (phase plan + decision log)
- [`docs/decisions/`](../docs/) — Per-decision records (DEC-00X)
- [`docs/setup/`](../docs/setup/) — Setup notes + verified stack versions
