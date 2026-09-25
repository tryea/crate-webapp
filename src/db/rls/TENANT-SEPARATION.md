# Tenant separation: what it costs (FR-29 survey)

Read-only survey. It exists so that the estimate for FR-29 is written against
measured facts instead of a guess.

**Status, 25 September 2026.** This was written when nothing in it had been
built. Two items have since landed, and the body below is left exactly as it
was measured on 24 September, because rewriting it would erase the before
picture the work is being judged against. What is no longer true:

- Item 2, bind the read path: landed. `withReadContext`
  (`src/shared/lib/auth/read-context.ts`) binds all 23 read functions and the 5
  pages that queried directly, and refuses an unbound read rather than
  returning it empty. §3 below describes the state before that.
- Item 3, the owner column and the composite unique indexes: landed in
  `src/db/migrations/0005_company_ownership.sql`. All ten domain tables now
  carry a NOT NULL `company_id`, every row that predated the column is
  backfilled to the single company, and the four indexes §2 calls global are
  `(company_id, ...)`. The table in §2 that reads "Owner column: none" is the
  before picture. `src/db/__tests__/tenant-ownership.test.ts` holds both halves.

Still exactly as written below: items 1, 4, 5, 6, 8 and 9. Item 7's SQL half is
partly covered by the test named above, the two-account Playwright spec is not
written.

Measured 24 September 2026 against `main` at `09a3615`. Every claim below cites
a file and a line. Where a fact could not be measured from this machine, it says
so instead of guessing.

## The short version

The app is single tenant by construction, and the construction is deeper than a
loose policy list suggests. Ten domain tables carry no owner column. Eight of
them have row level security switched off entirely. Four unique indexes are
global, so two companies could not both stock a SKU named `A-100`. One settings
table has a single row per installation, so the backorder switch is shared.

The largest piece of work is none of those. It is that **every read in the app
runs without a database identity**, and the policy convention already in the
repo treats a query with no identity as allowed. A tenant policy written in the
existing style would therefore be enforced on writes and ignored on all
nineteen screens.

## 1. What is a tenant here?

**A tenant is the installation. The app has no concept smaller than itself.**

The only axis of authority in the code is a role, not a membership:

- `src/shared/lib/auth/require-role.ts:6` declares the whole vocabulary:
  `export type Role = "admin" | "manager" | "staff"`.
- `src/shared/lib/auth/require-role.ts:8-12` ranks those three. There is no
  fourth dimension, nothing that answers "which company".
- `src/shared/lib/auth/server.ts:25-47` configures Better Auth with email and
  password and one additional field, `role`. No organization plugin, no team,
  no membership table.
- `src/db/schema/_auth.ts:4-16`: `user` has id, name, email, emailVerified,
  image, timestamps, role. No foreign key to anything that could be an owner.

The app already uses a word for the boundary, and it uses it to mean the whole
installation:

- `src/app/(protected)/users/page.tsx:17`: "Everyone with access to this
  workspace and the role that scopes what ...".
- `src/app/(protected)/users/_components/users-table.tsx:110`: "Accounts that
  can sign in to this workspace will appear here."
- `src/shared/lib/auth/sign-up-gate.ts:6-8` states the consequence in the
  clearest sentence in the repo: "A stranger who signs up does not get an empty
  workspace, they get a seat at the client's table."

So the app's own assumption is: one workspace, and membership in it means having
a row in `user` at all. `listUsersServer` proves it operationally, it selects
every account with no filter at all (`src/entities/user/api/server.ts:23-36`).

**Warning about `account`.** The schema does contain an `account_id`, and it is
not a tenant. `src/db/schema/_auth.ts:37-59` is Better Auth's credential row:
it carries `provider_id`, `password`, `access_token`, `refresh_token`. One human
with a password has one such row. Treating it as a tenant key would bind every
domain row to a password record.

**The product decision this leaves open.** "Company with members" and "personal
workspace per user" are both consistent with what exists today, because nothing
in the code distinguishes them yet. The code leans toward company: roles are
`admin`, `manager`, `staff`, which are job titles inside one business, and the
Users screen is an admin roster rather than an invite flow. That leaning is not
the same as a decision, and the decision changes every foreign key that follows.
It belongs to Sapta, not to this survey.

