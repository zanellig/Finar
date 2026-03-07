# Migration Fix Notes

Status as of March 3, 2026.

## Issue Summary

- `bun run db:migrate` previously read `drizzle.config.ts` without a valid SQLite URL.
- Initial migration had drift from legacy bootstrap constraints.

## Current Implementation

- Shared DB path resolver: `src/db/sqlite-path.ts`.
- DB initialization: `src/db/database.ts`.
- Migration runner + legacy baseline logic: `src/db/migrate.ts`.
- Canonical migration SQL: `src/db/migrations/0000_initial.sql`.

## Constraint Coverage Restored

`0000_initial.sql` now preserves enum-like `CHECK` constraints for:

- `entities.type`
- `accounts.type`
- `cc_spenditures.currency`
- `payments.type`

## Verification Commands

```bash
bun -e "import config from './drizzle.config.ts'; console.log(config.dbCredentials);"
NODE_ENV=production bun -e "import { getSqliteDbPath } from './src/db/sqlite-path.ts'; console.log(getSqliteDbPath());"
bun run db:migrate
bun test tests/migrations.test.ts
```

## Notes for Future Migrations

- Keep schema evolution migration-first (`src/db/migrations/*.sql`).
- Avoid raw bootstrap schema duplication outside migration files.
- Use `createTestDb()` from `src/db/migrate.ts` in tests that rely on real schema state.
