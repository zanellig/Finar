# Credit Card Spenditures Rework Tasks

## Goal
Implement a coherent end-to-end upgrade for credit-card spenditures so we can:
- prevent over-limit registrations,
- track ARS and USD spend separately while preserving a unified ARS card limit,
- show a CCL-based USD estimate of the card limit,
- edit/delete spenditures safely,
- and track each spenditure due date (`fecha de vencimiento`).

This plan is intentionally ordered to avoid duplicated logic and rework across schema, services, API, and UI.

## Scope Map (Requested Points -> Tasks)
- Point 1 (`no over-limit spenditures`) -> Task 2 and Task 3.
- Point 2 (`ARS/USD totals separately + single-query aggregation`) -> Task 2 and Task 4.
- Point 3 (`USD estimate of ARS limit using CCL`) -> Task 2 and Task 4.
- Point 4 (`modify/delete spenditures`) -> Task 3 and Task 4.
- Point 5 (`due date on spenditures`) -> Task 1, Task 3, and Task 4.

## Implementation Principles (Do Not Skip)
- Keep route layers thin (`src/api/*`): parse, validate, delegate, map errors.
- Keep business rules in services (`src/modules/*/*-service.ts`).
- Keep repositories DB-only (`src/modules/*/*-repository.ts`).
- Reuse existing helpers: `parseSpenditure`, `CurrencyConverter`, `roundMoney`, `mapErrorToResponse`.
- Keep API payload fields in `snake_case`.
- Use one canonical spend-aggregation path to avoid repeating ARS/USD math in multiple services.

## Task 1 - Schema and Validation Foundation (Due Date + Spenditure DTOs)
### Objective
Add due-date support and the request contracts needed for create/update/delete spenditure operations.

### Files
- `src/db/schema.ts`
- `src/db/validation.ts`
- `src/db/migrations/*` (new migration)
- `src/modules/credit-cards/credit-card-types.ts`

### Steps
- Add `dueDate` (`due_date` in DB) to `cc_spenditures`.
- Store due date as text in `YYYY-MM-DD` format.
- Add a migration with all three required phases: create the new column, backfill existing rows to a safe default (for example `date(created_at)`), and enforce non-null after backfill.
- Add request schemas for spenditure update (`PUT`) and spenditure deletion path validation needs.
- Extend the spenditure create schema path to accept `due_date`.
- Add optional schema for metadata-only edits (`description`, `due_date`) and for financial edits (amount/currency/installments).

### Acceptance Criteria
- DB can migrate from current state with existing spenditures.
- New spenditures require a valid `due_date` format.
- Validation contracts exist for create and update and are reusable by API + service.

## Task 2 - Canonical Card Exposure Aggregation and Limit Enforcement
### Objective
Introduce one shared aggregation flow that returns ARS/USD totals per card in a single query, and use it to enforce the ARS unified limit before persisting spenditures.

### Files
- `src/modules/credit-cards/credit-card-repository.ts`
- `src/modules/credit-cards/credit-card-service.ts`
- `src/modules/dashboard/dashboard-repository.ts`
- `src/modules/dashboard/dashboard-service.ts`
- `src/modules/dashboard/dashboard-types.ts`
- `src/modules/currency/rates-repository.ts` (only if a helper is needed)

### Steps
- Add one aggregate repository query for unpaid spenditures grouped by `credit_card_id` and `currency`.
- Aggregate in SQL (single query), not by issuing per-card queries.
- Return both raw currency totals in the aggregate result: `total_spent_ars` and `total_spent_usd`.
- In service, compute ARS unified debt using converter (`USD -> ARS` with existing rate behavior).
- Enforce limit on create/update spenditure using projected post-mutation exposure in ARS.
- Reject with a domain validation error when projected ARS exposure exceeds `spend_limit`.
- Add CCL-only limit estimate fields: `spend_limit_usd_estimate` and `available_limit_usd_estimate`.
- Ensure these estimate fields do not require changing current base-currency totals (`total_spent`, `available_limit` in ARS remain).
- Reuse this aggregation path in dashboard card summaries so ARS/USD splits come from the same source of truth.

