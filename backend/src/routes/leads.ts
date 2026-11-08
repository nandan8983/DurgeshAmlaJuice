/**
 * Website leads.
 *
 * `POST /leads` is the only endpoint without auth: it is what the public
 * sign-up form on durgeshamlajuice.vercel.app posts to. It is rate limited and
 * strictly validated, and it accepts nothing that could set a price or a rider.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, toNumber } from '../prisma';
import { asyncHandler, badRequest, conflict, notFound } from '../errors';
import { validate } from '../middleware/validate';
import { leadsLimiter } from '../middleware/rateLimit';
import { actorOf, authenticate, requireStaff } from '../middleware/auth';
import { assertCanAssignToRider } from '../services/access';
import { subscriptionAmount, subscriptionEndDate } from '../domain/pricing';
import { isDateOnly, toUtcDate, today } from '../domain/dates';
import { logger, maskMobile } from '../logger';

export const publicLeadsRouter = Router();
export const leadsRouter = Router();

const createLeadSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  mobile: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/, 'Enter a valid mobile number'),
  area: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  planId: z.string().uuid().optional(),
  /** Free text when the form sends a plan label rather than an id. */
  plan: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
  source: z.string().trim().max(40).optional(),
});

publicLeadsRouter.post(
  '/',
  leadsLimiter,
  validate(createLeadSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createLeadSchema>;

    if (body.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
      if (!plan) throw badRequest('Unknown plan');
    }

    const lead = await prisma.lead.create({
      data: {
        fullName: body.fullName,
        mobile: body.mobile,
        area: body.area ?? null,
        city: body.city ?? null,
        planId: body.planId ?? null,
        planText: body.plan ?? null,
        notes: body.notes ?? null,
        source: body.source ?? 'website',
      },
      select: { id: true, createdAt: true },
    });

    logger.info({ leadId: lead.id, mobile: maskMobile(body.mobile) }, 'Lead captured');
    // Deliberately thin response: the public form needs no data back.
    res.status(201).json({ ok: true, id: lead.id });
  }),
);

leadsRouter.use(authenticate, requireStaff);

const listQuerySchema = z.object({
  status: z.enum(['new', 'contacted', 'converted', 'rejected']).optional(),
  search: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

leadsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;

    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { fullName: { contains: q.search, mode: 'insensitive' as const } },
              { mobile: { contains: q.search } },
            ],
          }
        : {}),
    };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        skip: q.offset,
        include: { plan: { select: { id: true, name: true, price: true } } },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      leads: leads.map((l) => ({
        id: l.id,
        fullName: l.fullName,
        mobile: l.mobile,
        area: l.area,
        city: l.city,
        planId: l.planId,
        planName: l.plan?.name ?? l.planText,
        planPrice: l.plan ? toNumber(l.plan.price) : null,
        notes: l.notes,
        status: l.status,
        source: l.source,
        convertedCustomerId: l.convertedCustomerId,
        createdAt: l.createdAt,
      })),
      total,
    });
  }),
);

leadsRouter.patch(
  '/:id',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(z.object({ status: z.enum(['new', 'contacted', 'rejected']) })),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: 'new' | 'contacted' | 'rejected' };
    const lead = await prisma.lead.update({ where: { id }, data: { status } });
    res.json({ lead: { id: lead.id, status: lead.status } });
  }),
);

const convertSchema = z.object({
  riderId: z.string().uuid(),
  bottlesPerDay: z.number().int().min(1).max(50).default(1),
  planId: z.string().uuid().optional(),
  startDate: z.string().refine(isDateOnly).optional(),
  address: z.string().trim().max(400).optional(),
  landmark: z.string().trim().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/**
 * Turn a lead into a customer, assign a rider, and start a subscription when a
 * plan is known. One transaction so a half-converted lead can't exist.
 */
leadsRouter.post(
  '/:id/convert',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(convertSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof convertSchema>;

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw notFound('Lead not found');
    if (lead.status === 'converted') throw conflict('This lead was already converted');

    await assertCanAssignToRider(actor, body.riderId);

    const planId = body.planId ?? lead.planId;
    const plan = planId ? await prisma.plan.findFirst({ where: { id: planId, isActive: true } }) : null;
    if (planId && !plan) throw badRequest('Plan not found or inactive');

    const startDate = body.startDate ?? today();

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: lead.fullName,
          mobile: lead.mobile,
          bottlesPerDay: body.bottlesPerDay,
          status: 'active',
          area: lead.area,
          city: lead.city ?? 'Shirpur',
          address: body.address ?? null,
          landmark: body.landmark ?? null,
          notes: lead.notes,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          riderId: body.riderId,
          createdById: actor.id,
        },
      });

      let subscriptionId: string | null = null;
      if (plan) {
        const planPrice = toNumber(plan.price) ?? 0;
        const amount = subscriptionAmount(planPrice, body.bottlesPerDay);
        const sub = await tx.subscription.create({
          data: {
            customerId: customer.id,
            planId: plan.id,
            product: plan.product,
            durationDays: plan.durationDays,
            bottlesPerDay: body.bottlesPerDay,
            amount,
            startDate: toUtcDate(startDate),
            endDate: toUtcDate(subscriptionEndDate(startDate, plan.durationDays)),
            createdById: actor.id,
          },
        });
        subscriptionId = sub.id;
        await tx.payment.create({
          data: {
            customerId: customer.id,
            subscriptionId: sub.id,
            amount,
            mode: 'cash',
            status: 'pending',
            notes: 'Created from website lead',
          },
        });
      }

      await tx.lead.update({
        where: { id: lead.id },
        data: { status: 'converted', convertedCustomerId: customer.id },
      });

      return { customerId: customer.id, subscriptionId };
    });

    res.status(201).json(result);
  }),
);
