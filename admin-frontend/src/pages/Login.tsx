import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button, ErrorBox, Input } from "../components/ui";

export function LoginPage() {
  const { user, login } = useAuth();
  const [identifier, setIdentifier] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(identifier, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-primary">Kissmet Hostel</p>
          <h1 className="mt-1 text-2xl font-semibold">Admin sign in</h1>
        </div>
        {error ? <ErrorBox message={error} /> : null}
        <label className="block text-sm">Username or email
          <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">Password
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
        </label>
        <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
    </div>
  );
}
