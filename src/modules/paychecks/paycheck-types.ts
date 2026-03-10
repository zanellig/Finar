/**
 * Types for the paycheck service, inferred from validators and schema.
 */

import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";
import {
  insertPaycheckSchema,
  updatePaycheckSchema,
  runPaycheckSchema,
} from "../../db/validation";
import { paychecks, paycheckRuns } from "../../db/schema";

/** Validated input from API (snake_case). */
export type CreatePaycheckInput = z.infer<typeof insertPaycheckSchema>;
export type UpdatePaycheckInput = z.infer<typeof updatePaycheckSchema>;
export type RunPaycheckInput = z.infer<typeof runPaycheckSchema>;

/** Drizzle insert schema (camelCase) — used by the repository layer. */
export const paycheckValuesSchema = createInsertSchema(paychecks);
export type PaycheckValues = z.infer<typeof paycheckValuesSchema>;

export const paycheckRunValuesSchema = createInsertSchema(paycheckRuns);
export type PaycheckRunValues = z.infer<typeof paycheckRunValuesSchema>;
