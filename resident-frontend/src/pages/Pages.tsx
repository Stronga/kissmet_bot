import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { formatMinorUnits, parseMoneyToMinorUnits } from "../utils/money";
import { deriveNextAction, journeySteps, type JourneyState } from "../utils/nextAction";

function Box({ children }: { children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">{children}</section>;
}
function Primary({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="min-h-12 w-full rounded-2xl bg-primary px-4 text-base font-medium text-white disabled:opacity-50">{children}</button>;
}
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return <label className="block text-sm">{label}<input {...rest} className="mt-1 min-h-12 w-full rounded-2xl border border-slate-200 px-3" /></label>;
}

export function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institutionCode, setInstitutionCode] = useState("ug");
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ items: any[] }>("/public/institutions").then((r) => setInstitutions(r.items)).catch(() => setInstitutions([])); }, []);
  if (user) return <Navigate to="/home" replace />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/auth/resident/request-otp", { method: "POST", body: JSON.stringify({ institutionCode, studentId }) });
      nav("/verify-otp", { state: { institutionCode, studentId, mode: "login" } });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send code"); }
    finally { setBusy(false); }
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Resident log in</h1>
      <p className="mt-1 text-sm text-slate-500">Use your institution and student ID. We will send an OTP to your registered phone.</p>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm">Institution
          <select className="mt-1 min-h-12 w-full rounded-2xl border px-3" value={institutionCode} onChange={(e) => setInstitutionCode(e.target.value)}>
            {institutions.map((i) => <option key={i.id} value={i.code}>{i.name}</option>)}
          </select>
        </label>
        <Field label="Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
        <Primary disabled={busy}>{busy ? "Sending…" : "Send OTP"}</Primary>
      </form>
      <Link to="/register" className="mt-6 text-center text-sm text-primary">New applicant? Register</Link>
    </div>
  );
}

export function RegisterPage() {
  const nav = useNavigate();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api<{ items: any[] }>("/public/institutions").then((r) => setInstitutions(r.items)); }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      firstName: fd.get("firstName"), lastName: fd.get("lastName"), middleName: fd.get("middleName") || null,
      gender: fd.get("gender"), phone: fd.get("phone"), email: fd.get("email") || null,
      institutionId: Number(fd.get("institutionId")), studentId: fd.get("studentId"),
    };
    try {
      await api("/auth/register/request-otp", { method: "POST", body: JSON.stringify(payload) });
      nav("/verify-otp", { state: { mode: "register", phone: payload.phone } });
    } catch (err) { setError(err instanceof Error ? err.message : "Registration failed"); }
  }
  return (
    <div className="mx-auto min-h-screen max-w-lg p-6">
      <h1 className="text-2xl font-semibold">Create account</h1>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      <form onSubmit={submit} className="mt-6 space-y-3">
        <Field label="First name" name="firstName" required />
        <Field label="Last name" name="lastName" required />
        <Field label="Middle name" name="middleName" />
        <label className="block text-sm">Gender<select name="gender" className="mt-1 min-h-12 w-full rounded-2xl border px-3"><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
        <label className="block text-sm">Institution<select name="institutionId" className="mt-1 min-h-12 w-full rounded-2xl border px-3">{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
        <Field label="Student ID" name="studentId" required />
        <Field label="Phone" name="phone" required placeholder="+233..." />
        <Field label="Email" name="email" />
        <Primary>Send verification code</Primary>
      </form>
      <Link to="/login" className="mt-4 block text-center text-sm text-primary">Already registered? Log in</Link>
    </div>
  );
}

export function VerifyOtpPage() {
  const nav = useNavigate();
  const { login } = useAuth();
  const state = (history.state && (history.state as any).usr) || (window.history.state && window.history.state.usr) || {};
  const locState = (nav as any);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const passed = (typeof window !== "undefined" && (window as any).__otpState) || state;
  const [ctx] = useState(() => {
    const s = (typeof window !== "undefined") ? sessionStorage.getItem("kissmet_otp_ctx") : null;
    return s ? JSON.parse(s) : passed;
  });
  useEffect(() => {
    const raw = sessionStorage.getItem("kissmet_otp_ctx");
    if (!raw && (state.mode || state.phone || state.studentId)) sessionStorage.setItem("kissmet_otp_ctx", JSON.stringify(state));
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if ((ctx.mode ?? "login") === "register") {
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
      <p className="mt-2 text-sm text-slate-500">Check the phone number we have on file. Development OTPs are printed in the API console.</p>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} required />
        <Primary>Verify</Primary>
      </form>
    </div>
  );
}

function useHome() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = () => {
    setLoading(true);
    api("/resident/home").then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);
  return { data, error, loading, reload };
}

