import { getDb } from "../db/database";
import {
  sanitizeString,
  sanitizeNumber,
  sanitizePositiveInt,
  sanitizeEnum,
  sanitizeUUID,
  validationError,
} from "../utils/sanitize";

const CURRENCIES = ["ARS", "USD"] as const;

export function getCreditCardsRoutes() {
  return {
    "/api/credit-cards": {
      GET: () => {
        const db = getDb();
        const cards = db
          .query(
            `SELECT cc.*, e.name as entity_name, e.type as entity_type
             FROM credit_cards cc
             JOIN entities e ON cc.entity_id = e.id
             ORDER BY cc.created_at DESC`,
          )
          .all();

        // Calculate available limit for each card
        const cardsWithLimits = (cards as any[]).map((card) => {
          const spenditures = db
            .query(
              `SELECT COALESCE(SUM(total_amount), 0) as total_spent
               FROM cc_spenditures
               WHERE credit_card_id = $cardId AND is_paid_off = 0`,
            )
            .get({ cardId: card.id }) as any;

          return {
            ...card,
            total_spent: spenditures?.total_spent || 0,
            available_limit: card.spend_limit - (spenditures?.total_spent || 0),
          };
        });

        return Response.json(cardsWithLimits);
      },
      POST: async (req: Request) => {
        const db = getDb();
        const body = await req.json().catch(() => null);
        if (!body) return validationError("Invalid JSON body");

        const entityId = sanitizeUUID(body.entity_id);
        const name = sanitizeString(body.name, 100);
        const spendLimit = sanitizeNumber(body.spend_limit, 0, 999_999_999);

        if (!entityId) return validationError("Valid entity_id is required");
        if (!name) return validationError("Name is required");
        if (spendLimit === null)
          return validationError("Spend limit must be a non-negative number");

        const entity = db
          .query("SELECT id FROM entities WHERE id = $id")
          .get({ id: entityId });
        if (!entity) return validationError("Entity not found");

        const id = crypto.randomUUID();
        db.query(
          `INSERT INTO credit_cards (id, entity_id, name, spend_limit)
           VALUES ($id, $entityId, $name, $spendLimit)`,
        ).run({ id, entityId, name, spendLimit });

        const card = db
          .query("SELECT * FROM credit_cards WHERE id = $id")
          .get({ id });
        return Response.json(
          { ...(card as any), total_spent: 0, available_limit: spendLimit },
          { status: 201 },
        );
      },
    },
    "/api/credit-cards/:id": {
      GET: (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid card ID");

        const db = getDb();
        const card = db
          .query(
            `SELECT cc.*, e.name as entity_name FROM credit_cards cc JOIN entities e ON cc.entity_id = e.id WHERE cc.id = $id`,
          )
          .get({ id });
        if (!card)
          return Response.json(
            { error: "Credit card not found" },
            { status: 404 },
          );

        const spenditures = db
          .query(
            `SELECT * FROM cc_spenditures WHERE credit_card_id = $id ORDER BY created_at DESC`,
          )
          .all({ id });

        const totalSpent = (spenditures as any[])
          .filter((s) => !s.is_paid_off)
          .reduce((sum, s) => sum + s.total_amount, 0);

        return Response.json({
          ...(card as any),
          spenditures,
          total_spent: totalSpent,
          available_limit: (card as any).spend_limit - totalSpent,
        });
      },
      PUT: async (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid card ID");

        const db = getDb();
        const body = await req.json().catch(() => null);
        if (!body) return validationError("Invalid JSON body");

        const existing = db
          .query("SELECT * FROM credit_cards WHERE id = $id")
          .get({ id });
        if (!existing)
          return Response.json(
            { error: "Credit card not found" },
            { status: 404 },
          );

        const spendLimit = sanitizeNumber(body.spend_limit, 0, 999_999_999);
        const name = sanitizeString(body.name, 100);

        if (spendLimit !== null) {
          db.query(
            "UPDATE credit_cards SET spend_limit = $spendLimit WHERE id = $id",
          ).run({
            id,
            spendLimit,
          });
        }
        if (name) {
          db.query("UPDATE credit_cards SET name = $name WHERE id = $id").run({
            id,
            name,
          });
        }

        const card = db
          .query("SELECT * FROM credit_cards WHERE id = $id")
          .get({ id });
        return Response.json(card);
      },
      DELETE: (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid card ID");

        const db = getDb();
        const existing = db
          .query("SELECT id FROM credit_cards WHERE id = $id")
          .get({ id });
        if (!existing)
          return Response.json(
            { error: "Credit card not found" },
            { status: 404 },
          );

        db.query("DELETE FROM credit_cards WHERE id = $id").run({ id });
        return Response.json({ success: true });
      },
    },
    "/api/credit-cards/:id/spenditures": {
      GET: (req: Request) => {
        const cardId = sanitizeUUID((req as any).params.id);
        if (!cardId) return validationError("Invalid card ID");

        const db = getDb();
        const spenditures = db
          .query(
            "SELECT * FROM cc_spenditures WHERE credit_card_id = $cardId ORDER BY created_at DESC",
          )
          .all({ cardId });
        return Response.json(spenditures);
      },
      POST: async (req: Request) => {
        const cardId = sanitizeUUID((req as any).params.id);
        if (!cardId) return validationError("Invalid card ID");

        const db = getDb();
        const card = db
          .query("SELECT * FROM credit_cards WHERE id = $id")
          .get({ id: cardId });
        if (!card)
          return Response.json(
            { error: "Credit card not found" },
            { status: 404 },
          );

        const body = await req.json().catch(() => null);
        if (!body) return validationError("Invalid JSON body");

        const description = sanitizeString(body.description, 200);
        const currency = sanitizeEnum(body.currency, CURRENCIES) || "ARS";
        const installments = sanitizePositiveInt(body.installments, 120) || 1;

        if (!description) return validationError("Description is required");

        // Installments only available in ARS
        if (currency === "USD" && installments > 1) {
          return validationError(
            "Installments are only available in ARS payments",
          );
        }

        let totalAmount: number;
        let monthlyAmount: number;

        if (installments === 1) {
          // One-time payment
          const amount = sanitizeNumber(body.amount, 0.01, 999_999_999);
          if (amount === null)
            return validationError("Amount must be a positive number");
          totalAmount = amount;
          monthlyAmount = amount;
        } else {
          // Installment payment - user can enter either monthly or total amount
          if (body.monthly_amount != null) {
            monthlyAmount = sanitizeNumber(
              body.monthly_amount,
              0.01,
              999_999_999,
            )!;
            if (monthlyAmount === null)
              return validationError("Monthly amount must be positive");
            totalAmount = Math.round(monthlyAmount * installments * 100) / 100;
          } else if (body.total_amount != null) {
            totalAmount = sanitizeNumber(body.total_amount, 0.01, 999_999_999)!;
            if (totalAmount === null)
              return validationError("Total amount must be positive");
            monthlyAmount =
              Math.round((totalAmount / installments) * 100) / 100;
          } else {
            return validationError(
              "Either monthly_amount or total_amount (or amount for one-time) is required",
            );
          }
        }

        const id = crypto.randomUUID();
        db.query(
          `INSERT INTO cc_spenditures (id, credit_card_id, description, amount, currency, installments, monthly_amount, total_amount, remaining_installments)
           VALUES ($id, $cardId, $description, $amount, $currency, $installments, $monthlyAmount, $totalAmount, $remainingInstallments)`,
        ).run({
          id,
          cardId,
          description,
          amount: installments === 1 ? totalAmount : monthlyAmount,
          currency,
          installments,
          monthlyAmount,
          totalAmount,
          remainingInstallments: installments,
        });

        const spenditure = db
          .query("SELECT * FROM cc_spenditures WHERE id = $id")
          .get({ id });
        return Response.json(spenditure, { status: 201 });
      },
    },
  };
}
