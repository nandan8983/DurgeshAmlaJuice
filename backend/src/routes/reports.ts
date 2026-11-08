/**
 * Reports for the admin dashboard, scoped like everything else: an admin sees
 * the business, a supervisor sees their own riders. Every list endpoint also
 * takes `?format=csv`.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, toNumber } from '../prisma';
import { asyncHandler } from '../errors';
import { validate } from '../middleware/validate';
import { actorOf, authenticate, requireStaff } from '../middleware/auth';
import {
  and,
  customerScope,
  deliveryScope,
  paymentScope,
  subscriptionScope,
} from '../domain/scope';
import {
  addDays,
  dayInstantRange,
  diffDays,
  endOfMonth,
  isDateOnly,
  rangeInstantRange,
  startOfMonth,
  toDateOnly,
  toUtcDate,
  today,
} from '../domain/dates';
import { findRenewalsDue } from '../services/renewals';
import { sendCsv, toCsv } from '../lib/csv';
import { env } from '../env';

export const reportsRouter = Router();

reportsRouter.use(authenticate, requireStaff);

const dateField = z.string().refine(isDateOnly, 'Expected a YYYY-MM-DD date');
const rangeQuery = z.object({
  from: dateField.optional(),
  to: dateField.optional(),
  riderId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/** Dashboard tiles: today's deliveries, collections, renewals due, pauses. */
reportsRouter.get(
  '/summary',
  validate(z.object({ date: dateField.optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const date = (req.query as { date?: string }).date ?? today();
    const monthFrom = startOfMonth(date);
    const monthTo = endOfMonth(date);

    const [deliveryGroups, todayPaid, monthPaid, pendingTotal, renewals, pausedCount, customerCount, riderCount] =
      await Promise.all([
        prisma.delivery.groupBy({
          by: ['status'],
          where: and(deliveryScope(actor), { deliveryDate: toUtcDate(date) }),
          _count: { _all: true },
          _sum: { qty: true },
        }),
        prisma.payment.aggregate({
          where: and(paymentScope(actor), { status: 'paid', paidAt: dayInstantRange(date) }),
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.payment.aggregate({
          where: and(paymentScope(actor), {
            status: 'paid',
            paidAt: rangeInstantRange(monthFrom, monthTo),
          }),
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: and(paymentScope(actor), { status: 'pending' }),
          _sum: { amount: true },
          _count: { _all: true },
        }),
        findRenewalsDue(actor, { date }),
        prisma.subscription.count({ where: and(subscriptionScope(actor), { status: 'paused' }) }),
        prisma.customer.count({ where: and(customerScope(actor), { status: 'active' }) }),
        actor.role === 'admin'
          ? prisma.user.count({ where: { role: 'rider', isActive: true } })
          : prisma.user.count({ where: { role: 'rider', isActive: true, supervisorId: actor.id } }),
      ]);

    const byStatus = (status: string) =>
      deliveryGroups.find((g) => g.status === status) ?? { _count: { _all: 0 }, _sum: { qty: 0 } };

    res.json({
      date,
      deliveries: {
        total: deliveryGroups.reduce((n, g) => n + g._count._all, 0),
        delivered: byStatus('delivered')._count._all,
        pending: byStatus('pending')._count._all,
        skipped: byStatus('skipped')._count._all,
        notHome: byStatus('not_home')._count._all,
        bottlesDelivered: byStatus('delivered')._sum.qty ?? 0,
        bottlesTotal: deliveryGroups.reduce((n, g) => n + (g._sum.qty ?? 0), 0),
      },
      collections: {
        today: toNumber(todayPaid._sum.amount) ?? 0,
        todayCount: todayPaid._count._all,
        month: toNumber(monthPaid._sum.amount) ?? 0,
        pending: toNumber(pendingTotal._sum.amount) ?? 0,
        pendingCount: pendingTotal._count._all,
      },
      renewalsDue: { thresholdDays: env.RENEWAL_ALERT_DAYS, count: renewals.length, items: renewals.slice(0, 20) },
      pausedSubscriptions: pausedCount,
      activeCustomers: customerCount,
      activeRiders: riderCount,
    });
  }),
);

/** Collections, with per-rider and per-mode breakdowns. */
reportsRouter.get(
  '/payments',
  validate(rangeQuery, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof rangeQuery>;
    const from = q.from ?? startOfMonth(today());
    const to = q.to ?? today();

    const where = and(
      paymentScope(actor),
      { status: 'paid' as const, paidAt: rangeInstantRange(from, to) },
      q.riderId ? { collectedById: q.riderId } : undefined,
    );

    const [rows, byMode] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        include: {
          customer: { select: { name: true, area: true, rider: { select: { id: true, name: true, supervisorId: true } } } },
          collectedBy: { select: { id: true, name: true, role: true, supervisorId: true } },
        },
      }),
      prisma.payment.groupBy({ by: ['mode'], where, _sum: { amount: true }, _count: { _all: true } }),
    ]);

    const flat = rows.map((p) => ({
      paidAt: p.paidAt,
      customerName: p.customer.name,
      area: p.customer.area ?? '',
      amount: toNumber(p.amount) ?? 0,
      mode: p.mode,
      collectedBy: p.collectedBy?.name ?? '',
      rider: p.customer.rider.name,
      notes: p.notes ?? '',
    }));

    if (q.format === 'csv') {
      return sendCsv(res, `collections-${from}-to-${to}.csv`, toCsv(flat));
    }

    // Per-collector and per-supervisor totals.
    const perCollector = new Map<string, { id: string; name: string; amount: number; count: number }>();
    const perSupervisor = new Map<string, { id: string; amount: number; count: number }>();
    for (const p of rows) {
      const amount = toNumber(p.amount) ?? 0;
      const collector = p.collectedBy;
      if (collector) {
        const entry = perCollector.get(collector.id) ?? { id: collector.id, name: collector.name, amount: 0, count: 0 };
        entry.amount += amount;
        entry.count += 1;
        perCollector.set(collector.id, entry);
      }
      const supervisorId = p.customer.rider.supervisorId ?? 'unassigned';
      const sup = perSupervisor.get(supervisorId) ?? { id: supervisorId, amount: 0, count: 0 };
      sup.amount += amount;
      sup.count += 1;
      perSupervisor.set(supervisorId, sup);
    }

    res.json({
      from,
      to,
      total: flat.reduce((sum, r) => sum + r.amount, 0),
      count: flat.length,
      byMode: byMode.map((m) => ({ mode: m.mode, amount: toNumber(m._sum.amount) ?? 0, count: m._count._all })),
      byCollector: [...perCollector.values()].sort((a, b) => b.amount - a.amount),
      bySupervisor: [...perSupervisor.values()].sort((a, b) => b.amount - a.amount),
      payments: flat,
    });
  }),
);

