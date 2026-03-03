import { eq, gt, sql, desc } from "drizzle-orm";
import { getOrm } from "../db/database";
import {
  accounts,
  entities,
  loans,
  creditCards,
  ccSpenditures,
  payments,
  exchangeRates,
} from "../db/schema";

export function getDashboardRoutes() {
  return {
    "/api/dashboard": {
      GET: () => {
        const db = getOrm();

        // Net worth: sum of all account balances
        const netWorthResult = db
          .select({
            net_worth: sql<number>`COALESCE(SUM(${accounts.balance}), 0)`,
          })
          .from(accounts)
          .get();

        // Loan debt
        const loanDebtResult = db
          .select({
            total: sql<number>`COALESCE(SUM(${loans.monthlyPayment} * ${loans.remainingInstallments}), 0)`,
          })
          .from(loans)
          .where(gt(loans.remainingInstallments, 0))
          .get();

        // CC debt
        const ccDebtResult = db
          .select({
            total: sql<number>`COALESCE(SUM(${ccSpenditures.monthlyAmount} * ${ccSpenditures.remainingInstallments}), 0)`,
          })
          .from(ccSpenditures)
          .where(eq(ccSpenditures.isPaidOff, false))
          .get();

        // Monthly loan obligations
        const monthlyLoanResult = db
          .select({
            total: sql<number>`COALESCE(SUM(${loans.monthlyPayment}), 0)`,
          })
          .from(loans)
          .where(gt(loans.remainingInstallments, 0))
          .get();

        // Monthly CC obligations
        const monthlyCCResult = db
          .select({
            total: sql<number>`COALESCE(SUM(${ccSpenditures.monthlyAmount}), 0)`,
          })
          .from(ccSpenditures)
          .where(eq(ccSpenditures.isPaidOff, false))
          .get();

        // Accounts breakdown
        const accountList = db
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

        // Entities summary
        const entityList = db
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

        // Active loans
        const loanList = db
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

        // Credit cards with available limits
        const cardList = db
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

        const cardsWithLimits = cardList.map((card) => {
          const spent = db
            .select({
              total: sql<number>`COALESCE(SUM(${ccSpenditures.totalAmount}), 0)`,
            })
            .from(ccSpenditures)
            .where(
              sql`${ccSpenditures.creditCardId} = ${card.id} AND ${ccSpenditures.isPaidOff} = 0`,
            )
            .get();
          const totalSpent = spent?.total ?? 0;
          return {
            ...card,
            total_spent: totalSpent,
            available_limit: card.spend_limit - totalSpent,
          };
        });

        // Recent payments
        const recentPaymentList = db
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

        // Exchange rates
        const rates = db
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

        return Response.json({
          net_worth: netWorthResult?.net_worth ?? 0,
          total_debt: (loanDebtResult?.total ?? 0) + (ccDebtResult?.total ?? 0),
          monthly_obligations:
            (monthlyLoanResult?.total ?? 0) + (monthlyCCResult?.total ?? 0),
          loan_debt: loanDebtResult?.total ?? 0,
          cc_debt: ccDebtResult?.total ?? 0,
          monthly_loan_payments: monthlyLoanResult?.total ?? 0,
          monthly_cc_payments: monthlyCCResult?.total ?? 0,
          accounts: accountList,
          entities: entityList,
          loans: loanList,
          credit_cards: cardsWithLimits,
          recent_payments: recentPaymentList,
          exchange_rates: rates,
        });
      },
    },
  };
}
