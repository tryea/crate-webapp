# RLS Policies (Phase: Architectural pivot, 2026-05-29)

Crate uses Row-Level Security as a defense-in-depth layer behind the
existing application checks (proxy → layout → requireRole → SQL FK +
unique). The principle: even if a future refactor accidentally drops a
`requireRole` call, RLS at the row level prevents data leakage.

## Two-role connection model

| Role         | URL env                | Purpose                          | Bypasses RLS? |
|--------------|------------------------|----------------------------------|---------------|
| `postgres`   | `DATABASE_URL_DIRECT`  | drizzle-kit migrations           | YES (superuser) |
| `app_user`   | `DATABASE_URL`         | Next.js runtime queries          | NO            |

The split is the COUNCIL.md / apply-to-upwork v1.4.1 amendment:
superusers always bypass RLS, even with `FORCE ROW LEVEL SECURITY`.

## Per-request user binding (Phase 8 follow-up)

For policies to be user-aware, every request must set a session-level
GUC before the first query:

```ts
await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
await tx.execute(sql`SELECT set_config('app.current_user_role', ${role}, true)`);
```

Policies then reference these via `current_setting('app.current_user_id', true)`.

The current DB client is a single shared connection pool, so the GUC
binding requires either (a) per-request transactions or (b) connection
pinning per-request via `postgres.js` `reserve()`. This is a Phase 8
hardening task — wiring noted in `src/shared/lib/auth/session-binding.ts`
(to be added).

## Files in this directory

- `0001_enable_rls.sql` — turn on RLS for sensitive tables (audit_log,
  user, session, account, verification). Applied via `bun run db:rls`.
- `0002_baseline_policies.sql` — initial policies (all currently
  permissive for the app_user — restrictive policies arrive once
  per-request user binding is wired in Phase 8).

## Why ship policy stubs now

Per the user directive (2026-05-29): "must use postgres include RLS".
Even though the per-request user-context binding lands in Phase 8, the
SQL infrastructure (ENABLE RLS, FORCE, baseline policies) lands now
so the migration trail records the intent + the app_user role exists
to bind against later.
