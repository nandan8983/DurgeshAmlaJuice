import { defineConfig } from 'vitest/config';

/**
 * Integration tests: the real HTTP API against a real PostgreSQL.
 *
 * Skipped at runtime unless TEST_DATABASE_URL is set — globalSetup prints a
 * note and the suite reports as skipped rather than failing, so running this
 * without a database is harmless.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globals: false,
    globalSetup: ['tests/integration/globalSetup.ts'],
    // These wait on a real database and on Prisma's engine starting up.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // They share one database, so they must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
