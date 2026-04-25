"use client";

import { useRouter } from "next/navigation";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AuthUser,
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  loginAccount,
  logoutAccount,
  registerAccount,
  registerUnauthorizedHandler,
  setAuthSession,
} from "@/lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: {
    email: string;
    full_name: string;
    password: string;
  }) => Promise<AuthUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Hydrate from localStorage once, on mount.
  useEffect(() => {
    setUser(getStoredUser());
    setAccessToken(getAccessToken());
    setIsReady(true);
  }, []);

  // Centralized 401 handler: any API call returning 401 will sign the user out.
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      clearAuthSession();
      setUser(null);
      setAccessToken(null);
      router.push("/login");
    });
  }, [router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginAccount(email, password);
      setAuthSession({
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        user: result.user,
      });
      setUser(result.user);
      setAccessToken(result.access_token);
      return result.user;
    },
    [],
  );

  const register = useCallback(
    async (payload: { email: string; full_name: string; password: string }) => {
      const result = await registerAccount(payload);
      // In dev mode the backend returns access_token alongside the user_id —
      // log the user straight in. In prod the user has to log in manually.
      if (result.access_token) {
        const fallbackUser: AuthUser = {
          id: result.user_id,
          email: payload.email,
          full_name: payload.full_name,
          role: "analyst",
        };
        setAuthSession({ accessToken: result.access_token, user: fallbackUser });
        setUser(fallbackUser);
        setAccessToken(result.access_token);
        return fallbackUser;
      }
      return null;
    },
    [],
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await logoutAccount(refreshToken);
      } catch {
        // Best-effort blacklist — clear session regardless.
      }
    }
    clearAuthSession();
    setUser(null);
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, accessToken, isReady, login, register, logout }),
    [user, accessToken, isReady, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
