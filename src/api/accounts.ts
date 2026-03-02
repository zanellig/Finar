import { getDb } from "../db/database";
import {
  sanitizeString,
  sanitizeNumber,
  sanitizeEnum,
  sanitizeUUID,
  validationError,
} from "../utils/sanitize";

const ACCOUNT_TYPES = ["savings", "checking", "interest"] as const;

export function getAccountsRoutes() {
  return {
    "/api/accounts": {
      GET: () => {
        const db = getDb();
        const accounts = db
          .query(
            `SELECT a.*, e.name as entity_name, e.type as entity_type
             FROM accounts a
             JOIN entities e ON a.entity_id = e.id
             ORDER BY a.created_at DESC`,
          )
          .all();
        return Response.json(accounts);
      },
      POST: async (req: Request) => {
        const db = getDb();
        const body = await req.json().catch(() => null);
        if (!body) return validationError("Invalid JSON body");

        const entityId = sanitizeUUID(body.entity_id);
        const name = sanitizeString(body.name, 100);
        const type = sanitizeEnum(body.type, ACCOUNT_TYPES);
        const balance =
          sanitizeNumber(body.balance, -999_999_999, 999_999_999) ?? 0;
        const currency =
          sanitizeEnum(body.currency, ["ARS", "USD"] as const) || "ARS";

        if (!entityId) return validationError("Valid entity_id is required");
        if (!name) return validationError("Name is required");
        if (!type)
          return validationError(
            "Type must be one of: savings, checking, interest",
          );

        const entity = db
          .query("SELECT id FROM entities WHERE id = $id")
          .get({ id: entityId });
        if (!entity) return validationError("Entity not found");

        const id = crypto.randomUUID();
        const dailyExtractionLimit = sanitizeNumber(
          body.daily_extraction_limit,
          0,
          999_999_999,
        );
        const monthlyMaintenanceCost =
          sanitizeNumber(body.monthly_maintenance_cost, 0, 999_999_999) ?? 0;
        const isSalaryAccount = body.is_salary_account ? 1 : 0;
        const overdraftLimit =
          sanitizeNumber(body.overdraft_limit, 0, 999_999_999) ?? 0;
        const tnaRate = sanitizeNumber(body.tna_rate, 0, 9999) ?? 0;

        db.query(
          `INSERT INTO accounts (id, entity_id, name, type, balance, currency, daily_extraction_limit, monthly_maintenance_cost, is_salary_account, overdraft_limit, tna_rate)
           VALUES ($id, $entityId, $name, $type, $balance, $currency, $dailyExtractionLimit, $monthlyMaintenanceCost, $isSalaryAccount, $overdraftLimit, $tnaRate)`,
        ).run({
          id,
          entityId,
          name,
          type,
          balance,
          currency,
          dailyExtractionLimit,
          monthlyMaintenanceCost,
          isSalaryAccount,
          overdraftLimit,
          tnaRate,
        });

        const account = db
          .query(
            "SELECT a.*, e.name as entity_name FROM accounts a JOIN entities e ON a.entity_id = e.id WHERE a.id = $id",
          )
          .get({ id });
        return Response.json(account, { status: 201 });
      },
    },
    "/api/accounts/:id": {
      GET: (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid account ID");

        const db = getDb();
        const account = db
          .query(
            `SELECT a.*, e.name as entity_name FROM accounts a JOIN entities e ON a.entity_id = e.id WHERE a.id = $id`,
          )
          .get({ id });
        if (!account)
          return Response.json({ error: "Account not found" }, { status: 404 });

        return Response.json(account);
      },
      PUT: async (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid account ID");

        const db = getDb();
        const body = await req.json().catch(() => null);
        if (!body) return validationError("Invalid JSON body");

        const existing = db
          .query("SELECT * FROM accounts WHERE id = $id")
          .get({ id }) as any;
        if (!existing)
          return Response.json({ error: "Account not found" }, { status: 404 });

        const name = sanitizeString(body.name, 100) || existing.name;
        const balance =
          body.balance != null
            ? sanitizeNumber(body.balance, -999_999_999, 999_999_999)
            : existing.balance;
        const dailyExtractionLimit =
          body.daily_extraction_limit != null
            ? sanitizeNumber(body.daily_extraction_limit, 0, 999_999_999)
            : existing.daily_extraction_limit;
        const monthlyMaintenanceCost =
          body.monthly_maintenance_cost != null
            ? sanitizeNumber(body.monthly_maintenance_cost, 0, 999_999_999)
            : existing.monthly_maintenance_cost;
        const isSalaryAccount =
          body.is_salary_account != null
            ? body.is_salary_account
              ? 1
              : 0
            : existing.is_salary_account;
        const overdraftLimit =
          body.overdraft_limit != null
            ? sanitizeNumber(body.overdraft_limit, 0, 999_999_999)
            : existing.overdraft_limit;
        const tnaRate =
          body.tna_rate != null
            ? sanitizeNumber(body.tna_rate, 0, 9999)
            : existing.tna_rate;

        db.query(
          `UPDATE accounts SET name = $name, balance = $balance, daily_extraction_limit = $dailyExtractionLimit,
           monthly_maintenance_cost = $monthlyMaintenanceCost, is_salary_account = $isSalaryAccount,
           overdraft_limit = $overdraftLimit, tna_rate = $tnaRate
           WHERE id = $id`,
        ).run({
          id,
          name,
          balance,
          dailyExtractionLimit,
          monthlyMaintenanceCost,
          isSalaryAccount,
          overdraftLimit,
          tnaRate,
        });

        const account = db
          .query(
            "SELECT a.*, e.name as entity_name FROM accounts a JOIN entities e ON a.entity_id = e.id WHERE a.id = $id",
          )
          .get({ id });
        return Response.json(account);
      },
      DELETE: (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid account ID");

        const db = getDb();
        const existing = db
          .query("SELECT id FROM accounts WHERE id = $id")
          .get({ id });
        if (!existing)
          return Response.json({ error: "Account not found" }, { status: 404 });

        db.query("DELETE FROM accounts WHERE id = $id").run({ id });
        return Response.json({ success: true });
      },
    },
  };
}
