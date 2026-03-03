import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  entities,
  accounts,
  loans,
  creditCards,
  ccSpenditures,
  payments,
  exchangeRates,
} from "./schema";

// ---- Select schemas (response types) ----

export const selectEntitySchema = createSelectSchema(entities);
export const selectAccountSchema = createSelectSchema(accounts);
export const selectLoanSchema = createSelectSchema(loans);
export const selectCreditCardSchema = createSelectSchema(creditCards);
export const selectCcSpenditureSchema = createSelectSchema(ccSpenditures);
export const selectPaymentSchema = createSelectSchema(payments);
export const selectExchangeRateSchema = createSelectSchema(exchangeRates);

// ---- Insert schemas (request validation) ----
// Accept snake_case from frontend, transform to camelCase for Drizzle

export const insertEntitySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  type: z.enum(["bank", "wallet", "asset_manager"]),
});

export const updateEntitySchema = insertEntitySchema.partial();

export const insertAccountSchema = z.object({
  entity_id: z.string().min(1, "entity_id is required"),
  name: z.string().trim().min(1, "Name is required").max(100),
  type: z.enum(["savings", "checking", "interest"]),
  balance: z.coerce.number().min(-999_999_999).max(999_999_999).default(0),
  currency: z.enum(["ARS", "USD"]).default("ARS"),
  daily_extraction_limit: z.coerce
    .number()
    .min(0)
    .max(999_999_999)
    .nullable()
    .optional(),
  monthly_maintenance_cost: z.coerce
    .number()
    .min(0)
    .max(999_999_999)
    .default(0),
  is_salary_account: z
    .union([z.boolean(), z.coerce.number()])
    .transform((v) => !!v)
    .default(false),
  overdraft_limit: z.coerce.number().min(0).max(999_999_999).default(0),
  tna_rate: z.coerce.number().min(0).max(9999).default(0),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  balance: z.coerce.number().min(-999_999_999).max(999_999_999).optional(),
  daily_extraction_limit: z.coerce
    .number()
    .min(0)
    .max(999_999_999)
    .nullable()
    .optional(),
  monthly_maintenance_cost: z.coerce
    .number()
    .min(0)
    .max(999_999_999)
    .optional(),
  is_salary_account: z
    .union([z.boolean(), z.coerce.number()])
    .transform((v) => !!v)
    .optional(),
  overdraft_limit: z.coerce.number().min(0).max(999_999_999).optional(),
  tna_rate: z.coerce.number().min(0).max(9999).optional(),
});

export const insertLoanSchema = z.object({
  entity_id: z.string().min(1, "entity_id is required"),
  name: z.string().trim().min(1, "Name is required").max(100),
  capital: z.coerce
    .number()
    .positive("Capital must be positive")
    .max(999_999_999),
  installments: z.coerce.number().int().min(1).max(360),
  cftea: z.coerce.number().positive("CFTEA must be positive").max(9999),
});

export const insertCreditCardSchema = z.object({
  entity_id: z.string().min(1, "entity_id is required"),
  name: z.string().trim().min(1, "Name is required").max(100),
  spend_limit: z.coerce.number().min(0).max(999_999_999),
});

export const updateCreditCardSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  spend_limit: z.coerce.number().min(0).max(999_999_999).optional(),
});

export const insertCcSpenditure1xSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(200),
  currency: z.enum(["ARS", "USD"]).default("ARS"),
  installments: z.literal(1).default(1),
  amount: z.coerce
    .number()
    .positive("Amount must be positive")
    .max(999_999_999),
});

export const insertCcSpendInstallmentSchema = z
  .object({
    description: z.string().trim().min(1, "Description is required").max(200),
    currency: z.literal("ARS").default("ARS"),
    installments: z.coerce.number().int().min(2).max(120),
    monthly_amount: z.coerce.number().positive().max(999_999_999).optional(),
    total_amount: z.coerce.number().positive().max(999_999_999).optional(),
  })
  .refine(
    (d) => d.monthly_amount != null || d.total_amount != null,
    "Either monthly_amount or total_amount is required for installment payments",
  );

export const insertPaymentSchema = z.object({
  type: z.enum(["cc", "loan"]),
  target_id: z.string().min(1, "target_id is required"),
  account_id: z.string().min(1, "account_id is required"),
  amount: z.coerce
    .number()
    .positive("Amount must be positive")
    .max(999_999_999),
  description: z.string().trim().max(200).default(""),
});

// ---- Inferred types ----

export type Entity = z.infer<typeof selectEntitySchema>;
export type Account = z.infer<typeof selectAccountSchema>;
export type Loan = z.infer<typeof selectLoanSchema>;
export type CreditCard = z.infer<typeof selectCreditCardSchema>;
export type CcSpenditure = z.infer<typeof selectCcSpenditureSchema>;
export type Payment = z.infer<typeof selectPaymentSchema>;
export type ExchangeRate = z.infer<typeof selectExchangeRateSchema>;

// ---- Response helper ----

export function validationError(error: unknown): Response {
  if (error instanceof z.ZodError) {
    const messages = error.issues.map((i) => i.message).join("; ");
    return Response.json({ error: messages }, { status: 400 });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "Validation failed" },
    { status: 400 },
  );
}
