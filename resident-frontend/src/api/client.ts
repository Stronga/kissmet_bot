const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";
let on401: (() => void) | null = null;
export function onUnauthorized(h: () => void) { on401 = h; }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("kissmet_resident_token");
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) { on401?.(); throw new Error("Please sign in again"); }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? "Request failed");
  return body as T;
}
