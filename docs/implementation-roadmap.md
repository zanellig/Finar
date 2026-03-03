# Production Roadmap (First 10 PRs)

This roadmap covers every finding from the audit, with your requested priorities:

- Single-user installable app; **no auth work included**.
- `P0` correctness and route/service/repository separation are first.
- End-to-end type safety is the **last** phase.

## Delivery Rules

- Keep routes thin: parse/validate request, call service, map response.
- Put business rules in services, DB access in repositories.
- Every money mutation must be atomic and checked in-transaction.
- Multi-currency math must always go through one conversion module.
- Every PR adds tests for the behavior it changes.

## PR 1 (P0): Atomic Payment Engine + Card Settlement Fix

Goal: fix correctness bugs in `payments` and remove race-prone flow.

Files to add:

- `src/modules/payments/payment-service.ts`
- `src/modules/payments/payment-repository.ts`
- `src/modules/payments/payment-types.ts`
- `src/modules/shared/errors.ts`

Files to change:

- `src/api/payments.ts`
- `src/db/validation.ts`

Scope:

- Move validation + business logic out of route.
- Handle loan and credit-card payment branches in one transaction.
- For loan payments: decrement installments only when amount matches expected installment rule.
- For card payments: reduce unpaid card debt (`cc_spenditures`) deterministically.
- Re-check account balance and target state inside transaction.

Done when:

- Concurrent requests cannot overdraw below allowed limit.
- Loan installments cannot go negative.
- Card debt/available limit updates after payment.
- `bun test` has integration tests for these invariants.

## PR 2 (P0): Currency Domain Unification

Goal: stop ARS/USD mixed arithmetic.

Files to add:

- `src/modules/currency/money.ts`
- `src/modules/currency/rates-repository.ts`
- `src/modules/currency/convert.ts`

Files to change:

- `src/api/dashboard.ts`
- `src/api/credit-cards.ts`
- `src/api/payments.ts`
- `src/db/validation.ts`

Scope:

- Define base-currency output policy for aggregates (e.g., ARS).
- Convert balances/debts/limits before summing.
- Add “missing rate” domain error and fail safely instead of silent bad totals.
- Document conversion source preference (e.g., `blue`) and timestamp handling.

Done when:

- Dashboard totals are mathematically consistent with mixed-currency fixtures.
- Card debt and available limit use conversion rules, not raw sum.

## PR 3 (P0): Route Layering Refactor Across APIs

Goal: remove mixed validation/business/DB/response logic from route files.

Files to add:

- `src/modules/accounts/{account-service.ts,account-repository.ts,account-types.ts}`
- `src/modules/loans/{loan-service.ts,loan-repository.ts,loan-types.ts}`
- `src/modules/credit-cards/{credit-card-service.ts,credit-card-repository.ts,credit-card-types.ts}`
- `src/modules/entities/{entity-service.ts,entity-repository.ts,entity-types.ts}`
- `src/modules/dashboard/{dashboard-service.ts,dashboard-repository.ts,dashboard-types.ts}`
- `src/api/http/{request.ts,response.ts,route-params.ts}`

Files to change:

- `src/api/accounts.ts`
- `src/api/loans.ts`
- `src/api/credit-cards.ts`
- `src/api/entities.ts`
- `src/api/dashboard.ts`

Scope:

- Keep each route file as transport adapter only.
- Replace `(req as any).params` with typed param helper.
- Standardize error mapping (`400` validation, `404` not found, `409` conflict, `500` unexpected).

Done when:

- Route handlers are mostly request parsing + service calls + response mapping.
- No new business rules live in route files.

## PR 4 (P1): Migration System + Single Schema Source

Goal: remove schema duplication and make DB evolution safe.

Files to add:

- `drizzle.config.ts`
- `src/db/migrations/*`
- `scripts/migrate.ts`

Files to change:

- `src/db/database.ts`
- `src/db/schema.ts`
- `package.json`
- `README.md`

Scope:

- Adopt Drizzle migrations as canonical schema source.
- Remove raw `CREATE TABLE IF NOT EXISTS` duplication.
- Add startup migration step for binary/runtime startup.

Done when:

- New install and existing DB upgrade are both reproducible.
- Schema changes are tracked as migrations only.

## PR 5 (P1): Query Performance + Indexes + N+1 Removal

