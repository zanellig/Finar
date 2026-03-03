/**
 * Standardised HTTP response helpers.
 *
 * Unifies error-to-HTTP mapping so every route uses the same
 * status-code conventions without duplicating switch logic.
 */

import { z } from "zod/v4";
import {
  DomainError,
  MissingRateError,
  NotFoundError,
  ConflictError,
  InsufficientFundsError,
  InvalidPaymentError,
  ValidationError,
} from "../../modules/shared/errors";

/**
 * Map any caught error to a well-formed JSON response.
 *
 * Status mapping:
 *   ZodError / ValidationError  → 400
 *   InvalidPaymentError         → 400
 *   InsufficientFundsError      → 400
 *   NotFoundError               → 404
 *   ConflictError               → 409
 *   MissingRateError            → 503
 *   Unknown DomainError         → 400
 *   Everything else             → 500
 */
export function mapErrorToResponse(err: unknown): Response {
  // Zod validation errors → 400
  if (err instanceof z.ZodError) {
    const messages = err.issues.map((i) => i.message).join("; ");
    return Response.json({ error: messages }, { status: 400 });
  }

  // Domain errors → mapped status codes
  if (err instanceof MissingRateError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  if (err instanceof NotFoundError) {
    return Response.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ConflictError) {
    return Response.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof InsufficientFundsError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof InvalidPaymentError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof ValidationError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof DomainError) {
    return Response.json({ error: err.message }, { status: 400 });
  }

  // Unknown errors → 500
  return Response.json(
    { error: err instanceof Error ? err.message : "Unexpected error" },
    { status: 500 },
  );
}
