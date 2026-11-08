/** Rate limits for the two endpoints reachable without a token, plus a global cap. */
import rateLimit from 'express-rate-limit';
import { env } from '../env';

const windowMs = env.RATE_WINDOW_MINUTES * 60 * 1000;

const message = (what: string) => ({
  error: { code: 'rate_limited', message: `Too many ${what}. Please try again later.` },
});

/** Brute-force protection on login. */
export const loginLimiter = rateLimit({
  windowMs,
  limit: env.LOGIN_RATE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('login attempts'),
});

/** Public website form — keep spam out of the leads table. */
export const leadsLimiter = rateLimit({
  windowMs,
  limit: env.LEADS_RATE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('submissions'),
});

/** Generous global ceiling so one misbehaving client can't exhaust the API. */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('requests'),
});
