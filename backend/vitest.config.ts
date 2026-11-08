import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // No-ops unless TEST_DATABASE_URL is set.
    globalSetup: ['tests/integration/globalSetup.ts'],
    // The integration suite waits on a real database and Prisma's engine start.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration tests share one database, so they must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
