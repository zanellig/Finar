/**
 * Typed HTTP request helpers.
 *
 * Replaces unsafe `(req as any).params.id` casts with a
 * safe extraction utility for Bun's route-param API.
 */

import type { ConversionOptions } from "../../modules/currency/convert";

/** Extract a named route param from a Bun request. */
export function routeParam(req: Request, name: string): string {
  // Bun attaches matched route params on the request object
  const params = (req as unknown as { params: Record<string, string> }).params;
  return params[name] ?? "";
}

/**
 * Safely parse a JSON request body.
 * Returns `null` on malformed input instead of throwing.
 */
export async function parseJsonBody(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * Parse conversion-related query params from a request URL.
 *
 * Supported params:
 *   ?rate_source=<source>   — override the exchange-rate source
 *   ?custom_rate=<number>   — use a user-supplied USD→ARS rate
 */
export function parseConversionOpts(req: Request): ConversionOptions {
  const url = new URL(req.url);
  const opts: ConversionOptions = {};

  const rateSource = url.searchParams.get("rate_source");
  if (rateSource && rateSource.trim().length > 0) {
    opts.rateSource = rateSource.trim();
  }

  const customRateRaw = url.searchParams.get("custom_rate");
  if (customRateRaw != null) {
    const parsed = Number(customRateRaw);
    if (Number.isFinite(parsed) && parsed > 0) {
      opts.customRate = parsed;
    }
  }

  return opts;
}
