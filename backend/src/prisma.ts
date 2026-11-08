import { PrismaClient } from '@prisma/client';
import { env, isProduction } from './env';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: isProduction ? ['warn', 'error'] : ['warn', 'error'],
  datasources: { db: { url: env.DATABASE_URL } },
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database connection closed');
}

/** Prisma Decimal -> number, for JSON responses. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}
