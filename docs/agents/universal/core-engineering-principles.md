# Core Engineering Principles

Use these as defaults on any codebase unless the repository already defines a better house style.

## 1. Extend the existing architecture before inventing a new one

- Spend a few minutes identifying the current layering, naming, test style, and data flow.
- Fit new work into existing seams when they are sound.
- If the current structure is weak, improve the smallest stable seam needed for the task instead of introducing a full rewrite.

## 2. Keep boundaries explicit

A strong default split is:

- Adapters / entry points: HTTP handlers, CLI commands, jobs, notebook entry cells, UI actions. They parse inputs, call core logic, and translate outputs or failures.
- Application / use-case layer: orchestration, sequencing, authorization, transaction boundaries, retries, and workflow rules.
- Domain / core logic: business rules, algorithms, calculations, invariants, and pure transformations.
- Infrastructure layer: database access, filesystem, queues, external APIs, SDK wrappers, model providers.

Rules:

- Do not hide business rules in controllers, views, SQL, or shell glue.
- Do not let persistence or transport details leak through core logic without intent.
- In non-OOP codebases, the same split can be implemented with modules and functions instead of classes.

## 3. Put each important rule in one canonical place

- Validation, normalization, calculations, aggregation, and mapping logic should each have a clear owner.
- Create, update, batch, import, and background paths should reuse the same canonical logic instead of re-implementing it.
- Duplicate logic is a regression factory. If two paths must behave the same way, make them call the same code.

## 4. Validate at trust boundaries and normalize once

- Parse and validate every external input: HTTP payloads, CLI args, files, messages, environment variables, notebook parameters, and third-party responses.
- Normalize naming, units, precision, time zones, encodings, and IDs once at the boundary.
- Keep wire or storage shapes separate from internal shapes when that improves clarity.
- If the language supports strong types, use them. If it does not, compensate with explicit validation and small, well-named data structures.

## 5. Make failures explicit and map them consistently

- Prefer typed errors, result objects, status enums, or another structured failure model over ad hoc strings.
- Keep one canonical translation layer from domain failures to outward surfaces such as HTTP status codes, CLI exit codes, UI messages, or pipeline alerts.
- Unknown failures should keep enough context to debug them quickly.

## 6. Make multi-step mutations atomic

- Any change that spans multiple writes or a read-modify-write cycle needs an atomicity strategy: transaction, lock, compare-and-swap, temp-file swap, or equivalent.
- Re-read mutable state inside the atomic section before changing it.
- Rejected or failed operations must leave state unchanged.
- Retryable or scheduled operations should usually have idempotency keys, dedupe tokens, or another replay-safe mechanism.

## 7. Treat contracts and schemas as first-class artifacts

- Keep public contracts, shared schemas, file formats, and storage models in well-known locations.
- Derive boilerplate from those sources when practical, rather than copying shapes by hand across layers.
- Commit schema changes together with the migration, backfill, or conversion logic that makes them safe.
- For breaking data changes, prefer phased rollout: add new field or path, backfill or dual-write, then enforce the new constraint and remove the old path.

## 8. Preserve operational reality

- Background workers, timers, threads, caches, and external connections need explicit startup and shutdown behavior.
- Long-running services benefit from a simple health check or self-test path.
- Batch and data-analysis workflows should define checkpointing, retry, and cleanup behavior explicitly.
- Do not assume dev-mode behavior is enough for production, cron, or CI.

## 9. Design against predictable performance failures

- Watch for N+1 queries, repeated scans, repeated network calls, accidental O(n^2) loops, and unnecessary serialization or parsing.
- Prefer bulk reads, grouped aggregation, batching, and cacheable lookups when loading collections.
- Add indexes or data-structure changes to match real access patterns, not guesses.
- Keep response or output shape stable when optimizing internals unless a product change is intentional.

## 10. Let tests encode invariants, not just happy paths

- Unit tests are good for pure logic; integration tests are often better for workflows that cross boundaries.
- Assert post-conditions, persisted state, and unchanged state on failure.
- Add regression tests for the exact bug class you are fixing, not only the specific example that surfaced it.
- For concurrency-sensitive flows, test parallel attempts or retry paths directly.
- For persistence-heavy work, test real migrations or realistic fixtures when possible.

## 11. Prefer small, composable changes

- Change foundations first, then orchestration, then adapters, then UI or reporting surfaces.
- Keep each commit or patch explainable in one sentence.
- If a task is large, split it into ordered phases so later steps reuse earlier canonical work instead of bypassing it.

## 12. Default review questions

Before calling a task done, ask:

- Is the rule implemented in the right layer?
- Did I reuse the canonical validation and calculation path?
- Could this fail partially under retries, concurrency, or shutdown?
- Did I protect performance on collection-sized workloads?
- Will future contributors know where this rule now lives?
