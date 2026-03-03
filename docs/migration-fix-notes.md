# Migration Fix Notes

## Findings

- `bun run db:migrate` was reading `drizzle.config.ts` without `dbCredentials.url`, causing `url: undefined`.
- `src/db/migrations/0000_initial.sql` had lost DB-level enum `CHECK` constraints that existed in the legacy bootstrap schema.

## Fix

- Added a shared SQLite path resolver: `src/db/sqlite-path.ts`.
- Updated `src/db/database.ts` and `drizzle.config.ts` to use the shared resolver, with `drizzle.config.ts` using a `file:` libsql URL.
- Restored enum `CHECK` constraints in `0000_initial.sql` for `entities.type`, `accounts.type`, `payments.type`, and `cc_spenditures.currency`.
- Installed `@libsql/client` for `drizzle-kit migrate` (Drizzle Kit CLI in this version does not connect through Bun's `bun:sqlite` driver).

## Verification

- Dev URL resolves to project-local SQLite file: `bun -e "import config from './drizzle.config.ts'; console.log(config.dbCredentials);"`
- Production URL follows OS-specific app-data location pattern: `NODE_ENV=production bun -e "import { getSqliteDbPath } from './src/db/sqlite-path.ts'; console.log(getSqliteDbPath());"`
- Manual migration command works: `bun run db:migrate`
- Constraint coverage test passes: `bun test tests/migrations.test.ts`
