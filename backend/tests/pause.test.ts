import { describe, expect, it } from 'vitest';
import { applyResume, pausedDayCount } from '../src/domain/pause';

describe('pausedDayCount', () => {
  it('counts the days the customer was actually skipped', () => {
    expect(pausedDayCount({ pausedFrom: '2026-11-03', resumedOn: '2026-11-06' })).toBe(3);
  });

  it('is zero when paused and resumed the same day', () => {
    expect(pausedDayCount({ pausedFrom: '2026-11-03', resumedOn: '2026-11-03' })).toBe(0);
  });

  it('rejects resuming before the pause', () => {
    expect(() => pausedDayCount({ pausedFrom: '2026-11-06', resumedOn: '2026-11-03' })).toThrow(
      RangeError,
    );
  });
});

describe('applyResume with the default extend-end-date policy', () => {
  it('pushes the end date out by the paused days', () => {
    const result = applyResume(
      { endDate: '2026-11-30', pausedDays: 0 },
      { pausedFrom: '2026-11-10', resumedOn: '2026-11-13' },
    );
    expect(result.pausedDays).toBe(3);
    expect(result.endDate).toBe('2026-12-03');
    expect(result.totalPausedDays).toBe(3);
  });

  it('accumulates across repeated pauses', () => {
    const first = applyResume(
      { endDate: '2026-11-30', pausedDays: 0 },
      { pausedFrom: '2026-11-05', resumedOn: '2026-11-07' },
    );
    const second = applyResume(
      { endDate: first.endDate, pausedDays: first.totalPausedDays },
      { pausedFrom: '2026-11-20', resumedOn: '2026-11-25' },
    );
    expect(first.endDate).toBe('2026-12-02');
    expect(second.endDate).toBe('2026-12-07');
    expect(second.totalPausedDays).toBe(7);
  });

  it('leaves the end date alone for a same-day pause and resume', () => {
    const result = applyResume(
      { endDate: '2026-11-30', pausedDays: 2 },
      { pausedFrom: '2026-11-10', resumedOn: '2026-11-10' },
    );
    expect(result.pausedDays).toBe(0);
    expect(result.endDate).toBe('2026-11-30');
    expect(result.totalPausedDays).toBe(2);
  });

  it('crosses a month boundary', () => {
    const result = applyResume(
      { endDate: '2026-11-28', pausedDays: 0 },
      { pausedFrom: '2026-11-20', resumedOn: '2026-11-25' },
    );
    expect(result.endDate).toBe('2026-12-03');
  });
});

describe('applyResume with the forfeit policy', () => {
  it('keeps the original end date', () => {
    const result = applyResume(
      { endDate: '2026-11-30', pausedDays: 0 },
      { pausedFrom: '2026-11-10', resumedOn: '2026-11-13' },
      'forfeit',
    );
    expect(result.pausedDays).toBe(3);
    expect(result.endDate).toBe('2026-11-30');
  });
});
