import { createApp } from './app';
import { env } from './env';
import { logger } from './logger';
import { disconnectPrisma, prisma } from './prisma';
import { startCronJobs, stopCronJobs } from './jobs/cron';

async function main(): Promise<void> {
  // Fail at boot rather than on the rider's first request of the morning.
  await prisma.$queryRaw`SELECT 1`;

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
  });

  startCronJobs();

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    stopCronJobs();
    server.close(() => {
      void disconnectPrisma().finally(() => process.exit(0));
    });
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
