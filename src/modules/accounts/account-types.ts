/**
 * Types for the account service, inferred from validators and schema.
 */

import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";
import { insertAccountSchema, updateAccountSchema } from "../../db/validation";
import { accounts } from "../../db/schema";

/** Validated input from API (snake_case). */
export type CreateAccountInput = z.infer<typeof insertAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

/** Drizzle insert schema (camelCase) — used by the repository layer. */
export const accountValuesSchema = createInsertSchema(accounts);
export type AccountValues = z.infer<typeof accountValuesSchema>;
