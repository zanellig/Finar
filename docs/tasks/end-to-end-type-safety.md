# End-to-End Type Safety Plan

Status as of March 3, 2026: Pending (PR 10 in roadmap).

This document defines the concrete implementation plan for typed backend/frontend contracts in this repository.

## Current State

Backend:

- Zod request schemas live in `src/db/validation.ts`.
- Routes validate input and map errors consistently.
- Response payloads are manually shaped in services/repositories.

Frontend:

- `src/frontend/api.ts` uses `request<any>` and `any` payloads for all endpoints.
- Backend contract changes are not surfaced at compile time in frontend code.

Gap:

- No shared contract module for request/response types.
- No compile-time coupling between API routes and frontend client methods.

## Chosen Approach

Use shared Zod contracts as the first-class source of API types.

Why this fits current architecture:

- Works with existing `Bun.serve()` route registration.
- No framework migration required.
- Preserves runtime validation while adding compile-time coupling.
- Can be adopted incrementally route-by-route.

## Target Structure

```text
src/
  shared/
    contracts/
      common.ts
      entities.ts
      accounts.ts
      loans.ts
      credit-cards.ts
      payments.ts
      dashboard.ts
      rates.ts
  api/
    *.ts                // imports request/response contracts
  frontend/
    api.ts              // imports inferred types from contracts
```

## Contract Rules

- Request and response schemas must be declared in `src/shared/contracts/*`.
- Routes must validate request data against contract schemas.
- Frontend API methods must return inferred response types from contracts.
- Avoid `any` in API boundary code (`src/api/*`, `src/frontend/api.ts`).
- Keep snake_case payload naming unless a deliberate migration is planned.

## PR 10 Execution Plan

### Phase 1: Shared contract module

Add:

- `src/shared/contracts/common.ts` (shared primitives: ids, currency, timestamps)
- Domain contract files for each API area

Change:

- `src/db/validation.ts` to reuse shared primitives where practical

Done when:

- Shared contracts compile and are imported by at least one route and one frontend API function.

### Phase 2: Frontend API typing

Change:

- `src/frontend/api.ts`

Work:

- Replace `request<any>` with generic request wrappers returning contract-inferred types.
- Type method params for create/update endpoints from shared contract schemas.

Done when:

- `src/frontend/api.ts` exports zero `any` types.

### Phase 3: Route-by-route adoption

Change progressively:

- `src/api/entities.ts`
- `src/api/accounts.ts`
- `src/api/loans.ts`
- `src/api/credit-cards.ts`
- `src/api/payments.ts`
- `src/api/dashboard.ts`
- `src/api/rates.ts`

Work:

- Route input/output must align with shared contract schemas.
- Keep current runtime behavior and status codes.

Done when:

- Each route returns values compatible with the declared contract type.

### Phase 4: Type regression tests

Add:

- `tests/types/contracts.test-d.ts` (or equivalent `tsc --noEmit` assertions)

Change:

- CI workflow in PR 9 to include `bunx tsc --noEmit`.

Done when:

- Breaking backend contract changes fail frontend type-check before runtime.

## Non-Goals for PR 10

- Replacing `Bun.serve()` with another framework.
- Public OpenAPI generation.
- GraphQL or RPC transport migration.

## Optional Future Step

If contract surface grows significantly, evaluate migration from shared Zod contracts to a stricter contract-first tool (for example `ts-rest`) without changing the runtime transport immediately.
