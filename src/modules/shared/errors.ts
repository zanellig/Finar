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

/** 400 — input validation failure */
export class ValidationError extends DomainError {}

/** 400 — payment and debt currencies do not match */
export class CurrencyMismatchError extends DomainError {}

/** 503 — required exchange rate is missing; aggregation cannot proceed */
export class MissingRateError extends DomainError {}

// ---- Paycheck errors ----

/** 404 — paycheck does not exist */
export class PaycheckNotFoundError extends DomainError {}

/** 409 — paycheck is disabled */
export class PaycheckInactiveError extends DomainError {}

/** 409 — paycheck next_run_at is in the future */
export class PaycheckNotDueError extends DomainError {}

/** 409 — idempotency key already used */
export class DuplicateRunError extends DomainError {}

/** 500 — should-never-happen guard */
export class InvariantViolationError extends DomainError {}

