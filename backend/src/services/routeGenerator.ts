/**
 * Daily route generation — the database half. The decision of who gets what
 * lives in `domain/route.planRoute`, which is tested directly.
 *
 * Each morning every customer who is active, has a subscription covering today,
 * and is not paused today gets exactly one `deliveries` row. The unique index on
 * (customer_id, delivery_date) makes the job idempotent, so the cron run and the
 * "generate on first request of the day" fallback can both fire harmlessly.
 */
import { prisma } from '../prisma';
import { logger } from '../logger';
import { toDateOnly, toUtcDate, today, type DateOnly } from '../domain/dates';
import type { PauseWindow, ProductKind } from '../domain/combo';
import { planRoute, type RouteCandidate } from '../domain/route';

export interface GenerationResult {
  date: DateOnly;
  created: number;
  alreadyPresent: number;
  skippedPaused: number;
  withoutCoordinates: number;
  expiredSubscriptions: number;
}

/**
 * Mark subscriptions whose end date has passed as expired, so they drop out of
 * the route by themselves. Runs before generation.
 */
export async function expireFinishedSubscriptions(date: DateOnly = today()): Promise<number> {
  const result = await prisma.subscription.updateMany({
    where: { status: { in: ['active', 'paused'] }, endDate: { lt: toUtcDate(date) } },
    data: { status: 'expired' },
  });
  return result.count;
}

/** Build (or top up) the delivery rows for one calendar date. */
export async function generateRouteForDate(date: DateOnly = today()): Promise<GenerationResult> {
  const expiredSubscriptions = await expireFinishedSubscriptions(date);
  const target = toUtcDate(date);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['active', 'paused'] },
      startDate: { lte: target },
      endDate: { gte: target },
    },
    select: {
      id: true,
      product: true,
      status: true,
      startDate: true,
      endDate: true,
      bottlesPerDay: true,
      customerId: true,
      customer: { select: { status: true, riderId: true, latitude: true, longitude: true } },
      pauses: { select: { pausedFrom: true, resumedOn: true } },
    },
  });

  const existing = await prisma.delivery.findMany({
    where: { deliveryDate: target },
    select: { customerId: true },
  });

  const candidates: RouteCandidate[] = subscriptions.map((sub) => ({
    subscriptionId: sub.id,
    customerId: sub.customerId,
    riderId: sub.customer.riderId,
    customerStatus: sub.customer.status,
    subscriptionStatus: sub.status,
    product: sub.product as ProductKind,
    startDate: toDateOnly(sub.startDate),
    endDate: toDateOnly(sub.endDate),
    bottlesPerDay: sub.bottlesPerDay,
    pauses: sub.pauses.map(
      (p): PauseWindow => ({
        pausedFrom: toDateOnly(p.pausedFrom),
        resumedOn: p.resumedOn ? toDateOnly(p.resumedOn) : null,
      }),
    ),
    hasCoordinates: sub.customer.latitude !== null && sub.customer.longitude !== null,
  }));

  const plan = planRoute(date, candidates, new Set(existing.map((d) => d.customerId)));

  const created =
    plan.rows.length > 0
      ? (
          await prisma.delivery.createMany({
            data: plan.rows.map((row) => ({ ...row, deliveryDate: target })),
            skipDuplicates: true,
          })
        ).count
      : 0;

  const result: GenerationResult = {
    date,
    created,
    alreadyPresent: plan.alreadyPresent,
    skippedPaused: plan.skippedPaused,
    withoutCoordinates: plan.withoutCoordinates,
    expiredSubscriptions,
  };
  logger.info(result, 'Route generated');
  return result;
}

/**
 * Fallback used by `GET /route/today`: if nothing has been generated for the
 * date yet, generate it now. Cheap (one count) on every later request of the day.
 */
export async function ensureRouteGenerated(date: DateOnly = today()): Promise<boolean> {
  const count = await prisma.delivery.count({ where: { deliveryDate: toUtcDate(date) } });
  if (count > 0) return false;
  await generateRouteForDate(date);
  return true;
}
