import { eq, and } from "drizzle-orm";
import { getOrm } from "../db/database";
import { loans, entities, payments, accounts } from "../db/schema";
import { insertLoanSchema, validationError } from "../db/validation";

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

export function getLoansRoutes() {
  return {
    "/api/loans": {
      GET: () => {
        const db = getOrm();
        const result = db
          .select({
            ...loanSelect,
            entity_name: entities.name,
            entity_type: entities.type,
          })
          .from(loans)
          .innerJoin(entities, eq(loans.entityId, entities.id))
          .orderBy(loans.createdAt)
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

          const data = insertLoanSchema.parse(body);
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

          const { totalOwed, monthlyPayment } = calculateLoan(
            data.capital,
            data.installments,
            data.cftea,
          );

          const id = crypto.randomUUID();
          db.insert(loans)
            .values({
              id,
              entityId: data.entity_id,
              name: data.name,
              capital: data.capital,
              installments: data.installments,
              cftea: data.cftea,
              totalOwed,
              monthlyPayment,
              remainingInstallments: data.installments,
            })
            .run();

          const loan = db
            .select({
              ...loanSelect,
              entity_name: entities.name,
            })
            .from(loans)
            .innerJoin(entities, eq(loans.entityId, entities.id))
            .where(eq(loans.id, id))
            .get();
          return Response.json(loan, { status: 201 });
        } catch (err) {
          return validationError(err);
        }
      },
    },
    "/api/loans/:id": {
      GET: (req: Request) => {
        const id = (req as any).params.id;
        const db = getOrm();

        const loan = db
          .select({
            ...loanSelect,
            entity_name: entities.name,
          })
          .from(loans)
          .innerJoin(entities, eq(loans.entityId, entities.id))
          .where(eq(loans.id, id))
          .get();
        if (!loan)
          return Response.json({ error: "Loan not found" }, { status: 404 });

        const loanPayments = db
          .select({
            id: payments.id,
            amount: payments.amount,
            description: payments.description,
            created_at: payments.createdAt,
            account_name: accounts.name,
          })
          .from(payments)
          .innerJoin(accounts, eq(payments.accountId, accounts.id))
          .where(and(eq(payments.type, "loan"), eq(payments.targetId, id)))
          .orderBy(payments.createdAt)
          .all();

        return Response.json({ ...loan, payments: loanPayments });
      },
      DELETE: (req: Request) => {
        const id = (req as any).params.id;
        const db = getOrm();

        const existing = db
          .select({ id: loans.id })
          .from(loans)
          .where(eq(loans.id, id))
          .get();
        if (!existing)
          return Response.json({ error: "Loan not found" }, { status: 404 });

        db.delete(loans).where(eq(loans.id, id)).run();
        return Response.json({ success: true });
      },
    },
  };
}
