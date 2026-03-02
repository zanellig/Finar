import { getDb } from "../db/database";
import {
  sanitizeString,
  sanitizeNumber,
  sanitizeEnum,
  sanitizeUUID,
  validationError,
} from "../utils/sanitize";

const PAYMENT_TYPES = ["cc", "loan"] as const;

export function getPaymentsRoutes() {
  return {
    "/api/payments": {
      GET: () => {
        const db = getDb();
        const payments = db
          .query(
            `SELECT p.*, a.name as account_name, a.currency as account_currency
             FROM payments p
             JOIN accounts a ON p.account_id = a.id
             ORDER BY p.created_at DESC`,
          )
          .all();

        // Enrich with target info
        const enriched = (payments as any[]).map((payment) => {
          let targetName = "";
          if (payment.type === "loan") {
            const loan = db
              .query("SELECT name FROM loans WHERE id = $id")
              .get({ id: payment.target_id }) as any;
            targetName = loan?.name || "Unknown Loan";
          } else {
            const card = db
              .query("SELECT name FROM credit_cards WHERE id = $id")
              .get({ id: payment.target_id }) as any;
            targetName = card?.name || "Unknown Card";
          }
          return { ...payment, target_name: targetName };
        });

        return Response.json(enriched);
      },
      POST: async (req: Request) => {
        const db = getDb();
        const body = await req.json().catch(() => null);
        if (!body) return validationError("Invalid JSON body");

        const type = sanitizeEnum(body.type, PAYMENT_TYPES);
        const targetId = sanitizeUUID(body.target_id);
        const accountId = sanitizeUUID(body.account_id);
        const amount = sanitizeNumber(body.amount, 0.01, 999_999_999);
        const description = sanitizeString(body.description, 200) || "";

        if (!type) return validationError("Type must be 'cc' or 'loan'");
        if (!targetId) return validationError("Valid target_id is required");
        if (!accountId) return validationError("Valid account_id is required");
        if (amount === null)
          return validationError("Amount must be a positive number");

        // Verify account exists and has sufficient balance (considering overdraft for checking)
        const account = db
          .query("SELECT * FROM accounts WHERE id = $id")
          .get({ id: accountId }) as any;
        if (!account) return validationError("Account not found");

        const minBalance =
          account.type === "checking" ? -(account.overdraft_limit || 0) : 0;
        if (account.balance - amount < minBalance) {
          return validationError(
            `Insufficient funds. Available: ${account.balance}${account.type === "checking" ? ` (overdraft limit: ${account.overdraft_limit})` : ""}`,
          );
        }

        // Verify target exists
        if (type === "loan") {
          const loan = db
            .query(
              "SELECT id, remaining_installments FROM loans WHERE id = $id",
            )
            .get({ id: targetId }) as any;
          if (!loan) return validationError("Loan not found");
          if (loan.remaining_installments <= 0)
            return validationError("Loan is already paid off");
        } else {
          const card = db
            .query("SELECT id FROM credit_cards WHERE id = $id")
            .get({ id: targetId });
          if (!card) return validationError("Credit card not found");
        }

        const id = crypto.randomUUID();

        // Use a transaction for atomicity
        const makePayment = db.transaction(() => {
          // Deduct from account
          db.query(
            "UPDATE accounts SET balance = balance - $amount WHERE id = $accountId",
          ).run({
            amount,
            accountId,
          });

          // Record payment
          db.query(
            `INSERT INTO payments (id, type, target_id, account_id, amount, description)
             VALUES ($id, $type, $targetId, $accountId, $amount, $description)`,
          ).run({ id, type, targetId, accountId, amount, description });

          // Update target
          if (type === "loan") {
            db.query(
              "UPDATE loans SET remaining_installments = remaining_installments - 1 WHERE id = $targetId",
            ).run({ targetId });
          }
          // For CC payments, mark spenditures as paid off based on payment amount
          // This is simplified - in practice each spenditure would be tracked individually
        });

        makePayment();

        const payment = db
          .query(
            `SELECT p.*, a.name as account_name FROM payments p JOIN accounts a ON p.account_id = a.id WHERE p.id = $id`,
          )
          .get({ id });
        return Response.json(payment, { status: 201 });
      },
    },
  };
}
