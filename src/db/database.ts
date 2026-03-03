import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

const DB_NAME = "finance-tracker.sqlite";
const APP_NAME = "FinTracker";
const isDev = process.env.NODE_ENV !== "production";

function getDataDir(): string {
  if (isDev) return ".";

  const platform = process.platform;
  let dir: string;

  if (platform === "win32") {
    dir = join(
      process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
      APP_NAME,
    );
  } else if (platform === "darwin") {
    dir = join(homedir(), "Library", "Application Support", APP_NAME);
  } else {
    dir = join(
      process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
      APP_NAME.toLowerCase(),
    );
  }

  mkdirSync(dir, { recursive: true });
  return dir;
}

const DB_PATH = join(getDataDir(), DB_NAME);

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