function toJourney(data: any): JourneyState {
  const docs = data?.documents ?? [];
  const types = new Set(docs.filter((d: any) => d.status !== "rejected" && d.status !== "deleted").map((d: any) => d.documentType));
  const payments = data?.payments ?? [];
  return {
    hasAccount: true,
    profileComplete: Boolean(data?.profile?.first_name && data?.profile?.last_name && data?.profile?.student_id),
    hasStudentCard: types.has("student_card"),
    hasGhanaCard: types.has("ghana_card"),
    applicationStatus: data?.application?.status ?? null,
    bookingStatus: data?.booking?.status ?? null,
    paymentSummary: data?.paymentSummary ? {
      outstandingMinor: data.paymentSummary.outstandingMinor,
      confirmationRequirementMet: data.paymentSummary.confirmationRequirementMet,
      hasSubmittedUnverified: payments.some((p: any) => p.status === "submitted" || p.status === "pending"),
    } : null,
    hasActiveAllocation: Boolean(data?.allocation),
    allocationLabel: data?.allocation ? `${data.allocation.room_name ?? data.allocation.room_code}, Bed ${data.allocation.bed_label}` : null,
  };
}

export function HomePage() {
  const { data, error, loading } = useHome();
  if (loading) return <p>Loading…</p>;
  if (error) return <p className="text-rose-700">{error}</p>;
  const journey = toJourney(data);
  const next = deriveNextAction(journey);
  const steps = journeySteps(journey);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {data.profile?.first_name}</h1>
        <p className="text-sm text-slate-500">{data.profile?.resident_code} · {data.profile?.institution_name}</p>
      </div>
      <Box>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your journey</p>
        <ol className="mt-3 space-y-2">{steps.map((s) => <li key={s.label} className="flex justify-between text-sm"><span>{s.label}</span><span className="capitalize text-slate-500">{s.state.replace("_", " ")}</span></li>)}</ol>
      </Box>
      <Link to={next.to ?? "/home"} className="block rounded-3xl bg-primary p-5 text-white">
        <p className="text-sm opacity-80">Next action</p>
        <p className="mt-1 text-xl font-semibold">{next.title}</p>
        <p className="mt-2 text-sm opacity-90">{next.body}</p>
      </Link>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/application" className="rounded-3xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Application</p><p className="font-medium capitalize">{data.application?.status ?? "Not started"}</p></Link>
        <Link to="/booking" className="rounded-3xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Booking</p><p className="font-medium capitalize">{data.booking?.status ?? "None"}</p></Link>
        <Link to="/payments" className="rounded-3xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Outstanding</p><p className="font-medium">{data.paymentSummary ? formatMinorUnits(data.paymentSummary.outstandingMinor, data.paymentSummary.currency) : "Unavailable"}</p></Link>
        <Link to="/room" className="rounded-3xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Room</p><p className="font-medium">{data.allocation ? data.allocation.room_code : "Not assigned yet"}</p></Link>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/resident/profile").then(setData); }, []);
  if (!data) return <p>Loading…</p>;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <Box>
        <p>{data.first_name} {data.middle_name} {data.last_name}</p>
        <p className="text-sm text-slate-500">{data.resident_code}</p>
        <p className="text-sm">{data.phone}</p>
        <p className="text-sm">{data.email ?? "No email"}</p>
        <p className="mt-3 text-sm">{data.institution_name} · {data.student_id}</p>
        <p className="text-xs text-slate-500">Institution and student ID cannot be edited here.</p>
      </Box>
    </div>
  );
}

export function DocumentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  const load = () => api<{ items: any[] }>("/resident/documents").then((r) => setItems(r.items));
  useEffect(() => { load(); }, []);
  async function upload(type: string, file: File) {
    const fd = new FormData();
    fd.set("documentType", type);
    fd.set("file", file);
    try { await api("/resident/documents", { method: "POST", body: fd }); load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Upload failed"); }
  }
  const current = (type: string) => items.find((d) => d.documentType === type);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Documents</h1>
      <p className="text-sm text-slate-500">PDF, JPG, PNG or WebP — maximum 5 MB. Files stay private.</p>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {["student_card", "ghana_card"].map((type) => {
        const doc = current(type);
        return (
          <Box key={type}>
            <p className="font-medium">{type === "student_card" ? "Student Card" : "Ghana Card"}</p>
            <p className="text-sm capitalize text-slate-500">{doc ? doc.status : "Not uploaded"}</p>
            <input className="mt-3" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(type, f); }} />
          </Box>
        );
      })}
    </div>
  );
}

