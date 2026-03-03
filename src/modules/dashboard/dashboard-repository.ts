/**
 * Dashboard repository — pure DB access layer.
 * Provides all the aggregate queries the dashboard needs.
 */

import { eq, gt, sql, desc } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  accounts,
  entities,
  loans,
  creditCards,
  ccSpenditures,
  payments,
  exchangeRates,
} from "../../db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

export class DashboardRepository {
  constructor(private readonly db: Orm) {}

  /** Account balances with entity names, ordered by balance desc. */
  getAccounts() {
    return this.db
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        balance: accounts.balance,
        currency: accounts.currency,
        tna_rate: accounts.tnaRate,
        entity_name: entities.name,
      })
      .from(accounts)
      .innerJoin(entities, eq(accounts.entityId, entities.id))
      .orderBy(desc(accounts.balance))
      .all();
  }

  /** Sum of remaining loan debt (ARS-only). */
  getLoanDebt() {
    const result = this.db
      .select({
        total: sql<number>`COALESCE(SUM(${loans.monthlyPayment} * ${loans.remainingInstallments}), 0)`,
      })
      .from(loans)
      .where(gt(loans.remainingInstallments, 0))
      .get();
    return result?.total ?? 0;
  }

  /** Unpaid CC spenditures with monthly amounts and currencies. */
  getUnpaidCcRows() {
    return this.db
      .select({
        monthlyAmount: ccSpenditures.monthlyAmount,
        remainingInstallments: ccSpenditures.remainingInstallments,
        currency: ccSpenditures.currency,
      })
      .from(ccSpenditures)
      .where(eq(ccSpenditures.isPaidOff, false))
      .all();
  }

  /** Sum of monthly loan payments for active loans. */
  getMonthlyLoanPayments() {
    const result = this.db
      .select({
        total: sql<number>`COALESCE(SUM(${loans.monthlyPayment}), 0)`,
      })
      .from(loans)
      .where(gt(loans.remainingInstallments, 0))
      .get();
    return result?.total ?? 0;
  }

  /** Credit cards with spend limits and entity names. */
  getCards() {
    return this.db
      .select({
        id: creditCards.id,
        name: creditCards.name,
        spend_limit: creditCards.spendLimit,
        entity_name: entities.name,
      })
      .from(creditCards)
      .innerJoin(entities, eq(creditCards.entityId, entities.id))
      .orderBy(desc(creditCards.spendLimit))
      .all();
  }

  /** Unpaid spenditures for a specific card. */
  getCardUnpaidSpenditures(cardId: string) {
    return this.db
      .select({
        totalAmount: ccSpenditures.totalAmount,
        currency: ccSpenditures.currency,
      })
      .from(ccSpenditures)
      .where(
        sql`${ccSpenditures.creditCardId} = ${cardId} AND ${ccSpenditures.isPaidOff} = 0`,
      )
      .all();
  }

  /** Entities with relationship counts. */
  getEntities() {
    return this.db
      .select({
        id: entities.id,
        name: entities.name,
        type: entities.type,
        created_at: entities.createdAt,
        account_count: sql<number>`(SELECT COUNT(*) FROM accounts WHERE entity_id = ${entities.id})`,
        loan_count: sql<number>`(SELECT COUNT(*) FROM loans WHERE entity_id = ${entities.id})`,
        card_count: sql<number>`(SELECT COUNT(*) FROM credit_cards WHERE entity_id = ${entities.id})`,
      })
      .from(entities)
      .orderBy(entities.name)
      .all();
  }

  /** Active loans ordered by monthly payment desc. */
  getActiveLoans() {
    return this.db
      .select({
        id: loans.id,
        name: loans.name,
        capital: loans.capital,
        installments: loans.installments,
        cftea: loans.cftea,
        total_owed: loans.totalOwed,
        monthly_payment: loans.monthlyPayment,
        remaining_installments: loans.remainingInstallments,
        entity_name: entities.name,
      })
      .from(loans)
      .innerJoin(entities, eq(loans.entityId, entities.id))
      .where(gt(loans.remainingInstallments, 0))
      .orderBy(desc(loans.monthlyPayment))
      .all();
  }

  /** Most recent 10 payments. */
  getRecentPayments() {
    return this.db
      .select({
        id: payments.id,
        type: payments.type,
        target_id: payments.targetId,
        amount: payments.amount,
        description: payments.description,
        created_at: payments.createdAt,
        account_name: accounts.name,
      })
      .from(payments)
      .innerJoin(accounts, eq(payments.accountId, accounts.id))
      .orderBy(desc(payments.createdAt))
      .limit(10)
      .all();
  }

  /** All exchange rates. */
  getExchangeRates() {
    return this.db
      .select({
        id: exchangeRates.id,
        pair: exchangeRates.pair,
        buy_rate: exchangeRates.buyRate,
        sell_rate: exchangeRates.sellRate,
        source: exchangeRates.source,
        fetched_at: exchangeRates.fetchedAt,
      })
      .from(exchangeRates)
      .orderBy(exchangeRates.source)
      .all();
  }
}