## 2. How does a row learn its owner?

**No row can today. There is no column to put an owner in, on any domain table.**

The ten domain tables and where they are defined:

| Table | Definition | Owner column |
|---|---|---|
| `categories` | `src/db/schema/catalog.ts:13` | none |
| `suppliers` | `src/db/schema/catalog.ts:27` | none |
| `warehouses` | `src/db/schema/warehouses.ts:9` | none |
| `locations` | `src/db/schema/warehouses.ts:24` | none (inherits via `warehouse_id`) |
| `products` | `src/db/schema/products.ts:13` | none |
| `stock_movements` | `src/db/schema/movements.ts:64` | none |
| `purchase_orders` | `src/db/schema/purchase-orders.ts:28` | none |
| `po_lines` | `src/db/schema/purchase-orders.ts:56` | none (inherits via `po_id`) |
| `audit_log` | `src/db/schema/audit.ts:23` | none |
| `settings` | `src/db/schema/settings.ts:13` | none, and see below |

Three columns point at a user, and none of them is ownership:

- `stock_movements.created_by` (`src/db/schema/movements.ts:81-83`)
- `purchase_orders.created_by` (`src/db/schema/purchase-orders.ts:43-45`)
- `audit_log.user_id` (`src/db/schema/audit.ts:27-29`)

All three are nullable with `on delete set null`. They record who did something,
not who owns it, and a nullable column cannot carry a policy: delete the user
and the row becomes ownerless rather than protected.

### Backfill is cheap. The unique indexes are not.

Backfill is the easy half. `src/db/seed.ts:98` wipes and rebuilds one dataset,
so every row that exists today belongs to one implicit tenant. The backfill is
`UPDATE <table> SET tenant_id = '<first tenant>'` with a constant, per table,
then `SET NOT NULL`. No join, no ambiguity, no rows left undecided.

The expensive half is uniqueness. Four indexes are global today and each one
silently forbids a second tenant from using a value the first tenant used:

- `products_sku_idx` on `sku` (`src/db/schema/products.ts:39`)
- `warehouses_code_idx` on `code` (`src/db/schema/warehouses.ts:18`)
- `categories_slug_idx` on `slug` (`src/db/schema/catalog.ts:24`)
- `po_number_idx` on `po_number` (`src/db/schema/purchase-orders.ts:48`)

Each has to become `(tenant_id, <column>)`. That is not a cosmetic change: the
CSV importer upserts on SKU, so its conflict target moves with the index
(`src/entities/product/api/actions.ts:284` is the batch write), and
`nextPoNumberServer` (`src/entities/purchase-order/api/server.ts:91`) derives
the next PO number from the existing set and would otherwise number every
tenant's orders from a shared sequence.

`locations_warehouse_code_idx` (`src/db/schema/warehouses.ts:36`) is already
scoped through `warehouse_id`, so it needs the tenant column for the policy but
not for correctness.

### `settings` is a special case worth naming early

`src/db/schema/settings.ts:13-19` makes `key` the primary key: one row per
config domain for the whole installation. The backorder switch that FR-04 is
built on lives in that single row. Per tenant settings means a composite key
`(tenant_id, key)` and a change to the only reader,
`getStockSettingsServer` (`src/entities/settings/api/server.ts:20-32`), which
today looks up `eq(settings.key, STOCK_SETTINGS_KEY)` with nothing else.

## 3. How does a policy know who is asking?

**Explicit statement, because the ticket asks for one: yes, the app sets a
database session identity, but only on writes. Every read runs unbound.**

The mechanism exists and is real. `withUserContext`
(`src/shared/lib/auth/session-binding.ts:38-52`) opens a transaction and sets
two transaction local GUCs before running the caller's work:

```ts
SELECT set_config('app.current_user_id', $1, true)
SELECT set_config('app.current_user_role', $2, true)
```

