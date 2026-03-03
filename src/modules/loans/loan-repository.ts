/**
 * Loan repository — pure DB access layer.
 * All queries return plain objects; no business logic here.
 */

import { eq, and } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { loans, entities, payments, accounts } from "../../db/schema";
import type { LoanValues } from "./loan-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

const loanSelect = {
  id: loans.id,
  entity_id: loans.entityId,
  name: loans.name,
  capital: loans.capital,
  installments: loans.installments,
  cftea: loans.cftea,
  total_owed: loans.totalOwed,
  monthly_payment: loans.monthlyPayment,
  remaining_installments: loans.remainingInstallments,
  created_at: loans.createdAt,
};

export class LoanRepository {
  constructor(private readonly db: Orm) {}

  findAll() {
    return this.db
      .select({
        ...loanSelect,
        entity_name: entities.name,
        entity_type: entities.type,
      })
      .from(loans)
      .innerJoin(entities, eq(loans.entityId, entities.id))
      .orderBy(loans.createdAt)
      .all();
  }

  findById(id: string) {
    return this.db
      .select({
        ...loanSelect,
        entity_name: entities.name,
      })
      .from(loans)
      .innerJoin(entities, eq(loans.entityId, entities.id))
      .where(eq(loans.id, id))
      .get();
  }

  exists(id: string) {
    return !!this.db
      .select({ id: loans.id })
      .from(loans)
      .where(eq(loans.id, id))
      .get();
  }

  entityExists(entityId: string) {
    return !!this.db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.id, entityId))
      .get();
  }

  create(values: LoanValues) {
    this.db.insert(loans).values(values).run();
  }

  remove(id: string) {
    this.db.delete(loans).where(eq(loans.id, id)).run();
  }

  /** Fetch payments for a specific loan. */
  getPaymentsForLoan(loanId: string) {
    return this.db
      .select({
        id: payments.id,
        amount: payments.amount,
        description: payments.description,
        created_at: payments.createdAt,
        account_name: accounts.name,
      })
      .from(payments)
      .innerJoin(accounts, eq(payments.accountId, accounts.id))
      .where(and(eq(payments.type, "loan"), eq(payments.targetId, loanId)))
      .orderBy(payments.createdAt)
      .all();
  }
}
