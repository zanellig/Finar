# Paycheck Feature Implementation

Status as of March 3, 2026: Planned (not implemented yet).

This spec defines how to add recurring paycheck income using the repository patterns already used in this codebase.

## Current Pattern Baseline

Match existing architecture:

- Thin routes in `src/api/*`.
- Business logic in `src/modules/*/*-service.ts`.
- Data access in `src/modules/*/*-repository.ts`.
- Shared error mapping via `src/api/http/response.ts`.
- Zod request validation in `src/db/validation.ts`.
- Migration-first schema changes generated from `src/db/schema.ts` declarations.

## Goals

- Record recurring salary income into user accounts.
- Keep a durable audit trail of each paycheck run.
- Keep run execution safe for retries and concurrent scheduler ticks.
- Preserve compatibility with current ARS/USD model.

## Non-Goals

- Auth or multi-user permissions.
- Tax calculations.
- Employer integrations.

## Proposed File Layout

Add:

- `src/api/paychecks.ts`
- `src/modules/paychecks/paycheck-service.ts`
- `src/modules/paychecks/paycheck-repository.ts`
- `src/modules/paychecks/paycheck-types.ts`
- `src/modules/paychecks/paycheck-scheduler.ts`
- generated migration file from `bun run db:generate`
- `src/frontend/features/paychecks/*` (after frontend split work)

Change:

- `src/server.ts` (register routes and lifecycle hooks)
- `src/db/schema.ts` (table definitions)
- `src/db/validation.ts` (request schemas)
- `src/frontend/api.ts` (temporary typed adapters until PR 10 contracts land)

## Data Model (Migration-First)

Migration rule:

- Define table/index changes in `src/db/schema.ts` and generate SQL via `bun run db:generate`.

### `paychecks`

- `id` text primary key
- `name` text not null
- `account_id` fk `accounts.id` not null
- `currency` enum-like text (`ARS` | `USD`) not null
- `amount` real positive not null
- `frequency` enum-like text (`monthly` | `biweekly` | `weekly`) not null
- `next_run_at` text datetime not null
- `last_run_at` text datetime nullable
- `is_active` boolean/int default true
- `description` text default `''`
- `created_at` text datetime default `datetime('now')`

### `paycheck_runs`

- `id` text primary key
- `paycheck_id` fk `paychecks.id` not null
- `run_at` text datetime not null
- `amount` real not null
- `currency` enum-like text (`ARS` | `USD`) not null
- `account_balance_before` real not null
- `account_balance_after` real not null
- `idempotency_key` text unique not null
- `status` enum-like text (`applied` | `skipped` | `failed`) not null
- `failure_reason` text nullable
- `created_at` text datetime default `datetime('now')`

### Indexes

- `paychecks(account_id)`
- `paychecks(next_run_at)`
- `paychecks(is_active, next_run_at)`
- `paycheck_runs(paycheck_id, run_at)`
- `paycheck_runs(idempotency_key)` unique

## API Contract

### `GET /api/paychecks`

- List paycheck definitions with last run summary.

### `POST /api/paychecks`

- Create paycheck definition.

Body:

- `name`, `account_id`, `currency`, `amount`, `frequency`, `next_run_at`, optional `description`.

### `PUT /api/paychecks/:id`

- Update `name`, `amount`, `frequency`, `next_run_at`, `is_active`, `description`.

### `POST /api/paychecks/:id/run`

- Manual run endpoint.
- Request includes optional `run_at` and required `idempotency_key`.

### `GET /api/paychecks/:id/runs`

- Paginated run history.

## Core Business Rules

- Same `idempotency_key` must never credit balance twice.
- Inactive paychecks cannot auto-run.
- Manual and scheduled runs must use the same service method.
- Missing paycheck/account returns typed domain errors.
- v1 rule: paycheck currency must equal account currency.

Future extension:

- Cross-currency paychecks can reuse `src/modules/currency/*` converter after explicit product decision.
- Scheduler must catch up missed runs when app downtime spans one or more scheduled periods.

## Atomic Service Flow

`runPaycheck(paycheckId, runAt, idempotencyKey)`:

1. Start DB transaction.
2. Load paycheck row and verify active/due state.
3. Check existing `paycheck_runs` by idempotency key.
4. Load account and capture pre-balance.
5. Credit account balance.
6. Insert run record with before/after balances.
7. Update paycheck `last_run_at` and `next_run_at`.
8. Commit.

Failure handling:

- Persist failed run record where possible.
- Return typed domain errors for route mapping.

## Scheduler Pattern

- `paycheck-scheduler.ts` executes on interval.
- Deterministic idempotency key format: `paycheck:{id}:{yyyy-mm-ddThh:mm}`.
- Scheduler start/stop registered in `src/server.ts` together with rates fetcher lifecycle.
- Shutdown path should clear interval and close DB cleanly.
- On startup and each scheduler tick, process all overdue runs up to current time.
- Example: if app was down for 2 months and paycheck frequency is monthly, apply the two missed paycheck runs in order.

## Error Model

Add domain errors in `src/modules/shared/errors.ts`:

- `PaycheckNotFoundError` -> 404
- `PaycheckInactiveError` -> 409
- `PaycheckNotDueError` -> 409
- `DuplicateRunError` -> 409 (or 200 with existing run payload)
- `AccountNotFoundError` -> 404
- `CurrencyMismatchError` -> 400
- `InvariantViolationError` -> 500

## Test Plan (`bun test`)

Add tests:

- Creates paycheck and lists it.
- Manual run increments balance exactly once.
- Duplicate idempotency key does not double-apply.
- Scheduler applies only due paychecks.
- Scheduler catches up all missed runs after downtime.
- Inactive paycheck is skipped/rejected.
- Concurrent run attempts keep single-application invariant.
- Run history stores accurate before/after balances.
- Currency mismatch rejected in v1.

## Rollout Sequence

1. Implement after roadmap PR 5 (indexes/perf baseline) and PR 7 (runtime lifecycle baseline).
2. Reuse payment transaction and error-mapping conventions.
3. Land backend + migration + tests first.
4. Add frontend module once PR 8 frontend split structure exists.
5. Integrate shared contracts in PR 10 end-to-end type safety phase.
