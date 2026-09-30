// Dates are handled as whole days since 1970-01-01 (UTC) so every calculation is deterministic.

const MS_PER_DAY = 86_400_000;

export function toDay(iso: string): number {
  if (!isIsoDate(iso)) throw new Error(`Invalid date: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export function toIso(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function parts(day: number): { year: number; month: number; date: number } {
  const dt = new Date(day * MS_PER_DAY);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, date: dt.getUTCDate() };
}

/** Adds calendar months; the day of month is clamped to the target month's length. */
export function addMonths(day: number, months: number): number {
  const { year, month, date } = parts(day);
  const total = month - 1 + months;
  const y = year + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.round(Date.UTC(y, m, Math.min(date, lastDay)) / MS_PER_DAY);
}

export function addYears(day: number, years: number): number {
  return addMonths(day, 12 * years);
}

export function yearStart(year: number): number {
  return Math.round(Date.UTC(year, 0, 1) / MS_PER_DAY);
}

export function daysInYear(year: number): number {
  return yearStart(year + 1) - yearStart(year);
}

/** Length of the overlap of the half-open intervals [a0, a1) and [b0, b1), in days. */
export function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}
