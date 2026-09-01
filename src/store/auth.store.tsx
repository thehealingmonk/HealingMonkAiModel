import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  AuthUser,
  Role,
  fetchMe,
  getToken,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
} from '@/services/api';
import { setPanelLock } from '@/lib/panelLock';
// heelo
interface AuthContextValue {
  user: AuthUser | null;
  permissions: string[];
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Restore session from a stored token on first load.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user, permissions } = await fetchMe();
        if (!cancelled) {
          setUser(user);
          setPermissions(permissions);
        }
      } catch {
        apiLogout(); // token invalid/expired
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setUser(res.user);
    setPermissions(res.permissions);
    return res.user;
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await apiRegister(name, email, password);
    setUser(res.user);
    setPermissions(res.permissions);
    return res.user;
  };

  const logout = () => {
    apiLogout();
    setPanelLock(false); // signing out returns to normal (no forced panel on next launch)
    setUser(null);
    setPermissions([]);
  };

  const hasRole = (...roles: Role[]) => !!user && roles.includes(user.role);
  const can = (permission: string) => permissions.includes(permission);

  return (
    <AuthContext.Provider
      value={{ user, permissions, loading, login, register, logout, hasRole, can }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
