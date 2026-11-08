/**
 * Distance maths on the phone.
 *
 * Nearest-first has to work with no signal, so the ordering is computed here
 * from the device's own GPS fix rather than asked of the server. Mirrors
 * backend/src/domain/geo.ts.
 */

export interface Coords {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineMeters(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function hasCoords(value: {
  latitude?: number | null;
  longitude?: number | null;
}): value is Coords {
  return (
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude)
  );
}

/**
 * Nearest-first ordering. A stop the rider pinned to the front (`pinnedFirst`)
 * stays first; customers with no pin keep their order at the end.
 */
export function sortByDistance<
  T extends { latitude?: number | null; longitude?: number | null; pinnedFirst?: boolean },
>(stops: readonly T[], origin: Coords | null): Array<T & { distanceMeters: number | null }> {
  const withDistance = stops.map(stop => ({
    ...stop,
    distanceMeters: origin && hasCoords(stop) ? haversineMeters(origin, stop) : null,
  }));

  return withDistance.sort((x, y) => {
    if (x.pinnedFirst && !y.pinnedFirst) return -1;
    if (y.pinnedFirst && !x.pinnedFirst) return 1;
    if (x.distanceMeters === null && y.distanceMeters === null) return 0;
    if (x.distanceMeters === null) return 1;
    if (y.distanceMeters === null) return -1;
    return x.distanceMeters - y.distanceMeters;
  });
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}
