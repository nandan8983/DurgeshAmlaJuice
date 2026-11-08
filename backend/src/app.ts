import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env, corsOrigins, isProduction } from './env';
import { logger } from './logger';
import { errorHandler, notFoundHandler } from './errors';
import { globalLimiter } from './middleware/rateLimit';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { plansRouter } from './routes/plans';
import { customersRouter } from './routes/customers';
import { subscriptionsRouter } from './routes/subscriptions';
import { routeRouter } from './routes/route';
import { deliveriesRouter } from './routes/deliveries';
import { paymentsRouter } from './routes/payments';
import { leadsRouter, publicLeadsRouter } from './routes/leads';
import { reportsRouter } from './routes/reports';

export function createApp(): Express {
  const app = express();

  // Cloudflare Tunnel / Render sit in front of us; without this the rate
  // limiters would see the proxy's IP for every client.
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // No Origin header: server-to-server, curl, or the mobile app.
        if (!origin) return callback(null, true);
        if (corsOrigins.includes(origin) || corsOrigins.includes('*')) return callback(null, true);
        // Refuse by withholding the CORS headers rather than raising an error:
        // the browser blocks the response either way, and this keeps a probe
        // from being logged as a 500.
        logger.warn({ origin }, 'Blocked a request from an unlisted origin');
        callback(null, false);
      },
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(
    pinoHttp({
      logger,
      // Bodies can hold phone numbers and addresses — never log them.
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(globalLimiter);

  if (isProduction) {
    // Behind HTTPS termination: tell browsers never to come back over http.
    app.use((_req, res, next) => {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, env: env.NODE_ENV, time: new Date().toISOString() });
  });

  app.use('/auth', authRouter);
  app.use('/users', usersRouter);
  app.use('/plans', plansRouter);
  app.use('/customers', customersRouter);
  app.use('/subscriptions', subscriptionsRouter);
  app.use('/route', routeRouter);
  app.use('/deliveries', deliveriesRouter);
  app.use('/payments', paymentsRouter);
  // Order matters: the public router only answers POST /leads, everything else
  // under /leads falls through to the authenticated router.
  app.use('/leads', publicLeadsRouter);
  app.use('/leads', leadsRouter);
  app.use('/admin/reports', reportsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
