/**
 * Renewal alerts: subscriptions with `RENEWAL_ALERT_DAYS` or fewer days left.
 * Surfaced to the rider on their route and to the admin on the dashboard.
 */
import { prisma } from '../prisma';
import { env } from '../env';
import { logger } from '../logger';
import { addDays, diffDays, toDateOnly, toUtcDate, today, type DateOnly } from '../domain/dates';
import { and, subscriptionScope, type Actor } from '../domain/scope';

export interface RenewalAlert {
  subscriptionId: string;
  customerId: string;
  customerName: string;
  riderId: string;
  riderName: string;
  product: string;
  endDate: DateOnly;
  daysLeft: number;
}

export async function findRenewalsDue(
  actor: Actor,
  options: { date?: DateOnly; thresholdDays?: number } = {},
): Promise<RenewalAlert[]> {
  const date = options.date ?? today();
  const threshold = options.thresholdDays ?? env.RENEWAL_ALERT_DAYS;

  const subscriptions = await prisma.subscription.findMany({
    where: and(
      {
        status: { in: ['active', 'paused'] },
        endDate: { gte: toUtcDate(date), lte: toUtcDate(addDays(date, threshold)) },
      },
      subscriptionScope(actor),
    ),
    select: {
      id: true,
      product: true,
      endDate: true,
      customer: {
        select: { id: true, name: true, riderId: true, rider: { select: { name: true } } },
      },
    },
    orderBy: { endDate: 'asc' },
  });

  return subscriptions.map((sub) => {
    const endDate = toDateOnly(sub.endDate);
    return {
      subscriptionId: sub.id,
      customerId: sub.customer.id,
      customerName: sub.customer.name,
      riderId: sub.customer.riderId,
      riderName: sub.customer.rider.name,
      product: sub.product,
      endDate,
      daysLeft: diffDays(date, endDate),
    };
  });
}

/** Cron hook: log the count so the owner can see it in the server logs. */
export async function reportRenewalsDue(): Promise<number> {
  const alerts = await findRenewalsDue({ id: 'system', role: 'admin' });
  logger.info({ count: alerts.length, thresholdDays: env.RENEWAL_ALERT_DAYS }, 'Renewals due');
  return alerts.length;
}
