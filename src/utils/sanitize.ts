/** Sanitize a string: trim, strip control chars, limit length */
export function sanitizeString(input: unknown, maxLength = 500): string {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, maxLength);
}

/** Sanitize a number: ensure it's finite, non-NaN, within bounds */
export function sanitizeNumber(
  input: unknown,
  min = -Infinity,
  max = Infinity,
): number | null {
  const num = typeof input === "string" ? parseFloat(input) : Number(input);
  if (!Number.isFinite(num)) return null;
  return Math.max(min, Math.min(max, num));
}

/** Sanitize a positive integer */
export function sanitizePositiveInt(input: unknown, max = 1000): number | null {
  const num = sanitizeNumber(input, 1, max);
  if (num === null) return null;
  return Math.floor(num);
}

/** Validate and return one of allowed values */
export function sanitizeEnum<T extends string>(
  input: unknown,
  allowed: readonly T[],
): T | null {
  const str = sanitizeString(input);
  return allowed.includes(str as T) ? (str as T) : null;
}

/** Validate UUID format */
export function sanitizeUUID(input: unknown): string | null {
  const str = sanitizeString(input, 36);
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str) ? str : null;
}

/** Create validation error response */
export function validationError(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}