Goal: prevent scale breakage in high-read endpoints.

Files to add:

- new migration file for indexes in `src/db/migrations/*`

Files to change:

- `src/api/payments.ts`
- `src/api/credit-cards.ts`
- `src/api/dashboard.ts`
- relevant repositories under `src/modules/**`

Scope:

- Add indexes on `entity_id`, `credit_card_id`, `account_id`, `target_id`, `created_at`.
- Replace per-row follow-up queries with joins/aggregates.
- Keep response shape unchanged unless explicitly versioned.

Done when:

- No N+1 patterns remain in audited endpoints.
- Query plans confirm index usage on key paths.

## PR 6 (P1): Financial Invariant Test Suite

Goal: lock in correctness for money workflows.

Files to add:

- `test/helpers/test-db.ts`
- `test/integration/payments.test.ts`
- `test/integration/dashboard-currency.test.ts`
- `test/integration/credit-card-settlement.test.ts`
- `test/integration/overdraft.test.ts`

Files to change:

- `package.json`

Scope:

- Bun test setup with isolated DB per test run.
- Cover atomicity, settlement, currency totals, overdraft constraints.

Done when:

- `bun test` runs in CI and locally.
- Core invariants fail loudly on regression.

## PR 7 (P1): Runtime Hardening for Installable Production

Goal: production basics for single-user desktop/server install.

Files to add:

- `src/api/health.ts`
- `src/ops/backup.ts`
- `src/ops/shutdown.ts`

Files to change:

- `src/server.ts`
- `src/api/rates.ts`
- `README.md`

Scope:

- Add health endpoint (`/api/health`).
- Manage lifecycle: start/stop rates fetcher on process signals.
- Add backup/restore command workflow for SQLite.
- Improve logs format for startup, job failures, critical operations.

Done when:

- Graceful shutdown closes jobs and DB cleanly.
- Operator has documented backup/restore steps.

## PR 8 (P2): Frontend Module Split and Typed UI State

Goal: reduce large-page risk and prep for contract typing.

Files to add:

- `src/frontend/features/dashboard/*`
- `src/frontend/features/credit-cards/*`
- `src/frontend/features/payments/*`
- `src/frontend/hooks/*`

Files to change:

- `src/frontend/pages/Dashboard.tsx`
- `src/frontend/pages/CreditCards.tsx`
- `src/frontend/pages/Payments.tsx`
- `src/frontend/api.ts`

Scope:

- Split monolithic pages into feature components/hooks.
- Remove local `any` in critical page state.
- Keep UI behavior stable.

Done when:

- Large page files are substantially reduced.
- Feature logic is easier to test and extend.

## PR 9 (P2): CI Quality Gates

Goal: prevent regressions before release.

Files to add:

- `.github/workflows/ci.yml`

Files to change:

- `README.md`
- `package.json`

Scope:

- Run `bunx tsc --noEmit`, `bun run build`, `bun test`.
- Add artifact/build checks for release binaries as needed.

Done when:

- PRs fail automatically on type/build/test regressions.

## PR 10 (P2, Final): End-to-End Type Safety

Goal: implement contract sharing as final phase (per your request).

Primary reference:

- `docs/end-to-end-type-safety.md`

Files to add:

- `src/shared/contracts/*` (or equivalent chosen in the doc)

Files to change:

- `src/frontend/api.ts`
- `src/api/*.ts` (progressively)
- `src/db/validation.ts`

Scope:

- Replace API `any` usage with shared contract types.
- Ensure route handlers and frontend calls share request/response types.
- Keep runtime validation (Zod) in place.

Done when:

- Frontend compile-time errors surface on backend contract changes.
- No `any` in API client surface.

## Finding Coverage Matrix

- Credit-card payment settlement bug: PR 1
- Mixed-currency arithmetic bug: PR 2
- Payment race conditions: PR 1
- Loan installment decrement bug: PR 1
- Route files mixing layers: PR 3
- Schema duplication / migration gap: PR 4
- N+1 queries + missing indexes: PR 5
- Missing financial tests: PR 6
- Generic error handling: PR 3
- Background job lifecycle: PR 7
- Observability + health: PR 7
- Backup/restore plan: PR 7
- CI gates: PR 9
- End-to-end type safety last: PR 10

