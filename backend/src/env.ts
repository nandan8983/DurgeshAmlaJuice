/** Validated configuration. Nothing in the app reads process.env directly. */
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(10),

  /** Comma-separated list of allowed browser origins (admin-web). */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  /** Business timezone — all "today" decisions use it. */
  TZ_BUSINESS: z.string().default('Asia/Kolkata'),

  /** Flag a subscription to rider and admin when this many days remain. */
  RENEWAL_ALERT_DAYS: z.coerce.number().int().min(0).max(30).default(2),

  /** Daily route generation. Cron is in TZ_BUSINESS; default 04:30 local. */
  ENABLE_CRON: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  ROUTE_CRON: z.string().default('30 4 * * *'),
  EXPIRY_CRON: z.string().default('0 1 * * *'),

  /** Rate limits. */
  LOGIN_RATE_MAX: z.coerce.number().int().positive().default(10),
  LEADS_RATE_MAX: z.coerce.number().int().positive().default(5),
  RATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Behind Cloudflare Tunnel / Render, trust the proxy for client IPs. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  // Fail fast and loudly: a half-configured server is worse than no server.
  console.error(`Invalid environment configuration:\n${issues.join('\n')}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
