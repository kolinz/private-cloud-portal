// packages/frontend/src/hooks/useAuth.ts
import {
  createContext, useContext, useEffect, useState,
  type FC, type ReactNode,
} from 'react';
import { api, type UserDTO, ApiError } from '../api/client.ts';

// ── Context 型 ────────────────────────────────────────
type AuthContextType = {
  user:      UserDTO | null;
  isAdmin:   boolean;
  isLoading: boolean;
  login:     (username: string, password: string) => Promise<void>;
  logout:    () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

// ── Provider ─────────────────────────────────────────
export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user,      setUser]      = useState<UserDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.auth.me()
      .then(res => setUser(res.user))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.auth.login({ username, password });
    setUser(res.user);
    // ターミナルWS用にセッションIDを保存（開発用）
    if (res.user.id) {
      sessionStorage.setItem('terminal_uid', res.user.id);
    }
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAdmin:   user?.role === 'admin',
      isLoading,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// ── Hook ─────────────────────────────────────────────
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
