import { getDb } from "../db/database";
import {
  sanitizeString,
  sanitizeNumber,
  sanitizePositiveInt,
  sanitizeUUID,
  validationError,
} from "../utils/sanitize";

/**
 * CFTEA Loan Calculation
 * Total owed = capital × (1 + CFTEA)^(installments/12)
 * Monthly payment = total_owed / installments
 */
function calculateLoan(capital: number, installments: number, cftea: number) {
  const cftDecimal = cftea / 100;
  const totalOwed = capital * Math.pow(1 + cftDecimal, installments / 12);
  const monthlyPayment = totalOwed / installments;
  return {
    totalOwed: Math.round(totalOwed * 100) / 100,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
  };
}

export function getLoansRoutes() {
  return {
    "/api/loans": {
      GET: () => {
        const db = getDb();
        const loans = db
          .query(
            `SELECT l.*, e.name as entity_name, e.type as entity_type
             FROM loans l
             JOIN entities e ON l.entity_id = e.id
             ORDER BY l.created_at DESC`,
          )
          .all();
        return Response.json(loans);
      },
      POST: async (req: Request) => {
        const db = getDb();
        const body = await req.json().catch(() => null);
        if (!body) return validationError("Invalid JSON body");

        const entityId = sanitizeUUID(body.entity_id);
        const name = sanitizeString(body.name, 100);
        const capital = sanitizeNumber(body.capital, 0.01, 999_999_999);
        const installments = sanitizePositiveInt(body.installments, 360);
        const cftea = sanitizeNumber(body.cftea, 0.01, 9999);

        if (!entityId) return validationError("Valid entity_id is required");
        if (!name) return validationError("Name is required");
        if (capital === null)
          return validationError("Capital must be a positive number");
        if (installments === null)
          return validationError("Installments must be 1-360");
        if (cftea === null)
          return validationError("CFTEA must be a positive percentage");

        // Verify entity exists
        const entity = db
          .query("SELECT id FROM entities WHERE id = $id")
          .get({ id: entityId });
        if (!entity) return validationError("Entity not found");

        const { totalOwed, monthlyPayment } = calculateLoan(
          capital,
          installments,
          cftea,
        );
        const id = crypto.randomUUID();

        db.query(
          `INSERT INTO loans (id, entity_id, name, capital, installments, cftea, total_owed, monthly_payment, remaining_installments)
           VALUES ($id, $entityId, $name, $capital, $installments, $cftea, $totalOwed, $monthlyPayment, $remainingInstallments)`,
        ).run({
          id,
          entityId,
          name,
          capital,
          installments,
          cftea,
          totalOwed,
          monthlyPayment,
          remainingInstallments: installments,
        });

        const loan = db
          .query(
            `SELECT l.*, e.name as entity_name FROM loans l JOIN entities e ON l.entity_id = e.id WHERE l.id = $id`,
          )
          .get({ id });
        return Response.json(loan, { status: 201 });
      },
    },
    "/api/loans/:id": {
      GET: (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid loan ID");

        const db = getDb();
        const loan = db
          .query(
            `SELECT l.*, e.name as entity_name FROM loans l JOIN entities e ON l.entity_id = e.id WHERE l.id = $id`,
          )
          .get({ id });
        if (!loan)
          return Response.json({ error: "Loan not found" }, { status: 404 });

        const payments = db
          .query(
            `SELECT p.*, a.name as account_name FROM payments p JOIN accounts a ON p.account_id = a.id WHERE p.type = 'loan' AND p.target_id = $id ORDER BY p.created_at DESC`,
          )
          .all({ id });

        return Response.json({ ...(loan as any), payments });
      },
      DELETE: (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid loan ID");

        const db = getDb();
        const existing = db
          .query("SELECT id FROM loans WHERE id = $id")
          .get({ id });
        if (!existing)
          return Response.json({ error: "Loan not found" }, { status: 404 });

        db.query("DELETE FROM loans WHERE id = $id").run({ id });
        return Response.json({ success: true });
      },
    },
  };
}
