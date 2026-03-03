/**
 * Account service — business logic for account management.
 */

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { AccountRepository } from "./account-repository";
import type { CreateAccountInput, UpdateAccountInput } from "./account-types";
import { NotFoundError, ValidationError } from "../shared/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

/** Map snake_case service input to Drizzle camelCase columns */
function toAccountValues(data: CreateAccountInput) {
  return {
    entityId: data.entity_id,
    name: data.name,
    type: data.type,
    balance: data.balance,
    currency: data.currency,
    dailyExtractionLimit: data.daily_extraction_limit ?? null,
    monthlyMaintenanceCost: data.monthly_maintenance_cost,
    isSalaryAccount: data.is_salary_account,
    overdraftLimit: data.overdraft_limit,
    tnaRate: data.tna_rate,
  };
}

function toUpdateValues(data: UpdateAccountInput) {
  const values: Record<string, unknown> = {};
  if (data.name !== undefined) values.name = data.name;
  if (data.balance !== undefined) values.balance = data.balance;
  if (data.daily_extraction_limit !== undefined)
    values.dailyExtractionLimit = data.daily_extraction_limit;
  if (data.monthly_maintenance_cost !== undefined)
    values.monthlyMaintenanceCost = data.monthly_maintenance_cost;
  if (data.is_salary_account !== undefined)
    values.isSalaryAccount = data.is_salary_account;
  if (data.overdraft_limit !== undefined)
    values.overdraftLimit = data.overdraft_limit;
  if (data.tna_rate !== undefined) values.tnaRate = data.tna_rate;
  return values;
}

export class AccountService {
  private readonly repo: AccountRepository;

  constructor(orm: Orm) {
    this.repo = new AccountRepository(orm);
  }

  listAccounts() {
    return this.repo.findAll();
  }

  getAccount(id: string) {
    const account = this.repo.findById(id);
    if (!account) {
      throw new NotFoundError("Account not found");
    }
    return account;
  }

  createAccount(input: CreateAccountInput) {
    if (!this.repo.entityExists(input.entity_id)) {
      throw new ValidationError("Entity not found");
    }

    const id = crypto.randomUUID();
    this.repo.create({ id, ...toAccountValues(input) });
    return this.repo.findById(id);
  }

  updateAccount(id: string, input: UpdateAccountInput) {
    if (!this.repo.exists(id)) {
      throw new NotFoundError("Account not found");
    }

    this.repo.update(id, toUpdateValues(input));
    return this.repo.findById(id);
  }

  deleteAccount(id: string) {
    if (!this.repo.exists(id)) {
      throw new NotFoundError("Account not found");
    }
    this.repo.remove(id);
  }
}
