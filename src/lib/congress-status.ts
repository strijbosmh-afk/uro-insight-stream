import type { Congress } from "@/types";

/**
 * Parse a YYYY-MM-DD string as a UTC date. Returns null for invalid input.
 * Avoids `new Date(str)` to dodge timezone shifts that flip the day.
 */
function parseYmdUtc(str: string | null | undefined): Date | null {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/**
 * Derive a congress status from its dates. Falls back to the stored
 * status when dates aren't available. End date is inclusive (treated as
 * end-of-day UTC) so a congress still counts as "live" on its final day.
 */
export function deriveCongressStatus(
  start_date: string | null | undefined,
  end_date: string | null | undefined,
  stored: Congress["status"],
): Congress["status"] {
  const start = parseYmdUtc(start_date);
  const end = parseYmdUtc(end_date);
  if (!start && !end) return stored;
  const now = Date.now();
  const startMs = start ? start.getTime() : end!.getTime();
  // Inclusive end-of-day: add 24h - 1ms
  const endMs = (end ?? start!).getTime() + 24 * 60 * 60 * 1000 - 1;
  if (now < startMs) return "upcoming";
  if (now > endMs) return "archived";
  return "live";
}