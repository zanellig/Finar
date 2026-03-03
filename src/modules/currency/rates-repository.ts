/**
 * Exchange-rate repository — pure DB access for rates.
 */

import { eq, and } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { exchangeRates } from "../../db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

export interface Rate {
  buyRate: number;
  sellRate: number;
  source: string;
  fetchedAt: string;
}

export class RatesRepository {
  constructor(private readonly db: Orm) {}

  /** Get a single rate by pair and source. */
  getRate(pair: string, source: string): Rate | undefined {
    const row = this.db
      .select({
        buyRate: exchangeRates.buyRate,
        sellRate: exchangeRates.sellRate,
        source: exchangeRates.source,
        fetchedAt: exchangeRates.fetchedAt,
      })
      .from(exchangeRates)
      .where(
        and(eq(exchangeRates.pair, pair), eq(exchangeRates.source, source)),
      )
      .get();

    return row ?? undefined;
  }

  /** Get all available sources for a given pair. */
  getAvailableSources(pair: string): string[] {
    const rows = this.db
      .select({ source: exchangeRates.source })
      .from(exchangeRates)
      .where(eq(exchangeRates.pair, pair))
      .all();

    return rows.map((r) => r.source);
  }
}
