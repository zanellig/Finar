import { eq, and, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { creditCards, ccSpenditures, entities } from "../../db/schema";
import type { CreditCardValues, CcSpenditureValues } from "./credit-card-types";

/** Per-card raw currency split for unpaid spenditures. */
export interface CardCurrencyTotals {
  ars: number;
  usd: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

const cardSelect = {
  id: creditCards.id,
  entity_id: creditCards.entityId,
  name: creditCards.name,
  spend_limit: creditCards.spendLimit,
  created_at: creditCards.createdAt,
};

const spendSelect = {
  id: ccSpenditures.id,
  credit_card_id: ccSpenditures.creditCardId,
  description: ccSpenditures.description,
  amount: ccSpenditures.amount,
  currency: ccSpenditures.currency,
  installments: ccSpenditures.installments,
  monthly_amount: ccSpenditures.monthlyAmount,
  total_amount: ccSpenditures.totalAmount,
  remaining_installments: ccSpenditures.remainingInstallments,
  is_paid_off: ccSpenditures.isPaidOff,
  due_date: ccSpenditures.dueDate,
  created_at: ccSpenditures.createdAt,
};

export class CreditCardRepository {
  constructor(private readonly db: Orm) {}

  findAll() {
    return this.db
      .select({
        ...cardSelect,
        entity_name: entities.name,
        entity_type: entities.type,
      })
      .from(creditCards)
      .innerJoin(entities, eq(creditCards.entityId, entities.id))
      .orderBy(creditCards.createdAt)
      .all();
  }

  findById(id: string) {
    return this.db
      .select({
        ...cardSelect,
        entity_name: entities.name,
      })
      .from(creditCards)
      .innerJoin(entities, eq(creditCards.entityId, entities.id))
      .where(eq(creditCards.id, id))
      .get();
  }

  findCardBasic(id: string) {
    return this.db
      .select(cardSelect)
      .from(creditCards)
      .where(eq(creditCards.id, id))
      .get();
  }

  exists(id: string) {
    return !!this.db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(eq(creditCards.id, id))
      .get();
  }

  entityExists(entityId: string) {
    return !!this.db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.id, entityId))
      .get();
  }

  create(values: CreditCardValues) {
    this.db.insert(creditCards).values(values).run();
  }

  update(id: string, values: Partial<CreditCardValues>) {
    this.db.update(creditCards).set(values).where(eq(creditCards.id, id)).run();
  }

  remove(id: string) {
    this.db.delete(creditCards).where(eq(creditCards.id, id)).run();
  }

  /** Fetch unpaid spenditures for a card with amounts/currencies. */
  getUnpaidSpenditures(cardId: string) {
    return this.db
      .select({
        totalAmount: ccSpenditures.totalAmount,
        currency: ccSpenditures.currency,
      })
      .from(ccSpenditures)
      .where(
        and(
          eq(ccSpenditures.creditCardId, cardId),
          eq(ccSpenditures.isPaidOff, false),
        ),
      )
      .all();
  }

  /**
   * Aggregate unpaid spenditures grouped by card ID and currency (single query).
   * Returns a Map keyed by card ID → { ars, usd } raw currency totals.
   */
  getUnpaidSpendTotalsByCurrency(): Map<string, CardCurrencyTotals> {
    const rows = this.db
      .select({
        cardId: ccSpenditures.creditCardId,
        currency: ccSpenditures.currency,
        total: sql<number>`COALESCE(SUM(${ccSpenditures.totalAmount}), 0)`,
      })
      .from(ccSpenditures)
      .where(eq(ccSpenditures.isPaidOff, false))
      .groupBy(ccSpenditures.creditCardId, ccSpenditures.currency)
      .all();

    const map = new Map<string, CardCurrencyTotals>();
    for (const row of rows) {
      let entry = map.get(row.cardId);
      if (!entry) {
        entry = { ars: 0, usd: 0 };
        map.set(row.cardId, entry);
      }
      if (row.currency === "USD") {
        entry.usd += row.total;
      } else {
        entry.ars += row.total;
      }
    }
    return map;
  }

  /** Single-card convenience accessor for unpaid currency totals. */
  getCardUnpaidTotals(cardId: string): CardCurrencyTotals {
    const rows = this.db
      .select({
        currency: ccSpenditures.currency,
        total: sql<number>`COALESCE(SUM(${ccSpenditures.totalAmount}), 0)`,
      })
      .from(ccSpenditures)
      .where(
        and(
          eq(ccSpenditures.creditCardId, cardId),
          eq(ccSpenditures.isPaidOff, false),
        ),
      )
      .groupBy(ccSpenditures.currency)
      .all();

    const result: CardCurrencyTotals = { ars: 0, usd: 0 };
    for (const row of rows) {
      if (row.currency === "USD") {
        result.usd += row.total;
      } else {
        result.ars += row.total;
      }
    }
    return result;
  }

  /** Fetch all spenditures for a card (for detail view). */
  getAllSpenditures(cardId: string) {
    return this.db
      .select(spendSelect)
      .from(ccSpenditures)
      .where(eq(ccSpenditures.creditCardId, cardId))
      .orderBy(ccSpenditures.createdAt)
      .all();
  }

  createSpenditure(values: CcSpenditureValues) {
    this.db.insert(ccSpenditures).values(values).run();
  }

  findSpenditureById(id: string) {
    return this.db
      .select(spendSelect)
      .from(ccSpenditures)
      .where(eq(ccSpenditures.id, id))
      .get();
  }
}
