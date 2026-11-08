import { describe, expect, it } from 'vitest';
import { dailyRate, subscriptionAmount, subscriptionEndDate } from '../src/domain/pricing';

describe('subscriptionAmount', () => {
  it('charges the plan price for one bottle a day', () => {
    expect(subscriptionAmount(140, 1)).toBe(140); // Amla 7-day trial
    expect(subscriptionAmount(299, 1)).toBe(299); // Amla 15-day
    expect(subscriptionAmount(549, 1)).toBe(549); // Amla 30-day
    expect(subscriptionAmount(210, 1)).toBe(210); // Beetroot trial
    expect(subscriptionAmount(399, 1)).toBe(399);
    expect(subscriptionAmount(749, 1)).toBe(749);
    expect(subscriptionAmount(349, 1)).toBe(349); // Combo 15-day
    expect(subscriptionAmount(699, 1)).toBe(699); // Combo 30-day
  });

  it('multiplies by bottles per day', () => {
    expect(subscriptionAmount(549, 2)).toBe(1098);
    expect(subscriptionAmount(699, 3)).toBe(2097);
    expect(subscriptionAmount(140, 4)).toBe(560);
  });

  it('rounds to paise rather than accumulating float noise', () => {
    expect(subscriptionAmount(33.33, 3)).toBe(99.99);
    expect(subscriptionAmount(0.1, 3)).toBe(0.3);
  });

  it('rejects nonsense inputs', () => {
    expect(() => subscriptionAmount(-1, 1)).toThrow(RangeError);
    expect(() => subscriptionAmount(100, 0)).toThrow(RangeError);
    expect(() => subscriptionAmount(100, 1.5)).toThrow(RangeError);
  });
});

describe('subscriptionEndDate', () => {
  it('counts the start date as delivery day 1', () => {
    expect(subscriptionEndDate('2026-11-01', 7)).toBe('2026-11-07');
    expect(subscriptionEndDate('2026-11-01', 15)).toBe('2026-11-15');
    expect(subscriptionEndDate('2026-11-01', 30)).toBe('2026-11-30');
  });

  it('crosses month and year boundaries', () => {
    expect(subscriptionEndDate('2026-11-25', 15)).toBe('2026-12-09');
    expect(subscriptionEndDate('2026-12-20', 30)).toBe('2027-01-18');
  });

  it('handles a leap day', () => {
    expect(subscriptionEndDate('2028-02-20', 15)).toBe('2028-03-05');
  });
});

describe('dailyRate', () => {
  it('reports the per-day cost of a plan', () => {
    expect(dailyRate(549, 30)).toBe(18.3);
    expect(dailyRate(140, 7)).toBe(20);
  });
});
