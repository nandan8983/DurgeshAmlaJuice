/** Zod request validation. Parsed values replace the raw ones. */
import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

type Part = 'body' | 'query' | 'params';

export function validate<S extends ZodTypeAny>(schema: S, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) return next(result.error);
    // Express 4 lets us replace these; keeps downstream handlers on parsed data.
    Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true });
    next();
  };
}

export type Infer<S extends ZodTypeAny> = z.infer<S>;
