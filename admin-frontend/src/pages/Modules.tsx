import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { Button, Card, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusChip, Textarea } from "../components/ui";
import { useLoad } from "../hooks/load";
import { formatDate, formatDateTime, labelize } from "../utils/format";
import { formatMinorUnits, parseMoneyToMinorUnits, percentageToBasisPoints } from "../utils/money";

type Row = Record<string, any>;

function useSearchPath(base: string) {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const path = `${base}?search=${encodeURIComponent(applied)}&limit=50&offset=0`;
  return { search, setSearch, apply: () => setApplied(search), path, applied };
}

function LookupName({ map, id, fallback }: { map: Record<number, string>; id?: number; fallback?: string }) {
  if (!id) return <span>{fallback ?? "Unavailable"}</span>;
  return <span>{map[id] ?? fallback ?? `ID ${id}`}</span>;
}

export function ResidentsPage() {
  const { has } = useAuth();
  const q = useSearchPath("/admin/residents");
  const { data, error, loading, reload } = useLoad<{ items: Row[] }>(q.path, [q.path]);
  const institutions = useLoad<{ items: Row[] }>("/admin/institutions", []);
  const [open, setOpen] = useState<Row | "create" | null>(null);
  const [formError, setFormError] = useState("");
  const instMap = Object.fromEntries((institutions.data?.items ?? []).map((i) => [i.id, i.name]));
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setFormError("");
    try {
      await api("/admin/residents", { method: "POST", body: JSON.stringify({
        firstName: fd.get("firstName"), lastName: fd.get("lastName"), gender: fd.get("gender"),
        institutionId: Number(fd.get("institutionId")), studentId: fd.get("studentId"), phone: fd.get("phone"), email: fd.get("email") || null,
      }) });
      setOpen(null); reload();
    } catch (err) { setFormError(err instanceof Error ? err.message : "Could not create resident"); }
  }
  return (
    <div>
      <PageHeader title="Residents" subtitle="Search is server-side by resident code, name, and student ID." actions={has("resident:write") ? <Button onClick={() => setOpen("create")}>Add resident</Button> : null} />
      <div className="mb-4 flex gap-2"><Input value={q.search} onChange={(e) => q.setSearch(e.target.value)} placeholder="Search" /><Button variant="secondary" onClick={q.apply}>Search</Button></div>
      {error ? <ErrorBox message={error} /> : loading ? <Loading /> : !data?.items.length ? <Empty title="No residents" body="Residents will appear after registration or staff creation." /> : (
        <Card>
          <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Code</th><th>Name</th><th>Student ID</th><th>Institution</th><th>Status</th><th></th></tr></thead>
            <tbody>{data.items.map((r) => (
              <tr key={r.id} className="border-t"><td className="py-2">{r.resident_code}</td><td>{r.first_name} {r.last_name}</td><td>{r.student_id}</td><td><LookupName map={instMap} id={r.institution_id} /></td><td><StatusChip value={r.status} /></td><td><button className="text-primary" onClick={() => setOpen(r)}>View</button></td></tr>
            ))}</tbody></table>
        </Card>
      )}
      {open && open !== "create" ? <Modal title={open.resident_code} onClose={() => setOpen(null)}>
        <div className="grid gap-2 text-sm">
          <p>Name: {open.first_name} {open.middle_name ?? ""} {open.last_name}</p>
          <p>Student ID: {open.student_id}</p>
          <p>Institution: <LookupName map={instMap} id={open.institution_id} /></p>
          <p>Phone/email: Unavailable on this list endpoint</p>
          <p>Status: <StatusChip value={open.status} /></p>
        </div>
      </Modal> : null}
      {open === "create" ? <Modal title="Add resident" onClose={() => setOpen(null)}>
        {formError ? <ErrorBox message={formError} /> : null}
        <form onSubmit={create} className="grid gap-3">
          <Input name="firstName" placeholder="First name" required />
          <Input name="lastName" placeholder="Last name" required />
          <Select name="gender" defaultValue="female"><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>
          <Select name="institutionId">{(institutions.data?.items ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>
          <Input name="studentId" placeholder="Student ID" required />
          <Input name="phone" placeholder="Phone" required />
          <Input name="email" placeholder="Email (optional)" />
          <Button type="submit">Create</Button>
        </form>
      </Modal> : null}
    </div>
  );
}

export function ApplicationsPage() {
  const { has } = useAuth();
  const q = useSearchPath("/admin/applications");
  const { data, error, loading, reload } = useLoad<{ items: Row[] }>(q.path, [q.path]);
  const residents = useLoad<{ items: Row[] }>("/admin/residents?limit=200", []);
  const sessions = useLoad<{ items: Row[] }>("/admin/academic-sessions", []);
  const [sel, setSel] = useState<Row | null>(null);
  const [msg, setMsg] = useState("");
  const resMap = Object.fromEntries((residents.data?.items ?? []).map((r) => [r.id, `${r.first_name} ${r.last_name}`]));
  const sesMap = Object.fromEntries((sessions.data?.items ?? []).map((s) => [s.id, s.name]));
  async function trans(status: string) {
    setMsg("");
    try {
      await api(`/admin/applications/${sel!.id}/status`, { method: "PATCH", body: JSON.stringify({ status, decisionNotes: (document.getElementById("decision") as HTMLTextAreaElement | null)?.value }) });
      reload(); setSel(null);
    } catch (err) { setMsg(err instanceof Error ? err.message : "Transition failed"); }
  }
  const next: Record<string, string[]> = { draft: ["submitted", "cancelled", "archived"], submitted: ["under_review", "cancelled"], under_review: ["approved", "rejected"], approved: ["archived"], rejected: ["archived"], cancelled: ["archived"] };
  return (
    <div>
      <PageHeader title="Applications" subtitle="Approval does not create a booking or allocate a bed." />
      <div className="mb-4 flex gap-2"><Input value={q.search} onChange={(e) => q.setSearch(e.target.value)} placeholder="Search number or status" /><Button variant="secondary" onClick={q.apply}>Search</Button></div>
      {error ? <ErrorBox message={error} /> : loading ? <Loading /> : !data?.items.length ? <Empty title="No applications" body="Applications appear after residents start one." /> : (
        <Card>
          <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Number</th><th>Applicant</th><th>Session</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
            <tbody>{data.items.map((a) => (
              <tr key={a.id} className="border-t"><td className="py-2">{a.application_number}</td><td><LookupName map={resMap} id={a.resident_id} /></td><td><LookupName map={sesMap} id={a.academic_session_id} /></td><td><StatusChip value={a.status} /></td><td>{formatDateTime(a.submitted_at)}</td><td><button className="text-primary" onClick={() => setSel(a)}>View</button></td></tr>
            ))}</tbody></table>
        </Card>
      )}
      {sel ? <Modal title={sel.application_number} onClose={() => setSel(null)}>
        {msg ? <ErrorBox message={msg} /> : null}
        <p className="text-sm">Applicant: <LookupName map={resMap} id={sel.resident_id} /></p>
        <p className="text-sm">Status: <StatusChip value={sel.status} /></p>
        {has("application:write") ? (
          <div className="mt-4 space-y-2">
            <Textarea id="decision" placeholder="Decision notes" />
            <div className="flex flex-wrap gap-2">{(next[sel.status] ?? []).map((s) => <Button key={s} onClick={() => trans(s)}>{labelize(s)}</Button>)}</div>
          </div>
        ) : <p className="mt-3 text-sm text-slate-500">Read-only for this role.</p>}
      </Modal> : null}
    </div>
  );
}

export function BookingsPage() {
  const { has } = useAuth();
  const q = useSearchPath("/admin/bookings");
  const { data, error, loading, reload } = useLoad<{ items: Row[] }>(q.path, [q.path]);
  const apps = useLoad<{ items: Row[] }>("/admin/applications?limit=200", []);
  const rooms = useLoad<{ items: Row[] }>("/admin/rooms", []);
  const [sel, setSel] = useState<Row | null>(null);
  const [summary, setSummary] = useState<Row | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const approved = (apps.data?.items ?? []).filter((a) => a.status === "approved");
  useEffect(() => {
    if (!sel) return;
    api<Row>(`/admin/bookings/${sel.id}/payment-summary`).then(setSummary).catch(() => setSummary(null));
  }, [sel]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/admin/bookings", { method: "POST", body: JSON.stringify({ applicationId: Number(fd.get("applicationId")), roomId: Number(fd.get("roomId")) }) });
      setCreateOpen(false); reload();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Could not create booking"); }
  }
  async function confirm() {
    try { await api(`/admin/bookings/${sel!.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) }); reload(); setSel(null); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Confirmation failed"); }
  }
  return (
    <div>
      <PageHeader title="Bookings" subtitle="Captured totals are historical. Confirmation does not allocate a bed." actions={has("booking:write") ? <Button onClick={() => setCreateOpen(true)}>Create booking</Button> : null} />
      <div className="mb-4 flex gap-2"><Input value={q.search} onChange={(e) => q.setSearch(e.target.value)} placeholder="Search" /><Button variant="secondary" onClick={q.apply}>Search</Button></div>
      {error ? <ErrorBox message={error} /> : loading ? <Loading /> : !data?.items.length ? <Empty title="No bookings" body="Create a booking from an approved application." /> : (
        <Card>
          <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Number</th><th>Amount</th><th>Status</th><th>Attention</th><th></th></tr></thead>
            <tbody>{data.items.map((b) => (
              <tr key={b.id} className="border-t"><td className="py-2">{b.booking_number}</td><td>{formatMinorUnits(b.total_amount_minor, b.currency)}</td><td><StatusChip value={b.status} /></td><td>{b.payment_attention_required ? "Yes" : "No"}</td><td><button className="text-primary" onClick={() => { setSel(b); setMsg(""); }}>View</button></td></tr>
            ))}</tbody></table>
        </Card>
      )}
      {sel ? <Modal title={sel.booking_number} onClose={() => setSel(null)}>
        {msg ? <ErrorBox message={msg} /> : null}
        <p className="text-sm">Captured total: {formatMinorUnits(sel.total_amount_minor, sel.currency)}</p>
        <p className="text-sm">Priced room ID: {sel.priced_room_id ?? "Unavailable"}</p>
        {summary ? (
          <div className="mt-3 space-y-1 text-sm">
            <p>Verified: {formatMinorUnits(summary.verifiedPaymentsMinor, summary.currency)}</p>
            <p>Outstanding: {formatMinorUnits(summary.outstandingMinor, summary.currency)}</p>
            <p>Pending/submitted: Unavailable</p>
            <p>Threshold met: {summary.confirmationRequirementMet ? "Yes" : "No"}</p>
          </div>
        ) : <p className="text-sm text-slate-500">Payment summary loading or unavailable.</p>}
        {sel.status === "pending" && has("booking:confirm") && summary?.confirmationRequirementMet ? <div className="mt-4"><Button onClick={confirm}>Confirm booking</Button></div> : null}
        <p className="mt-3 text-xs text-slate-500">Confirming a booking does not assign a bed.</p>
      </Modal> : null}
      {createOpen ? <Modal title="Create booking" onClose={() => setCreateOpen(false)}>
        {msg ? <ErrorBox message={msg} /> : null}
        <form onSubmit={create} className="grid gap-3">
          <Select name="applicationId">{approved.map((a) => <option key={a.id} value={a.id}>{a.application_number}</option>)}</Select>
          <Select name="roomId">{(rooms.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{r.room_code} {r.name}</option>)}</Select>
          <Button type="submit">Create</Button>
        </form>
      </Modal> : null}
    </div>
  );
}

export function RoomsPage() {
  const { has } = useAuth();
  const rooms = useLoad<{ items: Row[] }>("/admin/rooms", []);
  const occ = useLoad<Row>("/admin/dashboard/occupancy", []);
  const [sel, setSel] = useState<Row | null>(null);
  const occMap = Object.fromEntries((occ.data?.rooms ?? []).map((r: Row) => [r.id, r]));
  return (
    <div>
      <PageHeader title="Rooms & beds" subtitle="Occupancy comes from active allocations, not room capacity." />
      {rooms.error ? <ErrorBox message={rooms.error} /> : rooms.loading ? <Loading /> : (
        <Card>
          <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Room</th><th>Capacity</th><th>Usable</th><th>Occupied</th><th>Available</th><th>Status</th><th></th></tr></thead>
            <tbody>{(rooms.data?.items ?? []).map((r) => {
              const o = occMap[r.id];
              return <tr key={r.id} className="border-t"><td className="py-2">{r.room_code} {r.name}</td><td>{r.capacity}</td><td>{o?.usable_beds ?? "Unavailable"}</td><td>{o?.occupied_beds ?? "Unavailable"}</td><td>{o?.available_beds ?? "Unavailable"}</td><td><StatusChip value={r.status} /></td><td><button className="text-primary" onClick={() => setSel(r)}>View</button></td></tr>;
            })}</tbody></table>
        </Card>
      )}
      {sel ? <RoomDetail room={sel} canWrite={has("admin:write")} onClose={() => { setSel(null); rooms.reload(); occ.reload(); }} /> : null}
    </div>
  );
}

function RoomDetail({ room, canWrite, onClose }: { room: Row; canWrite: boolean; onClose: () => void }) {
  const beds = useLoad<{ items: Row[] }>(`/admin/rooms/${room.id}/beds`, [room.id]);
  const rates = useLoad<{ items: Row[] }>(`/admin/room-rates?roomId=${room.id}`, [room.id]);
  const sessions = useLoad<{ items: Row[] }>("/admin/academic-sessions", []);
  const [msg, setMsg] = useState("");
  async function addBed(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try { await api("/admin/beds", { method: "POST", body: JSON.stringify({ roomId: room.id, label: fd.get("label") }) }); beds.reload(); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Could not create bed"); }
  }
  async function addRate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/admin/room-rates", { method: "POST", body: JSON.stringify({ roomId: room.id, academicSessionId: Number(fd.get("sessionId")), amount: fd.get("amount"), currency: "GHS" }) });
      rates.reload();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Could not create rate"); }
  }
  return (
    <Modal title={`${room.room_code} ${room.name}`} onClose={onClose}>
      {msg ? <ErrorBox message={msg} /> : null}
      <p className="text-sm">Configured capacity: {room.capacity}. Actual inventory is the bed list.</p>
      <h3 className="mt-4 font-medium">Beds</h3>
      <ul className="text-sm">{(beds.data?.items ?? []).map((b) => <li key={b.id}>{b.bed_code} <StatusChip value={b.status} /></li>)}</ul>
      {canWrite ? <form onSubmit={addBed} className="mt-2 flex gap-2"><Input name="label" placeholder="Label" /><Button type="submit">Add bed</Button></form> : null}
      <h3 className="mt-4 font-medium">Rates</h3>
      <ul className="text-sm">{(rates.data?.items ?? []).map((r) => <li key={r.id}>{formatMinorUnits(r.amount_minor, r.currency)} <StatusChip value={r.status} /> {canWrite && r.status !== "active" ? <button className="ml-2 text-primary" onClick={() => api(`/admin/room-rates/${r.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "active" }) }).then(() => rates.reload())}>Activate</button> : null}</li>)}</ul>
      {canWrite ? <form onSubmit={addRate} className="mt-2 grid gap-2">
        <Select name="sessionId">{(sessions.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Input name="amount" placeholder="2500.00" />
        <Button type="submit">Add rate</Button>
      </form> : null}
    </Modal>
  );
}

