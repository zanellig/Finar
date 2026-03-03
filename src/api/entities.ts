import { eq } from "drizzle-orm";
import { getOrm } from "../db/database";
import { entities } from "../db/schema";
import {
  insertEntitySchema,
  updateEntitySchema,
  validationError,
} from "../db/validation";

export function getEntitiesRoutes() {
  return {
    "/api/entities": {
      GET: () => {
        const db = getOrm();
        const result = db
          .select({
            id: entities.id,
            name: entities.name,
            type: entities.type,
            created_at: entities.createdAt,
          })
          .from(entities)
          .orderBy(entities.createdAt)
          .all();
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

          const data = insertEntitySchema.parse(body);
          const db = getOrm();
          const id = crypto.randomUUID();

          db.insert(entities)
            .values({ id, ...data })
            .run();

          const entity = db
            .select({
              id: entities.id,
              name: entities.name,
              type: entities.type,
              created_at: entities.createdAt,
            })
            .from(entities)
            .where(eq(entities.id, id))
            .get();
          return Response.json(entity, { status: 201 });
        } catch (err) {
          return validationError(err);
        }
      },
    },
    "/api/entities/:id": {
      GET: (req: Request) => {
        const id = (req as any).params.id;
        const db = getOrm();
        const entity = db
          .select({
            id: entities.id,
            name: entities.name,
            type: entities.type,
            created_at: entities.createdAt,
          })
          .from(entities)
          .where(eq(entities.id, id))
          .get();

        if (!entity)
          return Response.json({ error: "Entity not found" }, { status: 404 });
        return Response.json(entity);
      },
      PUT: async (req: Request) => {
        try {
          const id = (req as any).params.id;
          const db = getOrm();

          const existing = db
            .select({ id: entities.id })
            .from(entities)
            .where(eq(entities.id, id))
            .get();
          if (!existing)
            return Response.json(
              { error: "Entity not found" },
              { status: 404 },
            );

          const body = await req.json().catch(() => null);
          if (!body)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            );

          const data = updateEntitySchema.parse(body);

          db.update(entities).set(data).where(eq(entities.id, id)).run();

          const entity = db
            .select({
              id: entities.id,
              name: entities.name,
              type: entities.type,
              created_at: entities.createdAt,
            })
            .from(entities)
            .where(eq(entities.id, id))
            .get();
          return Response.json(entity);
        } catch (err) {
          return validationError(err);
        }
      },
      DELETE: (req: Request) => {
        const id = (req as any).params.id;
        const db = getOrm();

        const existing = db
          .select({ id: entities.id })
          .from(entities)
          .where(eq(entities.id, id))
          .get();
        if (!existing)
          return Response.json({ error: "Entity not found" }, { status: 404 });

        db.delete(entities).where(eq(entities.id, id)).run();
        return Response.json({ success: true });
      },
    },
  };
}
