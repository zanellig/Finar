# Bugfix Playbook

Use this playbook for defects, regressions, audit findings, and production incidents.

## 1. Write the bug down precisely

Capture five things before changing code:

- Symptom: what the user, system, or metric shows.
- Trigger: the smallest reproducible input or sequence.
- Expected invariant: the rule that should have held.
- Observed bad outcome: wrong value, wrong state, crash, stale output, partial write, performance blow-up, or silent no-op.
- Impact: severity, scope, and whether existing data may already be wrong.

A bug that cannot be stated precisely is likely to be patched in the wrong place.

## 2. Reproduce it in an executable way

Preferred order:

1. Failing automated test.
2. Small script or fixture.
3. Minimal request sequence or CLI invocation.
4. Query, log, or benchmark that proves the bad state.

If you cannot automate the repro immediately, still capture the exact steps and expected result. Then automate it as part of the fix whenever practical.

## 3. Find the violated invariant and its true owner

Ask:

- Which layer should have prevented this?
- Is the bug caused by missing validation, duplicated logic drift, bad normalization, partial mutation, stale cache, race condition, or error translation?
- Is there already a canonical function or module that almost owns this rule?

Fix the rule where it belongs. Avoid stacking temporary guards in outer layers if the core rule is still wrong.

## 4. Fix the class of bug, not just the example

Audit sibling paths after finding the root cause:

- create vs update,
- sync vs async,
- manual vs scheduled,
- API vs UI vs batch import,
- single-item vs bulk path,
- read path vs write path.

Many regressions happen because one path was patched while its twin path kept the old logic.

## 5. Protect state integrity during failure

For bugs involving writes or side effects:

- Make sure rejected operations do not partially mutate state.
- Revisit the atomic boundary if the current flow reads, writes, and validates in the wrong order.
- Add rollback, transactional protection, compare-and-swap, locking, or idempotency when the defect involves retries or races.
- If failed attempts must be auditable, store that outcome deliberately instead of letting partial state imply it.

## 6. Check the common hidden companions

When one bug appears, inspect nearby risks:

- Unit mismatches: currency, precision, time zone, encoding, measurement unit, locale.
- Duplicate validation or error mapping that may drift.
- Empty or no-op updates reaching persistence layers.
- Success responses that do not correspond to persisted state changes.
- N+1 queries or accidental O(n^2) work on collection endpoints or reports.
- Background workers, timers, or connections that are not tied to shutdown.
- Type holes or unchecked dynamic data crossing trust boundaries.

## 7. Prove the fix with regression coverage

Good bugfix verification usually includes:

- the original failing case,
- the generalized bug class if it is cheap to cover,
- unchanged-state assertions for rejected operations,
- concurrency or retry tests when atomicity was the issue,
- performance assertions or profiling checks when the bug was algorithmic.

Do not stop at “the response was 200” or “the UI showed success.” Assert the actual data and side effects.

## 8. Keep outward behavior intentional

When fixing a bug:

- Preserve existing response or output shapes unless a change is intentional.
- If error behavior changes, make it clearer and more consistent rather than merely different.
- Document data repair steps if the bug may have corrupted stored state.
- If the fix adds a new invariant, make that invariant visible in tests and comments where helpful.

## Bugfix Done Checklist

- [ ] The bug is described as a violated invariant, not just a symptom.
- [ ] There is a reliable repro or failing test.
- [ ] The fix lives in the canonical layer that owns the rule.
- [ ] Related paths were audited for the same bug class.
- [ ] Partial writes and retry behavior were checked where relevant.
- [ ] Regression tests assert real state, not only surface-level success.
- [ ] Performance, shutdown, and type-safety side effects were reviewed if relevant.
- [ ] Data repair or operator follow-up is documented when needed.
