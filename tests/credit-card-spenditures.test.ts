/**
 * Integration tests for the spenditure lifecycle (create/update/delete).
 *
 * Exercises CreditCardService against an in-memory DB to verify:
 * - Limit enforcement with mixed ARS/USD spenditures
 * - Accounting accuracy (rounding, derivation, delta calculations)
 * - Aggregate split outputs (total_spent_ars, total_spent_usd)
 * - CCL USD estimate fields (present vs null)
 * - Due-date persistence
 * - Update/delete integrity rules for settled spenditures
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createTestDb } from "../src/db/migrate";
import { CreditCardService } from "../src/modules/credit-cards/credit-card-service";
import {
  ValidationError,
  ConflictError,
  NotFoundError,
} from "../src/modules/shared/errors";

// ── Helpers ──────────────────────────────────────────────────────

function seedEntity(raw: Database, id = "entity-1") {
  raw.run(
    `INSERT INTO entities (id, name, type) VALUES ('${id}', 'Test Bank', 'bank')`,
  );
}

function seedRate(
  raw: Database,
  opts: { source?: string; sellRate?: number } = {},
) {
  const { source = "contadoconliqui", sellRate = 1200 } = opts;
  raw.run(
    `INSERT OR REPLACE INTO exchange_rates (id, pair, buy_rate, sell_rate, source)
     VALUES ('usd_ars_${source}', 'USD/ARS', ${sellRate * 0.98}, ${sellRate}, '${source}')`,
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
    dueDate?: string;
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
    dueDate = "2026-06-01",
  } = opts;
  raw.run(
    `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, monthly_amount, total_amount, remaining_installments, installments, due_date)
     VALUES ('${id}', '${cardId}', 'Seeded Spend', ${monthlyAmount}, '${currency}', ${monthlyAmount}, ${totalAmount}, ${remainingInstallments}, ${installments}, '${dueDate}')`,
  );
}

// ── Limit enforcement ────────────────────────────────────────────

describe("Spenditure limit enforcement", () => {
  let raw: Database;
  let service: CreditCardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    service = new CreditCardService(db.orm);
    seedEntity(raw);
    seedRate(raw, { sellRate: 1200 });
    seedCreditCard(raw, { id: "cc-1", spendLimit: 100000 });
  });

  it("allows ARS spenditure within limit", () => {
    const result = service.createSpenditure("cc-1", {
      description: "Within limit",
      amount: 99999,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    expect(result).toBeDefined();
    expect(result!.total_amount).toBe(99999);
  });

  it("rejects ARS spenditure that exceeds limit", () => {
    expect(() =>
      service.createSpenditure("cc-1", {
        description: "Over limit",
        amount: 100001,
        currency: "ARS",
        due_date: "2026-06-01",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects USD spenditure whose ARS equivalent exceeds limit", () => {
    // 100 USD × 1200 = 120,000 ARS > 100,000 limit
    expect(() =>
      service.createSpenditure("cc-1", {
        description: "USD over limit",
        amount: 100,
        currency: "USD",
        due_date: "2026-06-01",
      }),
    ).toThrow(ValidationError);
  });

  it("allows mixed ARS+USD spenditures that fit within limit", () => {
    // 50,000 ARS first
    service.createSpenditure("cc-1", {
      description: "ARS portion",
      amount: 50000,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // 40 USD × 1200 = 48,000 ARS → total exposure 98,000 < 100,000
    const result = service.createSpenditure("cc-1", {
      description: "USD portion",
      amount: 40,
      currency: "USD",
      due_date: "2026-06-01",
    });
    expect(result).toBeDefined();
  });

  it("rejects second spenditure when cumulative exposure exceeds limit", () => {
    service.createSpenditure("cc-1", {
      description: "First",
      amount: 60000,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // 50 USD × 1200 = 60,000 → total 120,000 > 100,000
    expect(() =>
      service.createSpenditure("cc-1", {
        description: "Second",
        amount: 50,
        currency: "USD",
        due_date: "2026-06-01",
      }),
    ).toThrow(ValidationError);
  });
});

// ── Update limit re-validation (delta-based) ─────────────────────

describe("Spenditure update — limit re-validation", () => {
  let raw: Database;
  let service: CreditCardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    service = new CreditCardService(db.orm);
    seedEntity(raw);
    seedRate(raw, { sellRate: 1200 });
    seedCreditCard(raw, { id: "cc-1", spendLimit: 100000 });
  });

  it("allows update that stays within limit (delta-based)", () => {
    // Create 50,000 ARS → 50k used
    const spend = service.createSpenditure("cc-1", {
      description: "Original",
      amount: 50000,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // Update to 90,000 → delta +40k → total 90k < 100k
    const updated = service.updateSpenditure("cc-1", spend!.id, {
      amount: 90000,
    });
    expect(updated!.total_amount).toBe(90000);
  });

  it("rejects update that pushes exposure past limit", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "Original",
      amount: 50000,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // Update to 110,000 → exceed 100k limit
    expect(() =>
      service.updateSpenditure("cc-1", spend!.id, { amount: 110000 }),
    ).toThrow(ValidationError);
  });

  it("rejects currency change from ARS to USD when ARS-equivalent exceeds limit", () => {
    // Create 50 ARS → fits within 100k limit
    const spend = service.createSpenditure("cc-1", {
      description: "Small ARS",
      amount: 50,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // Change to 50 USD → 50 × 1200 = 60,000 ARS → delta = +59,950
    // Projected: 60,000 < 100,000 → fits
    const updated = service.updateSpenditure("cc-1", spend!.id, {
      amount: 50,
      currency: "USD",
    });
    expect(updated!.currency).toBe("USD");
    expect(updated!.total_amount).toBe(50);
  });

  it("rejects currency change to USD that pushes exposure past limit", () => {
    // Create 50,000 ARS + another 40,000 ARS = 90,000 used
    service.createSpenditure("cc-1", {
      description: "First",
      amount: 50000,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    const spend2 = service.createSpenditure("cc-1", {
      description: "Second",
      amount: 40000,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // Change second to 100 USD → 100 × 1200 = 120,000 ARS
    // Projected: 50,000 + 120,000 = 170,000 > 100,000
    expect(() =>
      service.updateSpenditure("cc-1", spend2!.id, {
        amount: 100,
        currency: "USD",
      }),
    ).toThrow(ValidationError);
  });
});

// ── Accounting accuracy ──────────────────────────────────────────

describe("Spenditure accounting accuracy", () => {
  let raw: Database;
  let service: CreditCardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    service = new CreditCardService(db.orm);
    seedEntity(raw);
    seedRate(raw, { sellRate: 1200 });
    seedCreditCard(raw, { id: "cc-1", spendLimit: 10000000 });
  });

  it("persists exact amount for 1× purchase", () => {
    const result = service.createSpenditure("cc-1", {
      description: "Exact",
      amount: 12345.67,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    expect(result!.total_amount).toBe(12345.67);
    expect(result!.monthly_amount).toBe(12345.67);
    expect(result!.amount).toBe(12345.67);
    expect(result!.installments).toBe(1);
    expect(result!.remaining_installments).toBe(1);
  });

  it("derives totalAmount = monthly × installments with roundMoney", () => {
    const result = service.createSpenditure("cc-1", {
      description: "Installment",
      monthly_amount: 333.33,
      installments: 3,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // 333.33 × 3 = 999.99 — no rounding needed
    expect(result!.monthly_amount).toBe(333.33);
    expect(result!.total_amount).toBe(999.99);
  });

  it("derives monthlyAmount from total / installments with roundMoney", () => {
    const result = service.createSpenditure("cc-1", {
      description: "From total",
      total_amount: 1000,
      installments: 3,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // 1000 / 3 = 333.33 (roundMoney)
    expect(result!.monthly_amount).toBe(333.33);
    expect(result!.total_amount).toBe(1000);
  });

  it("update recalculates monthly from new total / installments", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "Original",
      total_amount: 6000,
      installments: 3,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    const updated = service.updateSpenditure("cc-1", spend!.id, {
      total_amount: 1000,
      installments: 3,
    });
    expect(updated!.total_amount).toBe(1000);
    expect(updated!.monthly_amount).toBe(333.33);
  });

  it("update with repeating-decimal total preserves exact total", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "Original",
      amount: 100,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // Change to installments=7, total_amount=100
    const updated = service.updateSpenditure("cc-1", spend!.id, {
      total_amount: 100,
      installments: 7,
    });
    // 100 / 7 = 14.29 (roundMoney)
    expect(updated!.total_amount).toBe(100);
    expect(updated!.monthly_amount).toBe(14.29);
    expect(updated!.installments).toBe(7);
  });

  it("remaining_installments resets to new installments count on financial update", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "Installment",
      total_amount: 6000,
      installments: 6,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    expect(spend!.remaining_installments).toBe(6);

    // Change installments from 6 to 3
    const updated = service.updateSpenditure("cc-1", spend!.id, {
      total_amount: 6000,
      installments: 3,
    });
    expect(updated!.remaining_installments).toBe(3);
    expect(updated!.monthly_amount).toBe(2000);
  });
});

// ── Aggregate split outputs ──────────────────────────────────────

describe("Spenditure aggregate splits", () => {
  let raw: Database;
  let service: CreditCardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    service = new CreditCardService(db.orm);
    seedEntity(raw);
    seedRate(raw, { sellRate: 1200 });
    seedCreditCard(raw, { id: "cc-1", spendLimit: 10000000 });
  });

  it("ARS-only card shows total_spent_ars > 0, total_spent_usd === 0", () => {
    seedSpenditure(raw, {
      id: "ars-1",
      cardId: "cc-1",
      totalAmount: 50000,
      monthlyAmount: 50000,
      installments: 1,
      remainingInstallments: 1,
      currency: "ARS",
    });
    const card = service.getCard("cc-1");
    expect(card.total_spent_ars).toBe(50000);
    expect(card.total_spent_usd).toBe(0);
    expect(card.total_spent).toBe(50000);
  });

  it("mixed ARS+USD card populates both splits", () => {
    seedSpenditure(raw, {
      id: "ars-1",
      cardId: "cc-1",
      totalAmount: 30000,
      monthlyAmount: 30000,
      installments: 1,
      remainingInstallments: 1,
      currency: "ARS",
    });
    seedSpenditure(raw, {
      id: "usd-1",
      cardId: "cc-1",
      totalAmount: 100,
      monthlyAmount: 100,
      installments: 1,
      remainingInstallments: 1,
      currency: "USD",
    });
    const card = service.getCard("cc-1");
    expect(card.total_spent_ars).toBe(30000);
    expect(card.total_spent_usd).toBe(100);
    // total_spent = 30000 ARS + 100 USD × 1200 = 150000 ARS
    expect(card.total_spent).toBe(150000);
  });

  it("paid-off spenditures are excluded from totals", () => {
    // Fully paid spenditure
    raw.run(
      `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, monthly_amount, total_amount, remaining_installments, installments, is_paid_off, due_date)
       VALUES ('paid-1', 'cc-1', 'Paid', 5000, 'ARS', 5000, 5000, 0, 1, 1, '2026-01-01')`,
    );
    // Unpaid spenditure
    seedSpenditure(raw, {
      id: "unpaid-1",
      cardId: "cc-1",
      totalAmount: 20000,
      monthlyAmount: 20000,
      installments: 1,
      remainingInstallments: 1,
      currency: "ARS",
    });
    const card = service.getCard("cc-1");
    // Only unpaid contributes
    expect(card.total_spent_ars).toBe(20000);
  });
});

// ── USD estimate fields ──────────────────────────────────────────

describe("USD estimate fields", () => {
  let raw: Database;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    seedEntity(raw);
    seedCreditCard(raw, { id: "cc-1", spendLimit: 500000 });
  });

  it("returns numeric estimates when CCL rate is seeded", () => {
    seedRate(raw, { sellRate: 1200 });
    const service = new CreditCardService(
      drizzle(raw, { schema: undefined as any }),
    );
    // Need a fresh ORM instance with the rate
    const db2 = createTestDb();
    seedEntity(db2.raw);
    seedRate(db2.raw, { sellRate: 1200 });
    seedCreditCard(db2.raw, { id: "cc-1", spendLimit: 600000 });
    const svc = new CreditCardService(db2.orm);

    const card = svc.getCard("cc-1");
    // 600,000 / 1200 = 500 USD
    expect(card.spend_limit_usd_estimate).toBe(500);
    expect(card.available_limit_usd_estimate).toBe(500);
  });

  it("returns null estimates when no CCL rate exists", () => {
    // No rate seeded
    const db2 = createTestDb();
    seedEntity(db2.raw);
    seedCreditCard(db2.raw, { id: "cc-1", spendLimit: 500000 });
    const svc = new CreditCardService(db2.orm);

    const card = svc.getCard("cc-1");
    expect(card.spend_limit_usd_estimate).toBeNull();
    expect(card.available_limit_usd_estimate).toBeNull();
  });
});

// ── Due-date persistence ─────────────────────────────────────────

describe("Spenditure due-date persistence", () => {
  let raw: Database;
  let service: CreditCardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    service = new CreditCardService(db.orm);
    seedEntity(raw);
    seedCreditCard(raw, { id: "cc-1", spendLimit: 10000000 });
  });

  it("persists due_date on creation and returns it", () => {
    const result = service.createSpenditure("cc-1", {
      description: "With date",
      amount: 100,
      currency: "ARS",
      due_date: "2026-12-25",
    });
    expect(result!.due_date).toBe("2026-12-25");
  });

  it("updates due_date via metadata-only edit", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "Date test",
      amount: 100,
      currency: "ARS",
      due_date: "2026-01-01",
    });
    const updated = service.updateSpenditure("cc-1", spend!.id, {
      due_date: "2026-12-31",
    });
    expect(updated!.due_date).toBe("2026-12-31");
  });

  it("rejects invalid due_date format via create", () => {
    expect(() =>
      service.createSpenditure("cc-1", {
        description: "Bad date",
        amount: 100,
        currency: "ARS",
        due_date: "12/25/2026",
      }),
    ).toThrow();
  });
});

// ── Update integrity (partially paid) ────────────────────────────

describe("Spenditure update integrity", () => {
  let raw: Database;
  let service: CreditCardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    service = new CreditCardService(db.orm);
    seedEntity(raw);
    seedRate(raw, { sellRate: 1200 });
    seedCreditCard(raw, { id: "cc-1", spendLimit: 10000000 });
  });

  it("allows metadata edit on partially-paid spenditure", () => {
    // Seed partially paid: 3 installments, 2 remaining
    seedSpenditure(raw, {
      id: "partial-1",
      cardId: "cc-1",
      totalAmount: 3000,
      monthlyAmount: 1000,
      installments: 3,
      remainingInstallments: 2,
    });
    const updated = service.updateSpenditure("cc-1", "partial-1", {
      description: "Renamed",
    });
    expect(updated!.description).toBe("Renamed");
  });

  it("allows due_date edit on partially-paid spenditure", () => {
    seedSpenditure(raw, {
      id: "partial-2",
      cardId: "cc-1",
      totalAmount: 3000,
      monthlyAmount: 1000,
      installments: 3,
      remainingInstallments: 1,
    });
    const updated = service.updateSpenditure("cc-1", "partial-2", {
      due_date: "2027-01-01",
    });
    expect(updated!.due_date).toBe("2027-01-01");
  });

  it("blocks financial edit on partially-paid spenditure", () => {
    seedSpenditure(raw, {
      id: "partial-3",
      cardId: "cc-1",
      totalAmount: 3000,
      monthlyAmount: 1000,
      installments: 3,
      remainingInstallments: 2,
    });
    expect(() =>
      service.updateSpenditure("cc-1", "partial-3", { amount: 5000 }),
    ).toThrow(ConflictError);
  });

  it("blocks financial edit on fully-paid spenditure", () => {
    raw.run(
      `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, monthly_amount, total_amount, remaining_installments, installments, is_paid_off, due_date)
       VALUES ('fully-paid', 'cc-1', 'Done', 1000, 'ARS', 1000, 1000, 0, 1, 1, '2026-01-01')`,
    );
    expect(() =>
      service.updateSpenditure("cc-1", "fully-paid", { amount: 2000 }),
    ).toThrow(ConflictError);
  });

  it("allows metadata edit on fully-paid spenditure", () => {
    raw.run(
      `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, monthly_amount, total_amount, remaining_installments, installments, is_paid_off, due_date)
       VALUES ('fully-paid-2', 'cc-1', 'Done', 1000, 'ARS', 1000, 1000, 0, 1, 1, '2026-01-01')`,
    );
    const updated = service.updateSpenditure("cc-1", "fully-paid-2", {
      description: "Renamed paid",
    });
    expect(updated!.description).toBe("Renamed paid");
  });

  it("throws NotFoundError for non-existent spenditure", () => {
    expect(() =>
      service.updateSpenditure("cc-1", "nonexistent", {
        description: "Nope",
      }),
    ).toThrow(NotFoundError);
  });

  it("throws NotFoundError for spenditure on wrong card", () => {
    seedCreditCard(raw, { id: "cc-2", spendLimit: 100000 });
    seedSpenditure(raw, { id: "spend-other", cardId: "cc-2" });
    expect(() =>
      service.updateSpenditure("cc-1", "spend-other", {
        description: "Wrong card",
      }),
    ).toThrow(NotFoundError);
  });
});

// ── Delete integrity ─────────────────────────────────────────────

describe("Spenditure delete integrity", () => {
  let raw: Database;
  let service: CreditCardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    service = new CreditCardService(db.orm);
    seedEntity(raw);
    seedCreditCard(raw, { id: "cc-1", spendLimit: 10000000 });
  });

  it("deletes fully-unpaid spenditure successfully", () => {
    seedSpenditure(raw, {
      id: "unpaid-del",
      cardId: "cc-1",
      totalAmount: 5000,
      monthlyAmount: 5000,
      installments: 1,
      remainingInstallments: 1,
    });
    service.deleteSpenditure("cc-1", "unpaid-del");
    // Verify it's gone
    const card = service.getCard("cc-1");
    expect(
      card.spenditures.find((s: any) => s.id === "unpaid-del"),
    ).toBeUndefined();
  });

  it("deletes multi-installment spenditure when no payments made", () => {
    seedSpenditure(raw, {
      id: "multi-del",
      cardId: "cc-1",
      totalAmount: 6000,
      monthlyAmount: 1000,
      installments: 6,
      remainingInstallments: 6,
    });
    service.deleteSpenditure("cc-1", "multi-del");
    const card = service.getCard("cc-1");
    expect(
      card.spenditures.find((s: any) => s.id === "multi-del"),
    ).toBeUndefined();
  });

  it("blocks deletion of partially-paid spenditure", () => {
    seedSpenditure(raw, {
      id: "partial-del",
      cardId: "cc-1",
      totalAmount: 3000,
      monthlyAmount: 1000,
      installments: 3,
      remainingInstallments: 2,
    });
    expect(() => service.deleteSpenditure("cc-1", "partial-del")).toThrow(
      ConflictError,
    );
  });

  it("blocks deletion of fully-paid spenditure", () => {
    raw.run(
      `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, monthly_amount, total_amount, remaining_installments, installments, is_paid_off, due_date)
       VALUES ('paid-del', 'cc-1', 'Paid', 5000, 'ARS', 5000, 5000, 0, 1, 1, '2026-01-01')`,
    );
    expect(() => service.deleteSpenditure("cc-1", "paid-del")).toThrow(
      ConflictError,
    );
  });

  it("throws NotFoundError for non-existent spenditure", () => {
    expect(() => service.deleteSpenditure("cc-1", "ghost")).toThrow(
      NotFoundError,
    );
  });

  it("throws NotFoundError for spenditure on wrong card", () => {
    seedCreditCard(raw, { id: "cc-2", spendLimit: 100000 });
    seedSpenditure(raw, { id: "wrong-card-del", cardId: "cc-2" });
    expect(() => service.deleteSpenditure("cc-1", "wrong-card-del")).toThrow(
      NotFoundError,
    );
  });

  it("frees limit exposure after delete", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "Will delete",
      amount: 50000,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // Before delete: total_spent should be 50000
    let card = service.getCard("cc-1");
    expect(card.total_spent).toBe(50000);

    service.deleteSpenditure("cc-1", spend!.id);

    // After delete: exposure freed
    card = service.getCard("cc-1");
    expect(card.total_spent).toBe(0);
    expect(card.available_limit).toBe(10000000);
  });
});

// ── Update — ARS-only installment invariant ──────────────────────

describe("Spenditure update — ARS-only installment invariant", () => {
  let raw: Database;
  let service: CreditCardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    service = new CreditCardService(db.orm);
    seedEntity(raw);
    seedRate(raw, { sellRate: 1200 });
    seedCreditCard(raw, { id: "cc-1", spendLimit: 10000000 });
  });

  it("rejects switching ARS installments to USD", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "ARS installments",
      total_amount: 9000,
      installments: 3,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    // Change currency to USD while keeping installments=3
    expect(() =>
      service.updateSpenditure("cc-1", spend!.id, { currency: "USD" }),
    ).toThrow(ValidationError);
  });

  it("rejects changing USD 1× to multi-installment", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "USD single",
      amount: 50,
      currency: "USD",
      due_date: "2026-06-01",
    });
    // Change installments to 3 while keeping currency=USD
    expect(() =>
      service.updateSpenditure("cc-1", spend!.id, {
        installments: 3,
        total_amount: 150,
      }),
    ).toThrow(ValidationError);
  });

  it("allows ARS multi-installment update", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "ARS installments",
      total_amount: 9000,
      installments: 3,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    const updated = service.updateSpenditure("cc-1", spend!.id, {
      total_amount: 12000,
      installments: 6,
    });
    expect(updated!.total_amount).toBe(12000);
    expect(updated!.installments).toBe(6);
  });

  it("allows USD 1× amount update", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "USD single",
      amount: 50,
      currency: "USD",
      due_date: "2026-06-01",
    });
    const updated = service.updateSpenditure("cc-1", spend!.id, {
      amount: 75,
    });
    expect(updated!.total_amount).toBe(75);
    expect(updated!.installments).toBe(1);
  });
});

// ── Update — empty payload guard ─────────────────────────────────

describe("Spenditure update — empty payload guard", () => {
  let raw: Database;
  let service: CreditCardService;

  beforeEach(() => {
    const db = createTestDb();
    raw = db.raw;
    service = new CreditCardService(db.orm);
    seedEntity(raw);
    seedCreditCard(raw, { id: "cc-1", spendLimit: 10000000 });
  });

  it("rejects empty object update", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "Test",
      amount: 100,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    expect(() => service.updateSpenditure("cc-1", spend!.id, {})).toThrow(
      ValidationError,
    );
  });

  it("rejects unknown-only payload", () => {
    const spend = service.createSpenditure("cc-1", {
      description: "Test",
      amount: 100,
      currency: "ARS",
      due_date: "2026-06-01",
    });
    expect(() =>
      service.updateSpenditure("cc-1", spend!.id, { foo: "bar" } as any),
    ).toThrow(ValidationError);
  });
});
