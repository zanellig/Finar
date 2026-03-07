# Production Roadmap (Status as of March 3, 2026)

This roadmap tracks the first 10 PRs and reflects the current repository state.

Priorities stay the same:

- Single-user installable app; no auth scope.
- P0 correctness and route/service/repository separation first.
- End-to-end type safety is last.

## Current Repository Baseline

Implemented structure today:

- `src/api/*` thin route adapters plus shared helpers in `src/api/http/{request,response}.ts`.
- `src/modules/*` organized by domain with `*-service.ts`, `*-repository.ts`, `*-types.ts`.
- `src/modules/currency/*` centralizes ARS/USD conversion.
- `src/db/migrate.ts` applies migrations and provides `createTestDb()` for tests.
- Tests currently live in `tests/` (`payments`, `currency`, `migrations`).

## PR Status Summary

| PR | Title | Status | Notes |
| --- | --- | --- | --- |
| 1 | Atomic Payment Engine + Card Settlement Fix | Complete | Payment transaction logic and invariants are in place. |
| 2 | Currency Domain Unification | Complete | Currency module and conversion-based aggregations are live. |
| 3 | Route Layering Refactor Across APIs | Complete | Routes are thin and use shared HTTP helpers. |
| 4 | Migration System + Single Schema Source | Complete | Drizzle migrations run at startup with legacy baseline support. |
| 5 | Query Performance + Indexes + N+1 Removal | Pending | N+1 patterns still exist; no index migration beyond `0000_initial.sql`. |
| 6 | Financial Invariant Test Suite | In Progress | Core suites exist, but concurrency/load and CI wiring are incomplete. |
| 7 | Runtime Hardening for Installable Production | Pending | No health route, backup/restore ops scripts, or graceful shutdown hooks yet. |
| 8 | Frontend Module Split and Typed UI State | Pending | Pages are still monolithic and `src/frontend/api.ts` uses `any`. |
| 9 | CI Quality Gates | Pending | No `.github/workflows/ci.yml`. |
| 10 | End-to-End Type Safety | Pending | No shared contract module; frontend API surface still untyped (`any`). |

## Completed PR Notes

### PR 1 (P0) Complete

Delivered in:

- `src/modules/payments/payment-service.ts`
- `src/modules/payments/payment-repository.ts`
- `src/modules/payments/payment-types.ts`
- `src/modules/shared/errors.ts`
- `src/api/payments.ts`

Verification:

- `tests/payments.test.ts` covers loan/card settlement and balance guards.

### PR 2 (P0) Complete

Delivered in:

- `src/modules/currency/money.ts`
- `src/modules/currency/rates-repository.ts`
- `src/modules/currency/convert.ts`
- `src/modules/dashboard/*`
- `src/modules/credit-cards/*`

Verification:

- `tests/currency.test.ts` covers mixed-currency totals and missing-rate behavior.

### PR 3 (P0) Complete

Delivered in:

- `src/modules/accounts/*`
- `src/modules/loans/*`
- `src/modules/credit-cards/*`
- `src/modules/entities/*`
- `src/modules/dashboard/*`
- `src/api/http/request.ts`
- `src/api/http/response.ts`

Note: the route param helper is `routeParam()` in `src/api/http/request.ts` (not a separate `route-params.ts`).

### PR 4 (P1) Complete

Delivered in:

- `drizzle.config.ts`
- `src/db/migrations/0000_initial.sql`
- `src/db/migrate.ts`
- `src/db/database.ts`

Verification:

- `tests/migrations.test.ts` validates baseline and enum-like constraints.

## Pending PR Plans

### PR 5 (P1): Query Performance + Indexes + N+1 Removal

Goal: remove avoidable query amplification and add production indexes.

Files to add:

- generated migration file from `bun run db:generate` (name may vary by Drizzle generation)

Files to change:

- `src/modules/payments/payment-repository.ts`
- `src/modules/dashboard/dashboard-repository.ts`
- `src/modules/dashboard/dashboard-service.ts`
- `src/modules/credit-cards/credit-card-service.ts`
- `src/db/schema.ts` (declare indexes here so Drizzle generates migration SQL)

Known hotspots now:

- `PaymentRepository.getAllPaymentsEnriched()` performs target lookups per row.
- `DashboardService` calls `getCardUnpaidSpenditures()` per card (N+1).

Required indexes:

- `accounts(entity_id)`
- `loans(entity_id)`
- `credit_cards(entity_id)`
- `payments(account_id)`
- `payments(target_id)`
- `cc_spenditures(credit_card_id)`
- `payments(created_at)`
- `cc_spenditures(created_at)`

