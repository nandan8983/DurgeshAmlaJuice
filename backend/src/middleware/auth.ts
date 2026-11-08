/**
 * JWT auth and role gates.
 *
 * The token carries the user id and role; the role is re-read from the database
 * on every request so deactivating a rider or moving them to another supervisor
 * takes effect immediately instead of when their token expires.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../env';
import { forbidden, unauthorized } from '../errors';
import { prisma } from '../prisma';
import type { Role } from '../domain/scope';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  supervisorId: string | null;
}

export interface AuthedRequest extends Request {
  user: AuthUser;
}

interface TokenPayload {
  sub: string;
  role: Role;
}

export function signToken(user: { id: string; role: Role }): string {
  const payload: TokenPayload = { sub: user.id, role: user.role };
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/** Require a valid token for an active user. Populates `req.user`. */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = bearerToken(req);
    if (!token) throw unauthorized('Missing bearer token');

    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    } catch {
      throw unauthorized('Invalid or expired token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, name: true, isActive: true, supervisorId: true },
    });
    if (!user) throw unauthorized('User no longer exists');
    if (!user.isActive) throw forbidden('This account has been deactivated');

    (req as AuthedRequest).user = {
      id: user.id,
      role: user.role,
      name: user.name,
      supervisorId: user.supervisorId,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Allow only the listed roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthedRequest).user;
    if (!user) return next(unauthorized());
    if (!roles.includes(user.role)) {
      return next(forbidden(`This action requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireStaff = requireRole('admin', 'supervisor');

export function actorOf(req: Request): AuthUser {
  const user = (req as AuthedRequest).user;
  if (!user) throw unauthorized();
  return user;
}
