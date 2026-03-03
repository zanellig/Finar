/**
 * Types for the loan service, inferred from validators and schema.
 */

import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";
import { insertLoanSchema } from "../../db/validation";
import { loans } from "../../db/schema";

/** Validated input from API (snake_case). */
export type CreateLoanInput = z.infer<typeof insertLoanSchema>;

/** Drizzle insert schema (camelCase) — used by the repository layer. */
export const loanValuesSchema = createInsertSchema(loans);
export type LoanValues = z.infer<typeof loanValuesSchema>;

export interface LoanCalculation {
  totalOwed: number;
  monthlyPayment: number;
}
