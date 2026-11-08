/** Error types and the one place that turns an error into an HTTP response. */
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from './logger';
import { isProduction } from './env';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required'): AppError =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this resource'): AppError =>
  new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found'): AppError =>
  new AppError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown): AppError =>
  new AppError(409, 'conflict', message, details);
export const unprocessable = (message: string, details?: unknown): AppError =>
  new AppError(422, 'unprocessable', message, details);

/** Wrap an async handler so rejections reach the error middleware. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req as T, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'validation_failed',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 unique violation, P2003 FK violation, P2025 record not found.
    if (err.code === 'P2002') {
      res
        .status(409)
        .json({ error: { code: 'conflict', message: 'A record with these values already exists' } });
      return;
    }
    if (err.code === 'P2003') {
      res
        .status(400)
        .json({ error: { code: 'bad_request', message: 'Referenced record does not exist' } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'not_found', message: 'Record not found' } });
      return;
    }
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: isProduction ? 'Something went wrong' : String((err as Error)?.message ?? err),
    },
  });
}
