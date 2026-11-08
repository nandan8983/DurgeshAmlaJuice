/**
 * The decision half of daily route generation, kept free of the database so it
 * can be tested directly: given the subscriptions and the date, which customers
 * get a bottle this morning, of which juice, and how many.
 */
import {
  isPausedOn,
  productForDate,
  type DeliveryProduct,
  type PauseWindow,
  type ProductKind,
} from './combo';
import { isWithin, type DateOnly } from './dates';

export interface RouteCandidate {
  subscriptionId: string;
  customerId: string;
  riderId: string;
  customerStatus: 'active' | 'inactive';
  subscriptionStatus: 'active' | 'paused' | 'expired' | 'cancelled';
  product: ProductKind;
  startDate: DateOnly;
  endDate: DateOnly;
  bottlesPerDay: number;
  pauses: readonly PauseWindow[];
  hasCoordinates: boolean;
}

export interface PlannedDelivery {
  customerId: string;
  subscriptionId: string;
  riderId: string;
  product: DeliveryProduct;
  qty: number;
}

export interface RoutePlan {
  rows: PlannedDelivery[];
  alreadyPresent: number;
  skippedPaused: number;
  skippedInactive: number;
  skippedOutOfWindow: number;
  withoutCoordinates: number;
}

/**
 * Plan one day. `existingCustomerIds` are customers that already have a row for
 * the date, so re-running the job adds nothing.
 */
export function planRoute(
  date: DateOnly,
  candidates: readonly RouteCandidate[],
  existingCustomerIds: ReadonlySet<string> = new Set(),
): RoutePlan {
  const plan: RoutePlan = {
    rows: [],
    alreadyPresent: 0,
    skippedPaused: 0,
    skippedInactive: 0,
    skippedOutOfWindow: 0,
    withoutCoordinates: 0,
  };
  const claimed = new Set(existingCustomerIds);

  for (const c of candidates) {
    if (claimed.has(c.customerId)) {
      plan.alreadyPresent += 1;
      continue;
    }
    if (c.customerStatus !== 'active') {
      plan.skippedInactive += 1;
      continue;
    }
    if (c.subscriptionStatus === 'expired' || c.subscriptionStatus === 'cancelled') {
      plan.skippedOutOfWindow += 1;
      continue;
    }
    if (!isWithin(date, c.startDate, c.endDate)) {
      plan.skippedOutOfWindow += 1;
      continue;
    }
    if (c.subscriptionStatus === 'paused' || isPausedOn(date, c.pauses)) {
      plan.skippedPaused += 1;
      continue;
    }

    const product = productForDate(c.product, c.startDate, date, c.pauses);
    if (product === null) {
      plan.skippedPaused += 1;
      continue;
    }

    if (!c.hasCoordinates) plan.withoutCoordinates += 1;

    // One bottle set per customer per day — the DB's unique index agrees.
    claimed.add(c.customerId);
    plan.rows.push({
      customerId: c.customerId,
      subscriptionId: c.subscriptionId,
      riderId: c.riderId,
      product,
      qty: c.bottlesPerDay,
    });
  }

  return plan;
}

/** Bottle counters for the rider's screen, split by product. */
export function bottleCounters(
  stops: ReadonlyArray<{ product: DeliveryProduct; qty: number; status: string }>,
): {
  total: number;
  delivered: number;
  remaining: number;
  byProduct: Record<DeliveryProduct, number>;
  remainingByProduct: Record<DeliveryProduct, number>;
} {
  const byProduct: Record<DeliveryProduct, number> = { amla: 0, beetroot: 0 };
  const remainingByProduct: Record<DeliveryProduct, number> = { amla: 0, beetroot: 0 };
  let total = 0;
  let delivered = 0;

  for (const stop of stops) {
    total += stop.qty;
    byProduct[stop.product] += stop.qty;
    if (stop.status === 'delivered') {
      delivered += stop.qty;
    } else {
      remainingByProduct[stop.product] += stop.qty;
    }
  }

  return { total, delivered, remaining: total - delivered, byProduct, remainingByProduct };
}
