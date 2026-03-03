# End-to-End Type Safety Options

This document evaluates production-grade approaches for achieving full-stack type safety between the backend and frontend in TypeScript applications. Each option is assessed for integration with our current stack (Bun + React + Drizzle ORM + Zod).

---

## Current State

Our backend uses Drizzle ORM with `drizzle-zod` for schema-derived Zod validation. The API layer returns snake_case JSON. The frontend consumes these via a thin `fetch` wrapper (`src/frontend/api.ts`) with `any` types.

**Gap**: The frontend has no compile-time knowledge of API response shapes or request payloads.

---

## Option 1: Shared Zod Schemas (Zero-Dependency)

**What**: Export Zod schemas from a shared `src/shared/types.ts` module, imported by both backend API routes and frontend API client.

**Pros**:

- No new dependencies
- Works with any transport (REST, WebSocket)
- Runtime validation on both sides
- Already half-implemented — `src/db/validation.ts` has the schemas

**Cons**:

- Manual effort to keep API contract types in sync
- No auto-generated client or route discovery

**Implementation**:

```
src/
  shared/
    types.ts       ← Zod schemas + inferred types
  api/
    entities.ts    ← imports from shared/types
  frontend/
    api.ts         ← imports from shared/types
```

**Verdict**: **Best fit for our current architecture**. Minimal friction, no new deps.

---

## Option 2: tRPC

**What**: Type-safe RPC layer that generates a fully typed client from server procedure definitions.

**Pros**:

- Zero-codegen: client types are inferred directly from server code
- Input validation via Zod built-in
- Batched requests, subscriptions (WebSocket)
- Massive ecosystem (adapters for Express, Fastify, Next.js, etc.)

**Cons**:

- Opinionated routing model (procedures, not REST endpoints)
- Requires adapter for Bun.serve() (no official adapter, community ones exist)
- Not RESTful — breaks `curl`/Postman/API explorer compatibility
- Heavier dependency tree

**Integration with our stack**:

```typescript
// server
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
const appRouter = t.router({
  entities: t.router({
    list: t.procedure.query(() => db.select().from(entities).all()),
    create: t.procedure.input(insertEntitySchema).mutation(({ input }) => { ... }),
  }),
});
export type AppRouter = typeof appRouter;

// client
import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '../server';
const trpc = createTRPCClient<AppRouter>({ ... });
const entities = await trpc.entities.list.query(); // fully typed
```

**Verdict**: Excellent for greenfield projects. Overkill for our simple CRUD app unless we plan to scale significantly.

---

## Option 3: Hono RPC

**What**: Hono is a lightweight web framework with built-in RPC-style type-safe client generation.

**Pros**:

- Ultra lightweight (~14KB)
- Native Bun support (Hono was designed for edge runtimes)
- REST-compatible — keeps standard HTTP routes
- Type-safe client via `hc<typeof app>()` (RPC-style)
- Zod validation via `@hono/zod-validator`

**Cons**:

- Would require replacing Bun.serve() routing with Hono's router
- Smaller ecosystem than tRPC
- Type inference requires app type export

**Integration**:

```typescript
// server
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

const app = new Hono()
  .get('/api/entities', (c) => c.json(db.select().from(entities).all()))
  .post('/api/entities', zValidator('json', insertEntitySchema), (c) => { ... });
export type App = typeof app;

// client
import { hc } from 'hono/client';
import type { App } from '../server';
const client = hc<App>('/');
const res = await client.api.entities.$get(); // typed
```

**Verdict**: Strong option if migrating away from raw Bun.serve(). REST-compatible, tiny footprint.

---

## Option 4: ts-rest

**What**: Contract-first REST API with shared type definitions and auto-generated client.

**Pros**:

- Keeps REST semantics (unlike tRPC)
- Contract defined once, used by both server and client
- Works with any HTTP server (Bun, Express, Fastify)
- OpenAPI spec generation from contracts
- Incremental adoption — can convert route by route

**Cons**:

- Requires defining contracts upfront (additional boilerplate)
- Smaller community than tRPC
- No native Bun adapter (uses fetch-compatible adapter)

**Integration**:

