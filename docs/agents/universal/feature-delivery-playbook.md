# Feature Delivery Playbook

Use this playbook for new features, substantial enhancements, or refactors that change behavior.

## 1. Start with a short implementation brief

Before editing code, capture:

- Goal: what user or system capability is being added.
- Non-goals: what is intentionally out of scope.
- Existing patterns to preserve: current layering, naming, contract style, persistence approach, test style.
- Main change surface: modules, services, jobs, data stores, reports, or UI areas likely to move.
- Invariants: rules that must remain true before and after the change.
- Risk areas: migrations, concurrency, retries, performance, precision, backward compatibility, operations.
- Test plan: how the behavior will be proven.

This brief does not need to be long. It needs to be specific enough that the implementation order is obvious.

## 2. Inspect current patterns before writing new abstractions

- Find the closest existing feature and mirror its structure when that structure is healthy.
- Reuse existing helpers, validators, serializers, repositories, service patterns, and UI primitives before creating new ones.
- Avoid introducing new frameworks, layers, or generic utilities unless the current task clearly needs them.

## 3. Change the foundations first

A reliable order is:

1. Shared schema, file format, contracts, or domain types.
2. Canonical validation and normalization logic.
3. Core algorithm, calculation, or business-rule path.
4. Persistence or gateway changes.
5. Use-case orchestration, transactions, and error handling.
6. Adapters such as HTTP, CLI, jobs, or message handlers.
7. UI, reporting, notebooks, or other consumer-facing surfaces.
8. Tests, docs, and operational wiring.

This order reduces rework. The outer layers should depend on the inner rules, not recreate them.

## 4. Create one canonical path for the new behavior

For any important new behavior, define the one place that owns it:

- one normalization path for incoming data,
- one calculation path for totals or derived fields,
- one mutation path for write logic,
- one error-mapping path for outward behavior.

If create and update must enforce the same rule, they should call the same validator or core function. If API, batch, and scheduler flows must behave the same way, they should converge on the same use-case method.

## 5. Make state changes safe from day one

When the feature mutates durable state:

- Define the atomic boundary early.
- Re-read mutable rows or records inside that boundary.
- Add idempotency or dedupe strategy for retryable operations.
- Decide what must happen on partial failure: rollback, compensation, tombstone, or explicit failed-run record.
- Verify that rejected operations do not produce hidden state changes.

## 6. Treat data evolution as part of the feature

If storage or file formats change:

- Keep one canonical schema definition.
- Generate or script migrations from that source where possible.
- Commit schema changes together with migration or backfill logic.
- Use phased migration for non-trivial changes: additive change first, backfill second, stricter constraint last.
- Add a realistic migration test when the project depends on persisted history or backward compatibility.

## 7. Keep consumers thin

Adapters and frontends should usually:

- parse inputs,
- call the core or service layer,
- render returned data,
- surface success or failure.

They should not recompute backend totals, duplicate domain rules, or silently reinterpret output. Display layers are consumers, not alternate business-rule engines.

## 8. Plan the right tests, not the most tests

Choose the narrowest useful mix:

- Unit tests for pure parsing, formatting, and algorithmic logic.
- Integration tests for workflows that cross the database, filesystem, network, queue, or multiple modules.
- Contract tests when shared interfaces must remain stable across components.
- Migration tests for schema changes.
- Concurrency or retry tests when invariants depend on atomicity or idempotency.

Success criteria should assert meaningful state and invariants, not only response codes or UI toasts.

## 9. Run a final implementation audit

Before finishing, check:

- No business rule is stranded in a transport or presentation layer.
- No important logic is duplicated across create/update/import/batch paths.
- Public contracts and internal types still align.
- Performance remains acceptable for collection-sized workloads.
- Startup, shutdown, and background processing are still correct if the feature added workers, intervals, or connections.
- Logs, errors, and docs reflect the new behavior.

## Feature Done Checklist

- [ ] Goals and non-goals are clear.
- [ ] New behavior fits existing architecture instead of bypassing it.
- [ ] Canonical validation, normalization, and core rule paths exist.
- [ ] Multi-step mutations are atomic and replay-safe where needed.
- [ ] Schema or format changes include migration or conversion support.
- [ ] Consumers reuse backend or core outputs instead of recalculating them independently.
- [ ] Tests cover invariants, failure modes, and realistic persistence behavior.
- [ ] Operational concerns are handled if the feature adds long-running work.
