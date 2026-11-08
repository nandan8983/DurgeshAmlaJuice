/**
 * Row-level access control.
 *
 * Every list/read query goes through one of these `where` fragments, so scoping
 * lives in one file instead of being re-derived (and eventually forgotten) in
 * each route:
 *
 *   admin      → everything
 *   supervisor → rows whose rider's `supervisorId` is the supervisor
 *   rider      → rows whose `riderId` is the rider
 */
import type { Prisma } from '@prisma/client';

export type Role = 'admin' | 'supervisor' | 'rider';

export interface Actor {
  id: string;
  role: Role;
}

/** Customers this actor may see. */
export function customerScope(actor: Actor): Prisma.CustomerWhereInput {
  switch (actor.role) {
    case 'admin':
      return {};
    case 'supervisor':
      return { rider: { supervisorId: actor.id } };
    case 'rider':
      return { riderId: actor.id };
  }
}

/** Deliveries this actor may see. */
export function deliveryScope(actor: Actor): Prisma.DeliveryWhereInput {
  switch (actor.role) {
    case 'admin':
      return {};
    case 'supervisor':
      return { rider: { supervisorId: actor.id } };
    case 'rider':
      return { riderId: actor.id };
  }
}

/** Subscriptions this actor may see (scoped through the customer's rider). */
export function subscriptionScope(actor: Actor): Prisma.SubscriptionWhereInput {
  if (actor.role === 'admin') return {};
  return { customer: customerScope(actor) };
}

/** Payments this actor may see. */
export function paymentScope(actor: Actor): Prisma.PaymentWhereInput {
  if (actor.role === 'admin') return {};
  return { customer: customerScope(actor) };
}

/** Rider accounts this actor may see or assign work to. */
export function riderScope(actor: Actor): Prisma.UserWhereInput {
  switch (actor.role) {
    case 'admin':
      return { role: 'rider' };
    case 'supervisor':
      return { role: 'rider', supervisorId: actor.id };
    case 'rider':
      return { role: 'rider', id: actor.id };
  }
}

/** Users this actor may manage. Supervisors manage only their own riders. */
export function manageableUserScope(actor: Actor): Prisma.UserWhereInput {
  switch (actor.role) {
    case 'admin':
      return {};
    case 'supervisor':
      return { role: 'rider', supervisorId: actor.id };
    case 'rider':
      return { id: actor.id };
  }
}

/** Combine a scope fragment with request filters without either overwriting the other. */
export function and<T extends object>(...parts: Array<T | undefined>): T {
  const clauses = parts.filter((p): p is T => p !== undefined && Object.keys(p).length > 0);
  if (clauses.length === 0) return {} as T;
  if (clauses.length === 1) return clauses[0] as T;
  return { AND: clauses } as unknown as T;
}
