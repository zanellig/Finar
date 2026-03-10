/**
 * Paycheck service — business logic for recurring paycheck income.
 *
 * Every mutation runs inside a single SQLite transaction so that
 * concurrent scheduler ticks or manual runs cannot double-apply
 * a paycheck or leave balances in an inconsistent state.
 */

import type { Database } from "bun:sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { PaycheckRepository } from "./paycheck-repository";
import type {
  CreatePaycheckInput,
  UpdatePaycheckInput,
  PaycheckValues,
} from "./paycheck-types";
import {
  PaycheckNotFoundError,
  PaycheckInactiveError,
  PaycheckNotDueError,
  DuplicateRunError,
  CurrencyMismatchError,
  InvariantViolationError,
} from "../shared/errors";
import { NotFoundError } from "../shared/errors";
import { roundMoney } from "../currency/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

type Frequency = "monthly" | "biweekly" | "weekly";

/** Map snake_case API input to Drizzle camelCase columns. */
function toPaycheckValues(
  data: CreatePaycheckInput,
): Omit<PaycheckValues, "id"> {
  return {
    name: data.name,
    accountId: data.account_id,
    currency: data.currency,
    amount: data.amount,
    frequency: data.frequency,
    nextRunAt: data.next_run_at,
    description: data.description,
  };
}

function toUpdateValues(
  data: UpdatePaycheckInput,
): Partial<PaycheckValues> {
  const values: Partial<PaycheckValues> = {};
  if (data.name !== undefined) values.name = data.name;
  if (data.amount !== undefined) values.amount = data.amount;
  if (data.frequency !== undefined) values.frequency = data.frequency;
  if (data.next_run_at !== undefined) values.nextRunAt = data.next_run_at;
  if (data.is_active !== undefined) values.isActive = data.is_active;
  if (data.description !== undefined) values.description = data.description;
  return values;
}

/**
 * Advance a datetime string by the given frequency.
 * Returns a new ISO datetime string.
 */
export function computeNextRunAt(current: string, frequency: Frequency): string {
  const d = new Date(current.replace(" ", "T"));
  switch (frequency) {
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
  }
  // Return in YYYY-MM-DD HH:mm:ss format to match SQLite datetime
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export class PaycheckService {
  private readonly repo: PaycheckRepository;

  constructor(
    private readonly rawDb: Database,
    private readonly orm: Orm,
  ) {
    this.repo = new PaycheckRepository(orm);
  }

  /** List all paychecks with account info. */
  listPaychecks() {
    return this.repo.findAll();
  }

  /** Get a single paycheck by ID. */
  getPaycheck(id: string) {
    const paycheck = this.repo.findById(id);
    if (!paycheck) {
      throw new PaycheckNotFoundError("Paycheck not found");
    }
    return paycheck;
  }

  /** Create a new paycheck definition. */
  createPaycheck(input: CreatePaycheckInput) {
    // Verify account exists
    const account = this.repo.getAccountById(input.account_id);
    if (!account) {
      throw new NotFoundError("Account not found");
    }

    // v1 rule: paycheck currency must equal account currency
    if (input.currency !== account.currency) {
      throw new CurrencyMismatchError(
        `Paycheck currency (${input.currency}) must match account currency (${account.currency})`,
      );
    }

    const id = crypto.randomUUID();
    this.repo.create({ id, ...toPaycheckValues(input) });
    return this.repo.findById(id);
  }

  /** Update a paycheck definition. */
  updatePaycheck(id: string, input: UpdatePaycheckInput) {
    if (!this.repo.exists(id)) {
      throw new PaycheckNotFoundError("Paycheck not found");
    }
    this.repo.update(id, toUpdateValues(input));
    return this.repo.findById(id);
  }

  /**
   * Execute a paycheck run atomically.
   *
   * Flow:
   * 1. Start DB transaction.
   * 2. Load paycheck row and verify active/due state.
   * 3. Check existing paycheck_runs by idempotency key.
   * 4. Load account and capture pre-balance.
   * 5. Credit account balance.
   * 6. Insert run record with before/after balances.
   * 7. Update paycheck last_run_at and next_run_at.
   * 8. Commit.
   */
  runPaycheck(paycheckId: string, runAt: string, idempotencyKey: string) {
    const txn = this.rawDb.transaction(() => {
      // 2. Load paycheck
      const paycheck = this.repo.findRawById(paycheckId);
      if (!paycheck) {
        throw new PaycheckNotFoundError("Paycheck not found");
      }

      // 3. Idempotency check (before active/due — a duplicate key should
      //    be rejected even if next_run_at has already advanced)
      const existingRun = this.repo.findRunByIdempotencyKey(idempotencyKey);
      if (existingRun) {
        throw new DuplicateRunError(
          "Run already exists for this idempotency key",
        );
      }

      if (!paycheck.is_active) {
        throw new PaycheckInactiveError("Paycheck is inactive");
      }

      if (paycheck.next_run_at > runAt) {
        throw new PaycheckNotDueError(
          `Paycheck is not due until ${paycheck.next_run_at}`,
        );
      }

      // 4. Load account and capture pre-balance
      const account = this.repo.getAccountById(paycheck.account_id);
      if (!account) {
        throw new InvariantViolationError(
          `Account ${paycheck.account_id} referenced by paycheck no longer exists`,
        );
      }

      // v1 rule: currency match
      if (paycheck.currency !== account.currency) {
        throw new CurrencyMismatchError(
          `Paycheck currency (${paycheck.currency}) does not match account currency (${account.currency})`,
        );
      }

      const balanceBefore = account.balance;
      const balanceAfter = roundMoney(balanceBefore + paycheck.amount);

      // 5. Credit account balance
      this.repo.creditAccountBalance(account.id, paycheck.amount);

      // 6. Insert run record
      const runId = crypto.randomUUID();
      this.repo.insertRun({
        id: runId,
        paycheckId: paycheck.id,
        runAt,
        amount: paycheck.amount,
        currency: paycheck.currency,
        accountBalanceBefore: balanceBefore,
        accountBalanceAfter: balanceAfter,
        idempotencyKey,
        status: "applied",
      });

      // 7. Update paycheck timestamps
      const nextRunAt = computeNextRunAt(
        paycheck.next_run_at,
        paycheck.frequency as Frequency,
      );
      this.repo.update(paycheck.id, {
        lastRunAt: runAt,
        nextRunAt,
      });

      return runId;
    });

    const runId = txn();
    return this.repo.findRunByIdempotencyKey(idempotencyKey) ?? { id: runId };
  }

  /** Get paginated run history for a paycheck. */
  getRunHistory(paycheckId: string, limit = 20, offset = 0) {
    if (!this.repo.exists(paycheckId)) {
      throw new PaycheckNotFoundError("Paycheck not found");
    }
    return this.repo.getRunsByPaycheckId(paycheckId, limit, offset);
  }

  /** Find all due paychecks (for scheduler). */
  findDuePaychecks(now: string) {
    return this.repo.findDue(now);
  }
}
