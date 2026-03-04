/**
 * Integration tests for the dashboard service.
 *
 * Verifies card spend aggregation uses bulk queries (no N+1)
 * and that total_spent / available_limit remain correct.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createTestDb } from "../src/db/migrate";
import { DashboardService } from "../src/modules/dashboard/dashboard-service";

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
    currency?: string;
    entityId?: string;
  } = {},
) {
  const {
    id = "acc-1",
    balance = 100000,
    currency = "ARS",
    entityId = "entity-1",
  } = opts;
  raw.run(
    `INSERT INTO accounts (id, entity_id, name, type, balance, currency)
     VALUES ('${id}', '${entityId}', 'Test Account', 'savings', ${balance}, '${currency}')`,
  );
}

function seedRate(raw: Database, sellRate = 1200) {
  raw.run(
    `INSERT OR REPLACE INTO exchange_rates (id, pair, buy_rate, sell_rate, source)
     VALUES ('usd_ars_ccl', 'USD/ARS', 1180, ${sellRate}, 'contadoconliqui')`,
  );
}

function seedCreditCard(
  raw: Database,
  opts: {
    id?: string;
    name?: string;
    spendLimit?: number;
    entityId?: string;
  } = {},
) {
  const {
    id = "cc-1",
    name = "Test Card",
    spendLimit = 500000,
    entityId = "entity-1",
  } = opts;
  raw.run(
    `INSERT INTO credit_cards (id, entity_id, name, spend_limit)
     VALUES ('${id}', '${entityId}', '${name}', ${spendLimit})`,
  );
}

function seedSpenditure(
  raw: Database,
  opts: {
    id?: string;
    cardId?: string;
    totalAmount?: number;
    monthlyAmount?: number;
    remainingInstallments?: number;
    installments?: number;
    currency?: string;
  } = {},
) {
  const {
    id = "spend-1",
    cardId = "cc-1",
    totalAmount = 3000,
    monthlyAmount = 1000,
    remainingInstallments = 3,
    installments = 3,
    currency = "ARS",
  } = opts;
  raw.run(
    `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, monthly_amount, total_amount, remaining_installments, installments)
     VALUES ('${id}', '${cardId}', 'Test Spend', ${monthlyAmount}, '${currency}', ${monthlyAmount}, ${totalAmount}, ${remainingInstallments}, ${installments})`,
  );
}

// ── Tests ────────────────────────────────────────────────────────

describe("DashboardService — card spend aggregation", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;
  let service: DashboardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    service = new DashboardService(orm);
    seedEntity(raw);
    seedAccount(raw);
  });

  it("computes total_spent and available_limit for a single card", () => {
    seedCreditCard(raw, { id: "cc-1", spendLimit: 500000 });
    seedSpenditure(raw, {
      id: "spend-1",
      cardId: "cc-1",
      totalAmount: 100000,
      monthlyAmount: 100000,
      remainingInstallments: 1,
      installments: 1,
    });

    const data = service.getDashboard();
    const card = data.credit_cards.find((c) => c.id === "cc-1");

    expect(card).toBeDefined();
    expect(card!.total_spent).toBe(100000);
    expect(card!.available_limit).toBe(400000);
  });

  it("computes correct totals across multiple cards", () => {
    seedCreditCard(raw, { id: "cc-a", name: "Card A", spendLimit: 200000 });
    seedCreditCard(raw, { id: "cc-b", name: "Card B", spendLimit: 300000 });

    seedSpenditure(raw, {
      id: "spend-a",
      cardId: "cc-a",
      totalAmount: 50000,
      monthlyAmount: 50000,
      remainingInstallments: 1,
      installments: 1,
    });
    seedSpenditure(raw, {
      id: "spend-b",
      cardId: "cc-b",
      totalAmount: 80000,
      monthlyAmount: 80000,
      remainingInstallments: 1,
      installments: 1,
    });

    const data = service.getDashboard();

    const cardA = data.credit_cards.find((c) => c.id === "cc-a");
    const cardB = data.credit_cards.find((c) => c.id === "cc-b");

    expect(cardA!.total_spent).toBe(50000);
    expect(cardA!.available_limit).toBe(150000);
    expect(cardB!.total_spent).toBe(80000);
    expect(cardB!.available_limit).toBe(220000);
  });

  it("cards with no spenditures have zero spent and full limit", () => {
    seedCreditCard(raw, { id: "cc-empty", spendLimit: 1000000 });

    const data = service.getDashboard();
    const card = data.credit_cards.find((c) => c.id === "cc-empty");

    expect(card!.total_spent).toBe(0);
    expect(card!.available_limit).toBe(1000000);
  });

  it("executes a bounded number of queries (no N+1 regression)", () => {
    // Seed many cards with spenditures to amplify any N+1 leak
    for (let i = 0; i < 10; i++) {
      seedCreditCard(raw, {
        id: `cc-n1-${i}`,
        name: `Card ${i}`,
        spendLimit: 100000,
      });
      seedSpenditure(raw, {
        id: `spend-n1-${i}`,
        cardId: `cc-n1-${i}`,
        totalAmount: 5000,
        monthlyAmount: 5000,
        remainingInstallments: 1,
        installments: 1,
      });
    }

    // Spy on the underlying prepare method to count queries
    let queryCount = 0;
    const originalPrepare = raw.prepare.bind(raw);
    raw.prepare = (...args: Parameters<typeof raw.prepare>) => {
      queryCount++;
      return originalPrepare(...args);
    };

    const data = service.getDashboard();
    expect(data.credit_cards.length).toBe(10);

    // With the bulk getCardSpendTotals() approach, the entire getDashboard
    // should execute a fixed number of queries, not scaling with card count.
    // The service makes ~8 repo calls total; with N+1 fixed it should be ≤ 15.
    // With the old N+1 pattern, 10 cards would produce 10 extra queries.
    expect(queryCount).toBeLessThanOrEqual(15);
  });
});
