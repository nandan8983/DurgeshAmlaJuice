/**
 * The rider's day: `GET /route/today`.
 *
 * Returns every stop for the date with the bottle counters. Stops are sorted
 * nearest-first when the caller sends its GPS fix, but the rider app re-sorts
 * on-device from the live fix after each delivery, so this ordering is only a
 * sensible starting point (and what the admin sees).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, toNumber } from '../prisma';
import { asyncHandler, badRequest } from '../errors';
import { validate } from '../middleware/validate';
import { actorOf, authenticate } from '../middleware/auth';
import { and, deliveryScope } from '../domain/scope';
import { diffDays, isDateOnly, toDateOnly, toUtcDate, today } from '../domain/dates';
import { sortByDistance, type Coords } from '../domain/geo';
import { ensureRouteGenerated } from '../services/routeGenerator';
import { env } from '../env';

export const routeRouter = Router();

routeRouter.use(authenticate);

const querySchema = z.object({
  date: z.string().refine(isDateOnly, 'Expected a YYYY-MM-DD date').optional(),
  riderId: z.string().uuid().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

routeRouter.get(
  '/today',
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof querySchema>;
    const date = q.date ?? today();

    // An admin or supervisor without a riderId filter gets every stop in scope.
    if (actor.role === 'rider' && q.riderId && q.riderId !== actor.id) {
      throw badRequest('Riders can only load their own route');
    }

    // Fallback for a missed cron run: build the day on first request.
    const generated = date === today() ? await ensureRouteGenerated(date) : false;

    const riderId = actor.role === 'rider' ? actor.id : q.riderId;

    const deliveries = await prisma.delivery.findMany({
      where: and(
        deliveryScope(actor),
        { deliveryDate: toUtcDate(date) },
        riderId ? { riderId } : undefined,
      ),
      select: {
        id: true,
        status: true,
        product: true,
        qty: true,
        sequence: true,
        deliveredAt: true,
        remarks: true,
        riderId: true,
        subscriptionId: true,
        customer: {
          select: {
            id: true,
            name: true,
            mobile: true,
            area: true,
            address: true,
            landmark: true,
            latitude: true,
            longitude: true,
            notes: true,
          },
        },
        subscription: { select: { id: true, endDate: true, product: true } },
      },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    });

    const origin: Coords | null =
      q.latitude !== undefined && q.longitude !== undefined
        ? { latitude: q.latitude, longitude: q.longitude }
        : null;

    const stops = deliveries.map((d) => {
      const endDate = d.subscription ? toDateOnly(d.subscription.endDate) : null;
      const daysLeft = endDate ? diffDays(date, endDate) : null;
      return {
        deliveryId: d.id,
        status: d.status,
        product: d.product,
        qty: d.qty,
        sequence: d.sequence,
        deliveredAt: d.deliveredAt,
        remarks: d.remarks,
        riderId: d.riderId,
        customerId: d.customer.id,
        name: d.customer.name,
        mobile: d.customer.mobile,
        area: d.customer.area,
        address: d.customer.address,
        landmark: d.customer.landmark,
        notes: d.customer.notes,
        latitude: toNumber(d.customer.latitude),
        longitude: toNumber(d.customer.longitude),
        subscriptionId: d.subscriptionId,
        subscriptionEndDate: endDate,
        daysLeft,
        renewalDue: daysLeft !== null && daysLeft <= env.RENEWAL_ALERT_DAYS && daysLeft >= 0,
      };
    });

    // Pending first (nearest-first among them), then everything already handled.
    const pending = stops.filter((s) => s.status === 'pending' || s.status === 'skipped' || s.status === 'not_home');
    const done = stops.filter((s) => s.status === 'delivered');
    const orderedPending = sortByDistance(pending, origin);

    const bottlesTotal = stops.reduce((sum, s) => sum + s.qty, 0);
    const bottlesDelivered = done.reduce((sum, s) => sum + s.qty, 0);

    const byProduct = (list: typeof stops) =>
      list.reduce<Record<string, number>>((acc, s) => {
        acc[s.product] = (acc[s.product] ?? 0) + s.qty;
        return acc;
      }, {});

    res.json({
      date,
      riderId: riderId ?? null,
      generated,
      nextStop: orderedPending[0] ?? null,
      stops: [...orderedPending, ...done.map((s) => ({ ...s, distanceMeters: null }))],
      counters: {
        stops: stops.length,
        delivered: done.length,
        pending: stops.filter((s) => s.status === 'pending').length,
        skipped: stops.filter((s) => s.status === 'skipped').length,
        notHome: stops.filter((s) => s.status === 'not_home').length,
        bottlesTotal,
        bottlesDelivered,
        bottlesRemaining: bottlesTotal - bottlesDelivered,
        bottlesByProduct: byProduct(stops),
        remainingByProduct: byProduct(pending),
      },
    });
  }),
);

/**
 * Manual trigger for the generator — useful after fixing data mid-morning, and
 * what the deployment docs tell you to curl if a cron run was missed.
 */
routeRouter.post(
  '/generate',
  validate(z.object({ date: z.string().refine(isDateOnly).optional() })),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    if (actor.role === 'rider') throw badRequest('Only an admin or supervisor can regenerate a route');
    const { generateRouteForDate } = await import('../services/routeGenerator');
    const result = await generateRouteForDate((req.body as { date?: string }).date ?? today());
    res.json({ result });
  }),
);
