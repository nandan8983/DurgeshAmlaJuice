/** Session state. The token lives in localStorage; the role drives the nav. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../lib/api';
import type { AuthUser } from '../lib/types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (mobile: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  // Revalidate the stored token on load: a deactivated account should not get
  // a working dashboard just because the browser kept its token.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(result => setUser(result.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (mobile: string, password: string) => {
    setError(null);
    try {
      const result = await api.login(mobile.trim(), password);
      if (result.user.role === 'rider') {
        throw new Error('Riders use the Android app, not this dashboard.');
      }
      tokenStore.set(result.token);
      setUser(result.user);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, login, logout }),
    [user, loading, error, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
