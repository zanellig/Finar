/**
 * Test matrix for the canonical error → HTTP status mapper.
 *
 * Locks down every domain-error class to its expected status code
 * so drift is caught immediately when new error types are added.
 */

import { describe, it, expect } from "bun:test";
import { z } from "zod/v4";
import { mapErrorToResponse } from "../src/api/http/response";
import {
  DomainError,
  CurrencyMismatchError,
  MissingRateError,
  NotFoundError,
  ConflictError,
  InsufficientFundsError,
  InvalidPaymentError,
  ValidationError,
} from "../src/modules/shared/errors";

// ── Mapping matrix ───────────────────────────────────────────────

const matrix: [string, unknown, number][] = [
  [
    "ZodError",
    new z.ZodError([
      {
        code: "invalid_type",
        message: "bad",
        path: [],
        expected: "string",
        received: "number",
      },
    ]),
    400,
  ],
  ["ValidationError", new ValidationError("invalid input"), 400],
  ["InvalidPaymentError", new InvalidPaymentError("bad payment"), 400],
  ["InsufficientFundsError", new InsufficientFundsError("not enough"), 400],
  ["CurrencyMismatchError", new CurrencyMismatchError("ARS ≠ USD"), 400],
  ["NotFoundError", new NotFoundError("missing"), 404],
  ["ConflictError", new ConflictError("already exists"), 409],
  ["MissingRateError", new MissingRateError("no rate"), 503],
  ["Generic DomainError", new DomainError("domain"), 400],
  ["Plain Error", new Error("boom"), 500],
  ["Non-Error (string)", "something broke", 500],
];

describe("mapErrorToResponse — status code matrix", () => {
  for (const [label, error, expectedStatus] of matrix) {
    it(`${label} → ${expectedStatus}`, async () => {
      const res = mapErrorToResponse(error);
      expect(res.status).toBe(expectedStatus);

      // Verify body always contains an error message
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });
  }
});

// ── Message preservation ─────────────────────────────────────────

describe("mapErrorToResponse — message fidelity", () => {
  it("preserves domain error messages verbatim", async () => {
    const msg = "Account acc-42 not found";
    const res = mapErrorToResponse(new NotFoundError(msg));
    const body = await res.json();
    expect(body.error).toBe(msg);
  });

  it("joins ZodError issues with semicolons", async () => {
    const zodErr = new z.ZodError([
      {
        code: "invalid_type",
        message: "Expected string",
        path: ["name"],
        expected: "string",
        received: "number",
      },
      {
        code: "invalid_type",
        message: "Required",
        path: ["email"],
        expected: "string",
        received: "undefined",
      },
    ]);
    const res = mapErrorToResponse(zodErr);
    const body = await res.json();
    expect(body.error).toBe("Expected string; Required");
  });

  it("uses 'Unexpected error' for non-Error throws", async () => {
    const res = mapErrorToResponse(42);
    const body = await res.json();
    expect(body.error).toBe("Unexpected error");
  });
});
