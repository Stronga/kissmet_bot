import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { FormEvent, useEffect, useState } from "react";
import { api } from "./api/client";
import { useAuth } from "./auth/AuthProvider";
import { Shell } from "./components/Shell";
import {
  AnnouncementsPage, ApplicationPage, BookingPage, DocumentsPage, HomePage, LoginPage,
  MaintenancePage, MessagesPage, MorePage, PaymentsPage, ProfilePage, ReceiptDetailPage,
  RegisterPage, RoomPage,
} from "./pages/Pages";

function Protected({ children }: { children: import('react').ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-6">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function VerifyOtp() {
  const location = useLocation() as { state?: any };
  const nav = useNavigate();
  const { login, user } = useAuth();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [ctx, setCtx] = useState<any>(null);
  useEffect(() => {
    const fromNav = location.state;
    const stored = sessionStorage.getItem("kissmet_otp_ctx");
    const next = fromNav ?? (stored ? JSON.parse(stored) : null);
    if (fromNav) sessionStorage.setItem("kissmet_otp_ctx", JSON.stringify(fromNav));
    setCtx(next);
  }, [location.state]);
  if (user) return <Navigate to="/home" replace />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ctx) { setError("Start from log in or register first."); return; }
    try {
      if (ctx.mode === "register") {
        const res = await api<any>("/auth/register/verify-otp", { method: "POST", body: JSON.stringify({ phone: ctx.phone, otp }) });
        login(res.token, res.user);
      } else {
        const res = await api<any>("/auth/resident/verify-otp", { method: "POST", body: JSON.stringify({ institutionCode: ctx.institutionCode, studentId: ctx.studentId, otp }) });
        login(res.token, res.user);
      }
      sessionStorage.removeItem("kissmet_otp_ctx");
      nav("/home");
    } catch (err) { setError(err instanceof Error ? err.message : "Invalid code"); }
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Enter verification code</h1>
      <p className="mt-2 text-sm text-slate-500">If we have that account, a code was sent to the registered phone. Development OTPs are printed in the API console.</p>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm">6-digit code
          <input value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} className="mt-1 min-h-12 w-full rounded-2xl border px-3" />
        </label>
        <button className="min-h-12 w-full rounded-2xl bg-primary text-white">Verify</button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-otp" element={<VerifyOtp />} />
      <Route element={<Protected><Shell /></Protected>}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/application" element={<ApplicationPage />} />
        <Route path="/booking" element={<BookingPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/receipts/:id" element={<ReceiptDetailPage />} />
        <Route path="/room" element={<RoomPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/more" element={<MorePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
