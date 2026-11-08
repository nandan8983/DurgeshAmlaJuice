/**
 * Date handling for a business that thinks in *calendar days* in one city.
 *
 * Everything subscription/delivery related is a date-only value, handled as a
 * `YYYY-MM-DD` string so a server running in UTC and a phone running in IST
 * never disagree about which day a delivery belongs to. Only timestamps
 * (delivered_at, paid_at) are real instants.
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/** `YYYY-MM-DD`. */
export type DateOnly = string;

export const BUSINESS_TZ = 'Asia/Kolkata';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== 'string' || !DATE_ONLY_RE.test(value)) return false;
  // Round-trip check: rejects impossible dates like 2026-13-01 or 2026-02-30,
  // which dayjs would otherwise roll over into a valid neighbouring date.
  return dayjs.utc(value, 'YYYY-MM-DD').format('YYYY-MM-DD') === value;
}

/** Today's calendar date in the business timezone. */
export function today(tz: string = BUSINESS_TZ): DateOnly {
  return dayjs().tz(tz).format('YYYY-MM-DD');
}

/** Accepts a Date (treated as UTC calendar date) or a date-only string. */
export function toDateOnly(value: Date | string): DateOnly {
  if (value instanceof Date) return dayjs.utc(value).format('YYYY-MM-DD');
  if (isDateOnly(value)) return value;
  return dayjs.utc(value).format('YYYY-MM-DD');
}

/**
 * UTC-midnight Date for a date-only value. Postgres `date` columns are read and
 * written this way by Prisma, so staying on UTC midnight keeps round-trips exact.
 */
export function toUtcDate(value: DateOnly): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(value: DateOnly, days: number): DateOnly {
  return dayjs.utc(toUtcDate(value)).add(days, 'day').format('YYYY-MM-DD');
}

/** Signed whole-day difference: `to - from`. */
export function diffDays(from: DateOnly, to: DateOnly): number {
  return dayjs.utc(toUtcDate(to)).diff(dayjs.utc(toUtcDate(from)), 'day');
}

/** Day count including both ends: 1st → 7th inclusive is 7. */
export function daysInclusive(from: DateOnly, to: DateOnly): number {
  return diffDays(from, to) + 1;
}

/** `from <= value <= to`. */
export function isWithin(value: DateOnly, from: DateOnly, to: DateOnly): boolean {
  return value >= from && value <= to;
}

export function minDate(a: DateOnly, b: DateOnly): DateOnly {
  return a <= b ? a : b;
}

export function maxDate(a: DateOnly, b: DateOnly): DateOnly {
  return a >= b ? a : b;
}

/** Start of the current month, in the business timezone. */
export function startOfMonth(value: DateOnly): DateOnly {
  return dayjs.utc(toUtcDate(value)).startOf('month').format('YYYY-MM-DD');
}

export function endOfMonth(value: DateOnly): DateOnly {
  return dayjs.utc(toUtcDate(value)).endOf('month').format('YYYY-MM-DD');
}

/** Half-open instant range covering a whole business day, for timestamp filters. */
export function dayInstantRange(value: DateOnly, tz: string = BUSINESS_TZ): { gte: Date; lt: Date } {
  const start = dayjs.tz(`${value} 00:00:00`, tz);
  return { gte: start.toDate(), lt: start.add(1, 'day').toDate() };
}

/** Half-open instant range covering a date-only range, for timestamp filters. */
export function rangeInstantRange(
  from: DateOnly,
  to: DateOnly,
  tz: string = BUSINESS_TZ,
): { gte: Date; lt: Date } {
  return { gte: dayInstantRange(from, tz).gte, lt: dayInstantRange(to, tz).lt };
}
