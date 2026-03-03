import { eq } from "drizzle-orm";
import { getOrm } from "../db/database";
import { accounts, entities } from "../db/schema";
import {
  insertAccountSchema,
  updateAccountSchema,
  validationError,
} from "../db/validation";

/** Map snake_case frontend input to Drizzle camelCase columns */
function toAccountValues(data: ReturnType<typeof insertAccountSchema.parse>) {
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

function toUpdateValues(data: ReturnType<typeof updateAccountSchema.parse>) {
  const values: Record<string, any> = {};
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

export function getAccountsRoutes() {
  return {
    "/api/accounts": {
      GET: () => {
        const db = getOrm();
        const result = db
          .select({
            ...accountSelect,
            entity_name: entities.name,
            entity_type: entities.type,
          })
          .from(accounts)
          .innerJoin(entities, eq(accounts.entityId, entities.id))
          .orderBy(accounts.createdAt)
          .all();
        return Response.json(result);
      },
      POST: async (req: Request) => {
        try {
          const body = await req.json().catch(() => null);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = insertAccountSchema.parse(body);
          const db = getOrm();

          // Verify entity exists
          const entity = db
            .select({ id: entities.id })
            .from(entities)
            .where(eq(entities.id, data.entity_id))
            .get();
          if (!entity)
            return Response.json(
              { error: "Entity not found" },
              { status: 400 },
            );

          const id = crypto.randomUUID();
          db.insert(accounts)
            .values({ id, ...toAccountValues(data) })
            .run();

          const account = db
            .select({
              ...accountSelect,
              entity_name: entities.name,
            })
            .from(accounts)
            .innerJoin(entities, eq(accounts.entityId, entities.id))
            .where(eq(accounts.id, id))
            .get();
          return Response.json(account, { status: 201 });
        } catch (err) {
          return validationError(err);
        }
      },
    },
    "/api/accounts/:id": {
      GET: (req: Request) => {
        const id = (req as any).params.id;
        const db = getOrm();
        const account = db
          .select({
            ...accountSelect,
            entity_name: entities.name,
          })
          .from(accounts)
          .innerJoin(entities, eq(accounts.entityId, entities.id))
          .where(eq(accounts.id, id))
          .get();
        if (!account)
          return Response.json({ error: "Account not found" }, { status: 404 });

        return Response.json(account);
      },
      PUT: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const db = getOrm();

          const existing = db
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.id, id))
            .get();
          if (!existing)
            return Response.json(
              { error: "Account not found" },
              { status: 404 },
            );

          const body = await req.json().catch(() => null);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = updateAccountSchema.parse(body);

          db.update(accounts)
            .set(toUpdateValues(data))
            .where(eq(accounts.id, id))
            .run();

          const account = db
            .select({
              ...accountSelect,
              entity_name: entities.name,
            })
            .from(accounts)
            .innerJoin(entities, eq(accounts.entityId, entities.id))
            .where(eq(accounts.id, id))
            .get();
          return Response.json(account);
        } catch (err) {
          return validationError(err);
        }
      },
      DELETE: (req: Request) => {
        const id = (req as any).params.id;
        const db = getOrm();

        const existing = db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.id, id))
          .get();
        if (!existing)
          return Response.json({ error: "Account not found" }, { status: 404 });

        db.delete(accounts).where(eq(accounts.id, id)).run();
        return Response.json({ success: true });
      },
    },
  };
}
