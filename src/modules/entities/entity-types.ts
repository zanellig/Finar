/**
 * Types for the entity service, inferred from validators.
 */

import { z } from "zod/v4";
import { insertEntitySchema, updateEntitySchema } from "../../db/validation";

export type CreateEntityInput = z.infer<typeof insertEntitySchema>;
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;

export interface EntityRecord {
  id: string;
  name: string;
  type: string;
  created_at: string;
}
