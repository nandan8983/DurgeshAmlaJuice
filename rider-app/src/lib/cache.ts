/**
 * Read-through cache on AsyncStorage.
 *
 * The route and the customer list are written here on every successful fetch,
 * so a rider who starts their round in a dead spot still sees this morning's
 * stops instead of an empty screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OFFLINE_CACHE_TTL_MS } from '../config';

interface Envelope<T> {
  savedAt: number;
  data: T;
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: Envelope<T> = { savedAt: Date.now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // A full disk must not break the delivery flow.
  }
}

export async function readCache<T>(
  key: string,
  ttlMs = OFFLINE_CACHE_TTL_MS,
): Promise<{ data: T; savedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Envelope<T>;
    if (Date.now() - envelope.savedAt > ttlMs) return null;
    return { data: envelope.data, savedAt: envelope.savedAt };
  } catch {
    return null;
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}
