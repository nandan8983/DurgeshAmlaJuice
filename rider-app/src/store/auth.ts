/**
 * Auth state. The token and the API base URL live in AsyncStorage so a rider
 * stays logged in between shifts and the app can start offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_API_BASE_URL, STORAGE_KEYS } from '../config';
import { setApiBaseUrl, setAuthToken, setUnauthorizedHandler } from '../api/client';
import { login as loginRequest } from '../api/endpoints';
import type { AuthUser } from '../api/types';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  apiBaseUrl: string;
  loading: boolean;
  restored: boolean;
  error: string | null;
  restore: () => Promise<void>;
  login: (mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setApiBaseUrl: (url: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  apiBaseUrl: DEFAULT_API_BASE_URL,
  loading: false,
  restored: false,
  error: null,

  restore: async () => {
    try {
      const [token, userJson, baseUrl] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.token),
        AsyncStorage.getItem(STORAGE_KEYS.user),
        AsyncStorage.getItem(STORAGE_KEYS.apiBaseUrl),
      ]);
      const url = baseUrl ?? DEFAULT_API_BASE_URL;
      setApiBaseUrl(url);
      setAuthToken(token);
      set({
        token,
        user: userJson ? (JSON.parse(userJson) as AuthUser) : null,
        apiBaseUrl: url,
        restored: true,
      });
    } catch {
      set({ restored: true });
    }
  },

  login: async (mobile, password) => {
    set({ loading: true, error: null });
    try {
      const result = await loginRequest(mobile.trim(), password);
      if (result.user.role !== 'rider' && result.user.role !== 'admin') {
        // Supervisors use the web dashboard; let an admin in for testing.
        throw new Error('This app is for riders. Supervisors use the web dashboard.');
      }
      setAuthToken(result.token);
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.token, result.token),
        AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(result.user)),
      ]);
      set({ token: result.token, user: result.user, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
      throw err;
    }
  },

  logout: async () => {
    setAuthToken(null);
    // The queue is deliberately left alone: unsynced deliveries must survive a
    // logout, or a rider who logs out in a dead spot loses their morning.
    await Promise.all(
      [
        STORAGE_KEYS.token,
        STORAGE_KEYS.user,
        STORAGE_KEYS.routeCache,
        STORAGE_KEYS.customersCache,
      ].map(key => AsyncStorage.removeItem(key)),
    );
    set({ token: null, user: null, error: null });
  },

  setApiBaseUrl: async (url: string) => {
    const clean = url.trim().replace(/\/+$/, '');
    setApiBaseUrl(clean);
    await AsyncStorage.setItem(STORAGE_KEYS.apiBaseUrl, clean);
    set({ apiBaseUrl: clean });
  },
}));

// A 401 mid-shift drops the rider back to the login screen rather than
// leaving them tapping Delivered into the void.
setUnauthorizedHandler(() => {
  void useAuthStore.getState().logout();
});
