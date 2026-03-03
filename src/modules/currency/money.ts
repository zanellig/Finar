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

/** Banker's rounding to 2 decimal places. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
