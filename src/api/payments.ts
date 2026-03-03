/**
 * Payment routes — thin transport adapter.
 * Parses requests, delegates to PaymentService, maps errors to HTTP.
 */

import { getDb, getOrm } from "../db/database";
import { insertPaymentSchema, validationError } from "../db/validation";
import { PaymentService } from "../modules/payments/payment-service";
import {
  mapDomainErrorToResponse,
  DomainError,
} from "../modules/shared/errors";

function getService() {
  return new PaymentService(getDb(), getOrm());
}

export function getPaymentsRoutes() {
  return {
    "/api/payments": {
      GET: () => {
        const service = getService();
        const result = service.listPayments();
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

          const data = insertPaymentSchema.parse(body);
          const service = getService();

          const payment = service.makePayment({
            type: data.type,
            targetId: data.target_id,
            accountId: data.account_id,
            amount: data.amount,
            description: data.description,
          });

          return Response.json(payment, { status: 201 });
        } catch (err) {
          if (err instanceof DomainError) {
            return mapDomainErrorToResponse(err);
          }
          return validationError(err);
        }
      },
    },
  };
}
