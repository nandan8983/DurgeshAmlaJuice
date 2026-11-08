/**
 * Prepares the integration database: migrate, wipe, seed.
 *
 * Does nothing unless TEST_DATABASE_URL is set, so the unit suite stays fast and
 * database-free. Starting from a known state is what makes the integration
 * tests repeatable — they assert on seeded counts and create records of their
 * own, so leftovers from a previous run would fail them.
 *
 * TEST_DATABASE_URL must point at a throwaway database. It gets truncated.
 */
import { execSync } from 'node:child_process';

export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.log('[integration] TEST_DATABASE_URL not set — integration tests will be skipped');
    return;
  }

  const env = { ...process.env, DATABASE_URL: url };
  // execSync (shell) rather than execFileSync: on Windows npx is a .cmd, which
  // spawnSync refuses to run directly.
  const run = (command: string): void => {
    execSync(command, { env, stdio: 'inherit' });
  };

  console.log('[integration] applying migrations');
  run('npx prisma migrate deploy');

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    console.log('[integration] truncating tables');
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE deliveries, subscription_pauses, payments, subscriptions,
       customers, leads, plans, users RESTART IDENTITY CASCADE`,
    );
  } finally {
    await prisma.$disconnect();
  }

  console.log('[integration] seeding');
  run('npx tsx prisma/seed.ts');
}
