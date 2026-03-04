/**
 * Currency conversion logic.
 *
 * Converts any Money value to the base currency (ARS).
 * Supports:
 *  - DB-backed rates from a configurable source (default: CCL)
 *  - User-supplied custom rate override
 *
 * Throws MissingRateError when no rate is available instead of
 * silently producing incorrect totals.
 */

import { RatesRepository } from "./rates-repository";
import {
  type Money,
  type Currency,
  BASE_CURRENCY,
  DEFAULT_RATE_SOURCE,
  roundMoney,
} from "./money";
import { MissingRateError } from "../shared/errors";

export interface ConversionOptions {
  /** Override the default rate source (e.g. "blue", "oficial"). */
  rateSource?: string;
  /**
   * User-supplied custom sell rate for USD → ARS.
   * When set, this takes priority over any DB rate.
   */
  customRate?: number;
}

export class CurrencyConverter {
  constructor(private readonly rates: RatesRepository) {}

  /**
   * Convert a Money value to the base currency (ARS).
   *
   * - ARS amounts pass through unchanged.
   * - USD amounts are multiplied by the sell rate.
   * - If `customRate` is provided, it overrides the DB lookup.
   */
  toBase(money: Money, opts: ConversionOptions = {}): number {
    if (money.currency === BASE_CURRENCY) {
      return money.amount;
    }

    const sellRate = this.resolveSellRate(money.currency, opts);
    return roundMoney(money.amount * sellRate);
  }

  /**
   * Convert an array of Money values to ARS and sum them.
   */
  sumToBase(items: Money[], opts: ConversionOptions = {}): number {
    // Fast path: cache the resolved rate so we don't query per item.
    const resolvedRate = items.some((m) => m.currency !== BASE_CURRENCY)
      ? this.resolveSellRate("USD", opts)
      : null;

    let total = 0;
    for (const m of items) {
      if (m.currency === BASE_CURRENCY) {
        total += m.amount;
      } else {
        total += m.amount * resolvedRate!;
      }
    }
    return roundMoney(total);
  }

  /**
   * Convert a base-currency (ARS) amount to a foreign currency estimate.
   *
   * Returns `null` when no rate is available — estimates are best-effort,
   * not critical. Used for USD limit estimates on card responses.
   */
  fromBase(arsAmount: number, opts: ConversionOptions = {}): number | null {
    try {
      const sellRate = this.resolveSellRate("USD", opts);
      return roundMoney(arsAmount / sellRate);
    } catch {
      return null;
    }
  }

  /**
   * Pre-resolve the USD → ARS sell rate.
   * Returns `null` when no rate is available.
   * Useful for caching the rate in hot loops.
   */
  tryGetSellRate(opts: ConversionOptions = {}): number | null {
    try {
      return this.resolveSellRate("USD", opts);
    } catch {
      return null;
    }
  }

  /** Resolve the sell rate for a foreign currency → ARS. */
  private resolveSellRate(currency: Currency, opts: ConversionOptions): number {
    // Custom rate takes priority
    if (opts.customRate != null && opts.customRate > 0) {
      return opts.customRate;
    }

    const source = opts.rateSource ?? DEFAULT_RATE_SOURCE;
    const pair = `${currency}/${BASE_CURRENCY}`;
    const rate = this.rates.getRate(pair, source);

    if (!rate) {
      throw new MissingRateError(
        `Missing exchange rate for ${pair} (source: ${source})`,
      );
    }

    return rate.sellRate;
  }
}
