/**
 * Entity service — business logic for entity management.
 */

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { EntityRepository } from "./entity-repository";
import type { CreateEntityInput, UpdateEntityInput } from "./entity-types";
import { NotFoundError } from "../shared/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

export class EntityService {
  private readonly repo: EntityRepository;

  constructor(orm: Orm) {
    this.repo = new EntityRepository(orm);
  }

  listEntities() {
    return this.repo.findAll();
  }

  getEntity(id: string) {
    const entity = this.repo.findById(id);
    if (!entity) {
      throw new NotFoundError("Entity not found");
    }
    return entity;
  }

  createEntity(input: CreateEntityInput) {
    const id = crypto.randomUUID();
    return this.repo.create({ id, ...input });
  }

  updateEntity(id: string, input: UpdateEntityInput) {
    // Verify existence
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("Entity not found");
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.type !== undefined) data.type = input.type;

    return this.repo.update(id, data);
  }

  deleteEntity(id: string) {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("Entity not found");
    }
    this.repo.remove(id);
  }
}
