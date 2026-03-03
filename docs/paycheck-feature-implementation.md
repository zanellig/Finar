# Paycheck Feature Implementation Doc

This spec defines how to implement paychecks using the architecture and quality patterns required by the roadmap.

## Goals

- Record recurring salary income into user accounts.
- Keep a full audit trail of generated paycheck events.
- Support ARS/USD with correct conversion behavior in aggregates.
- Be safe under retries and concurrent job execution.

## Non-Goals

- No auth or multi-user permissions.
- No payroll tax engine for all jurisdictions.
- No external employer integrations in v1.

## Required Build Patterns

Use these patterns for paycheck and all new financial features:

- Thin routes: validation + service call + response mapping only.
- Service layer owns business rules and invariants.
- Repository layer owns all SQL/ORM queries.
- Atomic money mutations in DB transactions.
- Idempotency keys for scheduled/automatic operations.
- Shared error model with correct HTTP status mapping.
- Tests for invariants before feature is considered complete.

## Proposed File Layout

- `src/api/paychecks.ts`
- `src/modules/paychecks/paycheck-service.ts`
- `src/modules/paychecks/paycheck-repository.ts`
- `src/modules/paychecks/paycheck-types.ts`
- `src/modules/paychecks/paycheck-scheduler.ts`
- `src/db/schema.ts` (new paycheck tables)
- `src/db/validation.ts` (request schemas)
- `src/frontend/features/paychecks/*`

## Data Model (Migration-First)

Add via migration files (not raw schema duplication).

### `paychecks`

- `id` (text pk)
- `name` (text, not null) example: "Main Salary"
- `account_id` (fk accounts.id, not null)
- `currency` (`ARS` | `USD`, not null)
- `amount` (real, positive, not null)
- `frequency` (`monthly` | `biweekly` | `weekly`, not null)
- `next_run_at` (text datetime, not null)
- `last_run_at` (text datetime, nullable)
- `is_active` (boolean/int, default true)
- `description` (text, default "")
- `created_at` (text datetime)

### `paycheck_runs`

- `id` (text pk)
- `paycheck_id` (fk paychecks.id, not null)
- `run_at` (text datetime, not null)
- `amount` (real, not null)
- `currency` (`ARS` | `USD`, not null)
- `account_balance_before` (real, not null)
- `account_balance_after` (real, not null)
- `idempotency_key` (text, unique, not null)
- `status` (`applied` | `skipped` | `failed`, not null)
- `failure_reason` (text, nullable)
- `created_at` (text datetime)

### Indexes

- `paychecks(account_id)`
- `paychecks(next_run_at)`
- `paychecks(is_active, next_run_at)`
- `paycheck_runs(paycheck_id, run_at)`
- `paycheck_runs(idempotency_key)` unique

## API Contract (REST)

### `GET /api/paychecks`

- Returns paycheck definitions plus last run summary.

### `POST /api/paychecks`

- Create paycheck definition.
- Body:
  - `name`, `account_id`, `currency`, `amount`, `frequency`, `next_run_at`, optional `description`.

### `PUT /api/paychecks/:id`

- Update editable fields (`name`, `amount`, `frequency`, `next_run_at`, `is_active`, `description`).
- `account_id` and `currency` updates should be restricted or handled as controlled migration logic.

### `POST /api/paychecks/:id/run`

- Manual run endpoint.
- Accept optional `run_at` and required `idempotency_key`.

### `GET /api/paychecks/:id/runs`

- Paginated paycheck run history.

## Core Business Rules

- A paycheck run increases account balance exactly once per idempotency key.
- Inactive paychecks cannot auto-run.
- Scheduled run computes and advances `next_run_at` deterministically.
- Manual and scheduled run paths share the same service method.
- If account or paycheck is missing, operation fails with typed domain errors.
- Currency on paycheck must match account currency in v1.
  - If cross-currency paychecks are needed later, conversion must use the shared currency module from roadmap PR 2.

## Service Flow (Atomic)

`runPaycheck(paycheckId, runAt, idempotencyKey)`:

1. Begin transaction.
2. Load paycheck row with lock-equivalent write intent.
3. Check existing `paycheck_runs` by idempotency key; return existing result if found.
4. Validate active state and due timing rules.
5. Load target account and capture `balance_before`.
6. Update account balance (`balance + amount`).
7. Insert `paycheck_runs` row with before/after balances.
8. Update paycheck `last_run_at` and next schedule timestamp.
9. Commit transaction.

Failure handling:

- Persist failed run with reason when possible.
- Return structured domain errors mapped by route adapter.

## Scheduler Pattern

- `paycheck-scheduler.ts` runs on interval (e.g., every minute).
- Each due paycheck run uses deterministic idempotency key:
  - `paycheck:{id}:{ISO minute timestamp}`
- Scheduler startup/shutdown hooks wired in `src/server.ts` beside rates fetcher lifecycle.
- On shutdown, clear intervals and close DB cleanly.

## Frontend Pattern

- New feature module under `src/frontend/features/paychecks`.
- Keep page component small; move data fetching and mutations to hooks.
- Use typed DTOs (from shared contracts in final type-safety phase).
- Show:
  - next run time
  - last run status
  - run history table
  - manual run action with idempotency key generated client-side

## Error Model

Domain errors to define in shared error module:

- `PaycheckNotFoundError` -> `404`
- `PaycheckInactiveError` -> `409`
- `PaycheckNotDueError` -> `409`
- `DuplicateRunError` -> `409` or existing run `200`
- `AccountNotFoundError` -> `404`
- `CurrencyMismatchError` -> `400`
- `InvariantViolationError` -> `500`

Do not return internal runtime errors as `400`.

## Test Plan (Bun)

Add integration tests:

- Creates paycheck and lists it.
- Manual run increases balance once.
- Duplicate idempotency key is safe (no double credit).
- Scheduler run applies only due paychecks.
- Inactive paycheck is skipped/rejected.
- Concurrent run attempts preserve single application.
- Run history records before/after balances correctly.

Add currency tests:

- v1 account/paycheck currency mismatch rejected.
- future conversion path (when enabled) covered by conversion fixtures.

## Rollout Sequence

1. Implement after roadmap PR 3 (layering baseline) and PR 4 (migrations baseline).
2. Reuse atomic and error conventions from payment fixes.
3. Land with tests and indexes in same PR set.
4. Integrate shared typed contracts only in final type-safety phase.

