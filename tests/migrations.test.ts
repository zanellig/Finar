import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { join } from "node:path";
import { runMigrations } from "../src/db/migrate";
import * as schema from "../src/db/schema";

const INITIAL_MIGRATION_PATH = join(
  import.meta.dir,
  "../src/db/migrations/0000_initial.sql",
);

async function loadInitialMigrationSql(): Promise<string> {
  return Bun.file(INITIAL_MIGRATION_PATH).text();
}

function runSqlBatch(raw: Database, sqlBatch: string): void {
  for (const statement of sqlBatch.split("--> statement-breakpoint")) {
    const sql = statement.trim();
    if (!sql) continue;
    raw.run(sql);
  }
}

async function seedLegacySchema(raw: Database): Promise<void> {
  const initialMigration = await loadInitialMigrationSql();
  const legacyBootstrapSql = initialMigration.replaceAll(
    "CREATE TABLE `",
    "CREATE TABLE IF NOT EXISTS `",
  );
  runSqlBatch(raw, legacyBootstrapSql);
}

describe("runMigrations", () => {
  it("baselines a pre-drizzle schema without replaying 0000_initial", async () => {
    const raw = new Database(":memory:", { strict: true });
    raw.run("PRAGMA foreign_keys = ON;");
    await seedLegacySchema(raw);

    const orm = drizzle(raw, { schema });

    expect(() => runMigrations(orm, raw)).not.toThrow();
    expect(() => runMigrations(orm, raw)).not.toThrow();

    const rows = raw
      .query(`SELECT hash, created_at FROM __drizzle_migrations`)
      .all();
    expect(rows).toHaveLength(3);

    raw.close(false);
  });

  it("keeps enum-like CHECK constraints in the initial migration", async () => {
    const raw = new Database(":memory:", { strict: true });
    raw.run("PRAGMA foreign_keys = ON;");

    runSqlBatch(raw, await loadInitialMigrationSql());
    raw.run(
      "INSERT INTO entities (id, name, type) VALUES ('e1', 'Entity', 'bank')",
    );
    raw.run(
      "INSERT INTO accounts (id, entity_id, name, type, balance) VALUES ('a1', 'e1', 'Account', 'savings', 0)",
    );
    raw.run(
      "INSERT INTO credit_cards (id, entity_id, name, spend_limit) VALUES ('c1', 'e1', 'Card', 0)",
    );

    expect(() =>
      raw.run(
        "INSERT INTO entities (id, name, type) VALUES ('e2', 'Invalid Entity', 'invalid')",
      ),
    ).toThrow();

    expect(() =>
      raw.run(
        "INSERT INTO accounts (id, entity_id, name, type, balance) VALUES ('a2', 'e1', 'Invalid Account', 'invalid', 0)",
      ),
    ).toThrow();

    expect(() =>
      raw.run(
        "INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, installments, monthly_amount, total_amount, remaining_installments) VALUES ('s1', 'c1', 'Invalid CC', 100, 'EUR', 1, 100, 100, 1)",
      ),
    ).toThrow();

    expect(() =>
      raw.run(
        "INSERT INTO payments (id, type, target_id, account_id, amount) VALUES ('p1', 'invalid', 'c1', 'a1', 100)",
      ),
    ).toThrow();

    raw.close(false);
  });

  it("has `due_date` column on cc_spenditures after migrations", () => {
    const raw = new Database(":memory:", { strict: true });
    raw.run("PRAGMA foreign_keys = ON;");
    const orm = drizzle(raw, { schema });

    // Seed parent rows BEFORE migrations so backfill can apply
    // We need the initial schema first
    const initialSql = raw.query("SELECT 1").get(); // just to confirm connection

    runMigrations(orm, raw);

    // Seed required parent rows
    raw.run(
      "INSERT INTO entities (id, name, type) VALUES ('e1', 'Entity', 'bank')",
    );
    raw.run(
      "INSERT INTO credit_cards (id, entity_id, name, spend_limit) VALUES ('c1', 'e1', 'Card', 0)",
    );

    // Verify that the column exists by querying it directly
    const columns = raw.query("PRAGMA table_info(cc_spenditures)").all() as {
      name: string;
    }[];
    const dueDateColumn = columns.find((c) => c.name === "due_date");
    expect(dueDateColumn).toBeDefined();

    // New inserts without due_date get NULL (column has no DEFAULT)
    raw.run(
      `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, installments, monthly_amount, total_amount, remaining_installments)
       VALUES ('s1', 'c1', 'Test', 100, 'ARS', 1, 100, 100, 1)`,
    );

    const row = raw
      .query("SELECT due_date FROM cc_spenditures WHERE id = 's1'")
      .get() as { due_date: string | null };

    expect(row).toBeDefined();
    // Column is nullable with no default — new rows get NULL
    expect(row.due_date).toBeNull();

    // Explicit due_date is persisted correctly
    raw.run(
      `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, installments, monthly_amount, total_amount, remaining_installments, due_date)
       VALUES ('s2', 'c1', 'Test 2', 200, 'ARS', 1, 200, 200, 1, '2026-06-01')`,
    );

    const row2 = raw
      .query("SELECT due_date FROM cc_spenditures WHERE id = 's2'")
      .get() as { due_date: string | null };

    expect(row2.due_date).toBe("2026-06-01");

    raw.close(false);
  });
});
