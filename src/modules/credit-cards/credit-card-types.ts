/**
 * Types for the credit-card service, inferred from validators and schema.
 */

import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";
import {
  insertCreditCardSchema,
  updateCreditCardSchema,
} from "../../db/validation";
import { creditCards, ccSpenditures } from "../../db/schema";

/** Validated input from API (snake_case). */
export type CreateCreditCardInput = z.infer<typeof insertCreditCardSchema>;
export type UpdateCreditCardInput = z.infer<typeof updateCreditCardSchema>;

/** Drizzle insert schemas (camelCase) — used by the repository layer. */
export const creditCardValuesSchema = createInsertSchema(creditCards);
export type CreditCardValues = z.infer<typeof creditCardValuesSchema>;

export const ccSpenditureValuesSchema = createInsertSchema(ccSpenditures);
export type CcSpenditureValues = z.infer<typeof ccSpenditureValuesSchema>;
