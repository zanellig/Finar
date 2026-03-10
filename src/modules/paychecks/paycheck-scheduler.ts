/**
 * Paycheck scheduler — interval-based runner for recurring paychecks.
 *
 * Processes all overdue paycheck runs on startup and at each tick.
 * Uses deterministic idempotency keys to safely handle retries and
 * concurrent scheduler ticks.
 *
 * Catch-up logic: if the app was down and a paycheck has missed
 * several scheduled periods, the scheduler applies each missed run
 * in chronological order.
 */

import { getDb, getOrm } from "../../db/database";
import { PaycheckService, computeNextRunAt } from "./paycheck-service";
import { formatLocalDatetime } from "../shared/datetime";

const SCHEDULER_INTERVAL_MS = 60_000; // 1 minute

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Build deterministic idempotency key for a scheduled run.
 * Format: paycheck:{id}:{YYYY-MM-DDTHH:mm}
 */
function buildIdempotencyKey(paycheckId: string, runAt: string): string {
  // Normalize to ISO-ish format for the key
  const normalized = runAt.replace(" ", "T").slice(0, 16); // YYYY-MM-DDTHH:mm
  return `paycheck:${paycheckId}:${normalized}`;
}

/**
 * Process a single paycheck, applying all missed runs in order.
 */
function processPaycheck(
  service: PaycheckService,
  paycheckId: string,
  nextRunAt: string,
  frequency: string,
  now: string,
): void {
  let currentRunAt = nextRunAt;

  // Apply runs in chronological order until we've caught up to now
  while (currentRunAt <= now) {
    const idempotencyKey = buildIdempotencyKey(paycheckId, currentRunAt);
    try {
      service.runPaycheck(paycheckId, currentRunAt, idempotencyKey);
    } catch (err) {
      // DuplicateRunError is expected on retries — skip silently
      if ((err as Error).name === "DuplicateRunError") {
        // Already applied — advance to next period
      } else {
        console.error(
          `⚠️ Paycheck run failed [${paycheckId}] at ${currentRunAt}:`,
          (err as Error).message,
        );
        // Stop processing this paycheck on unexpected errors
        return;
      }
    }

    // Advance to next period
    currentRunAt = computeNextRunAt(
      currentRunAt,
      frequency as "monthly" | "biweekly" | "weekly",
    );
  }
}

function tick(): void {
  try {
    const service = new PaycheckService(getDb(), getOrm());
    const now = formatLocalDatetime(new Date());
    const duePaychecks = service.findDuePaychecks(now);

    for (const paycheck of duePaychecks) {
      processPaycheck(
        service,
        paycheck.id,
        paycheck.next_run_at,
        paycheck.frequency,
        now,
      );
    }
  } catch (err) {
    console.error("⚠️ Paycheck scheduler tick error:", err);
  }
}

export function startPaycheckScheduler(): void {
  // Run immediately on startup to catch up missed runs
  tick();
  intervalId = setInterval(tick, SCHEDULER_INTERVAL_MS);
  console.log("⏰ Paycheck scheduler started");
}

export function stopPaycheckScheduler(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("⏰ Paycheck scheduler stopped");
  }
}
