/**
 * Unit tests for the canonical spenditure parser.
 *
 * Verifies installment rules, schema dispatch, amount derivation,
 * and edge cases that were previously duplicated across route and service.
 */

import { describe, it, expect } from "bun:test";
import { parseSpenditure } from "../src/modules/credit-cards/parse-spenditure";
import { ValidationError } from "../src/modules/shared/errors";
import {
  updateSpenditureMetadataSchema,
  updateSpenditureFinancialSchema,
  spenditureParamsSchema,
} from "../src/db/validation";

// ── Helpers ──────────────────────────────────────────────────────

function base1x(overrides: Record<string, unknown> = {}) {
  return {
    description: "Coffee",
    currency: "ARS",
    amount: 1500,
    due_date: "2026-01-15",
    ...overrides,
  };
}

function baseInstallment(overrides: Record<string, unknown> = {}) {
  return {
    description: "TV",
    currency: "ARS",
    installments: 6,
    monthly_amount: 5000,
    due_date: "2026-06-10",
    ...overrides,
  };
}

// ── 1× purchase tests ───────────────────────────────────────────

describe("parseSpenditure — 1× purchases", () => {
  it("returns correct shape for a valid ARS 1× purchase", () => {
    const result = parseSpenditure(base1x());

    expect(result.installments).toBe(1);
    expect(result.totalAmount).toBe(1500);
    expect(result.monthlyAmount).toBe(1500);
    expect(result.currency).toBe("ARS");
    expect(result.description).toBe("Coffee");
  });

  it("accepts USD for single purchases", () => {
    const result = parseSpenditure(base1x({ currency: "USD" }));

    expect(result.installments).toBe(1);
    expect(result.currency).toBe("USD");
    expect(result.totalAmount).toBe(1500);
  });

  it("treats installments < 2 as 1×", () => {
    const result = parseSpenditure(base1x({ installments: 1 }));
    expect(result.installments).toBe(1);
  });

  it("treats missing installments as 1×", () => {
    const result = parseSpenditure(base1x());
    expect(result.installments).toBe(1);
  });

  it("treats non-numeric installments as 1×", () => {
    const result = parseSpenditure(base1x({ installments: "abc" }));
    expect(result.installments).toBe(1);
  });

  it("trims description whitespace", () => {
    const result = parseSpenditure(base1x({ description: "  Latte  " }));
    expect(result.description).toBe("Latte");
  });

  it("defaults currency to ARS when missing", () => {
    const body = { description: "Coffee", amount: 100, due_date: "2026-01-01" };
    const result = parseSpenditure(body);
    expect(result.currency).toBe("ARS");
  });
});

// ── Installment purchase tests ──────────────────────────────────

describe("parseSpenditure — installment purchases", () => {
  it("derives totalAmount from monthly_amount", () => {
    const result = parseSpenditure(baseInstallment({ monthly_amount: 1000 }));

    expect(result.installments).toBe(6);
    expect(result.monthlyAmount).toBe(1000);
    expect(result.totalAmount).toBe(6000);
  });

  it("derives monthlyAmount from total_amount", () => {
    const result = parseSpenditure(
      baseInstallment({
        monthly_amount: undefined,
        total_amount: 12000,
      }),
    );

    expect(result.installments).toBe(6);
    expect(result.totalAmount).toBe(12000);
    expect(result.monthlyAmount).toBe(2000);
  });

  it("prefers monthly_amount over total_amount when both present", () => {
    const result = parseSpenditure(
      baseInstallment({ monthly_amount: 500, total_amount: 99999 }),
    );

    // monthly_amount takes precedence
    expect(result.monthlyAmount).toBe(500);
    expect(result.totalAmount).toBe(3000); // 500 × 6
  });

  it("applies deterministic rounding and preserves totalAmount", () => {
    const result = parseSpenditure(
      baseInstallment({
        installments: 3,
        monthly_amount: undefined,
        total_amount: 100,
      }),
    );

    // 100 / 3 = 33.333... → rounds to 33.33
    expect(result.monthlyAmount).toBe(33.33);
    // totalAmount must stay at the user's exact figure (100),
    // NOT recomputed as 33.33 × 3 = 99.99 — that would cause drift.
    expect(result.totalAmount).toBe(100);
  });

  it("preserves totalAmount for 10 / 6 (repeating decimal)", () => {
    const result = parseSpenditure(
      baseInstallment({
        installments: 6,
        monthly_amount: undefined,
        total_amount: 10,
      }),
    );

    // 10 / 6 = 1.6666... → 1.67
    expect(result.monthlyAmount).toBe(1.67);
    expect(result.totalAmount).toBe(10);
  });

  it("preserves totalAmount for 7 / 4", () => {
    const result = parseSpenditure(
      baseInstallment({
        installments: 4,
        monthly_amount: undefined,
        total_amount: 7,
      }),
    );

    // 7 / 4 = 1.75 — exact, no drift
    expect(result.monthlyAmount).toBe(1.75);
    expect(result.totalAmount).toBe(7);
  });

  it("preserves totalAmount for 1000 / 7 (long repeating)", () => {
    const result = parseSpenditure(
      baseInstallment({
        installments: 7,
        monthly_amount: undefined,
        total_amount: 1000,
      }),
    );

    // 1000 / 7 = 142.857... → 142.86
    expect(result.monthlyAmount).toBe(142.86);
    expect(result.totalAmount).toBe(1000);
  });

  it("floors fractional installments to integer", () => {
    const result = parseSpenditure(
      baseInstallment({ installments: 6.7, monthly_amount: 100 }),
    );
    expect(result.installments).toBe(6);
  });
});

