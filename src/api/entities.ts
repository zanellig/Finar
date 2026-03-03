/**
 * Entity routes — thin transport adapter.
 * Parses requests, delegates to EntityService, maps errors to HTTP.
 */

import { getOrm } from "../db/database";
import { insertEntitySchema, updateEntitySchema } from "../db/validation";
import { EntityService } from "../modules/entities/entity-service";
import { routeParam, parseJsonBody } from "./http/request";
import { mapErrorToResponse } from "./http/response";

function getService() {
  return new EntityService(getOrm());
}

export function getEntitiesRoutes() {
  return {
    "/api/entities": {
      GET: () => {
        const service = getService();
        const result = service.listEntities();
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

          const data = insertEntitySchema.parse(body);
          const service = getService();
          const entity = service.createEntity(data);
          return Response.json(entity, { status: 201 });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
    "/api/entities/:id": {
      GET: (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const service = getService();
          const entity = service.getEntity(id);
          return Response.json(entity);
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

          const data = updateEntitySchema.parse(body);
          const service = getService();
          const entity = service.updateEntity(id, data);
          return Response.json(entity);
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
      DELETE: (req: Request) => {
        try {
          const id = routeParam(req, "id");
          const service = getService();
          service.deleteEntity(id);
          return Response.json({ success: true });
        } catch (err) {
          return mapErrorToResponse(err);
        }
      },
    },
  };
}
