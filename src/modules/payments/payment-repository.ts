/**
 * Payment repository — pure DB access layer.
 * All queries return plain objects; no business logic here.
 */

import { eq, and, sql, desc, asc } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  payments,
  accounts,
  loans,
  creditCards,
  ccSpenditures,
} from "../../db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

export class PaymentRepository {
  constructor(private readonly db: Orm) {}

  getAccountById(id: string) {
    return this.db
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        balance: accounts.balance,
        currency: accounts.currency,
        overdraftLimit: accounts.overdraftLimit,
      })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get();
  }

  getLoanById(id: string) {
    return this.db
      .select({
        id: loans.id,
        name: loans.name,
        remainingInstallments: loans.remainingInstallments,
        monthlyPayment: loans.monthlyPayment,
      })
      .from(loans)
      .where(eq(loans.id, id))
      .get();
  }

  getCreditCardById(id: string) {
    return this.db
      .select({
        id: creditCards.id,
        name: creditCards.name,
        spendLimit: creditCards.spendLimit,
      })
      .from(creditCards)
      .where(eq(creditCards.id, id))
      .get();
  }

  /** Fetches unpaid spenditures for a card, oldest first (FIFO settlement). */
  getUnpaidSpenditures(cardId: string) {
    return this.db
      .select({
        id: ccSpenditures.id,
        monthlyAmount: ccSpenditures.monthlyAmount,
        totalAmount: ccSpenditures.totalAmount,
        remainingInstallments: ccSpenditures.remainingInstallments,
        installments: ccSpenditures.installments,
        currency: ccSpenditures.currency,
      })
      .from(ccSpenditures)
      .where(
        and(
          eq(ccSpenditures.creditCardId, cardId),
          eq(ccSpenditures.isPaidOff, false),
        ),
      )
      .orderBy(asc(ccSpenditures.createdAt))
      .all();
  }

  deductAccountBalance(id: string, amount: number) {
    this.db
      .update(accounts)
      .set({ balance: sql`${accounts.balance} - ${amount}` })
      .where(eq(accounts.id, id))
      .run();
  }

  insertPayment(data: {
    id: string;
    type: "cc" | "loan";
    targetId: string;
    accountId: string;
    amount: number;
    description: string;
  }) {
    this.db
      .insert(payments)
      .values({
        id: data.id,
        type: data.type,
        targetId: data.targetId,
        accountId: data.accountId,
        amount: data.amount,
        description: data.description,
      })
      .run();
  }

  decrementLoanInstallment(id: string) {
    this.db
      .update(loans)
      .set({
        remainingInstallments: sql`${loans.remainingInstallments} - 1`,
      })
      .where(eq(loans.id, id))
      .run();
  }

  updateSpenditure(spendId: string, newRemaining: number, isPaidOff: boolean) {
    this.db
      .update(ccSpenditures)
      .set({
        remainingInstallments: newRemaining,
        isPaidOff,
      })
      .where(eq(ccSpenditures.id, spendId))
      .run();
  }

  getPaymentById(id: string) {
    return this.db
      .select({
        id: payments.id,
        type: payments.type,
        target_id: payments.targetId,
        account_id: payments.accountId,
        amount: payments.amount,
        description: payments.description,
        created_at: payments.createdAt,
        account_name: accounts.name,
        account_currency: accounts.currency,
      })
      .from(payments)
      .innerJoin(accounts, eq(payments.accountId, accounts.id))
      .where(eq(payments.id, id))
      .get();
  }

  getAllPaymentsEnriched() {
    const rows = this.db
      .select({
        id: payments.id,
        type: payments.type,
        target_id: payments.targetId,
        account_id: payments.accountId,
        amount: payments.amount,
        description: payments.description,
        created_at: payments.createdAt,
        account_name: accounts.name,
        account_currency: accounts.currency,
        loan_name: loans.name,
        card_name: creditCards.name,
      })
      .from(payments)
      .innerJoin(accounts, eq(payments.accountId, accounts.id))
      .leftJoin(loans, eq(payments.targetId, loans.id))
      .leftJoin(creditCards, eq(payments.targetId, creditCards.id))
      .orderBy(desc(payments.createdAt))
      .all();

    return rows.map((p) => ({
      id: p.id,
      type: p.type,
      target_id: p.target_id,
      account_id: p.account_id,
      amount: p.amount,
      description: p.description,
      created_at: p.created_at,
      account_name: p.account_name,
      account_currency: p.account_currency,
      target_name:
        p.type === "loan"
          ? (p.loan_name ?? "Unknown Loan")
          : (p.card_name ?? "Unknown Card"),
    }));
  }
}
