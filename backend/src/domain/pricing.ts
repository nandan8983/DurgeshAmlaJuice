/**
 * Plan pricing.
 *
 * A plan's `price` is the full price of that plan for ONE bottle per day
 * (Amla 7-day trial = ₹140 for one bottle every morning for 7 days).
 * A customer taking 2 bottles a day pays twice that.
 */
import { addDays, type DateOnly } from './dates';

/** Subscription amount = plan price × bottles per day, rounded to paise. */
export function subscriptionAmount(planPrice: number, bottlesPerDay: number): number {
  if (!Number.isFinite(planPrice) || planPrice < 0) throw new RangeError('planPrice must be >= 0');
  if (!Number.isInteger(bottlesPerDay) || bottlesPerDay < 1) {
    throw new RangeError('bottlesPerDay must be a positive integer');
  }
  return Math.round(planPrice * bottlesPerDay * 100) / 100;
}

/**
 * End date of a subscription. The start date counts as delivery day 1, so a
 * 7-day plan starting on the 1st runs through the 7th.
 */
export function subscriptionEndDate(startDate: DateOnly, durationDays: number): DateOnly {
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new RangeError('durationDays must be a positive integer');
  }
  return addDays(startDate, durationDays - 1);
}

/** Per-bottle-per-day rate, for reporting only. */
export function dailyRate(planPrice: number, durationDays: number): number {
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new RangeError('durationDays must be a positive integer');
  }
  return Math.round((planPrice / durationDays) * 100) / 100;
}