```typescript
// contract (shared)
import { initContract } from "@ts-rest/core";
const c = initContract();
export const contract = c.router({
  getEntities: {
    method: "GET",
    path: "/api/entities",
    responses: { 200: selectEntitySchema.array() },
  },
  createEntity: {
    method: "POST",
    path: "/api/entities",
    body: insertEntitySchema,
    responses: { 201: selectEntitySchema },
  },
});

// client
import { initClient } from "@ts-rest/core";
const client = initClient(contract, { baseUrl: "" });
const { body } = await client.getEntities(); // Entity[]
```

**Verdict**: Best option if REST semantics + OpenAPI generation are priorities.

---

## Option 5: OpenAPI + Zodios

**What**: Generate an OpenAPI spec from Zod schemas, then use Zodios to create a fully typed, axios-like client.

**Pros**:

- Industry-standard API documentation (Swagger UI)
- Client can be generated for any language (not just TS)
- Runtime validation on client side
- Works with existing REST endpoints

**Cons**:

- Requires maintaining OpenAPI spec or generating from Zod
- Zodios adds bundle size to the frontend
- More moving parts than simpler options

**Integration**:

```typescript
// Zodios client
import { Zodios } from "@zodios/core";
const api = new Zodios("/api", [
  { method: "get", path: "/entities", response: selectEntitySchema.array() },
  {
    method: "post",
    path: "/entities",
    parameters: [{ type: "Body", schema: insertEntitySchema }],
    response: selectEntitySchema,
  },
]);
const entities = await api.getEntities(); // Entity[]
```

**Verdict**: Best for public APIs or multi-language consumers. Heavy for internal apps.

---

## Option 6: ElysiaJS + Eden

**What**: Bun-native web framework with its own type-safe client (Eden).

**Pros**:

- Built specifically for Bun — maximum performance
- End-to-end type safety via Eden Treaty client
- Automatic OpenAPI documentation
- Built-in validation, lifecycle hooks
- Active Bun-first development

**Cons**:

- Requires full framework adoption (replaces Bun.serve)
- Ecosystem is younger than alternatives
- Eden only works with Elysia (no incremental adoption)

**Integration**:

```typescript
// server
import { Elysia, t } from 'elysia';
const app = new Elysia()
  .get('/api/entities', () => db.select().from(entities).all())
  .post('/api/entities', ({ body }) => { ... }, { body: t.Object({ name: t.String(), type: t.Union([...]) }) });
export type App = typeof app;

// client
import { treaty } from '@elysiajs/eden';
import type { App } from '../server';
const api = treaty<App>('localhost:3000');
const { data } = await api.api.entities.get(); // typed
```

**Verdict**: Most performant Bun-native option. Ideal for new Bun projects prioritizing speed.

---

## Recommendation Matrix

| Criteria                | Shared Zod | tRPC  | Hono RPC | ts-rest | Zodios | Elysia |
| ----------------------- | :--------: | :---: | :------: | :-----: | :----: | :----: |
| No new deps             |     ✅     |  ❌   |    ❌    |   ❌    |   ❌   |   ❌   |
| REST compatible         |     ✅     |  ❌   |    ✅    |   ✅    |   ✅   |   ✅   |
| Auto-typed client       |     ❌     |  ✅   |    ✅    |   ✅    |   ✅   |   ✅   |
| Incremental adoption    |     ✅     |  ⚠️   |    ⚠️    |   ✅    |   ✅   |   ❌   |
| Bun-native              |     ✅     |  ⚠️   |    ✅    |   ⚠️    |   ⚠️   |   ✅   |
| OpenAPI generation      |     ❌     |  ⚠️   |    ⚠️    |   ✅    |   ✅   |   ✅   |
| Bundle size impact      |    None    | ~20KB |  ~14KB   |  ~8KB   | ~15KB  | ~25KB  |
| Migration effort (ours) |    Low     | High  |  Medium  | Medium  | Medium |  High  |

### For this project: **Shared Zod schemas** → then **Hono RPC** or **ts-rest** when complexity grows.

The current Drizzle + drizzle-zod setup already generates all the Zod schemas we need. The immediate next step is to:

1. Move shared types to `src/shared/types.ts`
2. Replace `any` types in `src/frontend/api.ts` with inferred Zod types
3. Later, if the API surface grows, adopt Hono RPC for auto-typed client generation
