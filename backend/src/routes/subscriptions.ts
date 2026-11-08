/**
 * Subscriptions, pause and resume.
 *
 * Creating a subscription snapshots the plan's product, duration, price and the
 * customer's bottles/day, so later price edits never change money already owed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, toNumber } from '../prisma';
import { asyncHandler, badRequest, conflict, notFound } from '../errors';
import { validate } from '../middleware/validate';
import { actorOf, authenticate } from '../middleware/auth';
import { and, subscriptionScope } from '../domain/scope';
import { addDays, isDateOnly, toDateOnly, toUtcDate, today } from '../domain/dates';
import { subscriptionAmount, subscriptionEndDate } from '../domain/pricing';
import { applyResume } from '../domain/pause';
import { productForDate, type ProductKind } from '../domain/combo';
import { loadCustomerInScope, loadSubscriptionInScope } from '../services/access';
import { logger } from '../logger';

export const subscriptionsRouter = Router();

subscriptionsRouter.use(authenticate);

const dateOnlyField = z.string().refine(isDateOnly, 'Expected a YYYY-MM-DD date');

const createSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
  startDate: dateOnlyField.optional(),
  /** Overrides the customer's bottles/day for this subscription only. */
  bottlesPerDay: z.number().int().min(1).max(50).optional(),
  /** Start the day after the customer's current plan ends instead of today. */
  renew: z.boolean().default(false),
  payment: z
    .object({
      mode: z.enum(['cash', 'upi', 'other']).default('cash'),
      status: z.enum(['pending', 'paid']).default('pending'),
      amount: z.number().nonnegative().optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .optional(),
});

const pauseSchema = z.object({
  from: dateOnlyField.optional(),
  reason: z.string().trim().max(300).optional(),
});

const resumeSchema = z.object({
  resumedOn: dateOnlyField.optional(),
});

const listQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(['active', 'paused', 'expired', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const serialize = (sub: {
  id: string;
  customerId: string;
  planId: string;
  product: string;
  status: string;
  durationDays: number;
  bottlesPerDay: number;
  amount: unknown;
  startDate: Date;
  endDate: Date;
  pausedDays: number;
}) => ({
  id: sub.id,
  customerId: sub.customerId,
  planId: sub.planId,
  product: sub.product,
  status: sub.status,
  durationDays: sub.durationDays,
  bottlesPerDay: sub.bottlesPerDay,
  amount: toNumber(sub.amount),
  startDate: toDateOnly(sub.startDate),
  endDate: toDateOnly(sub.endDate),
  pausedDays: sub.pausedDays,
});

subscriptionsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;

    const where = and(
      subscriptionScope(actor),
      q.customerId ? { customerId: q.customerId } : undefined,
      q.status ? { status: q.status } : undefined,
    );

    const [rows, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: q.limit,
        skip: q.offset,
        include: { customer: { select: { name: true, riderId: true } } },
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({
      subscriptions: rows.map((r) => ({
        ...serialize(r),
        customerName: r.customer.name,
        riderId: r.customer.riderId,
      })),
      total,
    });
  }),
);

subscriptionsRouter.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as z.infer<typeof createSchema>;

    const customer = await loadCustomerInScope(actor, body.customerId);
    const plan = await prisma.plan.findFirst({ where: { id: body.planId, isActive: true } });
    if (!plan) throw notFound('Plan not found or inactive');

    const current = await prisma.subscription.findFirst({
      where: { customerId: customer.id, status: { in: ['active', 'paused'] } },
      orderBy: { endDate: 'desc' },
    });

    const asOf = today();
    let startDate = body.startDate ?? asOf;

    if (current) {
      const currentEnd = toDateOnly(current.endDate);
      if (body.renew) {
        // Queue the new plan to begin the morning after the current one ends.
        startDate = addDays(currentEnd > asOf ? currentEnd : asOf, 1);
      } else if (startDate <= currentEnd) {
        throw conflict(
          `This customer already has a plan running until ${currentEnd}. Pass renew: true to queue the next plan, or a startDate after it.`,
          { currentSubscriptionId: current.id, currentEndDate: currentEnd },
        );
      }
    }

    const bottlesPerDay = body.bottlesPerDay ?? customer.bottlesPerDay;
    const planPrice = toNumber(plan.price) ?? 0;
    const amount = subscriptionAmount(planPrice, bottlesPerDay);
    const endDate = subscriptionEndDate(startDate, plan.durationDays);

    const subscription = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          customerId: customer.id,
          planId: plan.id,
          product: plan.product,
          durationDays: plan.durationDays,
          bottlesPerDay,
          amount,
          startDate: toUtcDate(startDate),
          endDate: toUtcDate(endDate),
          status: 'active',
          createdById: actor.id,
        },
      });

      // Prepaid business: every subscription gets a payment row, pending until
      // the rider or admin records the collection.
      await tx.payment.create({
        data: {
          customerId: customer.id,
          subscriptionId: sub.id,
          amount: body.payment?.amount ?? amount,
          mode: body.payment?.mode ?? 'cash',
          status: body.payment?.status ?? 'pending',
          paidAt: body.payment?.status === 'paid' ? new Date() : null,
          collectedById: body.payment?.status === 'paid' ? actor.id : null,
          notes: body.payment?.notes ?? null,
        },
      });

      // A customer signed up at the door should get their bottle the same
      // morning, after the day's route was already generated.
      if (startDate === asOf && customer.status === 'active') {
        const product = productForDate(plan.product as ProductKind, startDate, asOf, []);
        if (product) {
          await tx.delivery.createMany({
            data: [
              {
                customerId: customer.id,
                subscriptionId: sub.id,
                riderId: customer.riderId,
                deliveryDate: toUtcDate(asOf),
                product,
                qty: bottlesPerDay,
              },
            ],
            skipDuplicates: true,
          });
        }
      }

      return sub;
    });

    logger.info(
      { subscriptionId: subscription.id, planId: plan.id, startDate, endDate },
      'Subscription created',
    );
    res.status(201).json({ subscription: serialize(subscription) });
  }),
);

