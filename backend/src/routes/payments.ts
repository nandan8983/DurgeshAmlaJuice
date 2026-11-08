/** Payment collection. A rider records what they collect; status moves pending → paid. */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, toNumber } from '../prisma';
import { asyncHandler, badRequest, notFound } from '../errors';
import { validate } from '../middleware/validate';
import { actorOf, authenticate } from '../middleware/auth';
import { and, paymentScope } from '../domain/scope';
import { isDateOnly, rangeInstantRange } from '../domain/dates';
import { loadCustomerInScope } from '../services/access';

export const paymentsRouter = Router();

paymentsRouter.use(authenticate);

const createSchema = z.object({
  customerId: z.string().uuid(),
  subscriptionId: z.string().uuid().optional(),
  amount: z.number().positive().max(1_000_000),
  mode: z.enum(['cash', 'upi', 'other']).default('cash'),
  status: z.enum(['pending', 'paid']).default('paid'),
  notes: z.string().trim().max(500).optional(),
  /** When the money actually changed hands (offline queue sends this). */
  paidAt: z.string().datetime().optional(),
});

const updateSchema = z.object({
  status: z.enum(['pending', 'paid']).optional(),
  mode: z.enum(['cash', 'upi', 'other']).optional(),
  amount: z.number().positive().max(1_000_000).optional(),
  notes: z.string().trim().max(500).optional(),
});

const listQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(['pending', 'paid']).optional(),
  mode: z.enum(['cash', 'upi', 'other']).optional(),
  collectedById: z.string().uuid().optional(),
  from: z.string().refine(isDateOnly).optional(),
  to: z.string().refine(isDateOnly).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const serialize = (p: {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  amount: unknown;
  mode: string;
  status: string;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
  customer?: { name: string } | null;
  collectedBy?: { id: string; name: string } | null;
}) => ({
  id: p.id,
  customerId: p.customerId,
  customerName: p.customer?.name ?? null,
  subscriptionId: p.subscriptionId,
  amount: toNumber(p.amount),
  mode: p.mode,
  status: p.status,
  paidAt: p.paidAt,
  notes: p.notes,
  createdAt: p.createdAt,
  collectedById: p.collectedBy?.id ?? null,
  collectedByName: p.collectedBy?.name ?? null,
});

paymentsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;

    const where = and(
      paymentScope(actor),
      q.customerId ? { customerId: q.customerId } : undefined,
      q.status ? { status: q.status } : undefined,
      q.mode ? { mode: q.mode } : undefined,
      q.collectedById ? { collectedById: q.collectedById } : undefined,
      q.from || q.to
        ? { paidAt: rangeInstantRange(q.from ?? q.to!, q.to ?? q.from!) }
        : undefined,
    );

    const [rows, total, sums] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        skip: q.offset,
        include: {
          customer: { select: { name: true } },
          collectedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({ by: ['status'], where, _sum: { amount: true } }),
    ]);

    res.json({
      payments: rows.map(serialize),
      total,
      totals: Object.fromEntries(
        sums.map((s) => [s.status, toNumber(s._sum.amount) ?? 0]),
      ) as Record<string, number>,
    });
  }),
);

paymentsRouter.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as z.infer<typeof createSchema>;

    await loadCustomerInScope(actor, body.customerId);

    if (body.subscriptionId) {
      const sub = await prisma.subscription.findFirst({
        where: { id: body.subscriptionId, customerId: body.customerId },
        select: { id: true },
      });
      if (!sub) throw badRequest('That subscription does not belong to this customer');
    }

    const paid = body.status === 'paid';
    const payment = await prisma.payment.create({
      data: {
        customerId: body.customerId,
        subscriptionId: body.subscriptionId ?? null,
        amount: body.amount,
        mode: body.mode,
        status: body.status,
        paidAt: paid ? (body.paidAt ? new Date(body.paidAt) : new Date()) : null,
        collectedById: paid ? actor.id : null,
        notes: body.notes ?? null,
      },
      include: {
        customer: { select: { name: true } },
        collectedBy: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ payment: serialize(payment) });
  }),
);

/** Settle an existing pending payment (the row created with the subscription). */
paymentsRouter.patch(
  '/:id',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof updateSchema>;

    const existing = await prisma.payment.findFirst({
      where: and({ id }, paymentScope(actor)),
      select: { id: true, status: true },
    });
    if (!existing) throw notFound('Payment not found');

    const becomingPaid = body.status === 'paid' && existing.status !== 'paid';

    const payment = await prisma.payment.update({
      where: { id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.mode !== undefined ? { mode: body.mode } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(becomingPaid ? { paidAt: new Date(), collectedById: actor.id } : {}),
        ...(body.status === 'pending' ? { paidAt: null, collectedById: null } : {}),
      },
      include: {
        customer: { select: { name: true } },
        collectedBy: { select: { id: true, name: true } },
      },
    });

    res.json({ payment: serialize(payment) });
  }),
);
