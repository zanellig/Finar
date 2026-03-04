/**
 * Dashboard service — aggregates financial data with currency conversion.
 *
 * All monetary totals are converted to the base currency (ARS) before
 * summing, using the requested rate source (default: CCL).
 */

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { DashboardRepository } from "./dashboard-repository";
import { CreditCardRepository } from "../credit-cards/credit-card-repository";
import type { DashboardData } from "./dashboard-types";
import { CurrencyConverter, type ConversionOptions } from "../currency/convert";
import { RatesRepository } from "../currency/rates-repository";
import type { Currency } from "../currency/money";
import { roundMoney } from "../currency/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

export class DashboardService {
  private readonly repo: DashboardRepository;
  private readonly ccRepo: CreditCardRepository;
  private readonly converter: CurrencyConverter;

  constructor(orm: Orm) {
    this.repo = new DashboardRepository(orm);
    this.ccRepo = new CreditCardRepository(orm);
    this.converter = new CurrencyConverter(new RatesRepository(orm));
  }

  getDashboard(opts: ConversionOptions = {}): DashboardData {
    // ── Account balances (mixed currencies) ────────────────
    const accountList = this.repo.getAccounts();

    const totalAssets = this.converter.sumToBase(
      accountList.map((a) => ({
        amount: a.balance,
        currency: a.currency as Currency,
      })),
      opts,
    );

    // ── Loan debt (ARS-only) ───────────────────────────────
    const loanDebt = this.repo.getLoanDebt();

    // ── CC debt (mixed currencies) ─────────────────────────
    const unpaidCcRows = this.repo.getUnpaidCcRows();

    const ccDebt = this.converter.sumToBase(
      unpaidCcRows.map((s) => ({
        amount: s.monthlyAmount * s.remainingInstallments,
        currency: s.currency as Currency,
      })),
      opts,
    );

    // ── Monthly obligations ────────────────────────────────
    const monthlyLoan = this.repo.getMonthlyLoanPayments();

    const monthlyCc = this.converter.sumToBase(
      unpaidCcRows.map((s) => ({
        amount: s.monthlyAmount,
        currency: s.currency as Currency,
      })),
      opts,
    );

    // ── Credit cards with available limits (canonical aggregation) ──
    const cardList = this.repo.getCards();
    const spendMap = this.ccRepo.getUnpaidSpendTotalsByCurrency();

    // Pre-resolve the sell rate once so card-loop calls don't hit DB per card
    const cachedRate = this.converter.tryGetSellRate(opts);
    const rateOpts: ConversionOptions =
      cachedRate != null ? { ...opts, customRate: cachedRate } : opts;

    const cardsWithLimits = cardList.map((card) => {
      const totals = spendMap.get(card.id) ?? { ars: 0, usd: 0 };

      const usdInArs =
        totals.usd > 0
          ? this.converter.toBase(
              { amount: totals.usd, currency: "USD" },
              rateOpts,
            )
          : 0;
      const totalSpent = roundMoney(totals.ars + usdInArs);
      const availableLimit = roundMoney(card.spend_limit - totalSpent);

      return {
        ...card,
        total_spent: totalSpent,
        total_spent_ars: roundMoney(totals.ars),
        total_spent_usd: roundMoney(totals.usd),
        available_limit: availableLimit,
        spend_limit_usd_estimate:
          cachedRate != null ? roundMoney(card.spend_limit / cachedRate) : null,
        available_limit_usd_estimate:
          cachedRate != null ? roundMoney(availableLimit / cachedRate) : null,
      };
    });

    // ── Entities summary ───────────────────────────────────
    const entityList = this.repo.getEntities();

    // ── Active loans ───────────────────────────────────────
    const loanList = this.repo.getActiveLoans();

    // ── Recent payments ────────────────────────────────────
    const recentPaymentList = this.repo.getRecentPayments();

    // ── Exchange rates ─────────────────────────────────────
    const rates = this.repo.getExchangeRates();

    const totalDebt = roundMoney(loanDebt + ccDebt);

    return {
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
    };
  }
}