Transaction local is the right choice and the comment at
`src/shared/lib/auth/session-binding.ts:17-20` says why: the GUC resets on
commit, so a pooled connection never leaks one request's identity into the next.
That matters because the client is a shared pool of up to ten connections
(`src/db/client.ts:26-30`).

It is used on 32 call sites, and every one of them is a write path in an
entity's `api/actions.ts`:

| File | Call sites |
|---|---|
| `src/entities/warehouse/api/actions.ts` | 8 |
| `src/entities/product/api/actions.ts` | 6 |
| `src/entities/purchase-order/api/actions.ts` | 5 |
| `src/entities/category/api/actions.ts` | 4 |
| `src/entities/stock-movement/api/actions.ts` | 4 |
| `src/entities/supplier/api/actions.ts` | 4 |
| `src/entities/settings/api/actions.ts` | 1 |

Zero read paths bind. All 23 exported read functions across the nine
`api/server.ts` files query the bare `db` handle, for example
`src/entities/product/api/server.ts:7`, `src/entities/category/api/server.ts:7`,
`src/entities/user/api/server.ts:23`, `src/entities/audit-log/api/server.ts:18`
and all eight functions in `src/entities/stock-movement/api/server.ts`.

Five files under `src/app` skip the entity layer and query the database straight
from the page, so they are unbound too and are easy to miss when auditing only
`src/entities`:

- `src/app/(protected)/reports/page.tsx:24`
- `src/app/(protected)/orders/page.tsx:12`
- `src/app/(protected)/orders/[id]/page.tsx:43`
- `src/app/(protected)/movements/new/stock-in/page.tsx:12`
- `src/app/(protected)/movements/new/_lib/movement-form-data.ts:12`

### This is deliberate, which is why it is the big piece of work

Two places state the unbound read convention on purpose:

- `scripts/check-auth-guards.sh:64`, in the CI gate itself: "Reads
  (`db.select`) stay allowed unbound, list pages don't need binding." The gate
  fails an unbound *write*, it permits an unbound read by design.
- `src/db/rls/0003_user_aware_policies.sql:11-17` defines the contract:
  unbound queries keep working, bound queries are restricted. Every USING clause
  in that file opens with `current_setting('app.current_user_id', true) IS NULL
  OR ... = ''`, which reads as "allow when nobody is asking".

Put those together and the consequence is the sharpest fact in this survey:

- Write a tenant policy in the existing style, and every read in the app is
  exempt from it. Separation holds for writes, and all nineteen screens still
  show every tenant's rows. The feature would look built and would not be.
- Flip the convention to deny when unbound, and every screen goes blank instead,
  because the reads have no identity to be allowed by.

Either way the read path has to be bound first. That is the largest single item
in FR-29, larger than the columns and larger than the policies.

Two constraints on how it can be bound:

1. The only binding mechanism in the repo is a transaction, because a GUC on a
   pooled connection is only safe transaction local
   (`src/shared/lib/auth/session-binding.ts:16-20`). Binding reads means every
   read becomes a transaction. `postgres.js` `reserve()` is the alternative the
   RLS README raised (`src/db/rls/README.md:30-34`) and it is not used anywhere
   in the code today.
2. Deny when unbound cannot be applied blindly to the auth tables. Better Auth
   runs on the same `app_user` connection and must read `user` before any
   identity exists (`src/db/rls/0003_user_aware_policies.sql:6-9`). For the ten
   domain tables the objection does not apply, Better Auth never touches them,
   so deny when unbound is available there and nowhere else.

### One stale premise found on the way

The FR-29 note in `frd/cpp` says six policies read `using (true)` and that four
of them are auth tables. In the repo's SQL that describes the state after
`0002_baseline_policies.sql` and before `0003_user_aware_policies.sql`, which
drops all four auth `_rw_all` policies (`src/db/rls/0003_user_aware_policies.sql:39,
81, 122, 166`) and replaces them with restrict when bound versions.
`src/db/apply-rls.ts:32-34` applies every `.sql` file in the folder in sorted
order, so a database built by `bun run db:rls` has 0003 in it.

This does not change the conclusion. The eight domain tables with no RLS at all
are still eight, and `audit_log` and `stock_movements` still read `using (true)`
(`src/db/rls/0002_baseline_policies.sql:9-23`). It only means the auth half is
in better shape than the note implies.

