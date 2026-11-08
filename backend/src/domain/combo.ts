/**
 * Which juice goes in the bottle today.
 *
 * Amla and Beetroot plans are the same product every day. A Combo plan
 * alternates: delivery day 1 Amla, day 2 Beetroot, day 3 Amla, …
 *
 * "Delivery day" means a day the customer actually gets a bottle, so paused
 * days don't advance the alternation — a customer paused on their Beetroot day
 * still gets Beetroot the day they resume.
 */
import { diffDays, isWithin, type DateOnly } from './dates';

export type ProductKind = 'amla' | 'beetroot' | 'combo';
export type DeliveryProduct = 'amla' | 'beetroot';

/** A closed date range during which no bottle was delivered. */
export interface PauseWindow {
  pausedFrom: DateOnly;
  /** `null` means still paused (open-ended). */
  resumedOn: DateOnly | null;
}

/**
 * How many paused days fall strictly before `date` and on/after `startDate`.
 * A pause window covers `pausedFrom` up to but not including `resumedOn`
 * (the customer is delivered to again on the day they resume).
 */
export function pausedDaysBefore(
  startDate: DateOnly,
  date: DateOnly,
  pauses: readonly PauseWindow[],
): number {
  let count = 0;
  for (const pause of pauses) {
    const from = pause.pausedFrom < startDate ? startDate : pause.pausedFrom;
    // Exclusive end: the earlier of "resumed" and "the day we're asking about".
    const end = pause.resumedOn === null ? date : (pause.resumedOn < date ? pause.resumedOn : date);
    const days = diffDays(from, end);
    if (days > 0) count += days;
  }
  return count;
}

/**
 * 1-based delivery-day number of `date` within a subscription, skipping paused
 * days. Returns 0 when `date` is itself a paused day or outside the window.
 */
export function deliveryDayNumber(
  startDate: DateOnly,
  date: DateOnly,
  pauses: readonly PauseWindow[] = [],
): number {
  if (date < startDate) return 0;
  if (isPausedOn(date, pauses)) return 0;
  const elapsed = diffDays(startDate, date); // 0 on the start date
  return elapsed - pausedDaysBefore(startDate, date, pauses) + 1;
}

export function isPausedOn(date: DateOnly, pauses: readonly PauseWindow[]): boolean {
  return pauses.some(
    (p) => date >= p.pausedFrom && (p.resumedOn === null || date < p.resumedOn),
  );
}

/** Resolve a plan product to the bottle for a given delivery-day number. */
export function productForDeliveryDay(
  product: ProductKind,
  deliveryDayNo: number,
): DeliveryProduct {
  if (product !== 'combo') return product;
  if (!Number.isInteger(deliveryDayNo) || deliveryDayNo < 1) {
    throw new RangeError('deliveryDayNo must be a positive integer');
  }
  // Odd delivery days are Amla, even are Beetroot.
  return deliveryDayNo % 2 === 1 ? 'amla' : 'beetroot';
}

/** Convenience: product for a calendar date, accounting for pauses. */
export function productForDate(
  product: ProductKind,
  startDate: DateOnly,
  date: DateOnly,
  pauses: readonly PauseWindow[] = [],
): DeliveryProduct | null {
  const dayNo = deliveryDayNumber(startDate, date, pauses);
  if (dayNo < 1) return null;
  return productForDeliveryDay(product, dayNo);
}

/** Does this subscription owe a bottle on `date`? */
export function isDeliverableOn(
  sub: { startDate: DateOnly; endDate: DateOnly; status: string },
  date: DateOnly,
  pauses: readonly PauseWindow[] = [],
): boolean {
  if (sub.status === 'cancelled' || sub.status === 'expired') return false;
  if (!isWithin(date, sub.startDate, sub.endDate)) return false;
  return !isPausedOn(date, pauses);
}
