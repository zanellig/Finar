import { eq, and, sql } from "drizzle-orm";
import { getOrm } from "../db/database";
import { creditCards, ccSpenditures, entities } from "../db/schema";
import {
  insertCreditCardSchema,
  updateCreditCardSchema,
  insertCcSpenditure1xSchema,
  insertCcSpendInstallmentSchema,
  validationError,
} from "../db/validation";

function getCardSpent(db: ReturnType<typeof getOrm>, cardId: string): number {
  const result = db
    .select({
      total: sql<number>`COALESCE(SUM(${ccSpenditures.totalAmount}), 0)`,
    })
    .from(ccSpenditures)
    .where(
      and(
        eq(ccSpenditures.creditCardId, cardId),
        eq(ccSpenditures.isPaidOff, false),
      ),
    )
    .get();
  return result?.total ?? 0;
}

const cardSelect = {
  id: creditCards.id,
  entity_id: creditCards.entityId,
  name: creditCards.name,
  spend_limit: creditCards.spendLimit,
  created_at: creditCards.createdAt,
};

const spendSelect = {
  id: ccSpenditures.id,
  credit_card_id: ccSpenditures.creditCardId,
  description: ccSpenditures.description,
  amount: ccSpenditures.amount,
  currency: ccSpenditures.currency,
  installments: ccSpenditures.installments,
  monthly_amount: ccSpenditures.monthlyAmount,
  total_amount: ccSpenditures.totalAmount,
  remaining_installments: ccSpenditures.remainingInstallments,
  is_paid_off: ccSpenditures.isPaidOff,
  created_at: ccSpenditures.createdAt,
};

