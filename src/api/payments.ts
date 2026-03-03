import { eq, sql, desc } from "drizzle-orm";
import { getDb, getOrm } from "../db/database";
import { payments, accounts, loans, creditCards } from "../db/schema";
import { insertPaymentSchema, validationError } from "../db/validation";

export function getPaymentsRoutes() {
  return {
    "/api/payments": {
      GET: () => {
        const db = getOrm();
        const result = db
          .select({
            id: payments.id,
            type: payments.type,
            target_id: payments.targetId,
            account_id: payments.accountId,
            amount: payments.amount,
            description: payments.description,
            created_at: payments.createdAt,
            account_name: accounts.name,
            account_currency: accounts.currency,
          })
          .from(payments)
          .innerJoin(accounts, eq(payments.accountId, accounts.id))
          .orderBy(desc(payments.createdAt))
          .all();

        // Enrich with target name
        const enriched = result.map((p) => {
          let targetName = "";
          if (p.type === "loan") {
            const loan = db
              .select({ name: loans.name })
              .from(loans)
              .where(eq(loans.id, p.target_id))
              .get();
            targetName = loan?.name || "Unknown Loan";
          } else {
            const card = db
              .select({ name: creditCards.name })
              .from(creditCards)
              .where(eq(creditCards.id, p.target_id))
              .get();
            targetName = card?.name || "Unknown Card";
          }
          return { ...p, target_name: targetName };
        });

        return Response.json(enriched);
      },
      POST: async (req: Request) => {
        try {
          const body = await req.json().catch(() => null);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = insertPaymentSchema.parse(body);
          const db = getOrm();

          // Verify account exists and check balance
          const account = db
            .select()
            .from(accounts)
            .where(eq(accounts.id, data.account_id))
            .get();
          if (!account)
            return Response.json(
              { error: "Account not found" },
              { status: 400 },
            );

          const minBalance =
            account.type === "checking" ? -(account.overdraftLimit || 0) : 0;
          if (account.balance - data.amount < minBalance) {
            return Response.json(
              {
                error: `Insufficient funds. Available: ${account.balance}${account.type === "checking" ? ` (overdraft limit: ${account.overdraftLimit})` : ""}`,
              },
              { status: 400 },
            );
          }

          // Verify target exists
          if (data.type === "loan") {
            const loan = db
              .select({
                id: loans.id,
                remaining: loans.remainingInstallments,
              })
              .from(loans)
              .where(eq(loans.id, data.target_id))
              .get();
            if (!loan)
              return Response.json(
                { error: "Loan not found" },
                { status: 400 },
              );
            if (loan.remaining <= 0)
              return Response.json(
                { error: "Loan is already paid off" },
                { status: 400 },
              );
          } else {
            const card = db
              .select({ id: creditCards.id })
              .from(creditCards)
              .where(eq(creditCards.id, data.target_id))
              .get();
            if (!card)
              return Response.json(
                { error: "Credit card not found" },
                { status: 400 },
              );
          }

          const id = crypto.randomUUID();

          // Transaction: deduct + record + update target
          const rawDb = getDb();
          const makePayment = rawDb.transaction(() => {
            db.update(accounts)
              .set({
                balance: sql`${accounts.balance} - ${data.amount}`,
              })
              .where(eq(accounts.id, data.account_id))
              .run();

            db.insert(payments)
              .values({
                id,
                type: data.type,
                targetId: data.target_id,
                accountId: data.account_id,
                amount: data.amount,
                description: data.description,
              })
              .run();

            if (data.type === "loan") {
              db.update(loans)
                .set({
                  remainingInstallments: sql`${loans.remainingInstallments} - 1`,
                })
                .where(eq(loans.id, data.target_id))
                .run();
            }
          });

          makePayment();

          const payment = db
            .select({
              id: payments.id,
              type: payments.type,
              target_id: payments.targetId,
              account_id: payments.accountId,
              amount: payments.amount,
              description: payments.description,
              created_at: payments.createdAt,
              account_name: accounts.name,
            })
            .from(payments)
            .innerJoin(accounts, eq(payments.accountId, accounts.id))
            .where(eq(payments.id, id))
            .get();
          return Response.json(payment, { status: 201 });
        } catch (err) {
          return validationError(err);
        }
      },
    },
  };
}
