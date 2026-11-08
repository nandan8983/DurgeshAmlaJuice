/**
 * Scheduled jobs. Both are safe to run twice, so a restart or an overlapping
 * manual trigger can't corrupt a day.
 */
import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../env';
import { logger } from '../logger';
import { today } from '../domain/dates';
import { expireFinishedSubscriptions, generateRouteForDate } from '../services/routeGenerator';
import { reportRenewalsDue } from '../services/renewals';

const tasks: ScheduledTask[] = [];

export function startCronJobs(): void {
  if (!env.ENABLE_CRON) {
    logger.info('Cron jobs disabled (ENABLE_CRON=false)');
    return;
  }

  // Morning: build today's route, then flag renewals for the riders.
  tasks.push(
    cron.schedule(
      env.ROUTE_CRON,
      () => {
        void (async () => {
          try {
            await generateRouteForDate(today());
            await reportRenewalsDue();
          } catch (err) {
            logger.error({ err }, 'Daily route generation failed');
          }
        })();
      },
      { timezone: env.TZ_BUSINESS },
    ),
  );

  // Overnight: retire subscriptions that ended yesterday.
  tasks.push(
    cron.schedule(
      env.EXPIRY_CRON,
      () => {
        void (async () => {
          try {
            const count = await expireFinishedSubscriptions(today());
            logger.info({ count }, 'Subscriptions expired');
          } catch (err) {
            logger.error({ err }, 'Subscription expiry failed');
          }
        })();
      },
      { timezone: env.TZ_BUSINESS },
    ),
  );

  logger.info(
    { routeCron: env.ROUTE_CRON, expiryCron: env.EXPIRY_CRON, timezone: env.TZ_BUSINESS },
    'Cron jobs scheduled',
  );
}

export function stopCronJobs(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
