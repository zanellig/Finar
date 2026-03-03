/**
 * Entity repository — pure DB access layer.
 * All queries return plain objects; no business logic here.
 */

import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { entities } from "../../db/schema";
import type { CreateEntityInput, UpdateEntityInput } from "./entity-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

const entitySelect = {
  id: entities.id,
  name: entities.name,
  type: entities.type,
  created_at: entities.createdAt,
};

export class EntityRepository {
  constructor(private readonly db: Orm) {}

  findAll() {
    return this.db
      .select(entitySelect)
      .from(entities)
      .orderBy(entities.createdAt)
      .all();
  }

  findById(id: string) {
    return this.db
      .select(entitySelect)
      .from(entities)
      .where(eq(entities.id, id))
      .get();
  }

  create(data: { id: string } & CreateEntityInput) {
    this.db.insert(entities).values(data).run();
    return this.findById(data.id);
  }

  update(id: string, data: UpdateEntityInput) {
    this.db.update(entities).set(data).where(eq(entities.id, id)).run();
    return this.findById(id);
  }

  remove(id: string) {
    this.db.delete(entities).where(eq(entities.id, id)).run();
  }
}