/** Pause: the customer is skipped from the daily route from `from` onwards. */
subscriptionsRouter.post(
  '/:id/pause',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(pauseSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof pauseSchema>;

    const sub = await loadSubscriptionInScope(actor, id);
    if (sub.status !== 'active') throw badRequest(`Cannot pause a ${sub.status} subscription`);

    const from = body.from ?? today();
    if (from < toDateOnly(sub.startDate)) throw badRequest('Cannot pause before the start date');
    if (from > toDateOnly(sub.endDate)) throw badRequest('Cannot pause after the end date');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.subscriptionPause.create({
        data: {
          subscriptionId: sub.id,
          pausedFrom: toUtcDate(from),
          reason: body.reason ?? null,
          pausedById: actor.id,
        },
      });
      // Drop any pending stop on or after the pause date.
      await tx.delivery.deleteMany({
        where: { customerId: sub.customerId, status: 'pending', deliveryDate: { gte: toUtcDate(from) } },
      });
      return tx.subscription.update({ where: { id: sub.id }, data: { status: 'paused' } });
    });

    res.json({ subscription: serialize(updated), pausedFrom: from });
  }),
);

/**
 * Resume. The end-date extension lives in `domain/pause.applyResume` — the one
 * place to change if paused days should be forfeited instead.
 */
subscriptionsRouter.post(
  '/:id/resume',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(resumeSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof resumeSchema>;

    const sub = await loadSubscriptionInScope(actor, id);
    if (sub.status !== 'paused') throw badRequest(`This subscription is ${sub.status}, not paused`);

    const openPause = sub.pauses.find((p) => p.resumedOn === null);
    if (!openPause) throw badRequest('No open pause found for this subscription');

    const resumedOn = body.resumedOn ?? today();
    const pausedFrom = toDateOnly(openPause.pausedFrom);
    if (resumedOn < pausedFrom) throw badRequest('resumedOn cannot be before the pause date');

    const outcome = applyResume(
      { endDate: toDateOnly(sub.endDate), pausedDays: sub.pausedDays },
      { pausedFrom, resumedOn },
    );

    const updated = await prisma.$transaction(async (tx) => {
      await tx.subscriptionPause.update({
        where: { id: openPause.id },
        data: {
          resumedOn: toUtcDate(resumedOn),
          pausedDays: outcome.pausedDays,
          resumedById: actor.id,
        },
      });
      return tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: outcome.endDate < today() ? 'expired' : 'active',
          endDate: toUtcDate(outcome.endDate),
          pausedDays: outcome.totalPausedDays,
        },
      });
    });

    res.json({
      subscription: serialize(updated),
      pausedDays: outcome.pausedDays,
      newEndDate: outcome.endDate,
    });
  }),
);

/** Cancel a subscription outright (admin or supervisor; no refund handling yet). */
subscriptionsRouter.post(
  '/:id/cancel',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const sub = await loadSubscriptionInScope(actor, id);
    if (sub.status === 'cancelled') throw badRequest('Already cancelled');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.delivery.deleteMany({
        where: { subscriptionId: sub.id, status: 'pending' },
      });
      return tx.subscription.update({ where: { id: sub.id }, data: { status: 'cancelled' } });
    });

    res.json({ subscription: serialize(updated) });
  }),
);
