/**
 * The one place that knows where the API lives.
 *
 * Moving between the owner's own server (Cloudflare Tunnel) and Render is a
 * change to `DEFAULT_API_BASE_URL` — or, in the field, the override a rider can
 * type on the login screen, which is stored on the device.
 */
import { Platform } from 'react-native';

/**
 * Debug builds talk to the machine running Metro — 10.0.2.2 is how the Android
 * emulator reaches the host's localhost. Release builds use the deployed API.
 *
 * Change PRODUCTION_API_BASE_URL when the API moves (a custom domain, or off
 * Render onto the owner's own server behind Cloudflare Tunnel). A rider can
 * also override it on the login screen without a rebuild, which is what to do
 * for a one-off handset or while testing.
 */
const PRODUCTION_API_BASE_URL = 'https://daj-api.onrender.com';

export const DEFAULT_API_BASE_URL = __DEV__
  ? Platform.select({ android: 'http://10.0.2.2:4000', default: 'http://localhost:4000' })!
  : PRODUCTION_API_BASE_URL;

/** How long cached route/customer data is considered usable while offline. */
export const OFFLINE_CACHE_TTL_MS = 36 * 60 * 60 * 1000;

/** Nearest-stop recalculation happens whenever the fix moves this far. */
export const LOCATION_DISTANCE_FILTER_M = 20;

export const STORAGE_KEYS = {
  token: 'daj.auth.token',
  user: 'daj.auth.user',
  apiBaseUrl: 'daj.config.apiBaseUrl',
  queue: 'daj.queue.v1',
  routeCache: 'daj.cache.route',
  customersCache: 'daj.cache.customers',
} as const;
