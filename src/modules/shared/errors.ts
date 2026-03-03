/**
 * Domain error classes for structured error handling.
 * Route layers map these to appropriate HTTP status codes.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** 400 — validation or business rule violation */
export class InvalidPaymentError extends DomainError {}

/** 400 — account cannot cover the requested amount */
export class InsufficientFundsError extends DomainError {}

/** 404 — requested resource does not exist */
export class NotFoundError extends DomainError {}

/** 409 — conflicting state (e.g. loan already paid off) */
export class ConflictError extends DomainError {}

/**
 * Maps a domain error to an HTTP Response.
 * Falls back to 400 for unknown errors.
 */
export function mapDomainErrorToResponse(error: unknown): Response {
  if (error instanceof NotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ConflictError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof InsufficientFundsError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof InvalidPaymentError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DomainError) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 },
  );
}
