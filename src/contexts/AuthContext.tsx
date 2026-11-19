import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { GitHubUser, SavedAccount } from '@/types/types';
import { getCurrentUser, setToken } from '@/services/github';
import { pageCache } from '@/lib/page-cache';
import { useRateLimitStore } from '@/stores/rateLimitStore';

interface AuthContextValue {
  token: string | null;
  user: GitHubUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  savedAccounts: SavedAccount[];
  login: (token: string) => Promise<void>;
  logout: () => void;
  switchAccount: (token: string) => Promise<void>;
  removeAccount: (token: string) => void;
  refreshUser: () => Promise<void>;
  updateUser: (newUser: GitHubUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'github_manager_token';
const ACCOUNTS_KEY = 'github_manager_accounts';

function loadAccounts(): SavedAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveAccounts(accounts: SavedAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => loadAccounts());

  const persistAccount = useCallback((newToken: string, userData: GitHubUser) => {
    setSavedAccounts((prev) => {
      const filtered = prev.filter((a) => a.token !== newToken);
      const updated = [{ token: newToken, user: userData, addedAt: new Date().toISOString() }, ...filtered];
      saveAccounts(updated);
      return updated;
    });
  }, []);

  const login = useCallback(async (newToken: string) => {
    const prevToken = token;
    setToken(newToken);
    try {
      const userData = await getCurrentUser();
      try { localStorage.setItem(TOKEN_KEY, newToken); } catch {}
      setTokenState(newToken);
      setUser(userData);
      setIsAuthenticated(true);
      persistAccount(newToken, userData);
      useRateLimitStore.getState().refresh();
    } catch (e) {
      setToken(prevToken);
      throw e;
    }
  }, [persistAccount, token]);

  const switchAccount = useCallback(async (switchToken: string) => {
    const prevToken = token;
    setToken(switchToken);
    try {
      const userData = await getCurrentUser();
      try { localStorage.setItem(TOKEN_KEY, switchToken); } catch {}
      setTokenState(switchToken);
      setUser(userData);
      setIsAuthenticated(true);
      persistAccount(switchToken, userData);
      useRateLimitStore.getState().refresh();
    } catch (e) {
      setToken(prevToken);
      throw e;
    }
  }, [persistAccount, token]);

  const removeAccount = useCallback((removeToken: string) => {
    setSavedAccounts((prev) => {
      const updated = prev.filter((a) => a.token !== removeToken);
      saveAccounts(updated);
      return updated;
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
      if (token) {
        setSavedAccounts((prev) => {
          const updated = prev.map((a) =>
            a.token === token ? { ...a, user: userData } : a
          );
          saveAccounts(updated);
          return updated;
        });
      }
    } catch {
    }
  }, [token]);

  const updateUser = useCallback((newUser: GitHubUser) => {
    setUser(newUser);
    if (token) {
      setSavedAccounts((prev) => {
        const updated = prev.map((a) =>
          a.token === token ? { ...a, user: newUser } : a
        );
        saveAccounts(updated);
        return updated;
      });
    }
  }, [token]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setTokenState(null);
    setUser(null);
    setIsAuthenticated(false);
    useRateLimitStore.getState().clear();
    pageCache.clear();
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      setToken(savedToken);
      getCurrentUser()
        .then((userData) => {
          setUser(userData);
          setIsAuthenticated(true);
          useRateLimitStore.getState().refresh();
        })
        .catch((err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            setTokenState(null);
            setToken(null);
            setIsAuthenticated(false);
          } else {
            const accounts = loadAccounts();
            const cached = accounts.find((a) => a.token === savedToken);
            if (cached?.user) setUser(cached.user);
            setIsAuthenticated(true);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => useRateLimitStore.getState().refresh(), 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onOnline = () => {
      getCurrentUser()
        .then((userData) => setUser(userData))
        .catch(() => {})
        .finally(() => useRateLimitStore.getState().refresh());
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [isAuthenticated]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token, user, isAuthenticated, loading,
      savedAccounts, login, logout, switchAccount, removeAccount,
      refreshUser, updateUser,
    }),
    [token, user, isAuthenticated, loading, savedAccounts, login, logout, switchAccount, removeAccount, refreshUser, updateUser],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