export function AllocationsPage() {
  const { has } = useAuth();
  const list = useLoad<{ items: Row[] }>("/admin/allocations?limit=50", []);
  const bookings = useLoad<{ items: Row[] }>("/admin/bookings?limit=50", []);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const confirmed = (bookings.data?.items ?? []).filter((b) => b.status === "confirmed");
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const bookingId = Number(fd.get("bookingId"));
    const booking = confirmed.find((b) => b.id === bookingId);
    if (!booking) return;
    try {
      await api("/admin/allocations", { method: "POST", body: JSON.stringify({
        bookingId, residentId: booking.resident_id, academicSessionId: booking.academic_session_id, bedId: Number(fd.get("bedId")), startsOn: fd.get("startsOn"),
      }) });
      setOpen(false); list.reload();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Allocation failed"); }
  }
  return (
    <div>
      <PageHeader title="Allocations" subtitle="Only confirmed bookings can be allocated. Occupancy is this list, not bookings." actions={has("allocation:write") ? <Button onClick={() => setOpen(true)}>Allocate bed</Button> : null} />
      {list.error ? <ErrorBox message={list.error} /> : list.loading ? <Loading /> : !list.data?.items.length ? <Empty title="No allocations" body="Assign a bed after a booking is confirmed." /> : (
        <Card><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">ID</th><th>Booking</th><th>Bed</th><th>Status</th><th>Started</th></tr></thead>
          <tbody>{list.data.items.map((a) => <tr key={a.id} className="border-t"><td className="py-2">{a.id}</td><td>{a.booking_id}</td><td>{a.bed_id}</td><td><StatusChip value={a.status} /></td><td>{formatDate(a.starts_on)}</td></tr>)}</tbody></table></Card>
      )}
      {open ? <Modal title="Create allocation" onClose={() => setOpen(false)}>
        {msg ? <ErrorBox message={msg} /> : null}
        <form onSubmit={create} className="grid gap-3">
          <Select name="bookingId">{confirmed.map((b) => <option key={b.id} value={b.id}>{b.booking_number}</option>)}</Select>
          <Input name="bedId" placeholder="Bed ID" required />
          <Input name="startsOn" type="date" required />
          <Button type="submit">Allocate</Button>
        </form>
      </Modal> : null}
    </div>
  );
}

