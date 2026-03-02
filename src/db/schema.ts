import { Database } from "bun:sqlite";

export function initializeSchema(db: Database): void {
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");

  db.run(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bank', 'wallet', 'asset_manager')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS loans (
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS credit_cards (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      spend_limit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cc_spenditures (
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('cc', 'loan')),
      target_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id TEXT PRIMARY KEY,
      pair TEXT NOT NULL,
      buy_rate REAL NOT NULL,
      sell_rate REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'blue',
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}
