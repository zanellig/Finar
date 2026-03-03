/**
 * Credit-card repository — pure DB access layer.
 * All queries return plain objects; no business logic here.
 */

import { eq, and } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { creditCards, ccSpenditures, entities } from "../../db/schema";
import type { CreditCardValues, CcSpenditureValues } from "./credit-card-types";

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
