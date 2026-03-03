import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import * as schema from "./schema";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

/**
 * Apply all pending Drizzle migrations to the given database.
 * Idempotent — safe to call on every startup.
 */
export function runMigrations(orm: BunSQLiteDatabase<typeof schema>): void {
  migrate(orm, { migrationsFolder: MIGRATIONS_DIR });
}

/**
 * Create an in-memory SQLite database with migrations applied.
 * Intended for use in tests so the schema definition lives in one place.
 */
export function createTestDb() {
  const raw = new Database(":memory:", { strict: true });
  raw.run("PRAGMA foreign_keys = ON;");

  const orm = drizzle(raw, { schema });
  runMigrations(orm);

  return { raw, orm } as const;
}
