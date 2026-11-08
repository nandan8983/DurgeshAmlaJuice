/** Daily route generation: who gets a bottle, which juice, how many. */
import { describe, expect, it } from 'vitest';
import { bottleCounters, planRoute, type RouteCandidate } from '../src/domain/route';

const DATE = '2026-11-08';

function candidate(overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    subscriptionId: 'sub-1',
    customerId: 'cust-1',
    riderId: 'rider-1',
    customerStatus: 'active',
    subscriptionStatus: 'active',
    product: 'amla',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    bottlesPerDay: 1,
    pauses: [],
    hasCoordinates: true,
    ...overrides,
  };
}

describe('planRoute', () => {
  it('creates one row per eligible customer', () => {
    const plan = planRoute(DATE, [
      candidate({ customerId: 'a', subscriptionId: 's-a' }),
      candidate({ customerId: 'b', subscriptionId: 's-b', bottlesPerDay: 3 }),
    ]);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[1]).toMatchObject({ customerId: 'b', qty: 3, product: 'amla' });
  });

  it('carries the customer bottles/day into qty', () => {
    const plan = planRoute(DATE, [candidate({ bottlesPerDay: 4 })]);
    expect(plan.rows[0]!.qty).toBe(4);
  });

  it('assigns the stop to the customer’s rider', () => {
    const plan = planRoute(DATE, [candidate({ riderId: 'rider-9' })]);
    expect(plan.rows[0]!.riderId).toBe('rider-9');
  });

  it('skips an inactive customer', () => {
    const plan = planRoute(DATE, [candidate({ customerStatus: 'inactive' })]);
    expect(plan.rows).toHaveLength(0);
    expect(plan.skippedInactive).toBe(1);
  });

  it('skips a paused subscription', () => {
    const plan = planRoute(DATE, [candidate({ subscriptionStatus: 'paused' })]);
    expect(plan.rows).toHaveLength(0);
    expect(plan.skippedPaused).toBe(1);
  });

  it('skips a customer inside an open pause window even if the status lags', () => {
    const plan = planRoute(DATE, [
      candidate({ pauses: [{ pausedFrom: '2026-11-07', resumedOn: null }] }),
    ]);
    expect(plan.rows).toHaveLength(0);
    expect(plan.skippedPaused).toBe(1);
  });

  it('delivers again on the resume day', () => {
    const plan = planRoute(DATE, [
      candidate({ pauses: [{ pausedFrom: '2026-11-05', resumedOn: DATE }] }),
    ]);
    expect(plan.rows).toHaveLength(1);
  });

  it('drops a subscription that ended yesterday', () => {
    const plan = planRoute(DATE, [candidate({ endDate: '2026-11-07' })]);
    expect(plan.rows).toHaveLength(0);
    expect(plan.skippedOutOfWindow).toBe(1);
  });

  it('drops a subscription that starts tomorrow', () => {
    const plan = planRoute(DATE, [candidate({ startDate: '2026-11-09' })]);
    expect(plan.rows).toHaveLength(0);
    expect(plan.skippedOutOfWindow).toBe(1);
  });

  it('includes the first and last day of the window', () => {
    expect(planRoute(DATE, [candidate({ startDate: DATE })]).rows).toHaveLength(1);
    expect(planRoute(DATE, [candidate({ endDate: DATE })]).rows).toHaveLength(1);
  });

  it('drops expired and cancelled subscriptions', () => {
    const plan = planRoute(DATE, [
      candidate({ customerId: 'a', subscriptionStatus: 'expired' }),
      candidate({ customerId: 'b', subscriptionStatus: 'cancelled' }),
    ]);
    expect(plan.rows).toHaveLength(0);
    expect(plan.skippedOutOfWindow).toBe(2);
  });

  it('is idempotent: a second run adds nothing', () => {
    const candidates = [candidate({ customerId: 'a' }), candidate({ customerId: 'b' })];
    const first = planRoute(DATE, candidates);
    const second = planRoute(DATE, candidates, new Set(first.rows.map((r) => r.customerId)));
    expect(second.rows).toHaveLength(0);
    expect(second.alreadyPresent).toBe(2);
  });

  it('never gives one customer two stops on the same day', () => {
    // Two overlapping subscriptions shouldn't happen, but the plan must hold.
    const plan = planRoute(DATE, [
      candidate({ subscriptionId: 's-1' }),
      candidate({ subscriptionId: 's-2' }),
    ]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.alreadyPresent).toBe(1);
  });

  it('still routes a customer whose pin was never set, and counts them', () => {
    const plan = planRoute(DATE, [candidate({ hasCoordinates: false })]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.withoutCoordinates).toBe(1);
  });
});

describe('planRoute with combo plans', () => {
  it('resolves combo to the right juice for the day', () => {
    // 2026-11-01 start, so the 8th is delivery day 8 -> even -> beetroot.
    const plan = planRoute(DATE, [candidate({ product: 'combo' })]);
    expect(plan.rows[0]!.product).toBe('beetroot');
  });

  it('resolves combo to amla on an odd delivery day', () => {
    const plan = planRoute('2026-11-07', [candidate({ product: 'combo' })]);
    expect(plan.rows[0]!.product).toBe('amla');
  });

  it('does not let paused days advance the alternation', () => {
    // Paused the 4th-6th (3 days): the 8th becomes delivery day 5 -> amla.
    const plan = planRoute(DATE, [
      candidate({
        product: 'combo',
        pauses: [{ pausedFrom: '2026-11-04', resumedOn: '2026-11-07' }],
      }),
    ]);
    expect(plan.rows[0]!.product).toBe('amla');
  });

  it('never emits combo as a delivery product', () => {
    const plan = planRoute(DATE, [
      candidate({ customerId: 'a', product: 'combo' }),
      candidate({ customerId: 'b', product: 'combo', startDate: '2026-11-02' }),
    ]);
    for (const row of plan.rows) {
      expect(['amla', 'beetroot']).toContain(row.product);
    }
  });
});

describe('bottleCounters', () => {
  const stops = [
    { product: 'amla' as const, qty: 2, status: 'delivered' },
    { product: 'amla' as const, qty: 1, status: 'pending' },
    { product: 'beetroot' as const, qty: 3, status: 'pending' },
    { product: 'beetroot' as const, qty: 1, status: 'skipped' },
  ];

  it('counts bottles, not stops', () => {
    const counters = bottleCounters(stops);
    expect(counters.total).toBe(7);
    expect(counters.delivered).toBe(2);
    expect(counters.remaining).toBe(5);
  });

  it('splits by product so the rider knows what is left in the crate', () => {
    const counters = bottleCounters(stops);
    expect(counters.byProduct).toEqual({ amla: 3, beetroot: 4 });
    expect(counters.remainingByProduct).toEqual({ amla: 1, beetroot: 4 });
  });

  it('treats skipped and not-home bottles as still on the bike', () => {
    const counters = bottleCounters([
      { product: 'amla', qty: 1, status: 'skipped' },
      { product: 'amla', qty: 1, status: 'not_home' },
    ]);
    expect(counters.remaining).toBe(2);
  });
});
