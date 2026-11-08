/**
 * Role scoping. These assert the shape of the `where` fragments every query is
 * built from — if a fragment ever comes back empty for a rider or supervisor,
 * that role would see the whole business.
 */
import { describe, expect, it } from 'vitest';
import {
  and,
  customerScope,
  deliveryScope,
  manageableUserScope,
  paymentScope,
  riderScope,
  subscriptionScope,
  type Actor,
} from '../src/domain/scope';

const admin: Actor = { id: 'admin-1', role: 'admin' };
const supervisor: Actor = { id: 'sup-1', role: 'supervisor' };
const rider: Actor = { id: 'rider-1', role: 'rider' };

describe('customerScope', () => {
  it('does not restrict an admin', () => {
    expect(customerScope(admin)).toEqual({});
  });

  it('limits a supervisor to their own riders', () => {
    expect(customerScope(supervisor)).toEqual({ rider: { supervisorId: 'sup-1' } });
  });

  it('limits a rider to their own customers', () => {
    expect(customerScope(rider)).toEqual({ riderId: 'rider-1' });
  });
});

describe('deliveryScope', () => {
  it('scopes by rider and by supervisor team', () => {
    expect(deliveryScope(admin)).toEqual({});
    expect(deliveryScope(supervisor)).toEqual({ rider: { supervisorId: 'sup-1' } });
    expect(deliveryScope(rider)).toEqual({ riderId: 'rider-1' });
  });
});

describe('subscriptionScope and paymentScope', () => {
  it('reach the rider through the customer', () => {
    expect(subscriptionScope(rider)).toEqual({ customer: { riderId: 'rider-1' } });
    expect(paymentScope(supervisor)).toEqual({
      customer: { rider: { supervisorId: 'sup-1' } },
    });
    expect(subscriptionScope(admin)).toEqual({});
  });
});

describe('riderScope', () => {
  it('only ever returns riders', () => {
    expect(riderScope(admin)).toEqual({ role: 'rider' });
    expect(riderScope(supervisor)).toEqual({ role: 'rider', supervisorId: 'sup-1' });
    expect(riderScope(rider)).toEqual({ role: 'rider', id: 'rider-1' });
  });
});

describe('manageableUserScope', () => {
  it('lets a supervisor manage only their own riders', () => {
    expect(manageableUserScope(supervisor)).toEqual({ role: 'rider', supervisorId: 'sup-1' });
  });

  it('lets a rider touch only themselves', () => {
    expect(manageableUserScope(rider)).toEqual({ id: 'rider-1' });
  });
});

describe('every non-admin scope is non-empty', () => {
  // A regression guard: an empty fragment silently means "all rows".
  it.each([
    ['customerScope', customerScope],
    ['deliveryScope', deliveryScope],
    ['subscriptionScope', subscriptionScope],
    ['paymentScope', paymentScope],
  ] as const)('%s', (_name, build) => {
    expect(Object.keys(build(supervisor)).length).toBeGreaterThan(0);
    expect(Object.keys(build(rider)).length).toBeGreaterThan(0);
  });
});

describe('and()', () => {
  it('drops empty fragments so an admin scope adds no clause', () => {
    expect(and({}, { status: 'active' })).toEqual({ status: 'active' });
    expect(and(undefined, undefined)).toEqual({});
  });

  it('combines with AND so a filter cannot overwrite the scope', () => {
    // The dangerous shape would be a spread: { ...{riderId: 'a'}, riderId: 'b' }.
    const combined = and({ riderId: 'rider-1' }, { riderId: 'rider-2' });
    expect(combined).toEqual({ AND: [{ riderId: 'rider-1' }, { riderId: 'rider-2' }] });
  });

  it('keeps the scope when a search filter is added', () => {
    const combined = and(customerScope(rider), { name: { contains: 'ram' } });
    expect(combined).toEqual({
      AND: [{ riderId: 'rider-1' }, { name: { contains: 'ram' } }],
    });
  });
});
