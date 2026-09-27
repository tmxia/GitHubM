import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { GitHubUser, GitHubRateLimit, SavedAccount } from '@/types/types';
import { getCurrentUser, getRateLimit, setToken } from '@/services/github';
import { pageCache } from '@/lib/page-cache';

interface AuthContextValue {
  token: string | null;
  user: GitHubUser | null;
  isAuthenticated: boolean;
  rateLimit: GitHubRateLimit | null;
  loading: boolean;
  savedAccounts: SavedAccount[];
  login: (token: string) => Promise<void>;
  logout: () => void;
  switchAccount: (token: string) => Promise<void>;
  removeAccount: (token: string) => void;
  refreshRateLimit: () => Promise<void>;
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
  } catch { /* 配额满/隐私模式：静默失败 */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [rateLimit, setRateLimit] = useState<GitHubRateLimit | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => loadAccounts());

  const refreshRateLimit = useCallback(async () => {
    try {
      const { rate } = await getRateLimit();
      setRateLimit(rate);
    } catch {
    }
  }, []);

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
    setToken(newToken); // 用于发请求鉴权
    try {
      const userData = await getCurrentUser();
      try { localStorage.setItem(TOKEN_KEY, newToken); } catch { /* ignore */ }
      setTokenState(newToken);
      setUser(userData);
      setIsAuthenticated(true);
      persistAccount(newToken, userData);
      refreshRateLimit();
    } catch (e) {
      setToken(prevToken);
      throw e;
    }
  }, [refreshRateLimit, persistAccount, token]);

  const switchAccount = useCallback(async (switchToken: string) => {
    const prevToken = token;
    setToken(switchToken);
    try {
      const userData = await getCurrentUser();
      try { localStorage.setItem(TOKEN_KEY, switchToken); } catch { /* ignore */ }
      setTokenState(switchToken);
      setUser(userData);
      setIsAuthenticated(true);
      persistAccount(switchToken, userData);
      refreshRateLimit();
    } catch (e) {
      setToken(prevToken);
      throw e;
    }
  }, [refreshRateLimit, persistAccount, token]);

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
    setRateLimit(null);
    pageCache.clear(); // 登出时清空所有页面缓存
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      setToken(savedToken);
      getCurrentUser()
        .then((userData) => {
          setUser(userData);
          setIsAuthenticated(true);
          refreshRateLimit();
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
  }, [refreshRateLimit]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(refreshRateLimit, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshRateLimit]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onOnline = () => {
      getCurrentUser()
        .then((userData) => setUser(userData))
        .catch(() => { /* 仍失败则保持缓存快照 */ })
        .finally(() => refreshRateLimit());
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [isAuthenticated, refreshRateLimit]);

  return (
    <AuthContext.Provider
      value={{
        token, user, isAuthenticated, rateLimit, loading,
        savedAccounts, login, logout, switchAccount, removeAccount,
        refreshRateLimit, refreshUser, updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
