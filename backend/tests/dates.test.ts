import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInclusive,
  diffDays,
  endOfMonth,
  isDateOnly,
  isWithin,
  startOfMonth,
  toDateOnly,
  toUtcDate,
} from '../src/domain/dates';

describe('date-only handling', () => {
  it('validates the format', () => {
    expect(isDateOnly('2026-11-08')).toBe(true);
    expect(isDateOnly('08-11-2026')).toBe(false);
    expect(isDateOnly('2026-13-01')).toBe(false);
    expect(isDateOnly(20261108)).toBe(false);
  });

  it('round-trips through a Postgres-style UTC midnight Date', () => {
    const date = toUtcDate('2026-11-08');
    expect(date.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(toDateOnly(date)).toBe('2026-11-08');
  });

  it('does not shift the day for a late-evening IST timestamp', () => {
    // 2026-11-08 23:30 IST is 18:00 UTC the same day — the delivery belongs to the 8th.
    expect(toDateOnly(new Date('2026-11-08T18:00:00.000Z'))).toBe('2026-11-08');
  });
});

describe('arithmetic', () => {
  it('adds and subtracts days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('diffs days signed', () => {
    expect(diffDays('2026-11-01', '2026-11-08')).toBe(7);
    expect(diffDays('2026-11-08', '2026-11-01')).toBe(-7);
    expect(diffDays('2026-11-08', '2026-11-08')).toBe(0);
  });

  it('counts inclusive spans the way a plan does', () => {
    expect(daysInclusive('2026-11-01', '2026-11-07')).toBe(7);
    expect(daysInclusive('2026-11-01', '2026-11-30')).toBe(30);
  });

  it('compares ranges inclusively', () => {
    expect(isWithin('2026-11-01', '2026-11-01', '2026-11-30')).toBe(true);
    expect(isWithin('2026-11-30', '2026-11-01', '2026-11-30')).toBe(true);
    expect(isWithin('2026-12-01', '2026-11-01', '2026-11-30')).toBe(false);
  });

  it('finds month boundaries for the monthly collection report', () => {
    expect(startOfMonth('2026-11-08')).toBe('2026-11-01');
    expect(endOfMonth('2026-11-08')).toBe('2026-11-30');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });
});