export function getCreditCardsRoutes() {
  return {
    "/api/credit-cards": {
      GET: () => {
        const db = getOrm();
        const cards = db
          .select({
            ...cardSelect,
            entity_name: entities.name,
            entity_type: entities.type,
          })
          .from(creditCards)
          .innerJoin(entities, eq(creditCards.entityId, entities.id))
          .orderBy(creditCards.createdAt)
          .all();

        const result = cards.map((card) => {
          const spent = getCardSpent(db, card.id);
          return {
            ...card,
            total_spent: spent,
            available_limit: card.spend_limit - spent,
          };
        });

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

          const data = insertCreditCardSchema.parse(body);
          const db = getOrm();

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
          db.insert(creditCards)
            .values({
              id,
              entityId: data.entity_id,
              name: data.name,
              spendLimit: data.spend_limit,
            })
            .run();

          const card = db
            .select(cardSelect)
            .from(creditCards)
            .where(eq(creditCards.id, id))
            .get();
          return Response.json(
            {
              ...card,
              total_spent: 0,
              available_limit: data.spend_limit,
            },
            { status: 201 },
          );
        } catch (err) {
          return validationError(err);
        }
      },
    },
    "/api/credit-cards/:id": {
      GET: (req: Request) => {
        const id = (req as any).params.id;
        const db = getOrm();

        const card = db
          .select({
            ...cardSelect,
            entity_name: entities.name,
          })
          .from(creditCards)
          .innerJoin(entities, eq(creditCards.entityId, entities.id))
          .where(eq(creditCards.id, id))
          .get();
        if (!card)
          return Response.json(
            { error: "Credit card not found" },
            { status: 404 },
          );

        const spenditureList = db
          .select(spendSelect)
          .from(ccSpenditures)
          .where(eq(ccSpenditures.creditCardId, id))
          .orderBy(ccSpenditures.createdAt)
          .all();

        const totalSpent = spenditureList
          .filter((s) => !s.is_paid_off)
          .reduce((sum, s) => sum + s.total_amount, 0);

        return Response.json({
          ...card,
          spenditures: spenditureList,
          total_spent: totalSpent,
          available_limit: card.spend_limit - totalSpent,
        });
      },
      PUT: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const db = getOrm();

          const existing = db
            .select({ id: creditCards.id })
            .from(creditCards)
            .where(eq(creditCards.id, id))
            .get();
          if (!existing)
            return Response.json(
              { error: "Credit card not found" },
              { status: 404 },
            );

          const body = await req.json().catch(() => null);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = updateCreditCardSchema.parse(body);

          const values: Record<string, any> = {};
          if (data.name !== undefined) values.name = data.name;
          if (data.spend_limit !== undefined)
            values.spendLimit = data.spend_limit;

          db.update(creditCards)
            .set(values)
            .where(eq(creditCards.id, id))
            .run();

          const card = db
            .select(cardSelect)
            .from(creditCards)
            .where(eq(creditCards.id, id))
            .get();
          return Response.json(card);
        } catch (err) {
          return validationError(err);
        }
      },
      DELETE: (req: Request) => {
        const id = (req as any).params.id;
        const db = getOrm();

        const existing = db
          .select({ id: creditCards.id })
          .from(creditCards)
          .where(eq(creditCards.id, id))
          .get();
        if (!existing)
          return Response.json(
            { error: "Credit card not found" },
            { status: 404 },
          );

        db.delete(creditCards).where(eq(creditCards.id, id)).run();
        return Response.json({ success: true });
      },
    },
    "/api/credit-cards/:id/spenditures": {
      GET: (req: Request) => {
        const cardId = (req as any).params.id;
        const db = getOrm();
        const result = db
          .select(spendSelect)
          .from(ccSpenditures)
          .where(eq(ccSpenditures.creditCardId, cardId))
          .orderBy(ccSpenditures.createdAt)
          .all();
        return Response.json(result);
      },
      POST: async (req: Request) => {
        try {
          const cardId = (req as any).params.id;
          const db = getOrm();

          const card = db
            .select({ id: creditCards.id })
            .from(creditCards)
            .where(eq(creditCards.id, cardId))
            .get();
          if (!card)
            return Response.json(
              { error: "Credit card not found" },
              { status: 404 },
            );

          const body = await req.json().catch(() => null);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const rawInstallments = Number(body.installments);
          const installments =
            Number.isFinite(rawInstallments) && rawInstallments >= 1
              ? Math.floor(rawInstallments)
              : 1;

          let totalAmount: number;
          let monthlyAmount: number;
          let parsedInstallments: number;

          if (installments <= 1) {
            const data = insertCcSpenditure1xSchema.parse(body);
            totalAmount = data.amount;
            monthlyAmount = data.amount;
            parsedInstallments = 1;
          } else {
            if (body.currency === "USD") {
              return Response.json(
                { error: "Installments are only available in ARS payments" },
                { status: 400 },
              );
            }

            const data = insertCcSpendInstallmentSchema.parse(body);
            parsedInstallments = data.installments;

            if (data.monthly_amount != null) {
              monthlyAmount = data.monthly_amount;
              totalAmount =
                Math.round(monthlyAmount * parsedInstallments * 100) / 100;
            } else {
              totalAmount = data.total_amount!;
              monthlyAmount =
                Math.round((totalAmount / parsedInstallments) * 100) / 100;
            }
          }

          const id = crypto.randomUUID();
          db.insert(ccSpenditures)
            .values({
              id,
              creditCardId: cardId,
              description: body.description?.trim(),
              amount: parsedInstallments === 1 ? totalAmount : monthlyAmount,
              currency: body.currency || "ARS",
              installments: parsedInstallments,
              monthlyAmount,
              totalAmount,
              remainingInstallments: parsedInstallments,
              isPaidOff: false,
            })
            .run();

          const spenditure = db
            .select(spendSelect)
            .from(ccSpenditures)
            .where(eq(ccSpenditures.id, id))
            .get();
          return Response.json(spenditure, { status: 201 });
        } catch (err) {
          return validationError(err);
        }
      },
    },
  };
}
