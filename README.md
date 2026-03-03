# finance-tracker-llm

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```

## Database Migrations

The app uses [Drizzle ORM](https://orm.drizzle.team/) for database management. The schema is defined in `src/db/schema.ts` and migrations live in `src/db/migrations/`.

**Migrations run automatically on startup** — the first time the server starts (or after a schema update), pending migrations are applied before accepting requests. No manual migration step is required.

### After changing the schema

If you modify `src/db/schema.ts`, generate a new migration:

```bash
bun run db:generate
```

This creates a new SQL migration file in `src/db/migrations/`. Commit it alongside your schema change.

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