export function PaymentsPage() {
  const { has } = useAuth();
  const q = useSearchPath("/admin/payments");
  const { data, error, loading, reload } = useLoad<{ items: Row[] }>(q.path, [q.path]);
  const bookings = useLoad<{ items: Row[] }>("/admin/bookings?limit=50", []);
  const [sel, setSel] = useState<Row | null>(null);
  const [msg, setMsg] = useState("");
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const booking = (bookings.data?.items ?? []).find((b) => b.id === Number(fd.get("bookingId")));
    try {
      const amountMinor = parseMoneyToMinorUnits(String(fd.get("amount")));
      await api("/admin/payments", { method: "POST", body: JSON.stringify({ bookingId: booking?.id, residentId: booking?.resident_id, amountMinor, currency: "GHS", method: fd.get("method") }) });
      reload();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Could not create payment"); }
  }
  async function act(path: string) {
    try { await api(path, { method: "POST" }); reload(); setSel(null); } catch (err) { setMsg(err instanceof Error ? err.message : "Action failed"); }
  }
  return (
    <div>
      <PageHeader title="Payments" subtitle="Verification does not confirm a booking. Pending/submitted is not verified revenue." />
      {msg ? <div className="mb-3"><ErrorBox message={msg} /></div> : null}
      {has("payment:write") ? (
        <Card className="mb-4" title="Record payment">
          <form onSubmit={create} className="grid gap-2 md:grid-cols-4">
            <Select name="bookingId">{(bookings.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.booking_number}</option>)}</Select>
            <Input name="amount" placeholder="2500.00" />
            <Select name="method"><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option></Select>
            <Button type="submit">Create</Button>
          </form>
        </Card>
      ) : null}
      {error ? <ErrorBox message={error} /> : loading ? <Loading /> : !data?.items.length ? <Empty title="No payments" body="Payments appear after a booking exists." /> : (
        <Card>
          <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Reference</th><th>Amount</th><th>Method</th><th>Status</th><th></th></tr></thead>
            <tbody>{data.items.map((p) => <tr key={p.id} className="border-t"><td className="py-2">{p.payment_reference}</td><td>{formatMinorUnits(p.amount_minor, p.currency)}</td><td>{labelize(p.method)}</td><td><StatusChip value={p.status} /></td><td><button className="text-primary" onClick={() => setSel(p)}>View</button></td></tr>)}</tbody></table>
        </Card>
      )}
      {sel ? <Modal title={sel.payment_reference} onClose={() => setSel(null)}>
        <p className="text-sm">{formatMinorUnits(sel.amount_minor, sel.currency)} · <StatusChip value={sel.status} /></p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sel.status === "pending" && has("payment:write") ? <Button onClick={() => api(`/admin/payments/${sel.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "submitted" }) }).then(() => { reload(); setSel(null); })}>Mark submitted</Button> : null}
          {sel.status === "submitted" && has("payment:verify") ? <Button onClick={() => act(`/admin/payments/${sel.id}/verify`)}>Verify</Button> : null}
          {sel.status === "submitted" && has("payment:verify") ? <Button variant="danger" onClick={() => act(`/admin/payments/${sel.id}/reject`)}>Reject</Button> : null}
          {sel.status === "verified" && has("payment:verify") ? <Button variant="secondary" onClick={() => act(`/admin/payments/${sel.id}/refund`)}>Refund</Button> : null}
        </div>
      </Modal> : null}
    </div>
  );
}

export function ReceiptsPage() {
  const { has } = useAuth();
  const list = useLoad<{ items: Row[] }>("/admin/receipts?limit=50", []);
  const payments = useLoad<{ items: Row[] }>("/admin/payments?limit=50", []);
  const [sel, setSel] = useState<Row | null>(null);
  const verified = (payments.data?.items ?? []).filter((p) => p.status === "verified");
  return (
    <div>
      <PageHeader title="Receipts" subtitle="One issued receipt per verified payment. Receipts are voided, not deleted." />
      {has("receipt:write") ? <Card className="mb-4"><div className="flex flex-wrap gap-2">{verified.map((p) => <Button key={p.id} variant="secondary" onClick={() => api(`/admin/payments/${p.id}/receipt`, { method: "POST" }).then(() => list.reload()).catch((e) => alert(e.message))}>Issue for {p.payment_reference}</Button>)}</div></Card> : null}
      {list.loading ? <Loading /> : !list.data?.items.length ? <Empty title="No receipts" body="Issue a receipt from a verified payment." /> : (
        <Card><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Receipt</th><th>Status</th><th>Issued</th><th></th></tr></thead>
          <tbody>{list.data.items.map((r) => <tr key={r.id} className="border-t"><td className="py-2">{r.receipt_number}</td><td><StatusChip value={r.status} /></td><td>{formatDateTime(r.issued_at)}</td><td><button className="text-primary" onClick={() => api(`/admin/receipts/${r.id}`).then((row) => setSel(row as Row))}>View</button></td></tr>)}</tbody></table></Card>
      )}
      {sel ? <Modal title={sel.receipt_number} onClose={() => setSel(null)}>
        <div className="print-receipt space-y-2 text-sm">
          {sel.status === "voided" ? <p className="text-lg font-bold text-rose-700">VOID</p> : null}
          <p>Amount: {formatMinorUnits(sel.amount_minor, sel.payment_currency ?? "GHS")}</p>
          <p>Payment: {sel.payment_reference}</p>
          <p>Issued: {formatDateTime(sel.issued_at)}</p>
        </div>
        <div className="no-print mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>Print</Button>
          {sel.status === "issued" && has("receipt:write") ? <Button variant="danger" onClick={() => api(`/admin/receipts/${sel.id}/void`, { method: "POST", body: JSON.stringify({ reason: "Voided by admin" }) }).then(() => { list.reload(); setSel(null); })}>Void</Button> : null}
        </div>
      </Modal> : null}
    </div>
  );
}

export function MaintenancePage() {
  const { has } = useAuth();
  const q = useSearchPath("/admin/maintenance");
  const { data, error, loading, reload } = useLoad<{ items: Row[] }>(q.path, [q.path]);
  const staff = useLoad<{ items: Row[] }>("/admin/staff?limit=50", []);
  const [sel, setSel] = useState<Row | null>(null);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/admin/maintenance", { method: "POST", body: JSON.stringify({ category: fd.get("category"), title: fd.get("title"), description: fd.get("description"), priority: fd.get("priority") }) });
    reload();
  }
  return (
    <div>
      <PageHeader title="Maintenance" subtitle="Work tickets are separate from taking a room out of service." />
      {has("maintenance:create") ? <Card className="mb-4"><form onSubmit={create} className="grid gap-2 md:grid-cols-4">
        <Select name="category"><option>plumbing</option><option>electrical</option><option>furniture</option><option>cleaning</option><option>security</option><option>other</option></Select>
        <Input name="title" placeholder="Title" required />
        <Select name="priority"><option>normal</option><option>low</option><option>high</option><option>urgent</option></Select>
        <Button type="submit">Create</Button>
      </form></Card> : null}
      {error ? <ErrorBox message={error} /> : loading ? <Loading /> : !data?.items.length ? <Empty title="No requests" body="No hostel issues have been reported." /> : (
        <Card><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Number</th><th>Title</th><th>Priority</th><th>Status</th><th></th></tr></thead>
          <tbody>{data.items.map((m) => <tr key={m.id} className="border-t"><td className="py-2">{m.request_number}</td><td>{m.title}</td><td>{m.priority}</td><td><StatusChip value={m.status} /></td><td><button className="text-primary" onClick={() => setSel(m)}>View</button></td></tr>)}</tbody></table></Card>
      )}
      {sel ? <Modal title={sel.request_number} onClose={() => setSel(null)}>
        <p className="text-sm">{sel.title} · <StatusChip value={sel.status} /></p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sel.status === "open" && has("maintenance:assign") ? <Select onChange={(e) => api(`/admin/maintenance/${sel.id}/assign`, { method: "POST", body: JSON.stringify({ staffId: Number(e.target.value) }) }).then(() => { reload(); setSel(null); })}><option value="">Assign…</option>{(staff.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</Select> : null}
          {has("maintenance:update") && sel.status === "assigned" ? <Button onClick={() => api(`/admin/maintenance/${sel.id}/start`, { method: "POST" }).then(() => { reload(); setSel(null); })}>Start</Button> : null}
          {has("maintenance:resolve") && sel.status === "in_progress" ? <Button onClick={() => api(`/admin/maintenance/${sel.id}/resolve`, { method: "POST" }).then(() => { reload(); setSel(null); })}>Resolve</Button> : null}
          {has("maintenance:close") && sel.status === "resolved" ? <Button onClick={() => api(`/admin/maintenance/${sel.id}/close`, { method: "POST" }).then(() => { reload(); setSel(null); })}>Close</Button> : null}
        </div>
      </Modal> : null}
    </div>
  );
}

export function AnnouncementsPage() {
  const { has } = useAuth();
  const list = useLoad<{ items: Row[] }>("/admin/announcements?limit=50", []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/admin/announcements", { method: "POST", body: JSON.stringify({ title: fd.get("title"), body: fd.get("body"), audience: fd.get("audience"), severity: fd.get("severity"), channels: ["resident_portal"] }) });
    list.reload();
  }
  return (
    <div>
      <PageHeader title="Announcements" subtitle="Broadcast notices. High alert does not automatically send SMS." />
      {has("announcement:write") ? <Card className="mb-4"><form onSubmit={create} className="grid gap-2">
        <Input name="title" placeholder="Title" required />
        <Textarea name="body" placeholder="Body" required />
        <div className="grid grid-cols-2 gap-2"><Select name="audience"><option>residents</option><option>all</option><option>staff</option></Select><Select name="severity"><option>normal</option><option>important</option><option>high_alert</option></Select></div>
        <Button type="submit">Save draft</Button>
      </form></Card> : null}
      {list.loading ? <Loading /> : !list.data?.items.length ? <Empty title="No announcements" body="Create a draft to notify residents." /> : (
        <Card><ul className="divide-y">{list.data.items.map((a) => <li key={a.id} className="flex items-center justify-between py-3"><div><p className="font-medium">{a.title}</p><p className="text-xs text-slate-500">{a.audience} · {a.severity}</p></div><div className="flex items-center gap-2"><StatusChip value={a.status} />{a.status === "draft" && has("announcement:publish") ? <Button onClick={() => api(`/admin/announcements/${a.id}/publish`, { method: "POST" }).then(() => list.reload())}>Publish</Button> : null}</div></li>)}</ul></Card>
      )}
    </div>
  );
}

export function MessagesPage() {
  const { has } = useAuth();
  const list = useLoad<{ items: Row[] }>("/admin/messages?limit=50", []);
  const residents = useLoad<{ items: Row[] }>("/admin/residents?limit=100", []);
  const [preview, setPreview] = useState<Row | null>(null);
  const [msg, setMsg] = useState("");
  async function previewSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const residentId = Number(fd.get("residentId"));
    setMsg("");
    try {
      const p = await api<Row>("/admin/messages/preview", { method: "POST", body: JSON.stringify({ targetType: "individual_resident", targetConfig: { residentId } }) });
      setPreview({ ...p, subject: fd.get("subject"), body: fd.get("body"), residentId });
    } catch (err) { setMsg(err instanceof Error ? err.message : "Preview failed"); }
  }
  return (
    <div>
      <PageHeader title="Messages" subtitle="Empty selected-target IDs are rejected. Room targeting uses active allocations." />
      {has("message:write") ? <Card className="mb-4">
        {msg ? <ErrorBox message={msg} /> : null}
        <form onSubmit={previewSend} className="grid gap-2">
          <Input name="subject" placeholder="Subject" required />
          <Textarea name="body" placeholder="Message" required />
          <Select name="residentId">{(residents.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{r.resident_code} {r.first_name} {r.last_name}</option>)}</Select>
          <Button type="submit">Preview recipients</Button>
        </form>
        {preview ? <div className="mt-3 text-sm">Recipients: {preview.recipientCount}<div className="mt-2"><Button onClick={async () => {
          const draft = await api<Row>("/admin/messages", { method: "POST", body: JSON.stringify({ subject: preview.subject, body: preview.body, targetType: "individual_resident", targetConfig: { residentId: preview.residentId }, channels: ["portal"] }) });
          if (has("message:send")) await api(`/admin/messages/${draft.id}/send`, { method: "POST", body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
          setPreview(null); list.reload();
        }}>Create and send</Button></div></div> : null}
      </Card> : null}
      {list.loading ? <Loading /> : !list.data?.items.length ? <Empty title="No messages" body="Targeted messages will appear here." /> : (
        <Card><ul className="divide-y">{list.data.items.map((m) => <li key={m.id} className="py-3"><p className="font-medium">{m.subject}</p><p className="text-xs text-slate-500">{m.target_type} · <StatusChip value={m.status} /></p></li>)}</ul></Card>
      )}
    </div>
  );
}

export function ReportsPage() {
  const { has } = useAuth();
  const [tab, setTab] = useState("overview");
  const path = tab === "finance" ? "/admin/reports/finance" : tab === "occupancy" ? "/admin/reports/occupancy" : tab === "outstanding" ? "/admin/reports/outstanding" : `/admin/reports/${tab}`;
  const { data, error, loading } = useLoad<Row>(has("report:read") ? path : null, [path]);
  const tabs = ["overview", "occupancy", "residents", "applications-bookings", ...(has("report:finance") ? ["finance", "outstanding"] : []), "maintenance"];
  return (
    <div>
      <PageHeader title="Reports" subtitle="Occupancy = active allocations / usable beds. Outstanding = captured total − verified payments." />
      <div className="mb-4 flex flex-wrap gap-2">{tabs.map((t) => <Button key={t} variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>{labelize(t)}</Button>)}</div>
      {error ? <ErrorBox message={error} /> : loading ? <Loading /> : <Card><pre className="overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre></Card>}
    </div>
  );
}

export function StaffPage() {
  const { has, user } = useAuth();
  const list = useLoad<{ items: Row[] }>("/admin/staff?limit=50", []);
  const roles = useLoad<{ items: Row[] }>("/admin/roles", []);
  const canWrite = user?.role === "super_admin";
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await api<Row>("/admin/staff", { method: "POST", body: JSON.stringify({
      displayName: fd.get("displayName"), username: fd.get("username"), email: fd.get("email"), staffCode: fd.get("staffCode"), roleId: Number(fd.get("roleId")), password: fd.get("password") || undefined,
    }) });
    alert(`Initial password (shown once): ${res.initialPassword}`);
    list.reload();
  }
  return (
    <div>
      <PageHeader title="Staff" subtitle="Role, status, and password changes revoke sessions." />
      {canWrite ? <Card className="mb-4"><form onSubmit={create} className="grid gap-2 md:grid-cols-3">
        <Input name="displayName" placeholder="Name" required />
        <Input name="username" placeholder="Username" required />
        <Input name="email" placeholder="Email" />
        <Input name="staffCode" placeholder="Staff code" required />
        <Select name="roleId">{(roles.data?.items ?? []).filter((r) => r.code !== "resident").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        <Input name="password" placeholder="Optional initial password" />
        <Button type="submit">Add staff</Button>
      </form></Card> : null}
      {list.loading ? <Loading /> : <Card><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Code</th><th>Name</th><th>Username</th><th>Role</th><th>Staff</th><th>Account</th></tr></thead>
        <tbody>{(list.data?.items ?? []).map((s) => <tr key={s.id} className="border-t"><td className="py-2">{s.staff_code}</td><td>{s.display_name}</td><td>{s.username}</td><td>{s.role_name}</td><td><StatusChip value={s.staff_status} /></td><td><StatusChip value={s.account_status} /></td></tr>)}</tbody></table></Card>}
    </div>
  );
}

export function AuditLogsPage() {
  const q = useSearchPath("/admin/audit-logs");
  const { data, error, loading } = useLoad<{ items: Row[]; total: number }>(q.path, [q.path]);
  const [sel, setSel] = useState<Row | null>(null);
  return (
    <div>
      <PageHeader title="Audit logs" subtitle="Append-only. Sensitive metadata is redacted on read." />
      <div className="mb-4 flex gap-2"><Input value={q.search} onChange={(e) => q.setSearch(e.target.value)} /><Button variant="secondary" onClick={q.apply}>Search</Button></div>
      {error ? <ErrorBox message={error} /> : loading ? <Loading /> : !data?.items.length ? <Empty title="No audit events" body="Operational history will appear here." /> : (
        <Card><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Time</th><th>Actor</th><th>Action</th><th>Entity</th><th></th></tr></thead>
          <tbody>{data.items.map((a) => <tr key={a.id} className="border-t"><td className="py-2">{formatDateTime(a.created_at)}</td><td>{a.actor_display_name ?? a.actor_user_id ?? "System"}</td><td>{a.action}</td><td>{a.entity_type} {a.entity_id ?? ""}</td><td><button className="text-primary" onClick={() => api(`/admin/audit-logs/${a.id}`).then((row) => setSel(row as Row))}>View</button></td></tr>)}</tbody></table></Card>
      )}
      {sel ? <Modal title={sel.action} onClose={() => setSel(null)}><pre className="overflow-auto text-xs">{JSON.stringify(sel.metadata ?? { note: "Not available" }, null, 2)}</pre></Modal> : null}
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad<Row>("/admin/settings", []);
  const canWrite = user?.role === "super_admin";
  async function saveGeneral(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/admin/settings/general", { method: "PATCH", body: JSON.stringify({
      organizationName: fd.get("organizationName"), adminPortalTitle: fd.get("adminPortalTitle"), residentPortalTitle: fd.get("residentPortalTitle"),
      supportEmail: fd.get("supportEmail"), supportPhone: fd.get("supportPhone"), addressText: fd.get("addressText"), defaultCurrency: fd.get("defaultCurrency"),
    }) });
    reload();
  }
  async function savePay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = String(fd.get("requirementType"));
    const body: Row = { requirementType: type };
    if (type === "fixed") body.fixedAmount = fd.get("fixedAmount");
    if (type === "percentage") body.percentage = fd.get("percentage");
    await api("/admin/settings/payment-confirmation", { method: "PATCH", body: JSON.stringify(body) });
    reload();
  }
  if (error) return <ErrorBox message={error} />;
  if (loading || !data) return <Loading />;
  const g = data.general ?? {};
  return (
    <div>
      <PageHeader title="Settings" subtitle="Changing payment policy does not rewrite historical financial records." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="General">
          <form onSubmit={saveGeneral} className="grid gap-2">
            <Input name="organizationName" defaultValue={g.organization_name} disabled={!canWrite} />
            <Input name="adminPortalTitle" defaultValue={g.admin_portal_title} disabled={!canWrite} />
            <Input name="residentPortalTitle" defaultValue={g.resident_portal_title} disabled={!canWrite} />
            <Input name="supportEmail" defaultValue={g.support_email ?? ""} disabled={!canWrite} />
            <Input name="supportPhone" defaultValue={g.support_phone ?? ""} disabled={!canWrite} />
            <Textarea name="addressText" defaultValue={g.address_text ?? ""} disabled={!canWrite} />
            <Input name="defaultCurrency" defaultValue={g.default_currency} disabled={!canWrite} />
            {canWrite ? <Button type="submit">Save</Button> : <p className="text-sm text-slate-500">Read-only</p>}
          </form>
        </Card>
        <Card title="Payment confirmation">
          <form onSubmit={savePay} className="grid gap-2">
            <Select name="requirementType" defaultValue={data.paymentConfirmation?.requirement_type} disabled={!canWrite}><option value="full">Full</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option></Select>
            <Input name="fixedAmount" placeholder="Fixed GHS amount" disabled={!canWrite} />
            <Input name="percentage" placeholder="Percentage e.g. 50" disabled={!canWrite} />
            {canWrite ? <Button type="submit">Update policy</Button> : null}
          </form>
        </Card>
        <Card title="Academic">{data.academic?.activeSession ? <p>{data.academic.activeSession.name}</p> : <p>No active session</p>}</Card>
        <Card title="Communications"><p>SMS: {data.communications?.sms}. Email: {data.communications?.email}. Provider secrets are not stored in settings.</p></Card>
        <Card title="Security / System"><pre className="text-xs">{JSON.stringify(data.security, null, 2)}</pre></Card>
      </div>
    </div>
  );
}

export { ApiError, useMemo, parseMoneyToMinorUnits, percentageToBasisPoints };
