/**
 * Guarded loads. A route never fetches a row by id alone — it fetches it
 * through the actor's scope, so "not mine" is indistinguishable from
 * "doesn't exist" and no id can be probed.
 */
import { prisma } from '../prisma';
import { forbidden, notFound } from '../errors';
import { and, customerScope, subscriptionScope, type Actor } from '../domain/scope';

export async function loadCustomerInScope(actor: Actor, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: and({ id: customerId }, customerScope(actor)),
  });
  if (!customer) throw notFound('Customer not found');
  return customer;
}

export async function loadSubscriptionInScope(actor: Actor, subscriptionId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: and({ id: subscriptionId }, subscriptionScope(actor)),
    include: { pauses: true, customer: { select: { id: true, riderId: true, name: true } } },
  });
  if (!subscription) throw notFound('Subscription not found');
  return subscription;
}

/**
 * May this actor put work on this rider?
 *   admin      → any active rider
 *   supervisor → only riders under them
 *   rider      → only themselves
 */
export async function assertCanAssignToRider(actor: Actor, riderId: string): Promise<void> {
  if (actor.role === 'rider') {
    if (riderId !== actor.id) throw forbidden('A rider can only take their own customers');
    return;
  }

  const rider = await prisma.user.findFirst({
    where: { id: riderId, role: 'rider' },
    select: { id: true, isActive: true, supervisorId: true },
  });
  if (!rider) throw notFound('Rider not found');
  if (!rider.isActive) throw forbidden('That rider account is deactivated');
  if (actor.role === 'supervisor' && rider.supervisorId !== actor.id) {
    throw forbidden('That rider is not under you');
  }
}
