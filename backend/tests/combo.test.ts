import { describe, expect, it } from 'vitest';
import {
  deliveryDayNumber,
  isDeliverableOn,
  isPausedOn,
  pausedDaysBefore,
  productForDate,
  productForDeliveryDay,
  type PauseWindow,
} from '../src/domain/combo';

describe('productForDeliveryDay', () => {
  it('leaves single-product plans alone', () => {
    expect(productForDeliveryDay('amla', 1)).toBe('amla');
    expect(productForDeliveryDay('amla', 9)).toBe('amla');
    expect(productForDeliveryDay('beetroot', 2)).toBe('beetroot');
  });

  it('alternates combo: day 1 amla, day 2 beetroot, day 3 amla', () => {
    const sequence = [1, 2, 3, 4, 5, 6].map((d) => productForDeliveryDay('combo', d));
    expect(sequence).toEqual(['amla', 'beetroot', 'amla', 'beetroot', 'amla', 'beetroot']);
  });

  it('rejects a non-positive day number', () => {
    expect(() => productForDeliveryDay('combo', 0)).toThrow(RangeError);
  });
});

describe('productForDate (no pauses)', () => {
  it('walks a 30-day combo plan day by day', () => {
    const start = '2026-11-01';
    expect(productForDate('combo', start, '2026-11-01')).toBe('amla');
    expect(productForDate('combo', start, '2026-11-02')).toBe('beetroot');
    expect(productForDate('combo', start, '2026-11-03')).toBe('amla');
    expect(productForDate('combo', start, '2026-11-30')).toBe('beetroot');
  });

  it('returns null before the plan starts', () => {
    expect(productForDate('combo', '2026-11-05', '2026-11-04')).toBeNull();
  });
});

describe('combo alternation across a pause', () => {
  // Paused on 2026-11-03, resumed 2026-11-06: days 3,4,5 were skipped.
  const pauses: PauseWindow[] = [{ pausedFrom: '2026-11-03', resumedOn: '2026-11-06' }];
  const start = '2026-11-01';

  it('does not advance the alternation while paused', () => {
    expect(productForDate('combo', start, '2026-11-01', pauses)).toBe('amla'); // day 1
    expect(productForDate('combo', start, '2026-11-02', pauses)).toBe('beetroot'); // day 2
    // 3rd-5th skipped, so the 6th is delivery day 3 and goes back to amla.
    expect(productForDate('combo', start, '2026-11-06', pauses)).toBe('amla');
    expect(productForDate('combo', start, '2026-11-07', pauses)).toBe('beetroot');
  });

  it('reports no product on a paused day', () => {
    expect(productForDate('combo', start, '2026-11-04', pauses)).toBeNull();
  });

  it('counts delivery days, not calendar days', () => {
    expect(deliveryDayNumber(start, '2026-11-02', pauses)).toBe(2);
    expect(deliveryDayNumber(start, '2026-11-06', pauses)).toBe(3);
    expect(deliveryDayNumber(start, '2026-11-10', pauses)).toBe(7);
  });

  it('survives two separate pauses', () => {
    const twoPauses: PauseWindow[] = [
      { pausedFrom: '2026-11-03', resumedOn: '2026-11-06' }, // 3 days
      { pausedFrom: '2026-11-10', resumedOn: '2026-11-12' }, // 2 days
    ];
    expect(pausedDaysBefore(start, '2026-11-15', twoPauses)).toBe(5);
    // 15th is calendar day 15 minus 5 paused = delivery day 10 -> even -> beetroot.
    expect(deliveryDayNumber(start, '2026-11-15', twoPauses)).toBe(10);
    expect(productForDate('combo', start, '2026-11-15', twoPauses)).toBe('beetroot');
  });
});

describe('isPausedOn', () => {
  it('treats the pause as covering pausedFrom up to (not including) resumedOn', () => {
    const pauses: PauseWindow[] = [{ pausedFrom: '2026-11-03', resumedOn: '2026-11-06' }];
    expect(isPausedOn('2026-11-02', pauses)).toBe(false);
    expect(isPausedOn('2026-11-03', pauses)).toBe(true);
    expect(isPausedOn('2026-11-05', pauses)).toBe(true);
    expect(isPausedOn('2026-11-06', pauses)).toBe(false); // delivered again
  });

  it('treats an open pause as open-ended', () => {
    const pauses: PauseWindow[] = [{ pausedFrom: '2026-11-03', resumedOn: null }];
    expect(isPausedOn('2027-05-01', pauses)).toBe(true);
  });
});

describe('isDeliverableOn', () => {
  const sub = { startDate: '2026-11-01', endDate: '2026-11-30', status: 'active' };

  it('covers the whole window inclusive', () => {
    expect(isDeliverableOn(sub, '2026-11-01')).toBe(true);
    expect(isDeliverableOn(sub, '2026-11-30')).toBe(true);
    expect(isDeliverableOn(sub, '2026-12-01')).toBe(false);
    expect(isDeliverableOn(sub, '2026-10-31')).toBe(false);
  });

  it('drops expired and cancelled subscriptions', () => {
    expect(isDeliverableOn({ ...sub, status: 'expired' }, '2026-11-10')).toBe(false);
    expect(isDeliverableOn({ ...sub, status: 'cancelled' }, '2026-11-10')).toBe(false);
  });

  it('skips paused days', () => {
    const pauses: PauseWindow[] = [{ pausedFrom: '2026-11-10', resumedOn: '2026-11-12' }];
    expect(isDeliverableOn(sub, '2026-11-10', pauses)).toBe(false);
    expect(isDeliverableOn(sub, '2026-11-11', pauses)).toBe(false);
    expect(isDeliverableOn(sub, '2026-11-12', pauses)).toBe(true);
  });
});
