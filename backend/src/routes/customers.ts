/**
 * Customers. A rider creates them at the door with the four mandatory fields
 * (name, mobile, bottles/day, status) and the GPS pin from the phone; the admin
 * fills in the rest later.
 */
import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma, toNumber } from '../prisma';
import { asyncHandler, forbidden, notFound } from '../errors';
import { validate } from '../middleware/validate';
import { actorOf, authenticate, requireStaff } from '../middleware/auth';
import { and, customerScope } from '../domain/scope';
import { diffDays, toDateOnly, today } from '../domain/dates';
import { assertCanAssignToRider, loadCustomerInScope } from '../services/access';
import { env } from '../env';

export const customersRouter = Router();

customersRouter.use(authenticate);

const mobileField = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s]{6,20}$/, 'Enter a valid mobile number');

const latitudeField = z.number().min(-90).max(90);
const longitudeField = z.number().min(-180).max(180);

const createCustomerSchema = z.object({
  // Mandatory
  name: z.string().trim().min(2).max(120),
  mobile: mobileField,
  bottlesPerDay: z.number().int().min(1).max(50).default(1),
  status: z.enum(['active', 'inactive']).default('active'),
  // Optional
  area: z.string().trim().max(120).optional(),
  address: z.string().trim().max(400).optional(),
  landmark: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
  latitude: latitudeField.optional(),
  longitude: longitudeField.optional(),
  /** Admin/supervisor may assign; a rider always gets themselves. */
  riderId: z.string().uuid().optional(),
});

const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    mobile: mobileField.optional(),
    bottlesPerDay: z.number().int().min(1).max(50).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    area: z.string().trim().max(120).nullable().optional(),
    address: z.string().trim().max(400).nullable().optional(),
    landmark: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    latitude: latitudeField.nullable().optional(),
    longitude: longitudeField.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const listQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  riderId: z.string().uuid().optional(),
  area: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  /** Only customers whose plan ends within RENEWAL_ALERT_DAYS. */
  renewalDue: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const customerSelect = {
  id: true,
  name: true,
  mobile: true,
  bottlesPerDay: true,
  status: true,
  area: true,
  address: true,
  landmark: true,
  city: true,
  notes: true,
  latitude: true,
  longitude: true,
  riderId: true,
  createdAt: true,
  rider: { select: { id: true, name: true, supervisorId: true } },
  subscriptions: {
    where: { status: { in: ['active', 'paused'] } },
    orderBy: { endDate: 'desc' },
    take: 1,
    select: {
      id: true,
      product: true,
      status: true,
      startDate: true,
      endDate: true,
      amount: true,
      bottlesPerDay: true,
      plan: { select: { id: true, name: true, durationDays: true } },
    },
  },
} satisfies Prisma.CustomerSelect;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;

export function serializeCustomer(row: CustomerRow, asOf = today()) {
  const sub = row.subscriptions[0];
  const endDate = sub ? toDateOnly(sub.endDate) : null;
  const daysLeft = endDate ? diffDays(asOf, endDate) : null;
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    bottlesPerDay: row.bottlesPerDay,
    status: row.status,
    area: row.area,
    address: row.address,
    landmark: row.landmark,
    city: row.city,
    notes: row.notes,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    riderId: row.riderId,
    riderName: row.rider.name,
    createdAt: row.createdAt,
    subscription: sub
      ? {
          id: sub.id,
          product: sub.product,
          status: sub.status,
          planName: sub.plan.name,
          startDate: toDateOnly(sub.startDate),
          endDate,
          daysLeft,
          amount: toNumber(sub.amount),
          bottlesPerDay: sub.bottlesPerDay,
        }
      : null,
    renewalDue: daysLeft !== null && daysLeft <= env.RENEWAL_ALERT_DAYS && daysLeft >= 0,
  };
}

customersRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const asOf = today();

    const where = and(
      customerScope(actor),
      q.status ? { status: q.status } : undefined,
      q.riderId ? { riderId: q.riderId } : undefined,
      q.area ? { area: { contains: q.area, mode: 'insensitive' as const } } : undefined,
      q.city ? { city: { equals: q.city, mode: 'insensitive' as const } } : undefined,
      q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' as const } },
              { mobile: { contains: q.search } },
            ],
          }
        : undefined,
    );

    const [rows, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: customerSelect,
        orderBy: { name: 'asc' },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.customer.count({ where }),
    ]);

    let customers = rows.map((row) => serializeCustomer(row, asOf));
    if (q.renewalDue === 'true') customers = customers.filter((c) => c.renewalDue);

    res.json({ customers, total, limit: q.limit, offset: q.offset });
  }),
);

customersRouter.get(
  '/:id',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };

    const row = await prisma.customer.findFirst({
      where: and({ id }, customerScope(actor)),
      select: customerSelect,
    });
    // 404, not 403: "out of your scope" must look the same as "does not exist",
    // or the status code itself confirms that a customer id is real.
    if (!row) throw notFound('Customer not found');

    const [subscriptions, payments] = await Promise.all([
      prisma.subscription.findMany({
        where: { customerId: id },
        orderBy: { startDate: 'desc' },
        select: {
          id: true,
          product: true,
          status: true,
          startDate: true,
          endDate: true,
          amount: true,
          bottlesPerDay: true,
          pausedDays: true,
          plan: { select: { name: true, durationDays: true } },
        },
      }),
      prisma.payment.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, amount: true, mode: true, status: true, paidAt: true, notes: true },
      }),
    ]);

    res.json({
      customer: serializeCustomer(row),
      subscriptions: subscriptions.map((s) => ({
        ...s,
        startDate: toDateOnly(s.startDate),
        endDate: toDateOnly(s.endDate),
        amount: toNumber(s.amount),
        planName: s.plan.name,
      })),
      payments: payments.map((p) => ({ ...p, amount: toNumber(p.amount) })),
      pendingAmount: payments
        .filter((p) => p.status === 'pending')
        .reduce((sum, p) => sum + (toNumber(p.amount) ?? 0), 0),
    });
  }),
);

customersRouter.post(
  '/',
  validate(createCustomerSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as z.infer<typeof createCustomerSchema>;

    const riderId = actor.role === 'rider' ? actor.id : (body.riderId ?? actor.id);
    if (actor.role !== 'rider' && !body.riderId) {
      throw forbidden('riderId is required when an admin or supervisor adds a customer');
    }
    await assertCanAssignToRider(actor, riderId);

    const row = await prisma.customer.create({
      data: {
        name: body.name,
        mobile: body.mobile,
        bottlesPerDay: body.bottlesPerDay,
        status: body.status,
        area: body.area ?? null,
        address: body.address ?? null,
        landmark: body.landmark ?? null,
        city: body.city ?? 'Shirpur',
        notes: body.notes ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        riderId,
        createdById: actor.id,
      },
      select: customerSelect,
    });

    res.status(201).json({ customer: serializeCustomer(row) });
  }),
);

customersRouter.patch(
  '/:id',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(updateCustomerSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    await loadCustomerInScope(actor, id);

    const row = await prisma.customer.update({
      where: { id },
      data: req.body as z.infer<typeof updateCustomerSchema>,
      select: customerSelect,
    });
    res.json({ customer: serializeCustomer(row) });
  }),
);

/** Reassign a customer to another rider. Admin, or a supervisor within their own team. */
customersRouter.patch(
  '/:id/assign',
  requireStaff,
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(z.object({ riderId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const { riderId } = req.body as { riderId: string };

    await loadCustomerInScope(actor, id);
    await assertCanAssignToRider(actor, riderId);

    // Move today's not-yet-delivered stop to the new rider too, so the route
    // the new rider sees this morning is correct.
    const [row] = await prisma.$transaction([
      prisma.customer.update({ where: { id }, data: { riderId }, select: customerSelect }),
      prisma.delivery.updateMany({
        where: { customerId: id, status: 'pending' },
        data: { riderId },
      }),
    ]);

    res.json({ customer: serializeCustomer(row) });
  }),
);
