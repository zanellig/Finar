/**
 * Loan service — business logic for loan management.
 *
 * Contains the CFTEA loan calculation formula and
 * delegates all DB access to the repository.
 */

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { LoanRepository } from "./loan-repository";
import type { CreateLoanInput, LoanCalculation } from "./loan-types";
import { NotFoundError, ValidationError } from "../shared/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

/**
 * CFTEA Loan Calculation
 * Total owed = capital × (1 + CFTEA)^(installments/12)
 * Monthly payment = total_owed / installments
 */
function calculateLoan(
  capital: number,
  installments: number,
  cftea: number,
): LoanCalculation {
  const cftDecimal = cftea / 100;
  const totalOwed = capital * Math.pow(1 + cftDecimal, installments / 12);
  const monthlyPayment = totalOwed / installments;
  return {
    totalOwed: Math.round(totalOwed * 100) / 100,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
  };
}

export class LoanService {
  private readonly repo: LoanRepository;

  constructor(orm: Orm) {
    this.repo = new LoanRepository(orm);
  }

  listLoans() {
    return this.repo.findAll();
  }

  getLoan(id: string) {
    const loan = this.repo.findById(id);
    if (!loan) {
      throw new NotFoundError("Loan not found");
    }

    const loanPayments = this.repo.getPaymentsForLoan(id);
    return { ...loan, payments: loanPayments };
  }

  createLoan(input: CreateLoanInput) {
    if (!this.repo.entityExists(input.entity_id)) {
      throw new ValidationError("Entity not found");
    }

    const { totalOwed, monthlyPayment } = calculateLoan(
      input.capital,
      input.installments,
      input.cftea,
    );

    const id = crypto.randomUUID();
    this.repo.create({
      id,
      entityId: input.entity_id,
      name: input.name,
      capital: input.capital,
      installments: input.installments,
      cftea: input.cftea,
      totalOwed,
      monthlyPayment,
      remainingInstallments: input.installments,
    });

    return this.repo.findById(id);
  }

  deleteLoan(id: string) {
    if (!this.repo.exists(id)) {
      throw new NotFoundError("Loan not found");
    }
    this.repo.remove(id);
  }
}
