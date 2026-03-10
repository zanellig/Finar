/**
 * Paycheck repository — pure DB access layer.
 * All queries return plain objects; no business logic here.
 */

import { eq, and, lte, desc, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { accounts, paychecks, paycheckRuns } from "../../db/schema";
import type { PaycheckValues, PaycheckRunValues } from "./paycheck-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

/** Standard snake_case select shape for paychecks */
const paycheckSelect = {
  id: paychecks.id,
  name: paychecks.name,
  account_id: paychecks.accountId,
  currency: paychecks.currency,
  amount: paychecks.amount,
  frequency: paychecks.frequency,
  next_run_at: paychecks.nextRunAt,
  last_run_at: paychecks.lastRunAt,
  is_active: paychecks.isActive,
  description: paychecks.description,
  created_at: paychecks.createdAt,
};

const paycheckRunSelect = {
  id: paycheckRuns.id,
  paycheck_id: paycheckRuns.paycheckId,
  run_at: paycheckRuns.runAt,
  amount: paycheckRuns.amount,
  currency: paycheckRuns.currency,
  account_balance_before: paycheckRuns.accountBalanceBefore,
  account_balance_after: paycheckRuns.accountBalanceAfter,
  idempotency_key: paycheckRuns.idempotencyKey,
  status: paycheckRuns.status,
  failure_reason: paycheckRuns.failureReason,
  created_at: paycheckRuns.createdAt,
};

export class PaycheckRepository {
  constructor(private readonly db: Orm) {}

  findAll() {
    return this.db
      .select({
        ...paycheckSelect,
        account_name: accounts.name,
        account_currency: accounts.currency,
      })
      .from(paychecks)
      .innerJoin(accounts, eq(paychecks.accountId, accounts.id))
      .orderBy(paychecks.createdAt)
      .all();
  }

  findById(id: string) {
    return this.db
      .select({
        ...paycheckSelect,
        account_name: accounts.name,
        account_currency: accounts.currency,
      })
      .from(paychecks)
      .innerJoin(accounts, eq(paychecks.accountId, accounts.id))
      .where(eq(paychecks.id, id))
      .get();
  }

  /** Raw paycheck row for mutation (no join). */
  findRawById(id: string) {
    return this.db
      .select(paycheckSelect)
      .from(paychecks)
      .where(eq(paychecks.id, id))
      .get();
  }

  exists(id: string) {
    return !!this.db
      .select({ id: paychecks.id })
      .from(paychecks)
      .where(eq(paychecks.id, id))
      .get();
  }

  /** All active paychecks whose next_run_at <= now. */
  findDue(now: string) {
    return this.db
      .select(paycheckSelect)
      .from(paychecks)
      .where(and(eq(paychecks.isActive, true), lte(paychecks.nextRunAt, now)))
      .all();
  }

  create(values: PaycheckValues) {
    this.db.insert(paychecks).values(values).run();
  }

  update(id: string, values: Partial<PaycheckValues>) {
    this.db.update(paychecks).set(values).where(eq(paychecks.id, id)).run();
  }

  /** Find an existing run by idempotency key. */
  findRunByIdempotencyKey(key: string) {
    return this.db
      .select(paycheckRunSelect)
      .from(paycheckRuns)
      .where(eq(paycheckRuns.idempotencyKey, key))
      .get();
  }

  insertRun(values: PaycheckRunValues) {
    this.db.insert(paycheckRuns).values(values).run();
  }

  /** Paginated run history for a paycheck, newest first. */
  getRunsByPaycheckId(paycheckId: string, limit: number, offset: number) {
    return this.db
      .select(paycheckRunSelect)
      .from(paycheckRuns)
      .where(eq(paycheckRuns.paycheckId, paycheckId))
      .orderBy(desc(paycheckRuns.runAt))
      .limit(limit)
      .offset(offset)
      .all();
  }

  /** Read account row inside transaction for balance snapshot. */
  getAccountById(id: string) {
    return this.db
      .select({
        id: accounts.id,
        balance: accounts.balance,
        currency: accounts.currency,
      })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get();
  }

  /** Increment account balance by the given amount. */
  creditAccountBalance(id: string, amount: number) {
    this.db
      .update(accounts)
      .set({ balance: sql`${accounts.balance} + ${amount}` })
      .where(eq(accounts.id, id))
      .run();
  }
}