Done when:

- Enriched payments and dashboard card totals are resolved without per-row queries.
- Migration applies the new indexes safely.
- Indexes are declared in schema definitions and generated into migrations, not hand-authored by default.

Migration policy for PR 5 and future schema changes:

- Do not manually edit migration SQL files under normal flow.
- Declare schema/index changes in `src/db/schema.ts` and run `bun run db:generate`.
- Exception: direct migration edits are allowed only to fix broken `db:generate`/`db:migrate` output.

### PR 6 (P1): Financial Invariant Test Suite

Goal: complete coverage for concurrency and regression guardrails.

Status today: partial completion.

Existing:

- `tests/payments.test.ts`
- `tests/currency.test.ts`
- `tests/migrations.test.ts`

Files to add:

- `tests/helpers/test-db.ts` (shared fixture/bootstrap helper)
- `tests/dashboard.test.ts` (or split by domain)
- `tests/overdraft-concurrency.test.ts` (parallel payment attempts)
- queue module/tests for serialized mutation execution where parallel attempts can violate invariants

Files to change:

- `tests/payments.test.ts`
- `package.json` (optional explicit `test` script)

Done when:

- Concurrency-sensitive invariants are tested with parallel operations.
- Test helpers are centralized and reused.
- A queue model is implemented for applicable mutation paths and validated in tests.
- The implementing agent (human or AI) audits all write/concurrency patterns to identify where queueing should also be applied.

### PR 7 (P1): Runtime Hardening for Installable Production

Goal: add operator-safe runtime behavior.

Files to add:

- `src/api/health.ts`
- `src/ops/backup.ts`
- `src/ops/shutdown.ts`

Files to change:

- `src/server.ts`
- `src/api/rates.ts`
- `README.md`

Scope:

- Add `/api/health` endpoint.
- Wire graceful shutdown to stop interval jobs and close DB.
- Document backup and restore flow for SQLite DB file.
- Support controlled application exit triggered from frontend UX, not only OS signals.
- Keep syscall signal handling for process shutdown (`SIGTERM` and `SIGINT`) in parallel with frontend-triggered shutdown.

Done when:

- Server exits cleanly on `SIGTERM`/`SIGINT`.
- Frontend can request a clean shutdown path for desktop/installable usage.
- Operator has documented backup/restore commands.

### PR 8 (P2): Frontend Module Split and Typed UI State

Goal: reduce page complexity and prepare typed API integration.

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

Current signal:

- Large page files (`Dashboard.tsx`, `CreditCards.tsx`, etc.) and `api.ts` uses `any` extensively.

Done when:

- Feature logic is split into modules/hooks.
- UI state and fetch results are typed without `any` in frontend API calls.

### PR 9 (P2): CI Quality Gates

Goal: automatic quality checks for every PR.

Files to add:

- `.github/workflows/ci.yml`

Files to change:

- `package.json`
- `README.md`

Scope:

- Run `bunx tsc --noEmit`.
- Run `bun run build`.
- Run `bun test`.

Done when:

- PRs fail on type/build/test regression in CI.

### PR 10 (P2, Final): End-to-End Type Safety

Goal: remove untyped API boundaries between frontend and backend.

Primary reference:

- `docs/end-to-end-type-safety.md`

Files to add:

- `src/shared/contracts/*`

Files to change:

- `src/frontend/api.ts`
- `src/api/*.ts` (progressive adoption)
- `src/db/validation.ts`

Scope:

- Define shared request/response contract schemas.
- Use inferred shared types in route handlers and frontend client functions.
- Keep runtime validation with Zod.

Done when:

- Backend contract changes break frontend compile where incompatible.
- `src/frontend/api.ts` no longer exports `any`-typed API methods.

## Finding Coverage Matrix

- Credit-card payment settlement bug: PR 1 complete
- Mixed-currency arithmetic bug: PR 2 complete
- Payment race conditions: PR 1 complete
- Loan installment decrement bug: PR 1 complete
- Route files mixing layers: PR 3 complete
- Schema duplication / migration gap: PR 4 complete
- N+1 queries + missing indexes: PR 5 pending
- Missing financial tests: PR 6 in progress
- Background job lifecycle: PR 7 pending
- Observability + health: PR 7 pending
- Backup/restore plan: PR 7 pending
- Frontend module decomposition: PR 8 pending
- CI gates: PR 9 pending
- End-to-end type safety: PR 10 pending
