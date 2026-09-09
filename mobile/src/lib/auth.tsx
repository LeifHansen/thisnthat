import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ApiError,
  apiLogin,
  apiMe,
  apiRegister,
  setAuthToken,
  setUnauthorizedHandler,
  type MobileUser,
} from '@/lib/api';

// Auth state for the app. The bearer token is persisted in the device
// keychain (expo-secure-store) and pushed into the API client so every request
// carries it. On launch we re-hydrate: read the stored token, set it, and
// verify it with /api/mobile/me (which also catches a revoked/suspended
// account). SecureStore is native-only; on web it throws, so we guard it.

const TOKEN_KEY = 'bx.authToken';

async function storeToken(token: string | null) {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // web / unsupported — token stays in memory for the session only
  }
}

async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

type AuthContextValue = {
  user: MobileUser | null;
  /** True until the initial token re-hydration completes. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const apply = useCallback((token: string | null, u: MobileUser | null) => {
    setAuthToken(token);
    setUser(u);
    void storeToken(token);
  }, []);

  // Re-hydrate on launch.
  useEffect(() => {
    mounted.current = true;
    (async () => {
      const token = await readToken();
      if (!token) {
        if (mounted.current) setLoading(false);
        return;
      }
      setAuthToken(token);
      try {
        const { user: u } = await apiMe();
        if (mounted.current) setUser(u);
      } catch (e) {
        // ONLY a real 401 means the token is bad (expired/revoked/suspended) —
        // clear it. A network error or 5xx (e.g. launching offline) must NOT
        // wipe the credential; keep it and try again next launch.
        if (e instanceof ApiError && e.status === 401) {
          setAuthToken(null);
          await storeToken(null);
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  // Any authed request that 401s mid-session signs the user out cleanly.
  useEffect(() => {
    setUnauthorizedHandler(() => apply(null, null));
    return () => setUnauthorizedHandler(null);
  }, [apply]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { token, user: u } = await apiLogin(email, password);
      apply(token, u);
    },
    [apply],
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      const { token, user: u } = await apiRegister({
        ...input,
        agreedToTerms: true,
      });
      apply(token, u);
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    apply(null, null);
  }, [apply]);

  const value = useMemo(
    () => ({ user, loading, signIn, register, signOut }),
    [user, loading, signIn, register, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
