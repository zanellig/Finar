/**
 * Credit-card routes — thin transport adapter.
 * Parses requests, delegates to CreditCardService, maps errors to HTTP.
 */

import { getOrm } from "../db/database";
import {
  insertCreditCardSchema,
  updateCreditCardSchema,
  insertCcSpenditure1xSchema,
  insertCcSpendInstallmentSchema,
} from "../db/validation";
import { CreditCardService } from "../modules/credit-cards/credit-card-service";
import { routeParam, parseJsonBody, parseConversionOpts } from "./http/request";
import { mapErrorToResponse } from "./http/response";

function getService() {
  return new CreditCardService(getOrm());
}

export function getCreditCardsRoutes() {
  return {
    "/api/credit-cards": {
      GET: (req: Request) => {
        try {
          const convOpts = parseConversionOpts(req);
          const service = getService();
          const result = service.listCards(convOpts);
          return Response.json(result);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
      POST: async (req: Request) => {
        try {
          const body = await parseJsonBody(req);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = insertCreditCardSchema.parse(body);
          const service = getService();
          const card = service.createCard(data);
          return Response.json(card, { status: 201 });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
    "/api/credit-cards/:id": {
      GET: (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const convOpts = parseConversionOpts(req);
          const service = getService();
          const card = service.getCard(id, convOpts);
          return Response.json(card);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
      PUT: async (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const body = await parseJsonBody(req);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = updateCreditCardSchema.parse(body);
          const service = getService();
          const card = service.updateCard(id, data);
          return Response.json(card);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
      DELETE: (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const service = getService();
          service.deleteCard(id);
          return Response.json({ success: true });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
    "/api/credit-cards/:id/spenditures": {
      GET: (req: Request) => {
        try {
          const cardId = routeParam(req, "id");
          const service = getService();
          const result = service.listSpenditures(cardId);
          return Response.json(result);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
      POST: async (req: Request) => {
        try {
          const cardId = routeParam(req, "id");
          const body = await parseJsonBody(req);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          // Validate with the appropriate schema based on installments
          const rawBody = body as Record<string, unknown>;
          const rawInstallments = Number(rawBody.installments);
          const installments =
            Number.isFinite(rawInstallments) && rawInstallments >= 1
              ? Math.floor(rawInstallments)
              : 1;

          if (installments <= 1) {
            insertCcSpenditure1xSchema.parse(body);
          } else {
            if (rawBody.currency === "USD") {
              return Response.json(
                { error: "Installments are only available in ARS payments" },
                { status: 400 },
              );
            }
            insertCcSpendInstallmentSchema.parse(body);
          }

          const service = getService();
          const spenditure = service.createSpenditure(cardId, rawBody);
          return Response.json(spenditure, { status: 201 });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
  };
}
