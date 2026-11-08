/**
 * The on-device nearest-first ordering. This is the one piece of business logic
 * the app computes itself (so it keeps working offline), so it is tested here as
 * well as on the server.
 */
import { formatDistance, haversineMeters, sortByDistance } from '../src/lib/geo';

const SHIRPUR = { latitude: 21.3486, longitude: 74.8805 };

describe('haversineMeters', () => {
  it('matches the server implementation for a known pair', () => {
    const other = { latitude: 21.3586, longitude: 74.8805 };
    const metres = haversineMeters(SHIRPUR, other);
    expect(metres).toBeGreaterThan(1050);
    expect(metres).toBeLessThan(1160);
  });

  it('is zero for the same point', () => {
    expect(haversineMeters(SHIRPUR, SHIRPUR)).toBe(0);
  });
});

describe('sortByDistance', () => {
  const stops = [
    { id: 'far', latitude: 21.3588, longitude: 74.8915 },
    { id: 'near', latitude: 21.3498, longitude: 74.8811 },
    { id: 'middle', latitude: 21.3461, longitude: 74.8789 },
  ];

  it('puts the nearest stop first', () => {
    expect(sortByDistance(stops, SHIRPUR).map(s => s.id)).toEqual(['near', 'middle', 'far']);
  });

  it('honours a stop the rider dragged to the front', () => {
    const pinned = stops.map(s => (s.id === 'far' ? { ...s, pinnedFirst: true } : s));
    expect(sortByDistance(pinned, SHIRPUR).map(s => s.id)).toEqual(['far', 'near', 'middle']);
  });

  it('keeps customers without a pin at the end', () => {
    const withMissing = [...stops, { id: 'nopin', latitude: null, longitude: null }];
    const sorted = sortByDistance(withMissing, SHIRPUR);
    expect(sorted[sorted.length - 1]!.id).toBe('nopin');
  });

  it('does not reorder without a GPS fix', () => {
    expect(sortByDistance(stops, null).map(s => s.id)).toEqual(['far', 'near', 'middle']);
  });
});

describe('formatDistance', () => {
  it('reads naturally on the stop card', () => {
    expect(formatDistance(420)).toBe('420 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(null)).toBe('—');
  });
});
