/**
 * Integration tests for the currency domain module.
 *
 * Uses an in-memory SQLite database to verify:
 * - CurrencyConverter correctness (passthrough, conversion, missing rate)
 * - Dashboard aggregate consistency with mixed-currency fixtures
 * - Credit-card available-limit calculations with conversion
 * - Custom exchange rate support
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { createTestDb } from "../src/db/migrate";
import { CurrencyConverter } from "../src/modules/currency/convert";
import { RatesRepository } from "../src/modules/currency/rates-repository";
import { roundMoney } from "../src/modules/currency/money";
import { MissingRateError } from "../src/modules/shared/errors";

// ── roundMoney decimal-safety regression tests ───────────────────

describe("roundMoney — IEEE 754 decimal safety", () => {
  it("rounds 1.005 to 1.01 (not 1.00)", () => {
    expect(roundMoney(1.005)).toBe(1.01);
  });

  it("rounds 1.255 to 1.26 (not 1.25)", () => {
    expect(roundMoney(1.255)).toBe(1.26);
  });

  it("rounds 2.345 to 2.35 (not 2.34)", () => {
    expect(roundMoney(2.345)).toBe(2.35);
  });

  it("rounds negative half-cent values correctly", () => {
    expect(roundMoney(-1.005)).toBe(-1);
  });

  it("preserves exact 2-decimal values", () => {
    expect(roundMoney(1.01)).toBe(1.01);
    expect(roundMoney(99.99)).toBe(99.99);
    expect(roundMoney(0)).toBe(0);
  });

  it("rounds large values correctly", () => {
    expect(roundMoney(123456.785)).toBe(123456.79);
  });

  it("handles values that stringify in scientific notation (1e21)", () => {
    expect(roundMoney(1e21)).toBe(1e21);
    expect(Number.isFinite(roundMoney(1e21))).toBe(true);
  });

  it("handles very small scientific-notation values", () => {
    expect(roundMoney(5e-7)).toBe(0);
    expect(Number.isFinite(roundMoney(5e-7))).toBe(true);
  });

  it("passes through Infinity without crashing", () => {
    expect(roundMoney(Infinity)).toBe(Infinity);
  });

  it("passes through NaN without crashing", () => {
    expect(roundMoney(NaN)).toBeNaN();
  });
});

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
    id = "acc-ars",
    balance = 100000,
    currency = "ARS",
    entityId = "entity-1",
  } = opts;
  raw.run(
    `INSERT INTO accounts (id, entity_id, name, type, balance, currency)
     VALUES ('${id}', '${entityId}', 'Test Account', 'savings', ${balance}, '${currency}')`,
  );
}

function seedRate(
  raw: Database,
  opts: {
    source?: string;
    buyRate?: number;
    sellRate?: number;
  } = {},
) {
  const { source = "contadoconliqui", buyRate = 1180, sellRate = 1200 } = opts;
  raw.run(
    `INSERT OR REPLACE INTO exchange_rates (id, pair, buy_rate, sell_rate, source)
     VALUES ('usd_ars_${source}', 'USD/ARS', ${buyRate}, ${sellRate}, '${source}')`,
  );
}

function seedCreditCard(
  raw: Database,
  opts: { id?: string; spendLimit?: number; entityId?: string } = {},
) {
  const { id = "cc-1", spendLimit = 500000, entityId = "entity-1" } = opts;
  raw.run(
    `INSERT INTO credit_cards (id, entity_id, name, spend_limit)
     VALUES ('${id}', '${entityId}', 'Test Card', ${spendLimit})`,
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

// ── CurrencyConverter unit tests ─────────────────────────────────

describe("CurrencyConverter", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
  });

  it("passes through ARS amounts unchanged", () => {
    const converter = new CurrencyConverter(new RatesRepository(orm));
    const result = converter.toBase({ amount: 1000, currency: "ARS" });
    expect(result).toBe(1000);
  });

  it("converts USD to ARS using sell rate from default source (CCL)", () => {
    seedRate(raw, { source: "contadoconliqui", sellRate: 1200 });
    const converter = new CurrencyConverter(new RatesRepository(orm));
    const result = converter.toBase({ amount: 100, currency: "USD" });
    expect(result).toBe(120000);
  });

  it("converts USD to ARS using a specified alternate source", () => {
    seedRate(raw, { source: "blue", sellRate: 1300 });
    const converter = new CurrencyConverter(new RatesRepository(orm));
    const result = converter.toBase(
      { amount: 100, currency: "USD" },
      { rateSource: "blue" },
    );
    expect(result).toBe(130000);
  });

  it("uses custom rate when provided, ignoring DB", () => {
    // No rate seeded — custom rate should still work
    const converter = new CurrencyConverter(new RatesRepository(orm));
    const result = converter.toBase(
      { amount: 100, currency: "USD" },
      { customRate: 1500 },
    );
    expect(result).toBe(150000);
  });

  it("custom rate takes priority over DB rate", () => {
    seedRate(raw, { source: "contadoconliqui", sellRate: 1200 });
    const converter = new CurrencyConverter(new RatesRepository(orm));
    const result = converter.toBase(
      { amount: 100, currency: "USD" },
      { customRate: 1500 },
    );
    // Custom rate wins
    expect(result).toBe(150000);
  });

  it("throws MissingRateError when no rate exists", () => {
    const converter = new CurrencyConverter(new RatesRepository(orm));
    expect(() => converter.toBase({ amount: 100, currency: "USD" })).toThrow(
      MissingRateError,
    );
  });

  it("throws MissingRateError when requested source doesn't exist", () => {
    seedRate(raw, { source: "blue", sellRate: 1300 });
    const converter = new CurrencyConverter(new RatesRepository(orm));
    // Request CCL but only blue exists
    expect(() => converter.toBase({ amount: 100, currency: "USD" })).toThrow(
      MissingRateError,
    );
  });

  it("sums mixed-currency amounts correctly", () => {
    seedRate(raw, { source: "contadoconliqui", sellRate: 1200 });
    const converter = new CurrencyConverter(new RatesRepository(orm));
    const result = converter.sumToBase([
      { amount: 1000, currency: "ARS" },
      { amount: 100, currency: "USD" },
    ]);
    // 1000 + (100 * 1200) = 121000
    expect(result).toBe(121000);
  });

  it("sums ARS-only amounts without requiring rates", () => {
    // No rate seeded — should not throw for all-ARS
    const converter = new CurrencyConverter(new RatesRepository(orm));
    const result = converter.sumToBase([
      { amount: 1000, currency: "ARS" },
      { amount: 2000, currency: "ARS" },
    ]);
    expect(result).toBe(3000);
  });

  it("handles empty array gracefully", () => {
    const converter = new CurrencyConverter(new RatesRepository(orm));
    const result = converter.sumToBase([]);
    expect(result).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    seedRate(raw, { source: "contadoconliqui", sellRate: 1200.33 });
    const converter = new CurrencyConverter(new RatesRepository(orm));
    const result = converter.toBase({ amount: 0.01, currency: "USD" });
    expect(result).toBe(12);
  });
});

// ── RatesRepository tests ────────────────────────────────────────

describe("RatesRepository", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
  });

  it("returns rate for existing pair and source", () => {
    seedRate(raw, { source: "blue", buyRate: 1100, sellRate: 1200 });
    const repo = new RatesRepository(orm);
    const rate = repo.getRate("USD/ARS", "blue");
    expect(rate).toBeDefined();
    expect(rate!.sellRate).toBe(1200);
    expect(rate!.buyRate).toBe(1100);
  });

  it("returns undefined for non-existent source", () => {
    seedRate(raw, { source: "blue", sellRate: 1200 });
    const repo = new RatesRepository(orm);
    const rate = repo.getRate("USD/ARS", "contadoconliqui");
    expect(rate).toBeUndefined();
  });

  it("lists all available sources for a pair", () => {
    seedRate(raw, { source: "blue", sellRate: 1200 });
    seedRate(raw, { source: "oficial", sellRate: 800 });
    seedRate(raw, { source: "contadoconliqui", sellRate: 1180 });
    const repo = new RatesRepository(orm);
    const sources = repo.getAvailableSources("USD/ARS");
    expect(sources).toContain("blue");
    expect(sources).toContain("oficial");
    expect(sources).toContain("contadoconliqui");
    expect(sources.length).toBe(3);
  });
});

// ── Dashboard currency integration tests ─────────────────────────

describe("Dashboard currency consistency", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    seedEntity(raw);
  });

  it("sums mixed-currency account balances correctly", () => {
    seedRate(raw, { source: "contadoconliqui", sellRate: 1200 });
    seedAccount(raw, { id: "acc-ars", balance: 100000, currency: "ARS" });
    seedAccount(raw, { id: "acc-usd", balance: 1000, currency: "USD" });

    const converter = new CurrencyConverter(new RatesRepository(orm));

    // Simulate what dashboard does
    const accountRows = orm
      .select({
        balance: schema.accounts.balance,
        currency: schema.accounts.currency,
      })
      .from(schema.accounts)
      .all();

    const totalAssets = converter.sumToBase(
      accountRows.map((a) => ({
        amount: a.balance,
        currency: a.currency as "ARS" | "USD",
      })),
    );

    // 100,000 ARS + (1,000 USD × 1,200) = 1,300,000 ARS
    expect(totalAssets).toBe(1300000);
  });

  it("sums mixed-currency CC debt correctly", () => {
    seedRate(raw, { source: "contadoconliqui", sellRate: 1200 });
    seedCreditCard(raw, { id: "cc-1", spendLimit: 2000000 });

    // ARS spenditure: 3 installments of 1,000 → debt 3,000
    seedSpenditure(raw, {
      id: "spend-ars",
      cardId: "cc-1",
      monthlyAmount: 1000,
      totalAmount: 3000,
      remainingInstallments: 3,
      currency: "ARS",
    });

    // USD spenditure: 2 installments of 50 → debt 100 USD
    seedSpenditure(raw, {
      id: "spend-usd",
      cardId: "cc-1",
      monthlyAmount: 50,
      totalAmount: 100,
      remainingInstallments: 2,
      currency: "USD",
    });

    const converter = new CurrencyConverter(new RatesRepository(orm));

    const unpaidRows = orm
      .select({
        monthlyAmount: schema.ccSpenditures.monthlyAmount,
        remainingInstallments: schema.ccSpenditures.remainingInstallments,
        currency: schema.ccSpenditures.currency,
      })
      .from(schema.ccSpenditures)
      .where(eq(schema.ccSpenditures.isPaidOff, false))
      .all();

    const ccDebt = converter.sumToBase(
      unpaidRows.map((s) => ({
        amount: s.monthlyAmount * s.remainingInstallments,
        currency: s.currency as "ARS" | "USD",
      })),
    );

    // 3,000 ARS + (100 USD × 1,200) = 123,000 ARS
    expect(ccDebt).toBe(123000);
  });

  it("uses custom rate for dashboard aggregation", () => {
    // No DB rate seeded — use custom rate
    seedAccount(raw, { id: "acc-ars", balance: 100000, currency: "ARS" });
    seedAccount(raw, { id: "acc-usd", balance: 1000, currency: "USD" });

    const converter = new CurrencyConverter(new RatesRepository(orm));

    const accountRows = orm
      .select({
        balance: schema.accounts.balance,
        currency: schema.accounts.currency,
      })
      .from(schema.accounts)
      .all();

    const totalAssets = converter.sumToBase(
      accountRows.map((a) => ({
        amount: a.balance,
        currency: a.currency as "ARS" | "USD",
      })),
      { customRate: 1500 },
    );

    // 100,000 ARS + (1,000 USD × 1,500) = 1,600,000 ARS
    expect(totalAssets).toBe(1600000);
  });
});

// ── Credit card available-limit currency tests ───────────────────

describe("Credit card available limit with currency conversion", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    seedEntity(raw);
    seedRate(raw, { source: "contadoconliqui", sellRate: 1200 });
    seedCreditCard(raw, { id: "cc-1", spendLimit: 500000 });
  });

  it("calculates correct available limit with mixed-currency spenditures", () => {
    // ARS spenditure: total 100,000
    seedSpenditure(raw, {
      id: "spend-ars",
      cardId: "cc-1",
      totalAmount: 100000,
      monthlyAmount: 100000,
      remainingInstallments: 1,
      installments: 1,
      currency: "ARS",
    });

    // USD spenditure: total 100 USD → 120,000 ARS at 1200
    seedSpenditure(raw, {
      id: "spend-usd",
      cardId: "cc-1",
      totalAmount: 100,
      monthlyAmount: 100,
      remainingInstallments: 1,
      installments: 1,
      currency: "USD",
    });

    const converter = new CurrencyConverter(new RatesRepository(orm));

    const spendRows = orm
      .select({
        totalAmount: schema.ccSpenditures.totalAmount,
        currency: schema.ccSpenditures.currency,
      })
      .from(schema.ccSpenditures)
      .where(eq(schema.ccSpenditures.isPaidOff, false))
      .all();

    const totalSpent = converter.sumToBase(
      spendRows.map((s) => ({
        amount: s.totalAmount,
        currency: s.currency as "ARS" | "USD",
      })),
    );

    // 100,000 + (100 × 1,200) = 220,000
    expect(totalSpent).toBe(220000);

    // Available: 500,000 - 220,000 = 280,000
    expect(500000 - totalSpent).toBe(280000);
  });

  it("pure ARS spenditures don't require rate lookup", () => {
    seedSpenditure(raw, {
      id: "spend-ars-only",
      cardId: "cc-1",
      totalAmount: 50000,
      monthlyAmount: 50000,
      remainingInstallments: 1,
      installments: 1,
      currency: "ARS",
    });

    // Create converter with a fresh DB that has no rates
    const dbNoRates = createTestDb();
    seedEntity(dbNoRates.raw);
    seedCreditCard(dbNoRates.raw, { id: "cc-1", spendLimit: 500000 });
    seedSpenditure(dbNoRates.raw, {
      id: "spend-ars-only",
      cardId: "cc-1",
      totalAmount: 50000,
      monthlyAmount: 50000,
      remainingInstallments: 1,
      installments: 1,
      currency: "ARS",
    });

    const converter = new CurrencyConverter(new RatesRepository(dbNoRates.orm));

    const spendRows = dbNoRates.orm
      .select({
        totalAmount: schema.ccSpenditures.totalAmount,
        currency: schema.ccSpenditures.currency,
      })
      .from(schema.ccSpenditures)
      .where(eq(schema.ccSpenditures.isPaidOff, false))
      .all();

    // Should NOT throw even without rates, because all are ARS
    const totalSpent = converter.sumToBase(
      spendRows.map((s) => ({
        amount: s.totalAmount,
        currency: s.currency as "ARS" | "USD",
      })),
    );

    expect(totalSpent).toBe(50000);
  });
});