/** Pending (uncollected) payments by customer. */
reportsRouter.get(
  '/pending-payments',
  validate(rangeQuery, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof rangeQuery>;

    const rows = await prisma.payment.findMany({
      where: and(
        paymentScope(actor),
        { status: 'pending' },
        q.riderId ? { customer: { riderId: q.riderId } } : undefined,
      ),
      orderBy: { createdAt: 'asc' },
      include: {
        customer: { select: { id: true, name: true, mobile: true, area: true, rider: { select: { name: true } } } },
      },
    });

    const flat = rows.map((p) => ({
      customerId: p.customer.id,
      customerName: p.customer.name,
      mobile: p.customer.mobile,
      area: p.customer.area ?? '',
      rider: p.customer.rider.name,
      amount: toNumber(p.amount) ?? 0,
      since: toDateOnly(p.createdAt),
      paymentId: p.id,
    }));

    if (q.format === 'csv') return sendCsv(res, `pending-payments-${today()}.csv`, toCsv(flat));
    res.json({ total: flat.reduce((s, r) => s + r.amount, 0), count: flat.length, items: flat });
  }),
);

/** Deliveries per rider over a date range. */
reportsRouter.get(
  '/deliveries',
  validate(rangeQuery, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof rangeQuery>;
    const from = q.from ?? startOfMonth(today());
    const to = q.to ?? today();

    const where = and(
      deliveryScope(actor),
      { deliveryDate: { gte: toUtcDate(from), lte: toUtcDate(to) } },
      q.riderId ? { riderId: q.riderId } : undefined,
    );

    const grouped = await prisma.delivery.groupBy({
      by: ['riderId', 'status'],
      where,
      _count: { _all: true },
      _sum: { qty: true },
    });

    const riderIds = [...new Set(grouped.map((g) => g.riderId))];
    const riders = await prisma.user.findMany({
      where: { id: { in: riderIds } },
      select: { id: true, name: true, supervisorId: true, supervisor: { select: { name: true } } },
    });
    const riderById = new Map(riders.map((r) => [r.id, r]));

    const perRider = riderIds.map((riderId) => {
      const rows = grouped.filter((g) => g.riderId === riderId);
      const stat = (status: string) => rows.find((r) => r.status === status);
      const rider = riderById.get(riderId);
      return {
        riderId,
        rider: rider?.name ?? riderId,
        supervisor: rider?.supervisor?.name ?? '',
        delivered: stat('delivered')?._count._all ?? 0,
        bottlesDelivered: stat('delivered')?._sum.qty ?? 0,
        pending: stat('pending')?._count._all ?? 0,
        skipped: stat('skipped')?._count._all ?? 0,
        notHome: stat('not_home')?._count._all ?? 0,
        total: rows.reduce((n, r) => n + r._count._all, 0),
      };
    });

    if (q.format === 'csv') return sendCsv(res, `deliveries-${from}-to-${to}.csv`, toCsv(perRider));
    res.json({ from, to, perRider });
  }),
);