// ── Rejection cases ─────────────────────────────────────────────

describe("parseSpenditure — validation rejections", () => {
  it("rejects USD installments", () => {
    expect(() => parseSpenditure(baseInstallment({ currency: "USD" }))).toThrow(
      ValidationError,
    );
  });

  it("rejects USD installments with matching error message", () => {
    expect(() => parseSpenditure(baseInstallment({ currency: "USD" }))).toThrow(
      "Installments are only available in ARS payments",
    );
  });

  it("rejects installment with missing both monthly_amount and total_amount", () => {
    expect(() =>
      parseSpenditure(
        baseInstallment({
          monthly_amount: undefined,
          total_amount: undefined,
        }),
      ),
    ).toThrow();
  });

  it("rejects non-positive amount for 1× purchase", () => {
    expect(() => parseSpenditure(base1x({ amount: 0 }))).toThrow();
    expect(() => parseSpenditure(base1x({ amount: -5 }))).toThrow();
  });

  it("rejects missing description for 1× purchase", () => {
    expect(() =>
      parseSpenditure({ amount: 100, description: "", due_date: "2026-01-01" }),
    ).toThrow();
  });
});

// ── Due date validation ─────────────────────────────────────────

describe("parseSpenditure — due date validation", () => {
  it("includes dueDate in parsed result", () => {
    const result = parseSpenditure(base1x({ due_date: "2026-03-15" }));
    expect(result.dueDate).toBe("2026-03-15");
  });

  it("rejects missing due_date", () => {
    const { due_date: _, ...body } = base1x();
    expect(() => parseSpenditure(body as Record<string, unknown>)).toThrow();
  });

  it("rejects invalid date format (slash separator)", () => {
    expect(() => parseSpenditure(base1x({ due_date: "2026/01/15" }))).toThrow(
      "due_date must be in YYYY-MM-DD format",
    );
  });

  it("rejects named month format", () => {
    expect(() => parseSpenditure(base1x({ due_date: "Jan 15" }))).toThrow(
      "due_date must be in YYYY-MM-DD format",
    );
  });

  it("includes dueDate on installment purchase", () => {
    const result = parseSpenditure(baseInstallment({ due_date: "2026-12-01" }));
    expect(result.dueDate).toBe("2026-12-01");
  });
});

// ── Update schemas ──────────────────────────────────────────────

describe("updateSpenditureMetadataSchema", () => {
  it("accepts partial description only", () => {
    const result = updateSpenditureMetadataSchema.parse({
      description: "New desc",
    });
    expect(result.description).toBe("New desc");
    expect(result.due_date).toBeUndefined();
  });

  it("accepts partial due_date only", () => {
    const result = updateSpenditureMetadataSchema.parse({
      due_date: "2026-05-01",
    });
    expect(result.due_date).toBe("2026-05-01");
  });

  it("accepts empty object", () => {
    const result = updateSpenditureMetadataSchema.parse({});
    expect(result.description).toBeUndefined();
    expect(result.due_date).toBeUndefined();
  });

  it("rejects invalid due_date format", () => {
    expect(() =>
      updateSpenditureMetadataSchema.parse({ due_date: "not-a-date" }),
    ).toThrow();
  });
});

describe("updateSpenditureFinancialSchema", () => {
  it("accepts partial amount", () => {
    const result = updateSpenditureFinancialSchema.parse({ amount: 999 });
    expect(result.amount).toBe(999);
  });

  it("accepts partial currency", () => {
    const result = updateSpenditureFinancialSchema.parse({ currency: "USD" });
    expect(result.currency).toBe("USD");
  });

  it("accepts empty object", () => {
    const result = updateSpenditureFinancialSchema.parse({});
    expect(result.amount).toBeUndefined();
  });

  it("rejects non-positive amount", () => {
    expect(() =>
      updateSpenditureFinancialSchema.parse({ amount: 0 }),
    ).toThrow();
  });
});

describe("spenditureParamsSchema", () => {
  it("accepts valid params", () => {
    const result = spenditureParamsSchema.parse({
      id: "card-1",
      spendId: "spend-1",
    });
    expect(result.id).toBe("card-1");
    expect(result.spendId).toBe("spend-1");
  });

  it("rejects empty id", () => {
    expect(() =>
      spenditureParamsSchema.parse({ id: "", spendId: "spend-1" }),
    ).toThrow();
  });

  it("rejects empty spendId", () => {
    expect(() =>
      spenditureParamsSchema.parse({ id: "card-1", spendId: "" }),
    ).toThrow();
  });
});
