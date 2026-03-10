/**
 * Paycheck routes — thin transport adapter.
 * Parses requests, delegates to PaycheckService, maps errors to HTTP.
 */

import { getDb, getOrm } from "../db/database";
import {
  insertPaycheckSchema,
  updatePaycheckSchema,
  runPaycheckSchema,
} from "../db/validation";
import { PaycheckService } from "../modules/paychecks/paycheck-service";
import { formatLocalDatetime } from "../modules/shared/datetime";
import { routeParam, parseJsonBody } from "./http/request";
import { mapErrorToResponse } from "./http/response";

function getService() {
  return new PaycheckService(getDb(), getOrm());
}

export function getPaychecksRoutes() {
  return {
    "/api/paychecks": {
      GET: () => {
        const service = getService();
        const result = service.listPaychecks();
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

          const data = insertPaycheckSchema.parse(body);
          const service = getService();
          const paycheck = service.createPaycheck(data);
          return Response.json(paycheck, { status: 201 });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
    "/api/paychecks/:id": {
      PUT: async (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const body = await parseJsonBody(req);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = updatePaycheckSchema.parse(body);
          const service = getService();
          const paycheck = service.updatePaycheck(id, data);
          return Response.json(paycheck);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
    "/api/paychecks/:id/run": {
      POST: async (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const body = await parseJsonBody(req);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = runPaycheckSchema.parse(body);
          const runAt = data.run_at ?? formatLocalDatetime(new Date());
          const service = getService();
          const run = service.runPaycheck(id, runAt, data.idempotency_key);
          return Response.json(run, { status: 201 });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
    "/api/paychecks/:id/runs": {
      GET: (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const url = new URL(req.url);
          const limit = Math.min(
            Math.max(Number(url.searchParams.get("limit")) || 20, 1),
            100,
          );
          const offset = Math.max(
            Number(url.searchParams.get("offset")) || 0,
            0,
          );
          const service = getService();
          const runs = service.getRunHistory(id, limit, offset);
          return Response.json(runs);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
  };
}
