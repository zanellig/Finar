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
} from "../shared/errors";

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
        this.processCreditCardPayment(input, paymentId);
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
    const expectedAmount = Math.round(loan.monthlyPayment * 100) / 100;
    const actualAmount = Math.round(input.amount * 100) / 100;

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

  private processCreditCardPayment(input: MakePaymentInput, paymentId: string) {
    const card = this.repo.getCreditCardById(input.targetId);
    if (!card) {
      throw new NotFoundError("Credit card not found");
    }

    // Fetch unpaid spenditures (FIFO order) and apply payment
    const spenditures = this.repo.getUnpaidSpenditures(input.targetId);

    let remaining = input.amount;

    for (const spend of spenditures) {
      if (remaining <= 0) break;

      // Each installment costs `monthlyAmount`; calculate outstanding debt
      const outstandingDebt = spend.remainingInstallments * spend.monthlyAmount;

      if (remaining >= outstandingDebt) {
        // Fully pay off this spenditure
        this.repo.updateSpenditure(spend.id, 0, true);
        remaining = Math.round((remaining - outstandingDebt) * 100) / 100;
      } else {
        // Partially pay — reduce as many installments as the amount covers
        const installmentsPaid = Math.floor(remaining / spend.monthlyAmount);
        if (installmentsPaid > 0) {
          const newRemaining = spend.remainingInstallments - installmentsPaid;
          this.repo.updateSpenditure(spend.id, newRemaining, newRemaining <= 0);
        }
        remaining =
          Math.round(
            (remaining - installmentsPaid * spend.monthlyAmount) * 100,
          ) / 100;
      }
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
