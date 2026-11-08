/** Plan and price management. Everyone can read plans; only an admin can change them. */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, toNumber } from '../prisma';
import { asyncHandler } from '../errors';
import { validate } from '../middleware/validate';
import { authenticate, requireAdmin } from '../middleware/auth';
import { dailyRate } from '../domain/pricing';

export const plansRouter = Router();

plansRouter.use(authenticate);

const upsertPlanSchema = z.object({
  name: z.string().trim().min(2).max(80),
  product: z.enum(['amla', 'beetroot', 'combo']),
  durationDays: z.number().int().positive().max(366),
  price: z.number().nonnegative().max(1_000_000),
  isTrial: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const updatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    price: z.number().nonnegative().max(1_000_000).optional(),
    isTrial: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const serialize = (plan: {
  id: string;
  name: string;
  product: string;
  durationDays: number;
  price: unknown;
  isTrial: boolean;
  isActive: boolean;
}) => {
  const price = toNumber(plan.price) ?? 0;
  return {
    id: plan.id,
    name: plan.name,
    product: plan.product,
    durationDays: plan.durationDays,
    price,
    perDay: dailyRate(price, plan.durationDays),
    isTrial: plan.isTrial,
    isActive: plan.isActive,
  };
};

plansRouter.get(
  '/',
  validate(z.object({ includeInactive: z.enum(['true', 'false']).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const { includeInactive } = req.query as { includeInactive?: 'true' | 'false' };
    const plans = await prisma.plan.findMany({
      where: includeInactive === 'true' ? {} : { isActive: true },
      orderBy: [{ product: 'asc' }, { durationDays: 'asc' }],
    });
    res.json({ plans: plans.map(serialize) });
  }),
);

plansRouter.post(
  '/',
  requireAdmin,
  validate(upsertPlanSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof upsertPlanSchema>;
    const plan = await prisma.plan.create({ data: body });
    res.status(201).json({ plan: serialize(plan) });
  }),
);

plansRouter.patch(
  '/:id',
  requireAdmin,
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(updatePlanSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    // Existing subscriptions keep their snapshotted amount, so a price change
    // only affects subscriptions created from here on.
    const plan = await prisma.plan.update({
      where: { id },
      data: req.body as z.infer<typeof updatePlanSchema>,
    });
    res.json({ plan: serialize(plan) });
  }),
);
