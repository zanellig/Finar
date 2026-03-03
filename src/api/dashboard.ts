/**
 * Dashboard route — thin transport adapter.
 * Parses requests, delegates to DashboardService, maps errors to HTTP.
 */

import { getOrm } from "../db/database";
import { DashboardService } from "../modules/dashboard/dashboard-service";
import { parseConversionOpts } from "./http/request";
import { mapErrorToResponse } from "./http/response";

function getService() {
  return new DashboardService(getOrm());
}

export function getDashboardRoutes() {
  return {
    "/api/dashboard": {
      GET: (req: Request) => {
        try {
          const convOpts = parseConversionOpts(req);
          const service = getService();
          const data = service.getDashboard(convOpts);
          return Response.json(data);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
  };
}
