/**
 * Unit tests for the canonical spenditure parser.
 *
 * Verifies installment rules, schema dispatch, amount derivation,
 * and edge cases that were previously duplicated across route and service.
 */

import { describe, it, expect } from "bun:test";
import { parseSpenditure } from "../src/modules/credit-cards/parse-spenditure";
import { ValidationError } from "../src/modules/shared/errors";

// ── Helpers ──────────────────────────────────────────────────────

function base1x(overrides: Record<string, unknown> = {}) {
  return {
    description: "Coffee",
    currency: "ARS",
    amount: 1500,
    ...overrides,
  };
}

function baseInstallment(overrides: Record<string, unknown> = {}) {
  return {
    description: "TV",
    currency: "ARS",
    installments: 6,
    monthly_amount: 5000,
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
    const body = { description: "Coffee", amount: 100 };
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
    expect(() => parseSpenditure({ amount: 100, description: "" })).toThrow();
  });
});