### Acceptance Criteria
- Card list/detail and dashboard can expose ARS and USD totals separately per card.
- Over-limit spenditure creation is rejected before insert.
- Over-limit spenditure update is rejected before update.
- No N+1 query pattern is introduced for per-card totals.

## Task 3 - Spenditure Lifecycle Mutations (Create/Update/Delete + Due Date)
### Objective
Add full spenditure mutation support while preserving payment integrity.

### Files
- `src/modules/credit-cards/parse-spenditure.ts`
- `src/modules/credit-cards/credit-card-repository.ts`
- `src/modules/credit-cards/credit-card-service.ts`
- `src/api/credit-cards.ts`
- `src/modules/shared/errors.ts` (only if a new error class is needed)

### Steps
- Extend parser/normalizer so create and update share one canonical normalization path.
- Add repository methods for update spenditure, delete spenditure, and fetch spenditure by `cardId + spenditureId` for ownership checks.
- Add service methods `updateSpenditure(cardId, spenditureId, input)` and `deleteSpenditure(cardId, spenditureId)`.
- Re-run limit validation on updates that change financial impact.
- Preserve integrity rule for paid/partially paid spenditures: allow metadata edits (`description`, `due_date`) always, but block financial edits or deletion when installments were already partially/fully settled.
- Add new routes `PUT /api/credit-cards/:id/spenditures/:spendId` and `DELETE /api/credit-cards/:id/spenditures/:spendId`.
- Keep error mapping through `mapErrorToResponse` only.

### Acceptance Criteria
- Spenditures can be edited and deleted through API.
- Due date is persisted and returned in responses.
- Financial edits/deletes cannot corrupt already-settled debt state.
- Limit checks apply consistently to create and update.

## Task 4 - UI Integration (Currency Split Totals, USD Limit Estimate, Due Date, Edit/Delete)
### Objective
Update UI flows to expose the new backend model and controls without duplicating calculations client-side.

### Files
- `src/frontend/api.ts`
- `src/frontend/pages/CreditCards.tsx`
- `src/frontend/pages/Dashboard.tsx`
- `src/frontend/components/shared.tsx` (only if small presentational helpers are needed)

### Steps
- Add frontend API methods for spenditure update/delete endpoints.
- In card list and card detail, show total spent in ARS and USD separately, plus ARS limit and CCL-based USD limit estimate.
- Add due-date input to spenditure create form.
- Show due date and remaining days/status in spenditure lists.
- Add edit and delete actions in card detail for each spenditure.
- Keep frontend as display-only for aggregates: use backend-provided totals and estimates.
- Ensure error toasts display limit-exceeded and integrity errors clearly.

### Acceptance Criteria
- User can create, edit, and delete spenditures from UI.
- UI displays ARS/USD totals side-by-side for each card.
- UI displays USD equivalent estimate of ARS limit.
- UI displays due date and urgency for each spenditure.

## Task 5 - Regression Tests and Migration Safety
### Objective
Lock behavior with tests to prevent regressions across business rules and aggregations.

### Files
- `tests/credit-cards.test.ts`
- `tests/dashboard.test.ts`
- `tests/currency.test.ts`
- `tests/migrations.test.ts`
- Add new suite if needed: `tests/credit-card-spenditures.test.ts`

### Steps
- Add tests for create/update over-limit rejection with mixed ARS/USD spenditures.
- Add tests for aggregate split outputs (`total_spent_ars`, `total_spent_usd`) and ARS unified totals.
- Add tests for CCL USD estimate fields when CCL rate exists and when it is missing.
- Add tests for due-date validation and persistence.
- Add tests for update/delete rules on partially paid spenditures.
- Add migration test assertions for new `due_date` column and backfill behavior.

### Acceptance Criteria
- Test suite covers all five requested points.
- No query-count regression for dashboard card aggregation.
- `bun test` passes on full suite.

## Suggested Delivery Order
1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5

## Done Definition
- No duplicate spenditure math across services.
- One canonical path exists for spenditure normalization and one for per-card ARS/USD aggregation.
- Card limit is enforced at write time for both create and update.
- Due date is first-class in storage, API, service, and UI.
- Edit/delete operations are available and protected by settlement integrity rules.
