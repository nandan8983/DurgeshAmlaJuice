/**
 * Foreground location: ask once, then watch.
 *
 * Only ACCESS_FINE_LOCATION while the app is open — the route never needs
 * background tracking, which keeps the Play Store declaration simple and the
 * rider's battery alive.
 */
import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { LOCATION_DISTANCE_FILTER_M } from '../config';
import type { Coords } from './geo';

Geolocation.setRNConfiguration({
  skipPermissionRequests: true,
  authorizationLevel: 'whenInUse',
  enableBackgroundLocationUpdates: false,
  locationProvider: 'auto',
});

export type PermissionState = 'unknown' | 'granted' | 'denied' | 'blocked';

export async function requestLocationPermission(): Promise<PermissionState> {
  if (Platform.OS !== 'android') return 'granted';
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location for your delivery route',
      message:
        'The app uses your location to show the nearest pending customer and to pin new customers at their door.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      error => reject(new Error(error.message)),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
    );
  });
}

export interface LocationHook {
  coords: Coords | null;
  accuracy: number | null;
  permission: PermissionState;
  error: string | null;
  request: () => Promise<void>;
  refresh: () => Promise<void>;
}

/** Live position, re-emitted whenever the rider moves far enough to matter. */
export function useLocation(watch = true): LocationHook {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  const request = async (): Promise<void> => {
    const state = await requestLocationPermission();
    setPermission(state);
    if (state !== 'granted') {
      setError('Location permission is needed to sort stops by distance.');
      return;
    }
    setError(null);
    try {
      const position = await getCurrentPosition();
      setCoords(position);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!watch || permission !== 'granted') return undefined;

    watchId.current = Geolocation.watchPosition(
      position => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setAccuracy(position.coords.accuracy ?? null);
        setError(null);
      },
      err => setError(err.message),
      {
        enableHighAccuracy: true,
        distanceFilter: LOCATION_DISTANCE_FILTER_M,
        interval: 10_000,
        fastestInterval: 5_000,
      },
    );

    return () => {
      if (watchId.current !== null) {
        Geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [watch, permission]);

  return {
    coords,
    accuracy,
    permission,
    error,
    request,
    refresh: async () => {
      try {
        setCoords(await getCurrentPosition());
      } catch (err) {
        setError((err as Error).message);
      }
    },
  };
}
