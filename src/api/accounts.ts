/**
 * Account routes — thin transport adapter.
 * Parses requests, delegates to AccountService, maps errors to HTTP.
 */

import { getOrm } from "../db/database";
import { insertAccountSchema, updateAccountSchema } from "../db/validation";
import { AccountService } from "../modules/accounts/account-service";
import { routeParam, parseJsonBody } from "./http/request";
import { mapErrorToResponse } from "./http/response";

function getService() {
  return new AccountService(getOrm());
}

export function getAccountsRoutes() {
  return {
    "/api/accounts": {
      GET: () => {
        const service = getService();
        const result = service.listAccounts();
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

          const data = insertAccountSchema.parse(body);
          const service = getService();
          const account = service.createAccount(data);
          return Response.json(account, { status: 201 });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
    "/api/accounts/:id": {
      GET: (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const service = getService();
          const account = service.getAccount(id);
          return Response.json(account);
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

          const data = updateAccountSchema.parse(body);
          const service = getService();
          const account = service.updateAccount(id, data);
          return Response.json(account);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
      DELETE: (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const service = getService();
          service.deleteAccount(id);
          return Response.json({ success: true });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
  };
}
