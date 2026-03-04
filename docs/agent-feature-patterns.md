# Agent Feature Patterns Playbook

This document captures the strongest recurring implementation patterns in this codebase so new features can be added quickly and consistently.

## 1) Architecture You Should Preserve

Domain-first layering is the default pattern:

- `src/api/*`: thin HTTP transport adapters (parse input, call service, map errors).
- `src/modules/<domain>/*-service.ts`: business rules and orchestration.
- `src/modules/<domain>/*-repository.ts`: database reads/writes only.
- `src/modules/<domain>/*-types.ts`: module-local input/output/domain types.
- `src/db/schema.ts`: canonical schema definition.
- `src/db/validation.ts`: Zod request schemas.

Use this split for every new domain.

## 2) API Route Pattern (Thin Adapter)

Every route follows the same shape:

1. Get service via `new <Domain>Service(getOrm())` (or `getDb(), getOrm()` when raw transaction support is needed).
2. Parse JSON with `parseJsonBody(req)`.
3. Validate with a Zod schema from `src/db/validation.ts`.
4. Call service method.
5. Return JSON.
6. Catch and map with `mapErrorToResponse(err)`.

Utilities used everywhere:

- `src/api/http/request.ts`: `routeParam`, `parseJsonBody`, `parseConversionOpts`.
- `src/api/http/response.ts`: uniform error-to-HTTP mapping.

## 3) Validation + Payload Conventions

Use strict runtime validation at the API boundary:

- Define request schemas in `src/db/validation.ts`.
- Use `z.coerce.number()` for numeric form payloads.
- Keep external payload fields in `snake_case`.
- Transform/bridge to DB camelCase inside service mapping functions.

Current pattern examples:

- `insertAccountSchema` + `toAccountValues()` mapping.
- `insertPaymentSchema` parsed in route, then mapped to service input.

## 4) Service Pattern (Business Rules)

Services are responsible for:

- Existence checks (`repo.exists`, `repo.findById`).
- Cross-entity rules (e.g., account/entity existence checks).
- Financial formulas (loan CFTEA computation).
- Currency-aware totals using converter utilities.
- UUID generation (`crypto.randomUUID()`).

Services throw typed domain errors from `src/modules/shared/errors.ts`.

## 5) Repository Pattern (Pure Data Access)

Repositories should stay deterministic and data-focused:

- No domain decisions in repository methods.
- Reuse select-shape constants (snake_case output aliases).
- Keep simple methods: `findAll`, `findById`, `exists`, `create`, `update`, `remove`.
- Use joins in repository for display-ready rows.

## 6) Currency Strategy

All mixed-currency aggregation routes through the currency module:

- Domain primitives and rounding: `src/modules/currency/money.ts`.
- Rate lookup: `src/modules/currency/rates-repository.ts`.
- Conversion orchestration: `src/modules/currency/convert.ts`.

Rules in use:

- Base aggregate currency is ARS.
- Missing rate throws `MissingRateError` (never silent fallback).
- `customRate` option can override DB rates.

## 7) Atomic Mutation Pattern

For money mutations, use one SQLite transaction per operation:

- `PaymentService` wraps mutation logic in `rawDb.transaction(() => { ... })`.
- Re-read mutable rows inside transaction before changing state.
- Apply all dependent writes in that same transaction.

This pattern is the model for any future money-moving feature.

## 8) DB + Migration Pattern

Database lifecycle pattern:

- `src/db/database.ts` lazily initializes DB singleton.
- PRAGMAs on startup (`journal_mode=WAL`, `foreign_keys=ON`).
- Migrations run on startup via `runMigrations()`.

Migration workflow pattern:

1. Update `src/db/schema.ts`.
2. Run `bun run db:generate`.
3. Commit schema + generated SQL together.

For tests, use `createTestDb()` from `src/db/migrate.ts` for in-memory migrated schema.

## 9) Error Model Pattern

Domain errors are explicit classes in `src/modules/shared/errors.ts`:

- `NotFoundError`, `ValidationError`, `ConflictError`, `InsufficientFundsError`, `InvalidPaymentError`, `MissingRateError`.

Routes map these consistently through shared response helpers.

## 10) Frontend Feature Pattern

Frontend is organized by page-level feature modules under `src/frontend/pages/*` plus shared primitives:

- HTTP calls centralized in `src/frontend/api.ts`.
- Reusable UI in `src/frontend/components/shared.tsx` (`Modal`, `useToast`, formatters, loading/empty states).
- Pages follow the flow: load data on mount -> render list/table/cards -> modal form -> call API -> toast -> reload.

## 11) Test Pattern

Testing style is integration-first with real schema behavior:

- Bun test runner: `bun test`.
- In-memory DB fixture with migrations (`createTestDb()`).
- Seed with helper functions per suite.
- Assert financial invariants and post-conditions (balances, installments, debt state).

Primary suites:

- `tests/payments.test.ts` (atomicity and settlement rules).
- `tests/currency.test.ts` (conversion/rounding/aggregation consistency).
- `tests/migrations.test.ts` (legacy baseline + constraint behavior).

## 12) New Feature Blueprint (Use This Order)

1. Add/extend schema in `src/db/schema.ts`.
2. Add Zod request schemas to `src/db/validation.ts`.
3. Create `src/modules/<domain>/<domain>-types.ts`.
4. Create `src/modules/<domain>/<domain>-repository.ts`.
5. Create `src/modules/<domain>/<domain>-service.ts` with domain rules.
6. Add `src/api/<domain>.ts` routes using shared helpers.
7. Register routes in `src/server.ts`.
8. Add frontend API methods in `src/frontend/api.ts`.
9. Add/update UI in `src/frontend/pages/*` (or shared components where needed).
10. Add integration tests with `createTestDb()` and invariants.

## 13) Commands Agents Should Use

- Install: `bun install`
- Dev server: `bun run dev`
- Tests: `bun test`
- Generate migrations: `bun run db:generate`
- Apply migrations: `bun run db:migrate`
- Build binary: `bun run build`