## 4. What breaks when a policy narrows

Every screen listed below reads across all rows today. The column on the right
is what happens the moment a tenant policy exists and the read is still unbound:
with allow when unbound the screen keeps showing every tenant, with deny when
unbound it shows nothing.

| Screen | Reads | Breaks because |
|---|---|---|
| `/dashboard` | `listWarehousesServer`, `listLowStockProductsServer`, `listRecentMovementsServer`, `getValuationServer`, `listProductsServer` (`src/app/(protected)/dashboard/page.tsx:86-94`) | Five unscoped reads; valuation sums the entire ledger |
| `/reports` | `getAllStockLevelsServer`, `getValuationServer`, `listLowStockProductsServer`, plus two direct queries (`src/app/(protected)/reports/page.tsx:20-41`) | Feeds all three CSV exports (FR-09) |
| `/movements` | `listRecentMovementsServer({ limit: 500 })` (`src/app/(protected)/movements/page.tsx:18`) | Ledger list, joined to product and location |
| `/movements/new/stock-in` | direct `db.select` on products and locations (`src/app/(protected)/movements/new/stock-in/page.tsx:12-27`) | Dropdown would offer another tenant's products |
| `/movements/new/stock-out`, `/transfer`, `/adjustment` | `loadMovementFormData()` (`src/app/(protected)/movements/new/_lib/movement-form-data.ts:10-26`) | Same dropdowns, shared loader |
| `/catalog` | `listProductsServer`, `listCategoriesServer`, `listSuppliersServer` (`src/app/(protected)/catalog/page.tsx:10-12`) | Product table plus both filter lists |
| `/catalog/categories` | `listCategoriesServer` (`src/app/(protected)/catalog/categories/page.tsx:7`) | |
| `/catalog/suppliers` | `listSuppliersServer` (`src/app/(protected)/catalog/suppliers/page.tsx:7`) | |
| `/catalog/warehouses` | `listWarehousesServer` (`src/app/(protected)/catalog/warehouses/page.tsx:7`) | |
| `/catalog/warehouses/[id]` | `getWarehouseServer`, `listLocationsServer` (`src/app/(protected)/catalog/warehouses/[id]/page.tsx:20-21`) | Also an IDOR surface: the id comes from the URL and nothing checks ownership |
| `/catalog/import` | write path only, `importProducts` (`src/entities/product/api/actions.ts:284`) | Upsert conflict target is the global SKU index |
| `/orders` | `listPurchaseOrdersServer(500)` plus direct supplier and warehouse reads (`src/app/(protected)/orders/page.tsx:10-17`) | |
| `/orders/[id]` | `getPurchaseOrderServer` plus a direct product read (`src/app/(protected)/orders/[id]/page.tsx:41-53`) | Same IDOR surface as the warehouse detail page |
| `/audit` | `listAuditLogServer(1000)` (`src/app/(protected)/audit/page.tsx:7`) | Joins `audit_log` to `user`, so it crosses the domain and auth boundary in one query (`src/entities/audit-log/api/server.ts:18-32`) |
| `/settings` | `getStockSettingsServer` (`src/app/(protected)/settings/page.tsx:9`) | Single shared row, see section 2 |
| `/users` | `listUsersServer` (`src/app/(protected)/users/page.tsx:7`) | Lists every account in the installation with no filter |
| `/account` | session only (`src/app/(protected)/account/page.tsx:21`) | Does not break |

Two non-screen consumers break the same way and are easy to forget:

- `src/db/seed.ts` builds one unowned dataset and would need a tenant to build
  it into.
- `scripts/concurrency-check.ts` creates its own product and movements against a
  live database (`scripts/concurrency-check.ts:101`) and would need the same.

Two queries deserve a second look at implementation time because the tenant
filter cannot simply be appended:

- `listLowStockProductsServer` puts its warehouse filter inside the JOIN rather
  than the WHERE on purpose, so a product with zero movements still surfaces
  (`src/entities/stock-movement/api/server.ts:174-188`). A tenant predicate in
  the wrong clause there would silently hide exactly the most urgent rows.
