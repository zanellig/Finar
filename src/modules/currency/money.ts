/**
 * Currency domain primitives.
 *
 * All monetary aggregation must go through the Money type and conversion
 * helpers so that ARS/USD values are never naively summed.
 */

export type Currency = "ARS" | "USD";

export interface Money {
  amount: number;
  currency: Currency;
}

/** Base currency for all aggregated output (dashboard totals, etc.). */
export const BASE_CURRENCY: Currency = "ARS";

/**
 * Default exchange-rate source key.
 * Corresponds to "Contado con Liquidación" from dolarapi.com.
 */
export const DEFAULT_RATE_SOURCE = "contadoconliqui";

/**
 * Decimal-safe rounding to 2 decimal places.
 *
 * Uses exponential-notation string conversion instead of float
 * multiplication to avoid IEEE 754 midpoint errors.
 * e.g. Math.round(1.005 * 100) / 100 → 1.00 (wrong)
 *      roundMoney(1.005)              → 1.01 (correct)
 */
export function roundMoney(n: number): number {
  return Number(Math.round(parseFloat(n + "e2")) + "e-2");
}