/** Plans expiring within N days — the renewal worklist. */
reportsRouter.get(
  '/expiring',
  validate(rangeQuery.extend({ days: z.coerce.number().int().min(0).max(60).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof rangeQuery> & { days?: number };
    const date = today();
    const days = q.days ?? env.RENEWAL_ALERT_DAYS;

    const rows = await prisma.subscription.findMany({
      where: and(
        subscriptionScope(actor),
        {
          status: { in: ['active', 'paused'] },
          endDate: { gte: toUtcDate(date), lte: toUtcDate(addDays(date, days)) },
        },
        q.riderId ? { customer: { riderId: q.riderId } } : undefined,
      ),
      orderBy: { endDate: 'asc' },
      include: {
        customer: {
          select: { id: true, name: true, mobile: true, area: true, rider: { select: { name: true } } },
        },
        plan: { select: { name: true } },
      },
    });

    const flat = rows.map((s) => ({
      customerId: s.customer.id,
      customerName: s.customer.name,
      mobile: s.customer.mobile,
      area: s.customer.area ?? '',
      rider: s.customer.rider.name,
      plan: s.plan.name,
      product: s.product,
      endDate: toDateOnly(s.endDate),
      daysLeft: diffDays(date, toDateOnly(s.endDate)),
      amount: toNumber(s.amount) ?? 0,
      subscriptionId: s.id,
    }));

    if (q.format === 'csv') return sendCsv(res, `expiring-${date}-plus-${days}d.csv`, toCsv(flat));
    res.json({ date, days, count: flat.length, items: flat });
  }),
);

/** Pause history. */
reportsRouter.get(
  '/pauses',
  validate(rangeQuery, 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const q = req.query as unknown as z.infer<typeof rangeQuery>;
    const from = q.from ?? startOfMonth(today());
    const to = q.to ?? today();

    const rows = await prisma.subscriptionPause.findMany({
      where: {
        pausedFrom: { gte: toUtcDate(from), lte: toUtcDate(to) },
        subscription: subscriptionScope(actor),
      },
      orderBy: { pausedFrom: 'desc' },
      include: {
        subscription: {
          select: {
            id: true,
            product: true,
            endDate: true,
            customer: { select: { id: true, name: true, rider: { select: { name: true } } } },
          },
        },
        pausedBy: { select: { name: true } },
        resumedBy: { select: { name: true } },
      },
    });

    const flat = rows.map((p) => ({
      customerName: p.subscription.customer.name,
      rider: p.subscription.customer.rider.name,
      product: p.subscription.product,
      pausedFrom: toDateOnly(p.pausedFrom),
      resumedOn: p.resumedOn ? toDateOnly(p.resumedOn) : '',
      pausedDays: p.pausedDays ?? '',
      reason: p.reason ?? '',
      pausedBy: p.pausedBy?.name ?? '',
      resumedBy: p.resumedBy?.name ?? '',
      newEndDate: toDateOnly(p.subscription.endDate),
    }));

    if (q.format === 'csv') return sendCsv(res, `pauses-${from}-to-${to}.csv`, toCsv(flat));
    res.json({ from, to, count: flat.length, items: flat });
  }),
);

/** Renewal alert feed, also used by the rider app's banner. */
reportsRouter.get(
  '/renewals',
  validate(z.object({ days: z.coerce.number().int().min(0).max(60).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { days } = req.query as { days?: number };
    const items = await findRenewalsDue(actor, { thresholdDays: days });
    res.json({ count: items.length, items });
  }),
);
