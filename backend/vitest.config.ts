import { defineConfig } from 'vitest/config';

/**
 * Unit tests: the business rules, with no database and no network.
 *
 * The integration suite has its own config (vitest.integration.config.ts) and
 * is excluded here by path rather than by a `--exclude` flag on the command
 * line. A glob in an npm script is expanded by the shell on Linux but not by
 * cmd.exe on Windows, so the same script silently means two different things
 * on a developer's machine and in CI.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/integration/**'],
    environment: 'node',
    globals: false,
  },
});
