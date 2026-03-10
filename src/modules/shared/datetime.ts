/**
 * Shared datetime utilities.
 *
 * All backend datetime strings use the "YYYY-MM-DD HH:mm:ss" format
 * (space separator) for consistent lexicographic comparison in SQLite.
 */

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Format a Date as "YYYY-MM-DD HH:mm:ss" using local time.
 * This is the canonical format for all persisted datetime values.
 */
export function formatLocalDatetime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Normalize a datetime string to "YYYY-MM-DD HH:mm:ss" format.
 * Replaces the ISO `T` separator with a space and pads missing seconds.
 */
export function normalizeDatetime(value: string): string {
  const spaced = value.replace("T", " ");
  // If seconds are missing (YYYY-MM-DD HH:mm), append ":00"
  return spaced.length === 16 ? `${spaced}:00` : spaced;
}
