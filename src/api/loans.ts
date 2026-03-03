/**
 * Loan routes — thin transport adapter.
 * Parses requests, delegates to LoanService, maps errors to HTTP.
 */

import { getOrm } from "../db/database";
import { insertLoanSchema } from "../db/validation";
import { LoanService } from "../modules/loans/loan-service";
import { routeParam, parseJsonBody } from "./http/request";
import { mapErrorToResponse } from "./http/response";

function getService() {
  return new LoanService(getOrm());
}

export function getLoansRoutes() {
  return {
    "/api/loans": {
      GET: () => {
        const service = getService();
        const result = service.listLoans();
        return Response.json(result);
      },
      POST: async (req: Request) => {
        try {
          const body = await parseJsonBody(req);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = insertLoanSchema.parse(body);
          const service = getService();
          const loan = service.createLoan(data);
          return Response.json(loan, { status: 201 });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
    "/api/loans/:id": {
      GET: (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const service = getService();
          const loan = service.getLoan(id);
          return Response.json(loan);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
      DELETE: (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const service = getService();
          service.deleteLoan(id);
          return Response.json({ success: true });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
  };
}
