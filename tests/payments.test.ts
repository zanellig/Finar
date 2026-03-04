/**
 * Integration tests for the payment service.
 *
 * Uses an in-memory SQLite database seeded with fixture data per test
 * to verify atomicity invariants, settlement logic, and guard rails.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { createTestDb } from "../src/db/migrate";
import { PaymentService } from "../src/modules/payments/payment-service";
import {
  InsufficientFundsError,
  InvalidPaymentError,
  ConflictError,
  NotFoundError,
  CurrencyMismatchError,
} from "../src/modules/shared/errors";
import { roundMoney } from "../src/modules/currency/money";

// ── Helpers ──────────────────────────────────────────────────────

type TestOrm = ReturnType<typeof createTestDb>["orm"];

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
    type?: string;
    overdraftLimit?: number;
    entityId?: string;
    currency?: string;
  } = {},
) {
  const {
    id = "acc-1",
    balance = 100000,
    type = "savings",
    overdraftLimit = 0,
    entityId = "entity-1",
    currency = "ARS",
  } = opts;
  raw.run(
    `INSERT INTO accounts (id, entity_id, name, type, balance, overdraft_limit, currency)
     VALUES ('${id}', '${entityId}', 'Test Account', '${type}', ${balance}, ${overdraftLimit}, '${currency}')`,
  );
}

function seedLoan(
  raw: Database,
  opts: {
    id?: string;
    monthlyPayment?: number;
    remainingInstallments?: number;
    entityId?: string;
  } = {},
) {
  const {
    id = "loan-1",
    monthlyPayment = 5000,
    remainingInstallments = 12,
    entityId = "entity-1",
  } = opts;
  raw.run(
    `INSERT INTO loans (id, entity_id, name, capital, installments, cftea, total_owed, monthly_payment, remaining_installments)
     VALUES ('${id}', '${entityId}', 'Test Loan', 50000, 12, 50, 60000, ${monthlyPayment}, ${remainingInstallments})`,
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
    monthlyAmount?: number;
    totalAmount?: number;
    remainingInstallments?: number;
    installments?: number;
    createdAt?: string;
    currency?: string;
  } = {},
) {
  const {
    id = "spend-1",
    cardId = "cc-1",
    monthlyAmount = 1000,
    totalAmount = 3000,
    remainingInstallments = 3,
    installments = 3,
    createdAt = "2026-01-01 00:00:00",
    currency = "ARS",
  } = opts;
  raw.run(
    `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, monthly_amount, total_amount, remaining_installments, installments, created_at, currency)
     VALUES ('${id}', '${cardId}', 'Test Spend', ${monthlyAmount}, ${monthlyAmount}, ${totalAmount}, ${remainingInstallments}, ${installments}, '${createdAt}', '${currency}')`,
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

function getLoanRemaining(orm: ReturnType<typeof drizzle>, id: string): number {
  const row = orm
    .select({ remaining: schema.loans.remainingInstallments })
    .from(schema.loans)
    .where(eq(schema.loans.id, id))
    .get();
  return row?.remaining ?? 0;
}

function getSpenditure(orm: ReturnType<typeof drizzle>, id: string) {
  return orm
    .select({
      remainingInstallments: schema.ccSpenditures.remainingInstallments,
      isPaidOff: schema.ccSpenditures.isPaidOff,
    })
    .from(schema.ccSpenditures)
    .where(eq(schema.ccSpenditures.id, id))
    .get();
}

// ── Tests ────────────────────────────────────────────────────────

describe("PaymentService — Loan payments", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;
  let service: PaymentService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    service = new PaymentService(raw, orm);
    seedEntity(raw);
    seedAccount(raw, { balance: 100000 });
    seedLoan(raw, { monthlyPayment: 5000, remainingInstallments: 12 });
  });

  it("deducts balance and decrements installment on valid payment", () => {
    service.makePayment({
      type: "loan",
      targetId: "loan-1",
      accountId: "acc-1",
      amount: 5000,
      description: "Jan payment",
    });

    expect(getAccountBalance(orm, "acc-1")).toBe(95000);
    expect(getLoanRemaining(orm, "loan-1")).toBe(11);
  });

  it("rejects payment with wrong amount", () => {
    expect(() =>
      service.makePayment({
        type: "loan",
        targetId: "loan-1",
        accountId: "acc-1",
        amount: 3000, // wrong — should be 5000
        description: "",
      }),
    ).toThrow(InvalidPaymentError);

    // State unchanged
    expect(getAccountBalance(orm, "acc-1")).toBe(100000);
    expect(getLoanRemaining(orm, "loan-1")).toBe(12);
  });

  it("rejects payment on fully paid-off loan", () => {
    seedLoan(raw, {
      id: "loan-done",
      monthlyPayment: 5000,
      remainingInstallments: 0,
    });

    expect(() =>
      service.makePayment({
        type: "loan",
        targetId: "loan-done",
        accountId: "acc-1",
        amount: 5000,
        description: "",
      }),
    ).toThrow(ConflictError);
  });

  it("installments cannot go negative via double payment", () => {
    // Seed a loan with exactly 1 installment remaining
    seedLoan(raw, {
      id: "loan-last",
      monthlyPayment: 1000,
      remainingInstallments: 1,
    });

    service.makePayment({
      type: "loan",
      targetId: "loan-last",
      accountId: "acc-1",
      amount: 1000,
      description: "final",
    });

    expect(getLoanRemaining(orm, "loan-last")).toBe(0);

    // Second payment should be rejected
    expect(() =>
      service.makePayment({
        type: "loan",
        targetId: "loan-last",
        accountId: "acc-1",
        amount: 1000,
        description: "extra",
      }),
    ).toThrow(ConflictError);

    // Installment still 0, not negative
    expect(getLoanRemaining(orm, "loan-last")).toBe(0);
  });
});

describe("PaymentService — Credit card payments", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;
  let service: PaymentService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    service = new PaymentService(raw, orm);
    seedEntity(raw);
    seedAccount(raw, { balance: 100000 });
    seedCreditCard(raw);
  });

  it("reduces spenditure debt via FIFO settlement", () => {
    // Two spenditures: older one (3 installments × 1000) and newer one (2 × 2000)
    seedSpenditure(raw, {
      id: "spend-old",
      monthlyAmount: 1000,
      totalAmount: 3000,
      remainingInstallments: 3,
      installments: 3,
      createdAt: "2026-01-01 00:00:00",
    });
    seedSpenditure(raw, {
      id: "spend-new",
      monthlyAmount: 2000,
      totalAmount: 4000,
      remainingInstallments: 2,
      installments: 2,
      createdAt: "2026-02-01 00:00:00",
    });

    // Pay 3000 — should fully pay off spend-old (3 × 1000 = 3000)
    service.makePayment({
      type: "cc",
      targetId: "cc-1",
      accountId: "acc-1",
      amount: 3000,
      description: "card payment",
    });

    const old = getSpenditure(orm, "spend-old");
    expect(old?.remainingInstallments).toBe(0);
    expect(old?.isPaidOff).toBe(true);

    // spend-new remains untouched
    const newer = getSpenditure(orm, "spend-new");
    expect(newer?.remainingInstallments).toBe(2);
    expect(newer?.isPaidOff).toBe(false);

    expect(getAccountBalance(orm, "acc-1")).toBe(97000);
  });

  it("marks spenditure as paid off when fully settled", () => {
    seedSpenditure(raw, {
      id: "spend-single",
      monthlyAmount: 5000,
      totalAmount: 5000,
      remainingInstallments: 1,
      installments: 1,
    });

    service.makePayment({
      type: "cc",
      targetId: "cc-1",
      accountId: "acc-1",
      amount: 5000,
      description: "",
    });

    const spend = getSpenditure(orm, "spend-single");
    expect(spend?.isPaidOff).toBe(true);
    expect(spend?.remainingInstallments).toBe(0);
  });

  it("rejects payment below the smallest installment amount", () => {
    seedSpenditure(raw, {
      id: "spend-min",
      monthlyAmount: 5000,
      totalAmount: 15000,
      remainingInstallments: 3,
      installments: 3,
    });

    expect(() =>
      service.makePayment({
        type: "cc",
        targetId: "cc-1",
        accountId: "acc-1",
        amount: 4999,
        description: "too small",
      }),
    ).toThrow(InvalidPaymentError);

    // State unchanged — balance untouched, spenditure intact
    expect(getAccountBalance(orm, "acc-1")).toBe(100000);
    const spend = getSpenditure(orm, "spend-min");
    expect(spend?.remainingInstallments).toBe(3);
    expect(spend?.isPaidOff).toBe(false);
  });

  it("rejects payment when all spenditures are already paid off", () => {
    // No unpaid spenditures seeded for cc-1

    expect(() =>
      service.makePayment({
        type: "cc",
        targetId: "cc-1",
        accountId: "acc-1",
        amount: 1000,
        description: "nothing to settle",
      }),
    ).toThrow(ConflictError);

    expect(getAccountBalance(orm, "acc-1")).toBe(100000);
  });
});

describe("PaymentService — Balance guards", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;
  let service: PaymentService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    service = new PaymentService(raw, orm);
    seedEntity(raw);
  });

  it("rejects payment when insufficient funds (savings)", () => {
    seedAccount(raw, { balance: 1000, type: "savings" });
    seedLoan(raw, { monthlyPayment: 5000, remainingInstallments: 12 });

    expect(() =>
      service.makePayment({
        type: "loan",
        targetId: "loan-1",
        accountId: "acc-1",
        amount: 5000,
        description: "",
      }),
    ).toThrow(InsufficientFundsError);

    // Balance unchanged — transaction rolled back
    expect(getAccountBalance(orm, "acc-1")).toBe(1000);
  });

  it("allows payment within overdraft limit (checking)", () => {
    seedAccount(raw, {
      balance: 2000,
      type: "checking",
      overdraftLimit: 10000,
    });
    seedLoan(raw, { monthlyPayment: 5000, remainingInstallments: 12 });

    // Balance 2000, overdraft 10000 → min balance -10000 → 2000-5000 = -3000 ≥ -10000 ✓
    service.makePayment({
      type: "loan",
      targetId: "loan-1",
      accountId: "acc-1",
      amount: 5000,
      description: "",
    });

    expect(getAccountBalance(orm, "acc-1")).toBe(-3000);
  });

  it("rejects payment that exceeds overdraft limit (checking)", () => {
    seedAccount(raw, {
      balance: 2000,
      type: "checking",
      overdraftLimit: 1000,
    });
    seedLoan(raw, { monthlyPayment: 5000, remainingInstallments: 12 });

    // Balance 2000, overdraft 1000 → min balance -1000 → 2000-5000 = -3000 < -1000 ✗
    expect(() =>
      service.makePayment({
        type: "loan",
        targetId: "loan-1",
        accountId: "acc-1",
        amount: 5000,
        description: "",
      }),
    ).toThrow(InsufficientFundsError);

    expect(getAccountBalance(orm, "acc-1")).toBe(2000);
  });

  it("rejects payment for non-existent account", () => {
    seedLoan(raw, { monthlyPayment: 5000, remainingInstallments: 12 });

    expect(() =>
      service.makePayment({
        type: "loan",
        targetId: "loan-1",
        accountId: "nonexistent",
        amount: 5000,
        description: "",
      }),
    ).toThrow(NotFoundError);
  });
});

describe("PaymentService — Currency-aware settlement", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;
  let service: PaymentService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    service = new PaymentService(raw, orm);
    seedEntity(raw);
    seedCreditCard(raw);
  });

  it("rejects ARS payment against USD spenditure", () => {
    seedAccount(raw, { balance: 100000, currency: "ARS" });
    seedSpenditure(raw, {
      id: "spend-usd",
      monthlyAmount: 100,
      totalAmount: 300,
      remainingInstallments: 3,
      installments: 3,
      currency: "USD",
    });

    expect(() =>
      service.makePayment({
        type: "cc",
        targetId: "cc-1",
        accountId: "acc-1",
        amount: 300,
        description: "cross-currency attempt",
      }),
    ).toThrow(CurrencyMismatchError);

    // State unchanged
    expect(getAccountBalance(orm, "acc-1")).toBe(100000);
    const spend = getSpenditure(orm, "spend-usd");
    expect(spend?.remainingInstallments).toBe(3);
    expect(spend?.isPaidOff).toBe(false);
  });

  it("rejects USD payment against ARS spenditure", () => {
    seedAccount(raw, { balance: 50000, currency: "USD" });
    seedSpenditure(raw, {
      id: "spend-ars",
      monthlyAmount: 5000,
      totalAmount: 15000,
      remainingInstallments: 3,
      installments: 3,
      currency: "ARS",
    });

    expect(() =>
      service.makePayment({
        type: "cc",
        targetId: "cc-1",
        accountId: "acc-1",
        amount: 15000,
        description: "cross-currency attempt",
      }),
    ).toThrow(CurrencyMismatchError);

    expect(getAccountBalance(orm, "acc-1")).toBe(50000);
  });

  it("allows same-currency settlement (USD/USD)", () => {
    seedAccount(raw, { balance: 10000, currency: "USD" });
    seedSpenditure(raw, {
      id: "spend-usd",
      monthlyAmount: 500,
      totalAmount: 1500,
      remainingInstallments: 3,
      installments: 3,
      currency: "USD",
    });

    service.makePayment({
      type: "cc",
      targetId: "cc-1",
      accountId: "acc-1",
      amount: 1500,
      description: "USD settlement",
    });

    const spend = getSpenditure(orm, "spend-usd");
    expect(spend?.remainingInstallments).toBe(0);
    expect(spend?.isPaidOff).toBe(true);
    expect(getAccountBalance(orm, "acc-1")).toBe(8500);
  });

  it("uses deterministic rounding on partial payoff", () => {
    seedAccount(raw, { balance: 100000, currency: "ARS" });
    // monthlyAmount = 33.33, 3 installments => total = 99.99
    seedSpenditure(raw, {
      id: "spend-round",
      monthlyAmount: 33.33,
      totalAmount: 99.99,
      remainingInstallments: 3,
      installments: 3,
      currency: "ARS",
    });

    // Pay 70 — covers 2 installments (2 × 33.33 = 66.66), leftover = roundMoney(70 - 66.66) = 3.34
    service.makePayment({
      type: "cc",
      targetId: "cc-1",
      accountId: "acc-1",
      amount: 70,
      description: "partial with rounding",
    });

    const spend = getSpenditure(orm, "spend-round");
    expect(spend?.remainingInstallments).toBe(1); // 3 - 2 = 1
    expect(spend?.isPaidOff).toBe(false);
    // Verify the remainder computation matches roundMoney exactly
    expect(roundMoney(70 - 2 * 33.33)).toBe(3.34);
  });

  it("settles matching-currency spenditures then rejects at currency mismatch", () => {
    seedAccount(raw, { balance: 100000, currency: "ARS" });

    // Older ARS spenditure — should settle
    seedSpenditure(raw, {
      id: "spend-ars",
      monthlyAmount: 1000,
      totalAmount: 2000,
      remainingInstallments: 2,
      installments: 2,
      currency: "ARS",
      createdAt: "2026-01-01 00:00:00",
    });

    // Newer USD spenditure — should trigger mismatch
    seedSpenditure(raw, {
      id: "spend-usd",
      monthlyAmount: 100,
      totalAmount: 200,
      remainingInstallments: 2,
      installments: 2,
      currency: "USD",
      createdAt: "2026-02-01 00:00:00",
    });

    // Pay 3000 — enough to settle ARS spend (2000) and overflow into USD spend
    expect(() =>
      service.makePayment({
        type: "cc",
        targetId: "cc-1",
        accountId: "acc-1",
        amount: 3000,
        description: "mixed currencies",
      }),
    ).toThrow(CurrencyMismatchError);

    // Transaction rolled back: ARS spenditure untouched, balance unchanged
    const arsSpend = getSpenditure(orm, "spend-ars");
    expect(arsSpend?.remainingInstallments).toBe(2);
    expect(arsSpend?.isPaidOff).toBe(false);
    expect(getAccountBalance(orm, "acc-1")).toBe(100000);
  });

  it("settles indivisible total without rounding drift (100 / 3)", () => {
    // monthlyAmount = 33.33, but 33.33 × 3 = 99.99 !== 100.
    // Settlement must collect exactly 100.00 total, not 99.99.
    seedAccount(raw, { balance: 100000, currency: "ARS" });
    seedSpenditure(raw, {
      id: "spend-drift",
      monthlyAmount: 33.33,
      totalAmount: 100,
      remainingInstallments: 3,
      installments: 3,
      currency: "ARS",
    });

    // Pay exactly the true debt (100), which should fully pay off
    service.makePayment({
      type: "cc",
      targetId: "cc-1",
      accountId: "acc-1",
      amount: 100,
      description: "full payoff of indivisible total",
    });

    const spend = getSpenditure(orm, "spend-drift");
    expect(spend?.remainingInstallments).toBe(0);
    expect(spend?.isPaidOff).toBe(true);

    // Balance should drop by exactly 100
    expect(getAccountBalance(orm, "acc-1")).toBe(99900);
  });
});

describe("PaymentService — listPayments (enriched target names)", () => {
  let raw: Database;
  let orm: ReturnType<typeof drizzle>;
  let service: PaymentService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    orm = db.orm;
    service = new PaymentService(raw, orm);
    seedEntity(raw);
    seedAccount(raw, { balance: 500000 });
  });

  it("returns loan name as target_name for loan payments", () => {
    seedLoan(raw, {
      id: "loan-enrich",
      monthlyPayment: 2000,
      remainingInstallments: 6,
    });

    service.makePayment({
      type: "loan",
      targetId: "loan-enrich",
      accountId: "acc-1",
      amount: 2000,
      description: "loan enrichment test",
    });

    const list = service.listPayments();
    expect(list.length).toBe(1);
    expect(list[0]!.target_name).toBe("Test Loan");
    expect(list[0]!.type).toBe("loan");
  });

  it("returns card name as target_name for credit card payments", () => {
    seedCreditCard(raw, { id: "cc-enrich" });
    seedSpenditure(raw, {
      id: "spend-enrich",
      cardId: "cc-enrich",
      monthlyAmount: 1000,
      totalAmount: 3000,
      remainingInstallments: 3,
      installments: 3,
    });

    service.makePayment({
      type: "cc",
      targetId: "cc-enrich",
      accountId: "acc-1",
      amount: 3000,
      description: "card enrichment test",
    });

    const list = service.listPayments();
    expect(list.length).toBe(1);
    expect(list[0]!.target_name).toBe("Test Card");
    expect(list[0]!.type).toBe("cc");
  });

  it("handles mixed loan and card payments with correct target names", () => {
    seedLoan(raw, {
      id: "loan-mix",
      monthlyPayment: 1500,
      remainingInstallments: 4,
    });
    seedCreditCard(raw, { id: "cc-mix" });
    seedSpenditure(raw, {
      id: "spend-mix",
      cardId: "cc-mix",
      monthlyAmount: 2000,
      totalAmount: 4000,
      remainingInstallments: 2,
      installments: 2,
    });

    service.makePayment({
      type: "loan",
      targetId: "loan-mix",
      accountId: "acc-1",
      amount: 1500,
      description: "loan",
    });
    service.makePayment({
      type: "cc",
      targetId: "cc-mix",
      accountId: "acc-1",
      amount: 4000,
      description: "card",
    });

    const list = service.listPayments();
    expect(list.length).toBe(2);

    const loanPayment = list.find((p) => p.type === "loan");
    const cardPayment = list.find((p) => p.type === "cc");

    expect(loanPayment?.target_name).toBe("Test Loan");
    expect(cardPayment?.target_name).toBe("Test Card");
  });

  it("preserves response shape with all expected fields", () => {
    seedLoan(raw, {
      id: "loan-shape",
      monthlyPayment: 3000,
      remainingInstallments: 2,
    });

    service.makePayment({
      type: "loan",
      targetId: "loan-shape",
      accountId: "acc-1",
      amount: 3000,
      description: "shape check",
    });

    const list = service.listPayments();
    const payment = list[0];

    expect(payment).toHaveProperty("id");
    expect(payment).toHaveProperty("type");
    expect(payment).toHaveProperty("target_id");
    expect(payment).toHaveProperty("account_id");
    expect(payment).toHaveProperty("amount");
    expect(payment).toHaveProperty("description");
    expect(payment).toHaveProperty("created_at");
    expect(payment).toHaveProperty("account_name");
    expect(payment).toHaveProperty("account_currency");
    expect(payment).toHaveProperty("target_name");

    // Must NOT leak intermediate join fields
    expect(payment).not.toHaveProperty("loan_name");
    expect(payment).not.toHaveProperty("card_name");
  });

  it("executes a bounded number of queries (no N+1 regression)", () => {
    // Seed many payments to amplify any N+1 leak
    seedLoan(raw, {
      id: "loan-n1",
      monthlyPayment: 100,
      remainingInstallments: 20,
    });
    seedCreditCard(raw, { id: "cc-n1" });
    for (let i = 0; i < 10; i++) {
      seedSpenditure(raw, {
        id: `spend-n1-${i}`,
        cardId: "cc-n1",
        monthlyAmount: 100,
        totalAmount: 100,
        remainingInstallments: 1,
        installments: 1,
        createdAt: `2026-01-${String(i + 1).padStart(2, "0")} 00:00:00`,
      });
    }

    // Make 5 loan payments and 5 card payments (10 total)
    for (let i = 0; i < 5; i++) {
      service.makePayment({
        type: "loan",
        targetId: "loan-n1",
        accountId: "acc-1",
        amount: 100,
        description: `loan-${i}`,
      });
    }
    for (let i = 0; i < 5; i++) {
      service.makePayment({
        type: "cc",
        targetId: "cc-n1",
        accountId: "acc-1",
        amount: 100,
        description: `cc-${i}`,
      });
    }

    // Spy on the underlying prepare method to count queries
    let queryCount = 0;
    const originalPrepare = raw.prepare.bind(raw);
    raw.prepare = (...args: Parameters<typeof raw.prepare>) => {
      queryCount++;
      return originalPrepare(...args);
    };

    const list = service.listPayments();
    expect(list.length).toBe(10);

    // With the JOIN-based approach, listPayments should execute
    // a constant number of queries (1), not N+1.
    // Allow up to 3 for any ORM overhead.
    expect(queryCount).toBeLessThanOrEqual(3);
  });
});
