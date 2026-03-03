import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { join } from "node:path";
import * as schema from "./schema";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");
const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";
const LEGACY_TABLES = [
  "entities",
  "accounts",
  "loans",
  "credit_cards",
  "cc_spenditures",
  "payments",
  "exchange_rates",
] as const;

function tableExists(db: Database, tableName: string): boolean {
  return (
    db.query(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    ).get(tableName) !== null
  );
}

function hasAppliedMigrations(db: Database): boolean {
  if (!tableExists(db, DRIZZLE_MIGRATIONS_TABLE)) {
    return false;
  }

  return (
    db.query(`SELECT 1 FROM ${DRIZZLE_MIGRATIONS_TABLE} LIMIT 1`).get() !== null
  );
}

function isLegacySchemaDatabase(db: Database): boolean {
  return LEGACY_TABLES.every((tableName) => tableExists(db, tableName));
}

function baselineLegacySchema(db: Database): void {
  if (hasAppliedMigrations(db) || !isLegacySchemaDatabase(db)) {
    return;
  }

  const [initialMigration] = readMigrationFiles({
    migrationsFolder: MIGRATIONS_DIR,
  });
  if (!initialMigration) {
    return;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS ${DRIZZLE_MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);
  db.run(
    `INSERT INTO ${DRIZZLE_MIGRATIONS_TABLE} ("hash", "created_at") VALUES (?, ?)`,
    [initialMigration.hash, initialMigration.folderMillis],
  );
}

/**
 * Apply all pending Drizzle migrations to the given database.
 * Idempotent — safe to call on every startup.
 */
export function runMigrations(
  orm: BunSQLiteDatabase<typeof schema>,
  rawDb?: Database,
): void {
  if (rawDb) {
    // Backward-compat for DBs created before Drizzle migrations were introduced.
    baselineLegacySchema(rawDb);
  }

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
  runMigrations(orm, raw);

  return { raw, orm } as const;
}
