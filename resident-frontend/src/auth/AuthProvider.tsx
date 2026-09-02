import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, onUnauthorized } from "../api/client";

export type AuthUser = { id: number; displayName: string; residentId: number | null; role: string | null };
type Ctx = { user: AuthUser | null; loading: boolean; login: (token: string, user: AuthUser) => void; logout: () => Promise<void> };
const Ctx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    onUnauthorized(() => { localStorage.removeItem("kissmet_resident_token"); setUser(null); });
    if (!localStorage.getItem("kissmet_resident_token")) { setLoading(false); return; }
    api<{ user: AuthUser }>("/auth/me").then((r) => setUser(r.user)).catch(() => { localStorage.removeItem("kissmet_resident_token"); setUser(null); }).finally(() => setLoading(false));
  }, []);
  const value = useMemo<Ctx>(() => ({
    user, loading,
    login(token, next) { localStorage.setItem("kissmet_resident_token", token); setUser(next); },
    async logout() { try { await api("/auth/logout", { method: "POST" }); } catch {} localStorage.removeItem("kissmet_resident_token"); setUser(null); },
  }), [user, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("auth");
  return v;
}
