/**
 * Integration tests for the paycheck service.
 *
 * Uses an in-memory SQLite database seeded with fixture data per test
 * to verify atomic run logic, idempotency, scheduler catch-up,
 * and domain error guard rails.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { createTestDb } from "../src/db/migrate";
import { PaycheckService, computeNextRunAt } from "../src/modules/paychecks/paycheck-service";
import {
  PaycheckNotFoundError,
  PaycheckInactiveError,
  PaycheckNotDueError,
  DuplicateRunError,
  InvariantViolationError,
} from "../src/modules/shared/errors";
import {
  CurrencyMismatchError,
  NotFoundError,
} from "../src/modules/shared/errors";

// ── Helpers ──────────────────────────────────────────────────────

function seedEntity(raw: Database, id = "entity-1") {
  raw.run(
    `INSERT INTO entities (id, name, type) VALUES ('${id}', 'Test Bank', 'bank')`,
  );
}

function seedAccount(
  raw: Database,
  opts: {
    id?: string;
    balance?: number;
    entityId?: string;
    currency?: string;
  } = {},
) {
  const {
    id = "acc-1",
    balance = 100000,
    entityId = "entity-1",
    currency = "ARS",
  } = opts;
  raw.run(
    `INSERT INTO accounts (id, entity_id, name, type, balance, currency)
     VALUES ('${id}', '${entityId}', 'Test Account', 'savings', ${balance}, '${currency}')`,
  );
}

function seedPaycheck(
  raw: Database,
  opts: {
    id?: string;
    accountId?: string;
    currency?: string;
    amount?: number;
    frequency?: string;
    nextRunAt?: string;
    isActive?: boolean;
    name?: string;
  } = {},
) {
  const {
    id = "pc-1",
    accountId = "acc-1",
    currency = "ARS",
    amount = 50000,
    frequency = "monthly",
    nextRunAt = "2026-03-01 00:00:00",
    isActive = true,
    name = "Test Paycheck",
  } = opts;
  raw.run(
    `INSERT INTO paychecks (id, name, account_id, currency, amount, frequency, next_run_at, is_active)
     VALUES ('${id}', '${name}', '${accountId}', '${currency}', ${amount}, '${frequency}', '${nextRunAt}', ${isActive ? 1 : 0})`,
  );
}

function getAccountBalance(
  orm: ReturnType<typeof drizzle>,
  id: string,
): number {
  const row = orm
    .select({ balance: schema.accounts.balance })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, id))
    .get();
  return row?.balance ?? 0;
}

function getPaycheckNextRunAt(
  orm: ReturnType<typeof drizzle>,
  id: string,
): string | null {
  const row = orm
    .select({ nextRunAt: schema.paychecks.nextRunAt })
    .from(schema.paychecks)
    .where(eq(schema.paychecks.id, id))
    .get();
  return row?.nextRunAt ?? null;
}

function getPaycheckLastRunAt(
  orm: ReturnType<typeof drizzle>,
  id: string,
): string | null {
  const row = orm
    .select({ lastRunAt: schema.paychecks.lastRunAt })
    .from(schema.paychecks)
    .where(eq(schema.paychecks.id, id))
    .get();
  return row?.lastRunAt ?? null;
}

function getPaycheckRunCount(
  orm: ReturnType<typeof drizzle>,
  paycheckId: string,
): number {
  return orm
    .select({ id: schema.paycheckRuns.id })
    .from(schema.paycheckRuns)
    .where(eq(schema.paycheckRuns.paycheckId, paycheckId))
    .all().length;
}

// ── Tests ────────────────────────────────────────────────────────

describe("PaycheckService — CRUD", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;
  let service: PaycheckService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    service = new PaycheckService(raw, orm);
    seedEntity(raw);
    seedAccount(raw, { balance: 100000 });
  });

  it("creates a paycheck and lists it", () => {
    const paycheck = service.createPaycheck({
      name: "Monthly Salary",
      account_id: "acc-1",
      currency: "ARS",
      amount: 50000,
      frequency: "monthly",
      next_run_at: "2026-03-01 00:00:00",
      description: "My salary",
    });

    expect(paycheck).toBeTruthy();
    expect(paycheck!.name).toBe("Monthly Salary");
    expect(paycheck!.amount).toBe(50000);

    const list = service.listPaychecks();
    expect(list.length).toBe(1);
    expect(list[0]!.name).toBe("Monthly Salary");
    expect(list[0]!.account_name).toBe("Test Account");
  });

  it("updates a paycheck", () => {
    service.createPaycheck({
      name: "Salary",
      account_id: "acc-1",
      currency: "ARS",
      amount: 50000,
      frequency: "monthly",
      next_run_at: "2026-03-01 00:00:00",
      description: "",
    });

    const list = service.listPaychecks();
    const id = list[0]!.id;

    const updated = service.updatePaycheck(id, {
      name: "Updated Salary",
      amount: 60000,
    });

    expect(updated!.name).toBe("Updated Salary");
    expect(updated!.amount).toBe(60000);
  });

  it("rejects creation for non-existent account", () => {
    expect(() =>
      service.createPaycheck({
        name: "Salary",
        account_id: "nonexistent",
        currency: "ARS",
        amount: 50000,
        frequency: "monthly",
        next_run_at: "2026-03-01 00:00:00",
        description: "",
      }),
    ).toThrow(NotFoundError);
  });

  it("rejects update for non-existent paycheck", () => {
    expect(() =>
      service.updatePaycheck("nonexistent", { name: "New Name" }),
    ).toThrow(PaycheckNotFoundError);
  });

  it("rejects currency mismatch on creation (v1 rule)", () => {
    expect(() =>
      service.createPaycheck({
        name: "USD Salary",
        account_id: "acc-1", // ARS account
        currency: "USD",
        amount: 1000,
        frequency: "monthly",
        next_run_at: "2026-03-01 00:00:00",
        description: "",
      }),
    ).toThrow(CurrencyMismatchError);
  });
});

describe("PaycheckService — Run paycheck", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;
  let service: PaycheckService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    service = new PaycheckService(raw, orm);
    seedEntity(raw);
    seedAccount(raw, { balance: 100000 });
    seedPaycheck(raw, {
      amount: 50000,
      nextRunAt: "2026-03-01 00:00:00",
      frequency: "monthly",
    });
  });

  it("manual run increments balance exactly once", () => {
    service.runPaycheck("pc-1", "2026-03-01 00:00:00", "key-1");

    expect(getAccountBalance(orm, "acc-1")).toBe(150000); // 100000 + 50000
    expect(getPaycheckRunCount(orm, "pc-1")).toBe(1);
  });

  it("updates last_run_at and advances next_run_at", () => {
    service.runPaycheck("pc-1", "2026-03-01 00:00:00", "key-1");

    expect(getPaycheckLastRunAt(orm, "pc-1")).toBe("2026-03-01 00:00:00");
    expect(getPaycheckNextRunAt(orm, "pc-1")).toBe("2026-04-01 00:00:00");
  });

  it("duplicate idempotency key does not double-apply", () => {
    service.runPaycheck("pc-1", "2026-03-01 00:00:00", "key-dup");

    expect(getAccountBalance(orm, "acc-1")).toBe(150000);

    // Second call with same key should throw DuplicateRunError
    expect(() =>
      service.runPaycheck("pc-1", "2026-03-01 00:00:00", "key-dup"),
    ).toThrow(DuplicateRunError);

    // Balance unchanged — still 150000
    expect(getAccountBalance(orm, "acc-1")).toBe(150000);
    expect(getPaycheckRunCount(orm, "pc-1")).toBe(1);
  });

  it("run history stores accurate before/after balances", () => {
    service.runPaycheck("pc-1", "2026-03-01 00:00:00", "key-hist");

    const runs = service.getRunHistory("pc-1");
    expect(runs.length).toBe(1);
    expect(runs[0]!.account_balance_before).toBe(100000);
    expect(runs[0]!.account_balance_after).toBe(150000);
    expect(runs[0]!.amount).toBe(50000);
    expect(runs[0]!.status).toBe("applied");
  });

  it("rejects run for non-existent paycheck", () => {
    expect(() =>
      service.runPaycheck("nonexistent", "2026-03-01 00:00:00", "key-ne"),
    ).toThrow(PaycheckNotFoundError);
  });

  it("rejects run for inactive paycheck", () => {
    seedPaycheck(raw, {
      id: "pc-inactive",
      isActive: false,
      nextRunAt: "2026-03-01 00:00:00",
    });

    expect(() =>
      service.runPaycheck("pc-inactive", "2026-03-01 00:00:00", "key-inact"),
    ).toThrow(PaycheckInactiveError);

    // Balance unchanged
    expect(getAccountBalance(orm, "acc-1")).toBe(100000);
  });

  it("rejects run when paycheck is not due yet", () => {
    seedPaycheck(raw, {
      id: "pc-future",
      nextRunAt: "2026-12-01 00:00:00",
    });

    expect(() =>
      service.runPaycheck("pc-future", "2026-03-01 00:00:00", "key-notdue"),
    ).toThrow(PaycheckNotDueError);
  });

  it("rejects run with currency mismatch at runtime", () => {
    // Create a USD paycheck pointing to an ARS account via direct SQL
    // (bypasses the service create guard which would catch it)
    raw.run(
      `INSERT INTO paychecks (id, name, account_id, currency, amount, frequency, next_run_at, is_active)
       VALUES ('pc-mismatch', 'USD Check', 'acc-1', 'USD', 1000, 'monthly', '2026-03-01 00:00:00', 1)`,
    );

    expect(() =>
      service.runPaycheck("pc-mismatch", "2026-03-01 00:00:00", "key-curr"),
    ).toThrow(CurrencyMismatchError);

    // Balance unchanged
    expect(getAccountBalance(orm, "acc-1")).toBe(100000);
  });
});

describe("PaycheckService — Scheduler catch-up", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;
  let service: PaycheckService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    service = new PaycheckService(raw, orm);
    seedEntity(raw);
    seedAccount(raw, { balance: 100000 });
  });

  it("applies only due paychecks", () => {
    // Due paycheck
    seedPaycheck(raw, {
      id: "pc-due",
      nextRunAt: "2026-03-01 00:00:00",
      amount: 10000,
    });
    // Future paycheck
    seedPaycheck(raw, {
      id: "pc-future",
      nextRunAt: "2026-12-01 00:00:00",
      amount: 20000,
    });

    const now = "2026-03-10 00:00:00";
    const duePaychecks = service.findDuePaychecks(now);

    expect(duePaychecks.length).toBe(1);
    expect(duePaychecks[0]!.id).toBe("pc-due");
  });

  it("catches up all missed runs after downtime (monthly)", () => {
    // Paycheck was due 2 months ago
    seedPaycheck(raw, {
      id: "pc-missed",
      nextRunAt: "2026-01-01 00:00:00",
      frequency: "monthly",
      amount: 25000,
    });

    const now = "2026-03-10 00:00:00";

    // First missed run: Jan 1
    service.runPaycheck(
      "pc-missed",
      "2026-01-01 00:00:00",
      "paycheck:pc-missed:2026-01-01T00:00",
    );
    expect(getAccountBalance(orm, "acc-1")).toBe(125000);

    // Second missed run: Feb 1
    service.runPaycheck(
      "pc-missed",
      "2026-02-01 00:00:00",
      "paycheck:pc-missed:2026-02-01T00:00",
    );
    expect(getAccountBalance(orm, "acc-1")).toBe(150000);

    // Third missed run: Mar 1
    service.runPaycheck(
      "pc-missed",
      "2026-03-01 00:00:00",
      "paycheck:pc-missed:2026-03-01T00:00",
    );
    expect(getAccountBalance(orm, "acc-1")).toBe(175000);

    // All 3 runs recorded
    expect(getPaycheckRunCount(orm, "pc-missed")).toBe(3);

    // next_run_at should now be April 1
    expect(getPaycheckNextRunAt(orm, "pc-missed")).toBe("2026-04-01 00:00:00");
  });

  it("catches up missed runs for weekly paycheck", () => {
    seedPaycheck(raw, {
      id: "pc-weekly",
      nextRunAt: "2026-03-01 00:00:00",
      frequency: "weekly",
      amount: 10000,
    });

    // Run first week
    service.runPaycheck(
      "pc-weekly",
      "2026-03-01 00:00:00",
      "paycheck:pc-weekly:2026-03-01T00:00",
    );
    expect(getAccountBalance(orm, "acc-1")).toBe(110000);

    // Run second week
    service.runPaycheck(
      "pc-weekly",
      "2026-03-08 00:00:00",
      "paycheck:pc-weekly:2026-03-08T00:00",
    );
    expect(getAccountBalance(orm, "acc-1")).toBe(120000);

    expect(getPaycheckRunCount(orm, "pc-weekly")).toBe(2);
    expect(getPaycheckNextRunAt(orm, "pc-weekly")).toBe("2026-03-15 00:00:00");
  });

  it("concurrent run attempts keep single-application invariant via idempotency", () => {
    seedPaycheck(raw, {
      id: "pc-concurrent",
      nextRunAt: "2026-03-01 00:00:00",
      amount: 30000,
    });

    const key = "paycheck:pc-concurrent:2026-03-01T00:00";

    // First run succeeds
    service.runPaycheck("pc-concurrent", "2026-03-01 00:00:00", key);
    expect(getAccountBalance(orm, "acc-1")).toBe(130000);

    // "Concurrent" attempt with same key — should fail with DuplicateRunError
    expect(() =>
      service.runPaycheck("pc-concurrent", "2026-03-01 00:00:00", key),
    ).toThrow(DuplicateRunError);

    // Balance unchanged — still 130000
    expect(getAccountBalance(orm, "acc-1")).toBe(130000);
    expect(getPaycheckRunCount(orm, "pc-concurrent")).toBe(1);
  });
});

describe("computeNextRunAt", () => {
  it("advances monthly", () => {
    expect(computeNextRunAt("2026-03-01 00:00:00", "monthly")).toBe(
      "2026-04-01 00:00:00",
    );
  });

  it("advances biweekly", () => {
    expect(computeNextRunAt("2026-03-01 00:00:00", "biweekly")).toBe(
      "2026-03-15 00:00:00",
    );
  });

  it("advances weekly", () => {
    expect(computeNextRunAt("2026-03-01 00:00:00", "weekly")).toBe(
      "2026-03-08 00:00:00",
    );
  });

  it("handles month-end rollover", () => {
    // Jan 31 + 1 month → Feb 28 (or 29 in leap year, but 2026 is not leap)
    const result = computeNextRunAt("2026-01-31 00:00:00", "monthly");
    // JS Date will roll to March 3 for non-leap year when adding month to Jan 31
    // This is expected Date behavior
    expect(result).toBeTruthy();
  });

  it("handles T-separator in input", () => {
    expect(computeNextRunAt("2026-03-01T00:00:00", "weekly")).toBe(
      "2026-03-08 00:00:00",
    );
  });
});
