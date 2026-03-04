/**
 * Canonical spenditure validation and normalization.
 *
 * Single source of truth for installment rules, schema dispatch,
 * and amount derivation — called by both the route and the service.
 */

import {
  insertCcSpenditure1xSchema,
  insertCcSpendInstallmentSchema,
} from "../../db/validation";
import { ValidationError } from "../shared/errors";

export interface ParsedSpenditure {
  description: string;
  currency: "ARS" | "USD";
  installments: number;
  monthlyAmount: number;
  totalAmount: number;
}

/**
 * Parse, validate, and normalize a raw spenditure request body.
 *
 * @throws {ValidationError} on invalid input (non-positive amounts,
 *   USD installments, missing amount fields, etc.)
 * @throws {ZodError} when schema validation fails.
 */
export function parseSpenditure(
  body: Record<string, unknown>,
): ParsedSpenditure {
  // 1. Normalize installments — coerce to integer, default to 1
  const rawInstallments = Number(body.installments);
  const installments =
    Number.isFinite(rawInstallments) && rawInstallments >= 1
      ? Math.floor(rawInstallments)
      : 1;

  let totalAmount: number;
  let monthlyAmount: number;
  let parsedInstallments: number;

  // Build a normalized copy so zod sees the cleaned installments value
  const normalized = { ...body, installments };

  if (installments <= 1) {
    // ── 1× purchase ──────────────────────────────────────────────
    insertCcSpenditure1xSchema.parse(normalized);

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError("Amount must be a positive number");
    }

    totalAmount = amount;
    monthlyAmount = amount;
    parsedInstallments = 1;
  } else {
    // ── Installment purchase ─────────────────────────────────────
    const currency = typeof body.currency === "string" ? body.currency : "ARS";

    if (currency === "USD") {
      throw new ValidationError(
        "Installments are only available in ARS payments",
      );
    }

    insertCcSpendInstallmentSchema.parse(normalized);

    parsedInstallments = installments;
    const mAmount = Number(body.monthly_amount);
    const tAmount = Number(body.total_amount);

    if (Number.isFinite(mAmount) && mAmount > 0) {
      monthlyAmount = mAmount;
      totalAmount = Math.round(monthlyAmount * parsedInstallments * 100) / 100;
    } else if (Number.isFinite(tAmount) && tAmount > 0) {
      totalAmount = tAmount;
      monthlyAmount =
        Math.round((totalAmount / parsedInstallments) * 100) / 100;
    } else {
      throw new ValidationError(
        "Either monthly_amount or total_amount is required for installment payments",
      );
    }
  }

  // ── Common field normalization ───────────────────────────────
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const currency =
    typeof body.currency === "string" &&
    (body.currency === "ARS" || body.currency === "USD")
      ? body.currency
      : "ARS";

  return {
    description,
    currency,
    installments: parsedInstallments,
    monthlyAmount,
    totalAmount,
  };
}
