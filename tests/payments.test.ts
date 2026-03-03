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
} from "../src/modules/shared/errors";

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
  } = {},
) {
  const {
    id = "acc-1",
    balance = 100000,
    type = "savings",
    overdraftLimit = 0,
    entityId = "entity-1",
  } = opts;
  raw.run(
    `INSERT INTO accounts (id, entity_id, name, type, balance, overdraft_limit)
     VALUES ('${id}', '${entityId}', 'Test Account', '${type}', ${balance}, ${overdraftLimit})`,
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
  } = opts;
  raw.run(
    `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, monthly_amount, total_amount, remaining_installments, installments, created_at)
     VALUES ('${id}', '${cardId}', 'Test Spend', ${monthlyAmount}, ${monthlyAmount}, ${totalAmount}, ${remainingInstallments}, ${installments}, '${createdAt}')`,
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
