import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as schema from "./schema";

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

  // Schema init — raw SQL for CREATE TABLE IF NOT EXISTS
  // This preserves existing DBs while ensuring tables exist
  db.run(`CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('bank', 'wallet', 'asset_manager')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('savings', 'checking', 'interest')),
    balance REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'ARS',
    daily_extraction_limit REAL,
    monthly_maintenance_cost REAL DEFAULT 0,
    is_salary_account INTEGER NOT NULL DEFAULT 0,
    overdraft_limit REAL DEFAULT 0,
    tna_rate REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    capital REAL NOT NULL,
    installments INTEGER NOT NULL,
    cftea REAL NOT NULL,
    total_owed REAL NOT NULL,
    monthly_payment REAL NOT NULL,
    remaining_installments INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS credit_cards (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    spend_limit REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cc_spenditures (
    id TEXT PRIMARY KEY,
    credit_card_id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'ARS' CHECK(currency IN ('ARS', 'USD')),
    installments INTEGER NOT NULL DEFAULT 1,
    monthly_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    remaining_installments INTEGER NOT NULL DEFAULT 1,
    is_paid_off INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (credit_card_id) REFERENCES credit_cards(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('cc', 'loan')),
    target_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS exchange_rates (
    id TEXT PRIMARY KEY,
    pair TEXT NOT NULL,
    buy_rate REAL NOT NULL,
    sell_rate REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'blue',
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

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
