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

function runSqlBatch(raw: Database, sqlBatch: string): void {
  for (const statement of sqlBatch.split("--> statement-breakpoint")) {
    const sql = statement.trim();
    if (!sql) continue;
    raw.run(sql);
  }
}

async function seedLegacySchema(raw: Database): Promise<void> {
  const initialMigration = await Bun.file(INITIAL_MIGRATION_PATH).text();
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
    expect(rows).toHaveLength(1);

    raw.close(false);
  });
});
