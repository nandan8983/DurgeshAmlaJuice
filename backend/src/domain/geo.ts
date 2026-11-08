/**
 * Distance helpers. The rider app does the same maths on-device from its live
 * GPS fix (see rider-app/src/lib/geo.ts) so nearest-first works offline; the
 * server keeps a copy for reports and for ordering a freshly generated route.
 */

export interface Coords {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres (Haversine). */
export function haversineMeters(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
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
 * Sort stops nearest-first from `origin`. Stops without coordinates keep their
 * relative order and go last — a customer whose pin was never set should still
 * be visible to the rider, just not jumped to.
 */
export function sortByDistance<T extends { latitude?: number | null; longitude?: number | null }>(
  stops: readonly T[],
  origin: Coords | null,
): Array<T & { distanceMeters: number | null }> {
  const withDistance = stops.map((stop) => ({
    ...stop,
    distanceMeters: origin && hasCoords(stop) ? haversineMeters(origin, stop) : null,
  }));
  if (!origin) return withDistance;
  return withDistance.sort((x, y) => {
    if (x.distanceMeters === null && y.distanceMeters === null) return 0;
    if (x.distanceMeters === null) return 1;
    if (y.distanceMeters === null) return -1;
    return x.distanceMeters - y.distanceMeters;
  });
}

export function formatDistance(meters: number | null): string {
  if (meters === null) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}
