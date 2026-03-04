/**
 * Payment service — business logic for loan and credit-card payments.
 *
 * Every mutation runs inside a single SQLite transaction so that
 * concurrent requests cannot overdraw accounts, push installments
 * negative, or leave card debt in an inconsistent state.
 */

import type { Database } from "bun:sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { PaymentRepository } from "./payment-repository";
import type { MakePaymentInput, EnrichedPayment } from "./payment-types";
import {
  NotFoundError,
  InsufficientFundsError,
  InvalidPaymentError,
  ConflictError,
  CurrencyMismatchError,
} from "../shared/errors";
import { roundMoney } from "../currency/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

export class PaymentService {
  private readonly repo: PaymentRepository;

  constructor(
    private readonly rawDb: Database,
    private readonly orm: Orm,
  ) {
    this.repo = new PaymentRepository(orm);
  }

  /** List all payments with enriched target names. */
  listPayments(): EnrichedPayment[] {
    return this.repo.getAllPaymentsEnriched();
  }

  /** Create a payment atomically. Returns the created payment record. */
  makePayment(input: MakePaymentInput) {
    const paymentId = crypto.randomUUID();

    const txn = this.rawDb.transaction(() => {
      // ── Re-read account inside transaction ──────────────────────
      const account = this.repo.getAccountById(input.accountId);
      if (!account) {
        throw new NotFoundError("Account not found");
      }

      const minBalance =
        account.type === "checking" ? -(account.overdraftLimit ?? 0) : 0;

      if (account.balance - input.amount < minBalance) {
        const overdraftNote =
          account.type === "checking"
            ? ` (overdraft limit: ${account.overdraftLimit ?? 0})`
            : "";
        throw new InsufficientFundsError(
          `Insufficient funds. Available: ${account.balance}${overdraftNote}`,
        );
      }

      if (input.type === "loan") {
        this.processLoanPayment(input, paymentId);
      } else {
        this.processCreditCardPayment(input, paymentId, account.currency);
      }
    });

    txn();

    return this.repo.getPaymentById(paymentId);
  }

  // ── Private helpers (called inside transaction) ────────────────

  private processLoanPayment(input: MakePaymentInput, paymentId: string) {
    const loan = this.repo.getLoanById(input.targetId);
    if (!loan) {
      throw new NotFoundError("Loan not found");
    }
    if (loan.remainingInstallments <= 0) {
      throw new ConflictError("Loan is already paid off");
    }

    // Verify payment amount matches the loan's monthly payment
    const expectedAmount = roundMoney(loan.monthlyPayment);
    const actualAmount = roundMoney(input.amount);

    if (actualAmount !== expectedAmount) {
      throw new InvalidPaymentError(
        `Payment amount must match the monthly installment of ${expectedAmount}`,
      );
    }

    this.repo.deductAccountBalance(input.accountId, input.amount);
    this.repo.insertPayment({
      id: paymentId,
      type: "loan",
      targetId: input.targetId,
      accountId: input.accountId,
      amount: input.amount,
      description: input.description,
    });
    this.repo.decrementLoanInstallment(input.targetId);
  }

  private processCreditCardPayment(
    input: MakePaymentInput,
    paymentId: string,
    accountCurrency: string,
  ) {
    const card = this.repo.getCreditCardById(input.targetId);
    if (!card) {
      throw new NotFoundError("Credit card not found");
    }

    // Fetch unpaid spenditures (FIFO order) and apply payment
    const spenditures = this.repo.getUnpaidSpenditures(input.targetId);

    if (spenditures.length === 0) {
      throw new ConflictError(
        "No outstanding debt on this card. All spenditures are already paid off.",
      );
    }

    // ── Pre-flight: ensure at least one installment can be settled ──
    const smallestInstallment = Math.min(
      ...spenditures.map((s) => s.monthlyAmount),
    );
    if (input.amount < smallestInstallment) {
      throw new InvalidPaymentError(
        `Payment amount is below the minimum installment of ${smallestInstallment}. ` +
          `Minimum payable: ${smallestInstallment}.`,
      );
    }

    let remaining = input.amount;
    let settledAny = false;

    for (const spend of spenditures) {
      if (remaining <= 0) break;

      // ── Currency guard ─────────────────────────────────────────
      if (spend.currency !== accountCurrency) {
        throw new CurrencyMismatchError(
          `Cannot settle ${spend.currency} spenditure from ${accountCurrency} account. ` +
            `Use a ${spend.currency} account or convert funds first.`,
        );
      }

      // Each installment costs `monthlyAmount`; calculate outstanding debt
      const outstandingDebt = roundMoney(
        spend.remainingInstallments * spend.monthlyAmount,
      );

      if (remaining >= outstandingDebt) {
        // Fully pay off this spenditure
        this.repo.updateSpenditure(spend.id, 0, true);
        remaining = roundMoney(remaining - outstandingDebt);
        settledAny = true;
      } else {
        // Partially pay — reduce as many installments as the amount covers
        const installmentsPaid = Math.floor(remaining / spend.monthlyAmount);
        if (installmentsPaid > 0) {
          const newRemaining = spend.remainingInstallments - installmentsPaid;
          this.repo.updateSpenditure(spend.id, newRemaining, newRemaining <= 0);
          settledAny = true;
        }
        remaining = roundMoney(
          remaining - installmentsPaid * spend.monthlyAmount,
        );
      }
    }

    // ── Final guard: nothing settled despite spenditures existing ──
    if (!settledAny) {
      throw new InvalidPaymentError(
        `Payment amount is below the minimum installment of ${smallestInstallment}. ` +
          `Minimum payable: ${smallestInstallment}.`,
      );
    }

    this.repo.deductAccountBalance(input.accountId, input.amount);
    this.repo.insertPayment({
      id: paymentId,
      type: "cc",
      targetId: input.targetId,
      accountId: input.accountId,
      amount: input.amount,
      description: input.description,
    });
  }
}
