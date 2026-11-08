/**
 * Delivery status updates.
 *
 * `skipped` and `not_home` are not terminal: the stop stays in the rider's
 * pending list so it can be suggested again later in the morning.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, toNumber } from '../prisma';
import { asyncHandler, badRequest, notFound } from '../errors';
import { validate } from '../middleware/validate';
import { actorOf, authenticate } from '../middleware/auth';
import { and, deliveryScope } from '../domain/scope';
import { isDateOnly, toDateOnly, toUtcDate, today } from '../domain/dates';

export const deliveriesRouter = Router();

deliveriesRouter.use(authenticate);

const updateSchema = z
  .object({
    status: z.enum(['pending', 'delivered', 'skipped', 'not_home']).optional(),
    /** Single-day quantity change, e.g. the customer asks for an extra bottle. */
    qty: z.number().int().min(1).max(50).optional(),
    /** Where the rider was when they marked it — audit trail for disputes. */
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    remarks: z.string().trim().max(500).optional(),
    /** Drag-to-front ordering from the rider app. */
    sequence: z.number().int().min(0).max(10_000).optional(),
    /** Set by the offline queue: when the rider actually tapped Delivered. */
    deliveredAt: z.string().datetime().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const listQuerySchema = z.object({
  date: z.string().refine(isDateOnly).optional(),
  from: z.string().refine(isDateOnly).optional(),
  to: z.string().refine(isDateOnly).optional(),
  riderId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(['pending', 'delivered', 'skipped', 'not_home']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

deliveriesRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;

    const dateFilter = q.date
      ? { deliveryDate: toUtcDate(q.date) }
      : q.from || q.to
        ? {
            deliveryDate: {
              ...(q.from ? { gte: toUtcDate(q.from) } : {}),
              ...(q.to ? { lte: toUtcDate(q.to) } : {}),
            },
          }
        : undefined;

    const where = and(
      deliveryScope(actor),
      dateFilter,
      q.riderId ? { riderId: q.riderId } : undefined,
      q.customerId ? { customerId: q.customerId } : undefined,
      q.status ? { status: q.status } : undefined,
    );

    const [rows, total] = await Promise.all([
      prisma.delivery.findMany({
        where,
        orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'asc' }],
        take: q.limit,
        skip: q.offset,
        include: {
          customer: { select: { id: true, name: true, area: true } },
          rider: { select: { id: true, name: true } },
        },
      }),
      prisma.delivery.count({ where }),
    ]);

    res.json({
      deliveries: rows.map((d) => ({
        id: d.id,
        deliveryDate: toDateOnly(d.deliveryDate),
        status: d.status,
        product: d.product,
        qty: d.qty,
        deliveredAt: d.deliveredAt,
        remarks: d.remarks,
        latitude: toNumber(d.latitude),
        longitude: toNumber(d.longitude),
        customerId: d.customer.id,
        customerName: d.customer.name,
        area: d.customer.area,
        riderId: d.rider.id,
        riderName: d.rider.name,
      })),
      total,
    });
  }),
);

deliveriesRouter.patch(
  '/:id',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof updateSchema>;

    const existing = await prisma.delivery.findFirst({
      where: and({ id }, deliveryScope(actor)),
      select: { id: true, status: true, deliveryDate: true },
    });
    if (!existing) throw notFound('Delivery not found');

    // Riders may only change today's stops; corrections to earlier days go
    // through an admin, so yesterday's numbers can't move unnoticed.
    if (actor.role === 'rider' && toDateOnly(existing.deliveryDate) !== today()) {
      throw badRequest('Riders can only update today’s deliveries');
    }

    const markingDelivered = body.status === 'delivered';

    const delivery = await prisma.delivery.update({
      where: { id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.qty !== undefined ? { qty: body.qty } : {}),
        ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
        ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
        ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
        ...(body.sequence !== undefined ? { sequence: body.sequence } : {}),
        ...(markingDelivered
          ? { deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : new Date() }
          : {}),
        ...(body.status !== undefined && body.status !== 'delivered' ? { deliveredAt: null } : {}),
        updatedById: actor.id,
      },
      include: { customer: { select: { id: true, name: true } } },
    });

    res.json({
      delivery: {
        id: delivery.id,
        deliveryDate: toDateOnly(delivery.deliveryDate),
        status: delivery.status,
        product: delivery.product,
        qty: delivery.qty,
        deliveredAt: delivery.deliveredAt,
        remarks: delivery.remarks,
        sequence: delivery.sequence,
        customerId: delivery.customer.id,
        customerName: delivery.customer.name,
      },
    });
  }),
);

/**
 * Bulk endpoint for the rider app's offline queue: send everything that piled
 * up while the signal was gone. Each item is applied independently so one bad
 * row can't lose the rest, and the response says what happened to each.
 */
const syncSchema = z.object({
  updates: z
    .array(
      z.object({
        deliveryId: z.string().uuid(),
        status: z.enum(['pending', 'delivered', 'skipped', 'not_home']),
        qty: z.number().int().min(1).max(50).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        remarks: z.string().trim().max(500).optional(),
        /** When the rider tapped it on the phone. */
        occurredAt: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(200),
});

deliveriesRouter.post(
  '/sync',
  validate(syncSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { updates } = req.body as z.infer<typeof syncSchema>;

    const results: Array<{ deliveryId: string; ok: boolean; error?: string }> = [];

    for (const update of updates) {
      try {
        const existing = await prisma.delivery.findFirst({
          where: and({ id: update.deliveryId }, deliveryScope(actor)),
          select: { id: true },
        });
        if (!existing) {
          results.push({ deliveryId: update.deliveryId, ok: false, error: 'not_found' });
          continue;
        }
        await prisma.delivery.update({
          where: { id: update.deliveryId },
          data: {
            status: update.status,
            ...(update.qty !== undefined ? { qty: update.qty } : {}),
            ...(update.latitude !== undefined ? { latitude: update.latitude } : {}),
            ...(update.longitude !== undefined ? { longitude: update.longitude } : {}),
            ...(update.remarks !== undefined ? { remarks: update.remarks } : {}),
            deliveredAt:
              update.status === 'delivered'
                ? update.occurredAt
                  ? new Date(update.occurredAt)
                  : new Date()
                : null,
            updatedById: actor.id,
          },
        });
        results.push({ deliveryId: update.deliveryId, ok: true });
      } catch {
        results.push({ deliveryId: update.deliveryId, ok: false, error: 'update_failed' });
      }
    }

    res.json({
      applied: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  }),
);
