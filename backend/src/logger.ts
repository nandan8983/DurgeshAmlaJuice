/**
 * Logging with personal data redacted.
 *
 * Customer phone numbers and addresses are personal data and must never reach
 * the logs in plain text, so request/response bodies are not logged at all and
 * the known PII field names are redacted wherever they do appear.
 */
import pino from 'pino';
import { env, isProduction } from './env';

const PII_PATHS = [
  'mobile',
  'phone',
  'address',
  'landmark',
  'latitude',
  'longitude',
  'password',
  'passwordHash',
  'token',
  'authorization',
];

/** `a.b`, `*.a.b`, `*.*.a.b` — pino needs explicit depth for wildcards. */
const redactPaths = PII_PATHS.flatMap((field) => [
  field,
  `*.${field}`,
  `*.*.${field}`,
  `req.headers.${field}`,
  `req.body.${field}`,
  `*.req.body.${field}`,
]);

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: [...new Set(redactPaths)], censor: '[redacted]' },
  transport: isProduction
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});

/** Last 4 digits only, for support ("…ends 4321") without storing PII in logs. */
export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  return digits.length <= 4 ? '****' : `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}
