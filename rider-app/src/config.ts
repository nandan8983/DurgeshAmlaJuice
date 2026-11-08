/**
 * The one place that knows where the API lives.
 *
 * Moving between the owner's own server (Cloudflare Tunnel) and Render is a
 * change to `DEFAULT_API_BASE_URL` — or, in the field, the override a rider can
 * type on the login screen, which is stored on the device.
 */
import { Platform } from 'react-native';

/**
 * 10.0.2.2 is how the Android emulator reaches the host machine's localhost.
 * Replace with your deployed URL, e.g. https://api.durgeshamlajuice.in
 */
export const DEFAULT_API_BASE_URL = __DEV__
  ? Platform.select({ android: 'http://10.0.2.2:4000', default: 'http://localhost:4000' })!
  : 'https://api.durgeshamlajuice.in';

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
