import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { runMigrations } from "./migrate";
import { getSqliteDbPath } from "./sqlite-path";

const DB_PATH = getSqliteDbPath();

let rawDb: Database | null = null;
let orm: BunSQLiteDatabase<typeof schema> | null = null;

function initDatabase(): Database {
  const db = new Database(DB_PATH, { create: true, strict: true });

  // PRAGMAs — raw driver only
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");

  // Apply pending migrations — idempotent, safe on every startup
  const ormInstance = drizzle(db, { schema });
  runMigrations(ormInstance, db);
  orm = ormInstance;

  return db;
}

export function getDb(): Database {
  if (!rawDb) {
    rawDb = initDatabase();
  }
  return rawDb;
}

export function getOrm(): BunSQLiteDatabase<typeof schema> {
  if (!orm) {
    orm = drizzle(getDb(), { schema });
  }
  return orm;
}

export function getDbPath(): string {
  return DB_PATH;
}

export function closeDb(): void {
  if (rawDb) {
    rawDb.close(false);
    rawDb = null;
    orm = null;
  }
}
