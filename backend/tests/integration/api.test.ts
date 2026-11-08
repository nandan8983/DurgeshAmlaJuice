/**
 * End-to-end API tests against a real PostgreSQL database.
 *
 * Skipped unless TEST_DATABASE_URL is set, so `npm test` stays fast and
 * database-free. To run them:
 *
 *   TEST_DATABASE_URL=postgresql://daj:pass@127.0.0.1:5432/daj_test \
 *     npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run test:integration
 *
 * They assume the seed data: one admin, one supervisor, two riders with six
 * customers each.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';

const DB_URL = process.env.TEST_DATABASE_URL;

// The env module validates on import, so configure before anything loads it.
if (DB_URL) {
  process.env.DATABASE_URL = DB_URL;
  process.env.JWT_SECRET ??= 'integration-test-secret-key-long-enough';
  process.env.NODE_ENV = 'test';
  process.env.ENABLE_CRON = 'false';
  process.env.LOGIN_RATE_MAX ??= '500';
  process.env.LEADS_RATE_MAX ??= '500';
  process.env.LOG_LEVEL ??= 'silent';
  process.env.RENEWAL_ALERT_DAYS ??= '2';
}

const describeDb = DB_URL ? describe : describe.skip;

const SEED = {
  admin: { mobile: '9999900001', password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe@Admin1' },
  supervisor: {
    mobile: '9999900002',
    password: process.env.SEED_SUPERVISOR_PASSWORD ?? 'ChangeMe@Super1',
  },
  rider1: { mobile: '9999900011', password: process.env.SEED_RIDER_PASSWORD ?? 'ChangeMe@Rider1' },
  rider2: { mobile: '9999900012', password: process.env.SEED_RIDER_PASSWORD ?? 'ChangeMe@Rider1' },
};

describeDb('API integration', () => {
  let app: Express;
  let prisma: typeof import('../../src/prisma').prisma;
  const tokens: Record<keyof typeof SEED, string> = {} as never;
  const ids: Record<string, string> = {};

  const auth = (who: keyof typeof SEED) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const [{ createApp }, prismaModule] = await Promise.all([
      import('../../src/app'),
      import('../../src/prisma'),
    ]);
    app = createApp();
    prisma = prismaModule.prisma;
    await prisma.$queryRaw`SELECT 1`;

    for (const who of Object.keys(SEED) as Array<keyof typeof SEED>) {
      const response = await request(app).post('/auth/login').send(SEED[who]);
      expect(response.status, `login ${who}: ${JSON.stringify(response.body)}`).toBe(200);
      tokens[who] = response.body.token as string;
      ids[who] = response.body.user.id as string;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------- auth
  describe('authentication', () => {
    it('rejects a wrong password with the same message as an unknown user', async () => {
      const unknown = await request(app)
        .post('/auth/login')
        .send({ mobile: '9000000000', password: 'whatever1' });
      const wrong = await request(app)
        .post('/auth/login')
        .send({ mobile: SEED.admin.mobile, password: 'wrong-password' });

      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
    });

    it('refuses an unauthenticated request', async () => {
      await request(app).get('/customers').expect(401);
    });

    it('refuses a forged token', async () => {
      await request(app)
        .get('/customers')
        .set('Authorization', 'Bearer not.a.real.token')
        .expect(401);
    });

    it('returns the caller from /auth/me', async () => {
      const response = await request(app).get('/auth/me').set(auth('rider1')).expect(200);
      expect(response.body.user.role).toBe('rider');
    });
  });

  // ---------------------------------------------------------------- scoping
  describe('role scoping', () => {
    it('gives the admin every customer', async () => {
      const response = await request(app).get('/customers').set(auth('admin')).expect(200);
      expect(response.body.total).toBeGreaterThanOrEqual(12);
    });

    it('gives each rider only their own customers', async () => {
      const first = await request(app).get('/customers').set(auth('rider1')).expect(200);
      const second = await request(app).get('/customers').set(auth('rider2')).expect(200);

      expect(first.body.customers.length).toBeGreaterThan(0);
      expect(second.body.customers.length).toBeGreaterThan(0);
      expect(first.body.customers.every((c: { riderId: string }) => c.riderId === ids.rider1)).toBe(
        true,
      );

      const firstIds = new Set(first.body.customers.map((c: { id: string }) => c.id));
      const overlap = second.body.customers.filter((c: { id: string }) => firstIds.has(c.id));
      expect(overlap).toHaveLength(0);
    });

    it('gives the supervisor both riders combined', async () => {
      const [supervisor, one, two] = await Promise.all([
        request(app).get('/customers').set(auth('supervisor')),
        request(app).get('/customers').set(auth('rider1')),
        request(app).get('/customers').set(auth('rider2')),
      ]);
      expect(supervisor.body.total).toBe(one.body.total + two.body.total);
    });

    it("hides another rider's customer behind a 404, not a 403", async () => {
      const other = await request(app).get('/customers').set(auth('rider2')).expect(200);
      const victimId = other.body.customers[0].id as string;

      const response = await request(app).get(`/customers/${victimId}`).set(auth('rider1'));
      expect(response.status).toBe(404);
    });

    it("refuses to let a rider patch another rider's customer", async () => {
      const other = await request(app).get('/customers').set(auth('rider2')).expect(200);
      const victimId = other.body.customers[0].id as string;

      await request(app)
        .patch(`/customers/${victimId}`)
        .set(auth('rider1'))
        .send({ bottlesPerDay: 9 })
        .expect(404);
    });

    it('refuses to let a rider reassign a customer', async () => {
      const mine = await request(app).get('/customers').set(auth('rider1')).expect(200);
      await request(app)
        .patch(`/customers/${mine.body.customers[0].id}/assign`)
        .set(auth('rider1'))
        .send({ riderId: ids.rider2 })
        .expect(403);
    });

    it('refuses to let a supervisor reach the reports of riders outside their team', async () => {
      // Both seeded riders are under the seeded supervisor, so the check is that
      // the supervisor's own scope is applied at all rather than ignored.
      const response = await request(app)
        .get('/admin/reports/summary')
        .set(auth('supervisor'))
        .expect(200);
      expect(response.body.activeRiders).toBe(2);
    });

    it('keeps riders out of the reports endpoints entirely', async () => {
      await request(app).get('/admin/reports/summary').set(auth('rider1')).expect(403);
    });

    it('keeps riders out of user management', async () => {
      await request(app).get('/users').set(auth('rider1')).expect(403);
    });
  });

  // ---------------------------------------------------------------- route
  describe('daily route', () => {
    it('generates the day on the first request and splits it by rider', async () => {
      const [one, two] = await Promise.all([
        request(app).get('/route/today').set(auth('rider1')),
        request(app).get('/route/today').set(auth('rider2')),
      ]);

      expect(one.status).toBe(200);
      expect(two.status).toBe(200);
      expect(one.body.stops.length).toBeGreaterThan(0);
      expect(two.body.stops.length).toBeGreaterThan(0);
      expect(one.body.stops.every((s: { riderId: string }) => s.riderId === ids.rider1)).toBe(true);
    });

    it('never puts combo in the bottle — only amla or beetroot', async () => {
      const response = await request(app).get('/route/today').set(auth('admin')).expect(200);
      for (const stop of response.body.stops) {
        expect(['amla', 'beetroot']).toContain(stop.product);
      }
    });

    it('is idempotent: regenerating adds no stops', async () => {
      const before = await request(app).get('/route/today').set(auth('admin')).expect(200);
      const generate = await request(app).post('/route/generate').set(auth('admin')).send({});
      expect(generate.status).toBe(200);
      expect(generate.body.result.created).toBe(0);

      const after = await request(app).get('/route/today').set(auth('admin')).expect(200);
      expect(after.body.stops.length).toBe(before.body.stops.length);
    });

    it('sorts stops nearest-first when the caller sends a fix', async () => {
      const response = await request(app)
        .get('/route/today')
        .query({ latitude: 21.3486, longitude: 74.8805 })
        .set(auth('rider1'))
        .expect(200);

      const distances = response.body.stops
        .filter((s: { status: string }) => s.status !== 'delivered')
        .map((s: { distanceMeters: number | null }) => s.distanceMeters)
        .filter((d: number | null): d is number => d !== null);

      expect(distances.length).toBeGreaterThan(1);
      for (let i = 1; i < distances.length; i += 1) {
        expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]!);
      }
      expect(response.body.nextStop.deliveryId).toBe(response.body.stops[0].deliveryId);
    });

    it('counts bottles, not stops', async () => {
      const response = await request(app).get('/route/today').set(auth('rider1')).expect(200);
      const expected = response.body.stops.reduce(
        (sum: number, s: { qty: number }) => sum + s.qty,
        0,
      );
      expect(response.body.counters.bottlesTotal).toBe(expected);
      expect(response.body.counters.bottlesRemaining).toBe(
        response.body.counters.bottlesTotal - response.body.counters.bottlesDelivered,
      );
    });

    it("refuses to show one rider another rider's route", async () => {
      await request(app)
        .get('/route/today')
        .query({ riderId: ids.rider2 })
        .set(auth('rider1'))
        .expect(400);
    });
  });

  // ---------------------------------------------------------------- deliveries
  describe('delivery updates', () => {
    it('marks a stop delivered and moves the counters', async () => {
      const before = await request(app).get('/route/today').set(auth('rider1')).expect(200);
      const stop = before.body.stops.find((s: { status: string }) => s.status === 'pending');
      expect(stop, 'expected a pending stop').toBeTruthy();

      const patched = await request(app)
        .patch(`/deliveries/${stop.deliveryId}`)
        .set(auth('rider1'))
        .send({ status: 'delivered', latitude: 21.35, longitude: 74.88 })
        .expect(200);

      expect(patched.body.delivery.status).toBe('delivered');
      expect(patched.body.delivery.deliveredAt).toBeTruthy();

      const after = await request(app).get('/route/today').set(auth('rider1')).expect(200);
      expect(after.body.counters.delivered).toBe(before.body.counters.delivered + 1);
      expect(after.body.counters.bottlesRemaining).toBe(
        before.body.counters.bottlesRemaining - stop.qty,
      );
    });

    it('keeps a skipped stop on the pending list', async () => {
      const before = await request(app).get('/route/today').set(auth('rider2')).expect(200);
      const stop = before.body.stops.find((s: { status: string }) => s.status === 'pending');

      await request(app)
        .patch(`/deliveries/${stop.deliveryId}`)
        .set(auth('rider2'))
        .send({ status: 'skipped', remarks: 'gate locked' })
        .expect(200);

      const after = await request(app).get('/route/today').set(auth('rider2')).expect(200);
      const updated = after.body.stops.find(
        (s: { deliveryId: string }) => s.deliveryId === stop.deliveryId,
      );
      expect(updated.status).toBe('skipped');
      // Still offered to the rider, just not as delivered.
      expect(after.body.counters.delivered).toBe(before.body.counters.delivered);
      expect(after.body.counters.bottlesRemaining).toBe(before.body.counters.bottlesRemaining);
    });

    it('accepts an extra bottle for one day', async () => {
      const route = await request(app).get('/route/today').set(auth('rider1')).expect(200);
      const stop = route.body.stops.find((s: { status: string }) => s.status === 'pending');

      const response = await request(app)
        .patch(`/deliveries/${stop.deliveryId}`)
        .set(auth('rider1'))
        .send({ status: 'delivered', qty: stop.qty + 1 })
        .expect(200);

      expect(response.body.delivery.qty).toBe(stop.qty + 1);
    });

    it("refuses an update to another rider's delivery", async () => {
      const other = await request(app).get('/route/today').set(auth('rider2')).expect(200);
      await request(app)
        .patch(`/deliveries/${other.body.stops[0].deliveryId}`)
        .set(auth('rider1'))
        .send({ status: 'delivered' })
        .expect(404);
    });

    it('applies a batch from the offline queue and reports per-item results', async () => {
      const route = await request(app).get('/route/today').set(auth('rider1')).expect(200);
      const pending = route.body.stops
        .filter((s: { status: string }) => s.status === 'pending')
        .slice(0, 2);

      const response = await request(app)
        .post('/deliveries/sync')
        .set(auth('rider1'))
        .send({
          updates: [
            ...pending.map((s: { deliveryId: string }) => ({
              deliveryId: s.deliveryId,
              status: 'delivered',
              occurredAt: new Date().toISOString(),
            })),
            // A delivery id that does not exist must not sink the batch.
            { deliveryId: '00000000-0000-4000-8000-000000000000', status: 'delivered' },
          ],
        })
        .expect(200);

      expect(response.body.applied).toBe(pending.length);
      expect(response.body.failed).toBe(1);
    });

    it('rejects an invalid status', async () => {
      const route = await request(app).get('/route/today').set(auth('rider1')).expect(200);
      await request(app)
        .patch(`/deliveries/${route.body.stops[0].deliveryId}`)
        .set(auth('rider1'))
        .send({ status: 'teleported' })
        .expect(422);
    });
  });

  // ---------------------------------------------------------------- subscriptions
  describe('subscriptions, pause and resume', () => {
    it('prices a subscription as plan price × bottles per day', async () => {
      const plans = await request(app).get('/plans').set(auth('admin')).expect(200);
      const plan = plans.body.plans.find(
        (p: { product: string; durationDays: number }) =>
          p.product === 'amla' && p.durationDays === 30,
      );
      expect(plan.price).toBe(549);

      const created = await request(app)
        .post('/customers')
        .set(auth('rider1'))
        .send({ name: 'Pricing Test', mobile: '9876500001', bottlesPerDay: 2, status: 'active' })
        .expect(201);
      ids.pricingCustomer = created.body.customer.id;

      const subscription = await request(app)
        .post('/subscriptions')
        .set(auth('rider1'))
        .send({ customerId: ids.pricingCustomer, planId: plan.id })
        .expect(201);

      expect(subscription.body.subscription.amount).toBe(1098);
      expect(subscription.body.subscription.bottlesPerDay).toBe(2);
    });

    it('refuses a second overlapping plan unless renew is set', async () => {
      const plans = await request(app).get('/plans').set(auth('admin')).expect(200);
      const plan = plans.body.plans[0];

      const conflict = await request(app)
        .post('/subscriptions')
        .set(auth('rider1'))
        .send({ customerId: ids.pricingCustomer, planId: plan.id });
      expect(conflict.status).toBe(409);

      const renewed = await request(app)
        .post('/subscriptions')
        .set(auth('rider1'))
        .send({ customerId: ids.pricingCustomer, planId: plan.id, renew: true })
        .expect(201);

      // Queued to begin the morning after the current plan ends.
      expect(renewed.body.subscription.startDate > conflict.body.error.details.currentEndDate).toBe(
        true,
      );
      ids.renewedSubscription = renewed.body.subscription.id;
    });

    it('creates a pending payment alongside the subscription', async () => {
      const payments = await request(app)
        .get('/payments')
        .query({ customerId: ids.pricingCustomer })
        .set(auth('rider1'))
        .expect(200);

      expect(payments.body.payments.length).toBeGreaterThan(0);
      expect(payments.body.payments.some((p: { status: string }) => p.status === 'pending')).toBe(
        true,
      );
    });

    it('delivers to a customer who subscribed today, same morning', async () => {
      const route = await request(app).get('/route/today').set(auth('rider1')).expect(200);
      const stop = route.body.stops.find(
        (s: { customerId: string }) => s.customerId === ids.pricingCustomer,
      );
      expect(stop).toBeTruthy();
      expect(stop.qty).toBe(2);
    });

    /**
     * A seeded customer of rider1 whose plan started days ago (so a pause can be
     * backdated) and whose stop today is still pending (so the pause has
     * something to remove — earlier tests have already closed out some stops).
     */
    const findEstablishedCustomer = async (): Promise<{
      customerId: string;
      subscriptionId: string;
      endDate: string;
    }> => {
      const [list, route] = await Promise.all([
        request(app).get('/customers').set(auth('rider1')).expect(200),
        request(app).get('/route/today').set(auth('rider1')).expect(200),
      ]);

      const stillPending = new Set(
        route.body.stops
          .filter((s: { status: string }) => s.status === 'pending')
          .map((s: { customerId: string }) => s.customerId as string),
      );
      const cutoff = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

      const found = list.body.customers.find(
        (c: { id: string; subscription: { startDate: string; status: string } | null }) =>
          c.subscription !== null &&
          c.subscription.status === 'active' &&
          c.subscription.startDate <= cutoff &&
          stillPending.has(c.id),
      );
      expect(found, 'expected an established customer with a pending stop today').toBeTruthy();
      return {
        customerId: found.id,
        subscriptionId: found.subscription.id,
        endDate: found.subscription.endDate,
      };
    };

    it('pause drops the pending stop, resume extends the end date', async () => {
      const { customerId, subscriptionId, endDate } = await findEstablishedCustomer();
      ids.pausedCustomer = customerId;
      ids.pausedSubscription = subscriptionId;

      // Backdate three days, so the resume has days to give back.
      const pausedFrom = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
      await request(app)
        .post(`/subscriptions/${subscriptionId}/pause`)
        .set(auth('rider1'))
        .send({ from: pausedFrom, reason: 'out of town' })
        .expect(200);

      const paused = await request(app).get('/route/today').set(auth('rider1')).expect(200);
      const stop = paused.body.stops.find(
        (s: { customerId: string }) => s.customerId === customerId,
      );
      expect(stop, 'a paused customer should have no stop left today').toBeUndefined();

      const resumed = await request(app)
        .post(`/subscriptions/${subscriptionId}/resume`)
        .set(auth('rider1'))
        .expect(200);

      expect(resumed.body.pausedDays).toBe(3);
      const expected = new Date(`${endDate}T00:00:00Z`);
      expected.setUTCDate(expected.getUTCDate() + 3);
      expect(resumed.body.newEndDate).toBe(expected.toISOString().slice(0, 10));
      expect(resumed.body.subscription.status).toBe('active');
    });

    it('puts a resumed customer back on the next day it generates', async () => {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

      const generated = await request(app)
        .post('/route/generate')
        .set(auth('admin'))
        .send({ date: tomorrow })
        .expect(200);
      expect(generated.body.result.created).toBeGreaterThan(0);

      const route = await request(app)
        .get('/route/today')
        .query({ date: tomorrow, riderId: ids.rider1 })
        .set(auth('admin'))
        .expect(200);

      expect(
        route.body.stops.some((s: { customerId: string }) => s.customerId === ids.pausedCustomer),
      ).toBe(true);
    });

    it('refuses to pause a subscription twice', async () => {
      const subscriptionId = ids.pausedSubscription;

      await request(app)
        .post(`/subscriptions/${subscriptionId}/pause`)
        .set(auth('rider1'))
        .send({})
        .expect(200);
      await request(app)
        .post(`/subscriptions/${subscriptionId}/pause`)
        .set(auth('rider1'))
        .send({})
        .expect(400);
      await request(app)
        .post(`/subscriptions/${subscriptionId}/resume`)
        .set(auth('rider1'))
        .expect(200);
    });

    it('refuses to pause before the plan started', async () => {
      const created = await request(app)
        .post('/customers')
        .set(auth('rider1'))
        .send({ name: 'Backdate Test', mobile: '9876500002', bottlesPerDay: 1, status: 'active' })
        .expect(201);

      const plans = await request(app).get('/plans').set(auth('admin')).expect(200);
      const subscription = await request(app)
        .post('/subscriptions')
        .set(auth('rider1'))
        .send({ customerId: created.body.customer.id, planId: plans.body.plans[0].id })
        .expect(201);

      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      await request(app)
        .post(`/subscriptions/${subscription.body.subscription.id}/pause`)
        .set(auth('rider1'))
        .send({ from: yesterday })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------- payments
  describe('payments', () => {
    it('records a collection and attributes it to the collector', async () => {
      const response = await request(app)
        .post('/payments')
        .set(auth('rider1'))
        .send({ customerId: ids.pricingCustomer, amount: 500, mode: 'upi', status: 'paid' })
        .expect(201);

      expect(response.body.payment.status).toBe('paid');
      expect(response.body.payment.collectedById).toBe(ids.rider1);
      expect(response.body.payment.paidAt).toBeTruthy();
    });

    it("refuses a payment against another rider's customer", async () => {
      const other = await request(app).get('/customers').set(auth('rider2')).expect(200);
      await request(app)
        .post('/payments')
        .set(auth('rider1'))
        .send({ customerId: other.body.customers[0].id, amount: 100, mode: 'cash' })
        .expect(404);
    });

    it('settles a pending payment', async () => {
      const pending = await request(app)
        .get('/payments')
        .query({ status: 'pending', customerId: ids.pricingCustomer })
        .set(auth('admin'))
        .expect(200);

      const paymentId = pending.body.payments[0].id as string;
      const response = await request(app)
        .patch(`/payments/${paymentId}`)
        .set(auth('admin'))
        .send({ status: 'paid' })
        .expect(200);

      expect(response.body.payment.status).toBe('paid');
      expect(response.body.payment.collectedById).toBe(ids.admin);
    });

    it('rejects a negative amount', async () => {
      await request(app)
        .post('/payments')
        .set(auth('rider1'))
        .send({ customerId: ids.pricingCustomer, amount: -50, mode: 'cash' })
        .expect(422);
    });
  });

  // ---------------------------------------------------------------- leads
  describe('website leads', () => {
    it('accepts a public submission with no token', async () => {
      const response = await request(app)
        .post('/leads')
        .send({
          fullName: 'Website Visitor',
          mobile: '9876500099',
          area: 'Gandhi Chowk',
          city: 'Shirpur',
          plan: 'Amla 30-day',
          notes: 'Morning delivery please',
        })
        .expect(201);

      expect(response.body.ok).toBe(true);
      // Deliberately thin: nothing about the business leaks to the public form.
      expect(Object.keys(response.body).sort()).toEqual(['id', 'ok']);
    });

    it('validates the submission', async () => {
      await request(app).post('/leads').send({ fullName: 'x', mobile: 'nope' }).expect(422);
    });

    it('needs a token to read leads', async () => {
      await request(app).get('/leads').expect(401);
      await request(app).get('/leads').set(auth('rider1')).expect(403);
      await request(app).get('/leads').set(auth('admin')).expect(200);
    });

    it('converts a lead into a customer with a rider', async () => {
      const list = await request(app)
        .get('/leads')
        .query({ status: 'new' })
        .set(auth('admin'))
        .expect(200);
      const lead = list.body.leads[0];

      const plans = await request(app).get('/plans').set(auth('admin')).expect(200);
      const plan = plans.body.plans.find((p: { product: string }) => p.product === 'combo');

      const response = await request(app)
        .post(`/leads/${lead.id}/convert`)
        .set(auth('admin'))
        .send({ riderId: ids.rider2, bottlesPerDay: 1, planId: plan.id })
        .expect(201);

      expect(response.body.customerId).toBeTruthy();
      expect(response.body.subscriptionId).toBeTruthy();

      const customer = await request(app)
        .get(`/customers/${response.body.customerId}`)
        .set(auth('admin'))
        .expect(200);
      expect(customer.body.customer.riderId).toBe(ids.rider2);
      expect(customer.body.customer.subscription.product).toBe('combo');

      // Converting twice must not create a second customer.
      await request(app)
        .post(`/leads/${lead.id}/convert`)
        .set(auth('admin'))
        .send({ riderId: ids.rider2 })
        .expect(409);
    });
  });

  // ---------------------------------------------------------------- reports
  describe('reports', () => {
    it('summarises the day', async () => {
      const response = await request(app)
        .get('/admin/reports/summary')
        .set(auth('admin'))
        .expect(200);

      expect(response.body.deliveries.total).toBeGreaterThan(0);
      expect(response.body.collections.today).toBeGreaterThan(0);
      expect(response.body.activeCustomers).toBeGreaterThan(0);
      expect(response.body.renewalsDue.thresholdDays).toBe(2);
    });

    it('reports deliveries per rider', async () => {
      const response = await request(app)
        .get('/admin/reports/deliveries')
        .set(auth('admin'))
        .expect(200);
      expect(response.body.perRider.length).toBeGreaterThanOrEqual(2);
      expect(response.body.perRider[0]).toHaveProperty('bottlesDelivered');
    });

    it('lists expiring plans within the window', async () => {
      const response = await request(app)
        .get('/admin/reports/expiring')
        .query({ days: 30 })
        .set(auth('admin'))
        .expect(200);
      expect(response.body.items.every((i: { daysLeft: number }) => i.daysLeft <= 30)).toBe(true);
    });

    it('exports CSV with a download header', async () => {
      const response = await request(app)
        .get('/admin/reports/payments')
        .query({ format: 'csv' })
        .set(auth('admin'))
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text.split('\r\n')[0]).toContain('customerName');
    });

    it('records the pause history with the days given back', async () => {
      const response = await request(app)
        .get('/admin/reports/pauses')
        .query({ from: '2000-01-01' })
        .set(auth('admin'))
        .expect(200);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.items.some((i: { pausedDays: unknown }) => i.pausedDays === 3)).toBe(
        true,
      );
    });
  });

  // ---------------------------------------------------------------- users
  describe('user management', () => {
    it('lets the admin create a rider under a supervisor', async () => {
      const response = await request(app)
        .post('/users')
        .set(auth('admin'))
        .send({
          name: 'Rider Test',
          mobile: '9000000777',
          password: 'TestRider@123',
          role: 'rider',
          supervisorId: ids.supervisor,
        })
        .expect(201);

      expect(response.body.user.supervisorId).toBe(ids.supervisor);
      ids.newRider = response.body.user.id;
    });

    it('blocks a deactivated account immediately', async () => {
      await request(app)
        .patch(`/users/${ids.newRider}`)
        .set(auth('admin'))
        .send({ isActive: false })
        .expect(200);

      const login = await request(app)
        .post('/auth/login')
        .send({ mobile: '9000000777', password: 'TestRider@123' });
      expect(login.status).toBe(403);
    });

    it('refuses a duplicate mobile number', async () => {
      await request(app)
        .post('/users')
        .set(auth('admin'))
        .send({
          name: 'Duplicate',
          mobile: '9000000777',
          password: 'TestRider@123',
          role: 'rider',
        })
        .expect(409);
    });

    it('stops a supervisor from creating anything but a rider', async () => {
      await request(app)
        .post('/users')
        .set(auth('supervisor'))
        .send({
          name: 'Sneaky Admin',
          mobile: '9000000888',
          password: 'TestAdmin@123',
          role: 'admin',
        })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------- plans
  describe('plans', () => {
    it('seeds the published price list', async () => {
      const response = await request(app).get('/plans').set(auth('admin')).expect(200);
      const price = (product: string, days: number): number =>
        response.body.plans.find(
          (p: { product: string; durationDays: number }) =>
            p.product === product && p.durationDays === days,
        ).price;

      expect(price('amla', 7)).toBe(140);
      expect(price('amla', 15)).toBe(299);
      expect(price('amla', 30)).toBe(549);
      expect(price('beetroot', 7)).toBe(210);
      expect(price('beetroot', 15)).toBe(399);
      expect(price('beetroot', 30)).toBe(749);
      expect(price('combo', 15)).toBe(349);
      expect(price('combo', 30)).toBe(699);
    });

    it('lets only an admin change a price', async () => {
      const plans = await request(app).get('/plans').set(auth('admin')).expect(200);
      const plan = plans.body.plans[0];

      await request(app)
        .patch(`/plans/${plan.id}`)
        .set(auth('supervisor'))
        .send({ price: 1 })
        .expect(403);

      await request(app)
        .patch(`/plans/${plan.id}`)
        .set(auth('admin'))
        .send({ price: plan.price })
        .expect(200);
    });
  });

  // ---------------------------------------------------------------- misc
  describe('plumbing', () => {
    it('answers the health check without a token', async () => {
      const response = await request(app).get('/health').expect(200);
      expect(response.body.ok).toBe(true);
    });

    it('404s an unknown route as JSON', async () => {
      const response = await request(app).get('/nope').expect(404);
      expect(response.body.error.code).toBe('not_found');
    });
  });
});
