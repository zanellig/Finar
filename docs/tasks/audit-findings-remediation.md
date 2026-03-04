# Audit Findings Remediation Tasks

## 1) Critical — Currency-blind credit-card settlement

Problem (exact):
[Critical] Credit-card payment settlement is currency-blind: debt installments are reduced by raw payment amount with no account/spend currency normalization, so ARS amounts can incorrectly settle USD debt. See [src/modules/payments/payment-repository.ts:55](/home/gz/projects/finance-tracker-llm/src/modules/payments/payment-repository.ts:55), [src/modules/payments/payment-service.ts:113](/home/gz/projects/finance-tracker-llm/src/modules/payments/payment-service.ts:113).

Fix plan (imperative):

- Normalize both payment amount and spenditure debt into one settlement currency before computing installment reductions.
- Resolve conversion rates explicitly (or reject cross-currency settlement until supported).
- Persist and test deterministic rounding behavior at each settlement step.

## 2) Critical — Balance deduction without debt reduction edge case

Problem (exact):
[Critical] A payment can be deducted from account balance without reducing any card debt when `amount < monthlyAmount` (because `Math.floor(remaining / monthlyAmount)` can be `0`). See [src/modules/payments/payment-service.ts:129](/home/gz/projects/finance-tracker-llm/src/modules/payments/payment-service.ts:129), [src/modules/payments/payment-service.ts:142](/home/gz/projects/finance-tracker-llm/src/modules/payments/payment-service.ts:142).

Fix plan:

- Block card payments that cannot settle at least one installment unit under current rules.
- Throw a domain error before deducting account balance when no installment can be reduced.
- Add explicit UX/backend validation messaging for minimum payable amount.

## 3) High — N+1 in payment enrichment

Problem (exact):
[High] `getAllPaymentsEnriched()` has N+1 target lookups (loan/card name per row). See [src/modules/payments/payment-repository.ts:152](/home/gz/projects/finance-tracker-llm/src/modules/payments/payment-repository.ts:152).

Fix plan:

- Replace per-row lookups with a single query strategy (join/union/subquery) that resolves `target_name` in bulk.
- Keep the response shape unchanged while reducing query count to O(1) per request.
- Add coverage or profiling assertions to prevent N+1 regressions.

## 4) High — N+1 in dashboard card totals

Problem (exact):
[High] Dashboard card totals are computed with per-card queries (N+1). See [src/modules/dashboard/dashboard-service.ts:68](/home/gz/projects/finance-tracker-llm/src/modules/dashboard/dashboard-service.ts:68), [src/modules/dashboard/dashboard-repository.ts:95](/home/gz/projects/finance-tracker-llm/src/modules/dashboard/dashboard-repository.ts:95).

Fix plan:

- Aggregate unpaid spenditures grouped by card in one repository query.
- Return grouped totals to service layer and compute `total_spent`/`available_limit` without per-card DB calls.
- Add indexes needed for grouped lookups on spenditure/card relations.

## 5) Medium — Rates fetcher lifecycle not tied to shutdown

Problem (exact):
[Medium] Rates interval is started but not lifecycle-managed from server shutdown path. See [src/server.ts:16](/home/gz/projects/finance-tracker-llm/src/server.ts:16), [src/api/rates.ts:50](/home/gz/projects/finance-tracker-llm/src/api/rates.ts:50).

Fix plan:

- Register process shutdown hooks and stop background intervals explicitly.
- Close database resources during graceful shutdown.
- Ensure production binary and dev mode both execute the same cleanup path.

## 6) Medium — Duplicated error mapping utilities

Problem (exact):
[Medium] Error-to-HTTP mapping exists in two places; one mapper appears unused, increasing drift risk. See [src/modules/shared/errors.ts:35](/home/gz/projects/finance-tracker-llm/src/modules/shared/errors.ts:35), [src/api/http/response.ts:32](/home/gz/projects/finance-tracker-llm/src/api/http/response.ts:32).

Fix plan:

- Consolidate on one canonical HTTP error mapper.
- Remove or refactor the unused mapper to eliminate duplicate status logic.
- Add a small mapping test matrix to lock status-code behavior.

## 7) Medium — Weak API/UI type safety

Problem (exact):
[Medium] Type safety at API/UI boundary is heavily weakened by `any` usage. See [src/frontend/api.ts:19](/home/gz/projects/finance-tracker-llm/src/frontend/api.ts:19), [src/frontend/pages/CreditCards.tsx:12](/home/gz/projects/finance-tracker-llm/src/frontend/pages/CreditCards.tsx:12).

Fix plan:

- Introduce typed request/response contracts for frontend API methods.
- Replace `any` in `src/frontend/api.ts` and high-traffic pages with inferred contract types.
- Run strict type checks and fail CI on new `any` at API boundaries.

## 8) Medium — Duplicated spenditure validation logic

Problem (exact):
[Medium] Credit-card spenditure validation logic is duplicated across route and service, which can diverge over time. See [src/api/credit-cards.ts:114](/home/gz/projects/finance-tracker-llm/src/api/credit-cards.ts:114), [src/modules/credit-cards/credit-card-service.ts:120](/home/gz/projects/finance-tracker-llm/src/modules/credit-cards/credit-card-service.ts:120).

Fix plan:

- Move spenditure validation/normalization into one canonical function in service or shared validator module.
- Call that same canonical validator from route and service entry points.
- Remove redundant branch logic and keep one source of truth for installment rules.

## 9) Testing Gap — Missing regression coverage for critical payment bugs

Problem (exact):
[Testing gap] The current payment tests don’t cover the two critical card-payment edge cases above. See [tests/payments.test.ts:244](/home/gz/projects/finance-tracker-llm/tests/payments.test.ts:244).

Fix plan:

- Add tests for cross-currency settlement correctness and rejection/handling policy.
- Add tests for sub-installment payment amounts to guarantee no balance deduction without debt change.
- Assert full transaction atomicity and unchanged state on rejected operations.
