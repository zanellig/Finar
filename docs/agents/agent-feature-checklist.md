# Agent Feature Checklist

Quick checklist for shipping a new feature in this repo.

## Backend

- [ ] Add/adjust tables in `src/db/schema.ts`.
- [ ] Generate migration via `bun run db:generate`.
- [ ] Add/adjust request validators in `src/db/validation.ts`.
- [ ] Add `src/modules/<domain>/<domain>-types.ts`.
- [ ] Add `src/modules/<domain>/<domain>-repository.ts` (DB only).
- [ ] Add `src/modules/<domain>/<domain>-service.ts` (business rules).
- [ ] Throw typed domain errors from `src/modules/shared/errors.ts`.
- [ ] Add route adapter in `src/api/<domain>.ts` using:
  - [ ] `parseJsonBody` / `routeParam` / `parseConversionOpts` as needed
  - [ ] Zod `.parse(...)`
  - [ ] `mapErrorToResponse(err)`
- [ ] Register route group in `src/server.ts`.

## Financial/Currency Safety

- [ ] Use `rawDb.transaction(...)` for money-moving mutations.
- [ ] For mixed-currency totals, use `CurrencyConverter.sumToBase(...)`.
- [ ] Use `roundMoney(...)` for monetary output rounding.

## Frontend

- [ ] Add API client methods in `src/frontend/api.ts`.
- [ ] Implement page flow in `src/frontend/pages/*`:
  - [ ] initial load
  - [ ] modal/form actions
  - [ ] success/error toasts
  - [ ] reload after mutation
- [ ] Reuse shared UI helpers from `src/frontend/components/shared.tsx`.

## Tests

- [ ] Add/extend integration tests in `tests/*.test.ts`.
- [ ] Use `createTestDb()` from `src/db/migrate.ts`.
- [ ] Seed with helper functions.
- [ ] Assert business invariants, not only happy-path responses.
- [ ] Run `bun test`.

## Done Criteria

- [ ] Route layer stays thin; business logic only in services.
- [ ] Repository layer contains no business rules.
- [ ] Payload naming remains snake_case at API boundary.
- [ ] Migrations + schema changes are committed together.
- [ ] Feature behavior is covered by tests.
