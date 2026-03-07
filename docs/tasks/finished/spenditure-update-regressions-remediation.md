# Spenditure Update Regressions Remediation Tasks

## 1) P1 — Preserve ARS-only installment invariant on spenditure updates

Problem:
[P1] The update flow recomputes `newCurrency` and `newInstallments` without enforcing the ARS-only installment rule used in create, allowing unsupported USD installment states (`currency: "USD"` with `installments > 1`). See [src/modules/credit-cards/credit-card-service.ts:205](/home/gz/projects/finance-tracker-llm/src/modules/credit-cards/credit-card-service.ts:205), [src/modules/credit-cards/credit-card-service.ts:206](/home/gz/projects/finance-tracker-llm/src/modules/credit-cards/credit-card-service.ts:206).

Fix plan:

- Re-apply the same installment currency invariant in the update path used by create.
- Reject updates that produce `USD` with `installments > 1` before persisting.
- Add regression tests for both transition cases: ARS installments switched to USD, and USD 1x changed to multi-installment.

## 2) P2 — Reject empty spenditure updates before issuing DB update

Problem:
[P2] When update payload has no recognized fields (for example `{}`), parsed schemas succeed but update `values` is empty, and Drizzle `.set({})` throws `No values to set`, returning a 500 instead of controlled validation feedback. See [src/modules/credit-cards/credit-card-service.ts:244](/home/gz/projects/finance-tracker-llm/src/modules/credit-cards/credit-card-service.ts:244).

Fix plan:

- Add an explicit guard that rejects empty effective updates before calling repository update.
- Return a domain validation error (4xx) with a clear message for no-op/invalid payloads.
- Add test coverage for `{}` and unknown-only payloads on `PUT /api/credit-cards/:id/spenditures/:spendId`.

## 3) P2 — Send installment edits with `total_amount` from the UI

Problem:
[P2] The edit modal always sends financial edits as `payload.amount`, but backend only applies `amount` when `installments === 1`; multi-installment edits to “Monto total” report success but do not update `total_amount`. See [src/frontend/pages/CreditCards.tsx:220](/home/gz/projects/finance-tracker-llm/src/frontend/pages/CreditCards.tsx:220), [src/frontend/pages/CreditCards.tsx:223](/home/gz/projects/finance-tracker-llm/src/frontend/pages/CreditCards.tsx:223).

Fix plan:

- Update frontend payload mapping to send `total_amount` for multi-installment spenditures.
- Keep single-installment behavior unchanged by continuing to send `amount` for 1x entries.
- Add UI/API integration regression tests to assert edited installment totals persist correctly.
