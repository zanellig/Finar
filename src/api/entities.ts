import { getDb } from "../db/database";
import {
  sanitizeString,
  sanitizeEnum,
  sanitizeUUID,
  validationError,
} from "../utils/sanitize";

const ENTITY_TYPES = ["bank", "wallet", "asset_manager"] as const;

export function getEntitiesRoutes() {
  return {
    "/api/entities": {
      GET: () => {
        const db = getDb();
        const entities = db
          .query("SELECT * FROM entities ORDER BY created_at DESC")
          .all();
        return Response.json(entities);
      },
      POST: async (req: Request) => {
        const db = getDb();
        const body = await req.json().catch(() => null);
        if (!body) return validationError("Invalid JSON body");

        const name = sanitizeString(body.name, 100);
        const type = sanitizeEnum(body.type, ENTITY_TYPES);

        if (!name) return validationError("Name is required");
        if (!type)
          return validationError(
            "Type must be one of: bank, wallet, asset_manager",
          );

        const id = crypto.randomUUID();
        db.query(
          "INSERT INTO entities (id, name, type) VALUES ($id, $name, $type)",
        ).run({ id, name, type });

        const entity = db
          .query("SELECT * FROM entities WHERE id = $id")
          .get({ id });
        return Response.json(entity, { status: 201 });
      },
    },
    "/api/entities/:id": {
      GET: (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid entity ID");

        const db = getDb();
        const entity = db
          .query("SELECT * FROM entities WHERE id = $id")
          .get({ id });
        if (!entity)
          return Response.json({ error: "Entity not found" }, { status: 404 });

        return Response.json(entity);
      },
      PUT: async (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid entity ID");

        const db = getDb();
        const body = await req.json().catch(() => null);
        if (!body) return validationError("Invalid JSON body");

        const existing = db
          .query("SELECT * FROM entities WHERE id = $id")
          .get({ id });
        if (!existing)
          return Response.json({ error: "Entity not found" }, { status: 404 });

        const name = sanitizeString(body.name, 100) || (existing as any).name;
        const type =
          sanitizeEnum(body.type, ENTITY_TYPES) || (existing as any).type;

        db.query(
          "UPDATE entities SET name = $name, type = $type WHERE id = $id",
        ).run({ id, name, type });

        const entity = db
          .query("SELECT * FROM entities WHERE id = $id")
          .get({ id });
        return Response.json(entity);
      },
      DELETE: (req: Request) => {
        const id = sanitizeUUID((req as any).params.id);
        if (!id) return validationError("Invalid entity ID");

        const db = getDb();
        const existing = db
          .query("SELECT * FROM entities WHERE id = $id")
          .get({ id });
        if (!existing)
          return Response.json({ error: "Entity not found" }, { status: 404 });

        db.query("DELETE FROM entities WHERE id = $id").run({ id });
        return Response.json({ success: true });
      },
    },
  };
}
