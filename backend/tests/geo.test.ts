import { describe, expect, it } from 'vitest';
import { formatDistance, haversineMeters, hasCoords, sortByDistance } from '../src/domain/geo';

const SHIRPUR = { latitude: 21.3486, longitude: 74.8805 };

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(SHIRPUR, SHIRPUR)).toBe(0);
  });

  it('matches a known short distance', () => {
    // ~0.01 degrees of latitude is ~1.11 km anywhere on Earth.
    const north = { latitude: 21.3586, longitude: 74.8805 };
    expect(haversineMeters(SHIRPUR, north)).toBeGreaterThan(1050);
    expect(haversineMeters(SHIRPUR, north)).toBeLessThan(1160);
  });

  it('is symmetric', () => {
    const other = { latitude: 21.3405, longitude: 74.8681 };
    expect(haversineMeters(SHIRPUR, other)).toBeCloseTo(haversineMeters(other, SHIRPUR), 6);
  });

  it('handles the Shirpur–Dhule gap (~45 km by road, ~38 km straight)', () => {
    const dhule = { latitude: 20.9042, longitude: 74.7749 };
    const km = haversineMeters(SHIRPUR, dhule) / 1000;
    expect(km).toBeGreaterThan(45);
    expect(km).toBeLessThan(55);
  });
});

describe('sortByDistance', () => {
  const stops = [
    { id: 'far', latitude: 21.3588, longitude: 74.8915 },
    { id: 'near', latitude: 21.3498, longitude: 74.8811 },
    { id: 'middle', latitude: 21.3461, longitude: 74.8789 },
  ];

  it('puts the nearest pending customer first', () => {
    const sorted = sortByDistance(stops, SHIRPUR);
    expect(sorted.map((s) => s.id)).toEqual(['near', 'middle', 'far']);
    expect(sorted[0]!.distanceMeters).toBeLessThan(sorted[1]!.distanceMeters!);
  });

  it('keeps pin-less customers at the end instead of dropping them', () => {
    const withMissing = [...stops, { id: 'nopin', latitude: null, longitude: null }];
    const sorted = sortByDistance(withMissing, SHIRPUR);
    expect(sorted.at(-1)!.id).toBe('nopin');
    expect(sorted.at(-1)!.distanceMeters).toBeNull();
    expect(sorted).toHaveLength(4);
  });

  it('leaves the order untouched with no GPS fix', () => {
    const sorted = sortByDistance(stops, null);
    expect(sorted.map((s) => s.id)).toEqual(['far', 'near', 'middle']);
    expect(sorted.every((s) => s.distanceMeters === null)).toBe(true);
  });
});

describe('hasCoords', () => {
  it('rejects nulls and non-finite values', () => {
    expect(hasCoords({ latitude: 21.3, longitude: 74.8 })).toBe(true);
    expect(hasCoords({ latitude: null, longitude: 74.8 })).toBe(false);
    expect(hasCoords({ latitude: Number.NaN, longitude: 74.8 })).toBe(false);
  });
});

describe('formatDistance', () => {
  it('reads naturally for a rider', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(420)).toBe('420 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(45_000)).toBe('45 km');
    expect(formatDistance(null)).toBe('—');
  });
});