export function ApplicationPage() {
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const load = () => api<{ items: any[] }>("/resident/applications").then((r) => setItems(r.items));
  useEffect(() => { load(); }, []);
  const current = items[0];
  async function start() { await api("/resident/applications", { method: "POST", body: "{}" }); load(); }
  async function submit() {
    try { await api(`/resident/applications/${current.id}/submit`, { method: "POST" }); load(); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Could not submit"); }
  }
  if (!current) return <div className="space-y-4"><h1 className="text-2xl font-semibold">Application</h1><Box><p>You have not started an application for the current academic session.</p><Primary className="mt-4" onClick={start}>Start application</Primary></Box></div>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Application</h1>
      {msg ? <p className="text-sm text-rose-700">{msg}</p> : null}
      <Box>
        <p className="text-sm text-slate-500">{current.application_number}</p>
        <p className="mt-1 text-xl font-semibold capitalize">{current.status.replace("_", " ")}</p>
        {current.status === "approved" ? <p className="mt-3 text-sm">Approval allows the booking process to continue. It does not mean a bed has been assigned yet.</p> : null}
        {current.status === "draft" ? <div className="mt-4"><Primary onClick={submit}>Submit application</Primary></div> : null}
        {current.status === "submitted" || current.status === "under_review" ? <p className="mt-3 text-sm">Kissmet staff will review your application.</p> : null}
      </Box>
    </div>
  );
}

export function BookingPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/resident/booking").then(setData); }, []);
  if (!data) return <p>Loading…</p>;
  if (!data.booking) return <Box><p>No booking yet. Approval does not create a booking automatically.</p></Box>;
  const b = data.booking;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Booking</h1>
      <Box>
        <p className="text-sm text-slate-500">{b.booking_number}</p>
        <p className="text-xl font-semibold capitalize">{b.status}</p>
        <p className="mt-2">{formatMinorUnits(b.total_amount_minor, b.currency)}</p>
        {b.status === "confirmed" ? <p className="mt-3 text-sm">Your booking is confirmed. Room assignment is still pending until an allocation is made.</p> : null}
        {data.paymentSummary ? <p className="mt-2 text-sm">Outstanding: {formatMinorUnits(data.paymentSummary.outstandingMinor, data.paymentSummary.currency)}</p> : null}
      </Box>
    </div>
  );
}

export function PaymentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [booking, setBooking] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => {
    api<{ items: any[] }>("/resident/payments").then((r) => setItems(r.items));
    api("/resident/booking").then(setBooking);
  };
  useEffect(() => { load(); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/resident/payments", { method: "POST", body: JSON.stringify({ amountMinor: parseMoneyToMinorUnits(amount), method: "mobile_money" }) });
      setMsg("Payment submitted — awaiting verification");
      load();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Could not submit payment"); }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Payments</h1>
      {booking?.paymentSummary ? (
        <Box>
          <p>Total: {formatMinorUnits(booking.paymentSummary.totalAmountMinor, booking.paymentSummary.currency)}</p>
          <p>Verified: {formatMinorUnits(booking.paymentSummary.verifiedPaymentsMinor, booking.paymentSummary.currency)}</p>
          <p>Outstanding: {formatMinorUnits(booking.paymentSummary.outstandingMinor, booking.paymentSummary.currency)}</p>
          <p className="text-xs text-slate-500">Pending/submitted amounts are not verified revenue.</p>
        </Box>
      ) : <Box><p>No payments yet. Payment information will appear after a booking is created.</p></Box>}
      {booking?.booking ? (
        <Box>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2500.00" />
            <p className="text-xs text-slate-500">Do not use hardcoded bank or MoMo numbers. Follow hostel payment instructions provided by staff.</p>
            <Primary>Submit payment</Primary>
          </form>
          {msg ? <p className="mt-2 text-sm">{msg}</p> : null}
        </Box>
      ) : null}
      <ul className="space-y-2">{items.map((p) => <li key={p.id} className="rounded-2xl bg-white p-4"><p className="font-medium">{p.payment_reference}</p><p className="text-sm">{formatMinorUnits(p.amount_minor, p.currency)} · {p.status === "submitted" ? "Awaiting verification" : p.status}</p></li>)}</ul>
      <Link to="/receipts/latest" className="text-sm text-primary">View receipts</Link>
    </div>
  );
}

