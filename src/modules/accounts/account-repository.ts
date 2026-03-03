/**
 * Account repository — pure DB access layer.
 * All queries return plain objects; no business logic here.
 */

import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { accounts, entities } from "../../db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

/** Standard snake_case select shape for accounts */
const accountSelect = {
  id: accounts.id,
  entity_id: accounts.entityId,
  name: accounts.name,
  type: accounts.type,
  balance: accounts.balance,
  currency: accounts.currency,
  daily_extraction_limit: accounts.dailyExtractionLimit,
  monthly_maintenance_cost: accounts.monthlyMaintenanceCost,
  is_salary_account: accounts.isSalaryAccount,
  overdraft_limit: accounts.overdraftLimit,
  tna_rate: accounts.tnaRate,
  created_at: accounts.createdAt,
};

export class AccountRepository {
  constructor(private readonly db: Orm) {}

  findAll() {
    return this.db
      .select({
        ...accountSelect,
        entity_name: entities.name,
        entity_type: entities.type,
      })
      .from(accounts)
      .innerJoin(entities, eq(accounts.entityId, entities.id))
      .orderBy(accounts.createdAt)
      .all();
  }

  findById(id: string) {
    return this.db
      .select({
        ...accountSelect,
        entity_name: entities.name,
      })
      .from(accounts)
      .innerJoin(entities, eq(accounts.entityId, entities.id))
      .where(eq(accounts.id, id))
      .get();
  }

  exists(id: string) {
    return !!this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get();
  }

  entityExists(entityId: string) {
    return !!this.db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.id, entityId))
      .get();
  }

  create(values: Record<string, unknown>) {
    this.db
      .insert(accounts)
      .values(values as any)
      .run();
  }

  update(id: string, values: Record<string, unknown>) {
    this.db.update(accounts).set(values).where(eq(accounts.id, id)).run();
  }

  remove(id: string) {
    this.db.delete(accounts).where(eq(accounts.id, id)).run();
  }
}
