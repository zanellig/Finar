/**
 * Dashboard route — aggregates financial data with currency conversion.
 *
 * All monetary totals are converted to the base currency (ARS) before
 * summing, using the requested rate source (default: CCL).
 *
 * Query params:
 *   ?rate_source=<source>   — override the exchange-rate source
 *   ?custom_rate=<number>   — use a user-supplied USD→ARS rate instead
 */

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
import {
  CurrencyConverter,
  type ConversionOptions,
} from "../modules/currency/convert";
import { RatesRepository } from "../modules/currency/rates-repository";
import type { Money, Currency } from "../modules/currency/money";
import { roundMoney } from "../modules/currency/money";
import {
  MissingRateError,
  mapDomainErrorToResponse,
} from "../modules/shared/errors";

/** Parse conversion-related query params from a request URL. */
function parseConversionOpts(req: Request): ConversionOptions {
  const url = new URL(req.url);
  const opts: ConversionOptions = {};

  const rateSource = url.searchParams.get("rate_source");
  if (rateSource && rateSource.trim().length > 0) {
    opts.rateSource = rateSource.trim();
  }

  const customRateRaw = url.searchParams.get("custom_rate");
  if (customRateRaw != null) {
    const parsed = Number(customRateRaw);
    if (Number.isFinite(parsed) && parsed > 0) {
      opts.customRate = parsed;
    }
  }

  return opts;
}

export function getDashboardRoutes() {
  return {
    "/api/dashboard": {
      GET: (req: Request) => {
        try {
          const db = getOrm();
          const convOpts = parseConversionOpts(req);
          const converter = new CurrencyConverter(new RatesRepository(db));

          // ── Account balances (mixed currencies) ────────────────
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

          const totalAssets = converter.sumToBase(
            accountList.map((a) => ({
              amount: a.balance,
              currency: a.currency as Currency,
            })),
            convOpts,
          );

          // ── Loan debt (ARS-only — loans have no currency field) ─
          const loanDebtResult = db
            .select({
              total: sql<number>`COALESCE(SUM(${loans.monthlyPayment} * ${loans.remainingInstallments}), 0)`,
            })
            .from(loans)
            .where(gt(loans.remainingInstallments, 0))
            .get();
          const loanDebt = loanDebtResult?.total ?? 0;

          // ── CC debt (mixed currencies) ─────────────────────────
          const unpaidCcRows = db
            .select({
              monthlyAmount: ccSpenditures.monthlyAmount,
              remainingInstallments: ccSpenditures.remainingInstallments,
              currency: ccSpenditures.currency,
            })
            .from(ccSpenditures)
            .where(eq(ccSpenditures.isPaidOff, false))
            .all();

          const ccDebt = converter.sumToBase(
            unpaidCcRows.map((s) => ({
              amount: s.monthlyAmount * s.remainingInstallments,
              currency: s.currency as Currency,
            })),
            convOpts,
          );

          // ── Monthly obligations ────────────────────────────────
          const monthlyLoanResult = db
            .select({
              total: sql<number>`COALESCE(SUM(${loans.monthlyPayment}), 0)`,
            })
            .from(loans)
            .where(gt(loans.remainingInstallments, 0))
            .get();
          const monthlyLoan = monthlyLoanResult?.total ?? 0;

          const monthlyCc = converter.sumToBase(
            unpaidCcRows.map((s) => ({
              amount: s.monthlyAmount,
              currency: s.currency as Currency,
            })),
            convOpts,
          );

          // ── Credit cards with available limits ─────────────────
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
            const spendRows = db
              .select({
                totalAmount: ccSpenditures.totalAmount,
                currency: ccSpenditures.currency,
              })
              .from(ccSpenditures)
              .where(
                sql`${ccSpenditures.creditCardId} = ${card.id} AND ${ccSpenditures.isPaidOff} = 0`,
              )
              .all();

            // Card spend_limit is always ARS; convert each spenditure's
            // total_amount to ARS before summing.
            const totalSpent = converter.sumToBase(
              spendRows.map((s) => ({
                amount: s.totalAmount,
                currency: s.currency as Currency,
              })),
              convOpts,
            );

            return {
              ...card,
              total_spent: roundMoney(totalSpent),
              available_limit: roundMoney(card.spend_limit - totalSpent),
            };
          });

          // ── Entities summary ───────────────────────────────────
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

          // ── Active loans ───────────────────────────────────────
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

          // ── Recent payments ────────────────────────────────────
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

          // ── Exchange rates ─────────────────────────────────────
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

          const totalDebt = roundMoney(loanDebt + ccDebt);

          return Response.json({
            net_worth: roundMoney(totalAssets - totalDebt),
            total_debt: totalDebt,
            monthly_obligations: roundMoney(monthlyLoan + monthlyCc),
            loan_debt: roundMoney(loanDebt),
            cc_debt: roundMoney(ccDebt),
            monthly_loan_payments: roundMoney(monthlyLoan),
            monthly_cc_payments: roundMoney(monthlyCc),
            accounts: accountList,
            entities: entityList,
            loans: loanList,
            credit_cards: cardsWithLimits,
            recent_payments: recentPaymentList,
            exchange_rates: rates,
          });
        } catch (err) {
          if (err instanceof MissingRateError) {
            return mapDomainErrorToResponse(err);
          }
          throw err;
        }
      },
    },
  };
}
