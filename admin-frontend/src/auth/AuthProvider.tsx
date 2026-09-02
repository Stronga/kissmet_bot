import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, onUnauthorized } from "../api/client";

export type AuthUser = {
  id: number;
  displayName: string;
  email: string | null;
  username: string | null;
  role: string | null;
  permissions: string[];
  staffId: number | null;
};

type Ctx = {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  has: (permission: string) => boolean;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onUnauthorized(() => {
      localStorage.removeItem("kissmet_admin_token");
      setUser(null);
    });
    const token = localStorage.getItem("kissmet_admin_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api<{ user: AuthUser }>("/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => {
        localStorage.removeItem("kissmet_admin_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      user,
      loading,
      async login(identifier, password) {
        const res = await api<{ token: string; user: AuthUser }>("/auth/staff/login", {
          method: "POST",
          body: JSON.stringify({ identifier, password }),
        });
        localStorage.setItem("kissmet_admin_token", res.token);
        setUser(res.user);
      },
      async logout() {
        try { await api("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
        localStorage.removeItem("kissmet_admin_token");
        setUser(null);
      },
      has: (permission) => Boolean(user?.permissions.includes(permission)),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth requires AuthProvider");
  return ctx;
}
