/**
 * Pause / resume policy — deliberately the only place that decides what a
 * pause costs the customer.
 *
 * Current policy (an assumption, stated in the brief): resuming extends the
 * subscription end date by the number of days the customer was actually
 * skipped, so a prepaid customer never loses bottles they paid for.
 *
 * To switch to "paused days are forfeited", change `RESUME_POLICY` to
 * 'forfeit' — nothing else in the codebase needs to move.
 */
import { addDays, diffDays, type DateOnly } from './dates';

export type ResumePolicy = 'extend-end-date' | 'forfeit';

export const RESUME_POLICY: ResumePolicy = 'extend-end-date';

export interface PauseSpec {
  /** First day the customer is skipped. */
  pausedFrom: DateOnly;
  /** First day the customer is delivered to again. */
  resumedOn: DateOnly;
}

export interface ResumeResult {
  /** Days actually skipped by this pause. */
  pausedDays: number;
  /** End date after applying the policy. */
  endDate: DateOnly;
  /** Running total of paused days on the subscription. */
  totalPausedDays: number;
}

/**
 * Days skipped by a pause: `resumedOn - pausedFrom`. Pausing and resuming on
 * the same day skips nothing, because delivery resumes that morning.
 */
export function pausedDayCount(spec: PauseSpec): number {
  const days = diffDays(spec.pausedFrom, spec.resumedOn);
  if (days < 0) throw new RangeError('resumedOn must not be before pausedFrom');
  return days;
}

/**
 * Apply the resume policy to a subscription.
 *
 * `currentEndDate` / `currentPausedDays` are the subscription's values before
 * the resume; the result is what they become.
 */
export function applyResume(
  subscription: { endDate: DateOnly; pausedDays: number },
  spec: PauseSpec,
  policy: ResumePolicy = RESUME_POLICY,
): ResumeResult {
  const pausedDays = pausedDayCount(spec);
  const totalPausedDays = subscription.pausedDays + pausedDays;
  const endDate =
    policy === 'extend-end-date' ? addDays(subscription.endDate, pausedDays) : subscription.endDate;
  return { pausedDays, endDate, totalPausedDays };
}