- `getValuationServer` pulls every movement row and walks them in JS
  (`src/entities/stock-movement/api/server.ts:272-295`). It is correct and it is
  the query most sensitive to the row set changing underneath it.

## 5. How it would be proven

**Today nothing proves it.** Searching `src`, `e2e` and `scripts` for `rls`,
`current_setting`, `app_user` or "row level security" returns only the
implementation files themselves: `src/db/apply-rls.ts`,
`src/shared/lib/auth/session-binding.ts`, and one comment in
`src/db/schema/movements.ts`. There is no test. The strongest existing evidence
for the current policies is the manual psql transcript pasted into the header of
`src/db/rls/0003_user_aware_policies.sql:21-27`, run once by hand.

Jest is not the home for this proof. `jest.config.ts:7` sets
`testEnvironment: "jsdom"` and no suite in the repo opens a database connection.

The repo already owns the right pattern, and it should be copied rather than
invented. `scripts/concurrency-check.ts` is a standalone bun script that proves
the advisory lock is load bearing by running the real gate and a counterfactual
gate that is byte for byte the real one minus the single line under test, then
asserting the two disagree (`scripts/concurrency-check.ts:1-25` for the
contract, `41-54` for the counterfactual). The assertion is the difference, not
the absolute, which is exactly the shape Sapta's acceptance asks for.

Sketch, as a differential check in that mould:

- New script `scripts/tenant-separation-check.ts`, wired as
  `check:tenant` next to `check:concurrency` in `package.json:24`.
- Runs against a throwaway database, never the live `crate` database.
- Seed two tenants, A and B, each with one product, one warehouse, one location
  and a few movements, with the same SKU on both sides so a leak is unmistakable.
- Scenario A, policies in place: open a transaction bound as a user of tenant A
  and read all ten domain tables. Every count of B's rows is 0.
- Scenario B, counterfactual: the identical reads with the tenant policy dropped
  (or with the GUC left unset, whichever single change the implementation makes
  load bearing). B's rows are now visible, and the script asserts that they are.
  Scenario B passing is what makes scenario A mean something.
- Exit non-zero if either half disagrees, so it can join the CI chain.

The screen half of Sapta's sentence needs a second, smaller proof, because a
green SQL check says nothing about what a page renders: a Playwright spec with
two accounts that signs in as A, opens `/catalog`, and asserts B's SKU is absent.
It belongs in `e2e/` with `SKIP_DB_E2E=0`, next to the existing RBAC specs
(`e2e/auth-rbac-admin.spec.ts`, `e2e/auth-rbac-staff.spec.ts`).

## The work this uncovers

Listed for the PM to size and schedule. This survey does not open tickets and
none of these is started.

1. Decide what a tenant is. Product decision, Sapta's, not an engineering task.
   Blocks everything below.
2. Bind the read path. The 23 read functions plus the 5 pages that query
   directly. Largest item, and it is a prerequisite rather than a follow up.
3. Add the owner column to 10 domain tables plus the backfill, and rewrite the
   4 global unique indexes as composite ones.
4. Rework `settings` to a composite key, and its one reader.
5. Enable RLS on the 8 domain tables that have none, and write policies for all
   10.
6. Tenant creation and membership. Nothing exists today: no company table, no
   invite, no first-run flow. Without it a second tenant cannot come into
   existence even after everything above lands.
7. The differential proof from section 5, plus the two-account Playwright spec.
8. Update `scripts/check-auth-guards.sh:64` and `src/db/rls/README.md`, both of
   which currently document unbound reads as correct.
9. FR-30 removal, once and only once the above is proven:
   `src/shared/lib/auth/sign-up-gate.ts:23-24` already lists the three steps.

## The one measurement this survey could not take

Which policies the live database actually has. That needs credentials this
machine deliberately does not read, and the live `crate` database is the running
demo. Everything above is measured from the repo, which is the source the
migrations are applied from, not from `pg_catalog`.

Whoever has the credentials can settle it with one read-only query and paste the
result next to this file:

```sql
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname;
```
