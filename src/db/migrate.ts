import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as schema from "./schema";
import { embeddedMigrations } from "./embedded-migrations";

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

type MigrationJournal = {
  entries: Array<{
    tag: string;
    when: number;
    breakpoints?: boolean;
  }>;
};

function loadEmbeddedMigrations(): MigrationMeta[] {
  const journalRaw = readFileSync(embeddedMigrations.journalPath, "utf8");
  const journal = JSON.parse(journalRaw) as MigrationJournal;

  return journal.entries.map((entry) => {
    const sqlPath = embeddedMigrations.files[entry.tag];
    if (!sqlPath) {
      throw new Error(`Missing embedded migration file for "${entry.tag}".`);
    }

    const sqlText = readFileSync(sqlPath, "utf8");
    return {
      sql: sqlText.split("--> statement-breakpoint"),
      folderMillis: entry.when,
      hash: createHash("sha256").update(sqlText).digest("hex"),
      bps: Boolean(entry.breakpoints),
    };
  });
}

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

function baselineLegacySchema(db: Database, migrations: MigrationMeta[]): void {
  if (hasAppliedMigrations(db) || !isLegacySchemaDatabase(db)) return;

  const [initialMigration] = migrations;
  if (!initialMigration) return;

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
  const migrations = loadEmbeddedMigrations();
  if (rawDb) {
    // Backward-compat for DBs created before Drizzle migrations were introduced.
    baselineLegacySchema(rawDb, migrations);
  }

  const ormAny = orm as unknown as {
    dialect: { migrate: (m: MigrationMeta[], session: unknown, config?: unknown) => void };
    session: unknown;
  };
  ormAny.dialect.migrate(migrations, ormAny.session, {
    migrationsTable: DRIZZLE_MIGRATIONS_TABLE,
  });
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