export function ReceiptDetailPage() {
  const { id } = useParams();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api<{ items: any[] }>("/resident/receipts").then((r) => setItems(r.items)); }, []);
  const item = id && id !== "latest" ? items.find((r) => String(r.id) === id) : items[0];
  if (!items.length) return <Box><p>No receipts yet.</p></Box>;
  if (!item) return <p>Loading…</p>;
  return (
    <Box>
      {item.status === "voided" ? <p className="font-bold text-rose-700">VOIDED</p> : null}
      <p className="text-xl font-semibold">{item.receipt_number}</p>
      <p>{formatMinorUnits(item.amount_minor, item.currency)}</p>
      <p className="text-sm">{item.payment_reference}</p>
      <button className="mt-4 text-primary" onClick={() => window.print()}>Print</button>
    </Box>
  );
}

export function RoomPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/resident/room").then(setData); }, []);
  if (!data) return <p>Loading…</p>;
  if (!data.allocation) {
    return <Box><h1 className="text-xl font-semibold">No room assigned yet</h1><p className="mt-2 text-sm">{data.bookingStatus === "confirmed" ? "Booking confirmed — room assignment pending." : "Your room and bed will appear here after an allocation is made."}</p></Box>;
  }
  const a = data.allocation;
  return (
    <Box>
      <p className="text-sm text-slate-500">Active allocation</p>
      <h1 className="text-2xl font-semibold">{a.room_code} · Bed {a.bed_label}</h1>
      <p className="mt-2 text-sm">{a.session_name}</p>
      <p className="text-sm capitalize">{a.status}</p>
    </Box>
  );
}

export function MaintenancePage() {
  const [items, setItems] = useState<any[]>([]);
  const load = () => api<{ items: any[] }>("/resident/maintenance").then((r) => setItems(r.items));
  useEffect(() => { load(); }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/resident/maintenance", { method: "POST", body: JSON.stringify({ category: fd.get("category"), title: fd.get("title"), description: fd.get("description"), priority: "normal" }) });
    load();
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Maintenance</h1>
      <Box>
        <form onSubmit={create} className="space-y-3">
          <select name="category" className="min-h-12 w-full rounded-2xl border px-3"><option>plumbing</option><option>electrical</option><option>furniture</option><option>cleaning</option><option>security</option><option>other</option></select>
          <Field label="Summary" name="title" required />
          <Field label="Details" name="description" />
          <Primary>Report an issue</Primary>
        </form>
      </Box>
      {!items.length ? <p className="text-sm text-slate-500">You have not reported any hostel issues.</p> : items.map((m) => <Box key={m.id}><p className="font-medium">{m.request_number}</p><p className="text-sm">{m.title} · {m.status}</p></Box>)}
    </div>
  );
}

export function MessagesPage() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api<{ items: any[] }>("/resident/inbox").then((r) => setItems(r.items)); }, []);
  if (!items.length) return <Box><h1 className="text-xl font-semibold">No messages</h1><p className="text-sm">Messages from Kissmet Hostel will appear here.</p></Box>;
  return <div className="space-y-3">{items.map((m) => <button key={m.id} onClick={() => api(`/resident/inbox/${m.id}/read`, { method: "POST" })} className="block w-full rounded-3xl bg-white p-4 text-left"><p className="font-medium">{m.subject}</p><p className="text-sm text-slate-500">{m.status}</p><p className="mt-1 text-sm">{m.body}</p></button>)}</div>;
}

export function AnnouncementsPage() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api<{ items: any[] }>("/resident/announcements").then((r) => setItems(r.items)); }, []);
  if (!items.length) return <Box><p>No announcements right now.</p></Box>;
  return <div className="space-y-3">{items.map((a) => <Box key={a.id}><p className="text-xs uppercase text-slate-500">{a.severity}</p><p className="font-medium">{a.title}</p><p className="text-sm">{a.body}</p></Box>)}</div>;
}

export function MorePage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">More</h1>
      {[
        ["/booking", "Booking"],
        ["/maintenance", "Maintenance"],
        ["/messages", "Messages"],
        ["/announcements", "Announcements"],
        ["/profile", "Profile"],
        ["/documents", "Documents"],
      ].map(([to, label]) => <Link key={to} to={to} className="block min-h-12 rounded-2xl bg-white px-4 py-3">{label}</Link>)}
    </div>
  );
}
