import type { AuthUser } from "../env";
import { optionalString, requirePositiveInt, requireString } from "../auth/validation";
import { writeAudit } from "../lib/audit";
import { all, one, run } from "../lib/db";
import { fail } from "../lib/http";
import { nowIso } from "../lib/time";
import { createApplication, createPayment, paymentSummary } from "./workflow.service";
import { createMaintenance, residentAnnouncements } from "./operations.service";
import { publicDocument } from "./documents.service";

export async function residentHome(db: D1Database, auth: AuthUser) {
  const residentId = auth.residentId!;
  const profile = await residentProfile(db, auth);
  const documents = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM documents WHERE resident_id = ? AND status != 'deleted' ORDER BY id DESC`,
    residentId,
  );
  const application = await one(db, `SELECT * FROM applications WHERE resident_id = ? ORDER BY id DESC LIMIT 1`, residentId);
  const booking = await one(db, `SELECT * FROM bookings WHERE resident_id = ? ORDER BY id DESC LIMIT 1`, residentId);
  const allocation = await one(
    db,
    `SELECT a.*, b.bed_code, b.label AS bed_label, r.room_code, r.name AS room_name
     FROM allocations a
     JOIN beds b ON b.id = a.bed_id
     JOIN rooms r ON r.id = b.room_id
     WHERE a.resident_id = ? AND a.status = 'active' LIMIT 1`,
    residentId,
  );
  const payments = booking
    ? await all(db, `SELECT * FROM payments WHERE resident_id = ? ORDER BY id DESC`, residentId)
    : [];
  const summary = booking ? await paymentSummary(db, (booking as { id: number }).id) : null;
  const unread = await one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM portal_message_deliveries WHERE user_id = ? AND status = 'unread'`,
    auth.userId,
  );
  return {
    profile,
    documents: documents.map(publicDocument),
    application,
    booking,
    paymentSummary: summary,
    payments,
    allocation,
    unreadMessages: unread?.c ?? 0,
  };
}

export async function residentProfile(db: D1Database, auth: AuthUser) {
  const row = await one(
    db,
    `SELECT r.*, u.email, u.phone, u.display_name, i.code AS institution_code, i.name AS institution_name
     FROM residents r
     JOIN users u ON u.id = r.user_id
     JOIN institutions i ON i.id = r.institution_id
     WHERE r.id = ?`,
    auth.residentId,
  );
  if (!row) fail(404, "not_found", "Resident profile not found");
  return row;
}

export async function updateResidentProfile(db: D1Database, auth: AuthUser, body: Record<string, unknown>) {
  const email = optionalString(body.email, "email");
  const middleName = optionalString(body.middleName ?? body.middle_name, "middleName");
  if (email !== null) {
    await run(db, `UPDATE users SET email = ?, updated_at = ? WHERE id = ?`, email, nowIso(), auth.userId);
  }
  if (middleName !== null) {
    await run(db, `UPDATE residents SET middle_name = ?, updated_at = ? WHERE id = ?`, middleName, nowIso(), auth.residentId);
  }
  await writeAudit(db, { actor: auth, action: "resident.profile.updated", entityType: "resident", entityId: auth.residentId });
  return residentProfile(db, auth);
}

export async function residentDocuments(db: D1Database, auth: AuthUser) {
  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM documents WHERE resident_id = ? AND status != 'deleted' ORDER BY id DESC`,
    auth.residentId,
  );
  return rows.map(publicDocument);
}

export async function residentApplications(db: D1Database, auth: AuthUser) {
  return all(db, `SELECT * FROM applications WHERE resident_id = ? ORDER BY id DESC`, auth.residentId);
}

export async function residentCreateApplication(db: D1Database, auth: AuthUser, notes?: string | null) {
  const session = await one<{ id: number }>(db, `SELECT id FROM academic_sessions WHERE status = 'active' LIMIT 1`);
  if (!session) fail(400, "no_active_session", "There is no active academic session");
  const docs = await all<{ document_type: string; status: string }>(
    db, `SELECT document_type, status FROM documents WHERE resident_id = ? AND status != 'deleted'`, auth.residentId,
  );
  return createApplication(db, auth, auth.residentId!, session.id, notes);
}

export async function residentSubmitApplication(db: D1Database, auth: AuthUser, id: number) {
  const app = await one<{ resident_id: number; status: string }>(db, `SELECT resident_id, status FROM applications WHERE id = ?`, id);
  if (!app || app.resident_id !== auth.residentId) fail(404, "not_found", "Application not found");
  const docs = await all<{ document_type: string }>(
    db,
    `SELECT document_type FROM documents WHERE resident_id = ? AND document_type IN ('student_card', 'ghana_card') AND status != 'deleted' AND status != 'rejected'`,
    auth.residentId,
  );
  const types = new Set(docs.map((d) => d.document_type));
  if (!types.has("student_card") || !types.has("ghana_card")) {
    fail(400, "documents_required", "Your application cannot be submitted until the required documents are uploaded.");
  }
  const { changeApplicationStatus } = await import("./workflow.service");
  return changeApplicationStatus(db, auth, id, "submitted");
}

export async function residentBooking(db: D1Database, auth: AuthUser) {
  const booking = await one(db, `SELECT * FROM bookings WHERE resident_id = ? ORDER BY id DESC LIMIT 1`, auth.residentId);
  if (!booking) return { booking: null, paymentSummary: null };
  return { booking, paymentSummary: await paymentSummary(db, (booking as { id: number }).id) };
}

export async function residentPayments(db: D1Database, auth: AuthUser) {
  return all(db, `SELECT * FROM payments WHERE resident_id = ? ORDER BY id DESC`, auth.residentId);
}

export async function residentCreatePayment(db: D1Database, auth: AuthUser, body: Record<string, unknown>) {
  const booking = await one<{ id: number }>(db, `SELECT id FROM bookings WHERE resident_id = ? ORDER BY id DESC LIMIT 1`, auth.residentId);
  if (!booking) fail(400, "no_booking", "Payment information will appear after a booking is created.");
  const created = await createPayment(db, auth, {
    bookingId: booking.id,
    residentId: auth.residentId,
    amountMinor: body.amountMinor ?? body.amount_minor,
    currency: body.currency ?? "GHS",
    method: body.method,
    notes: body.notes,
    paidAt: body.paidAt ?? body.paid_at,
  });
  const { changePaymentStatus } = await import("./workflow.service");
  return changePaymentStatus(db, auth, (created as { id: number }).id, "submitted");
}

export async function residentReceipts(db: D1Database, auth: AuthUser) {
  return all(
    db,
    `SELECT r.*, p.amount_minor, p.method, p.payment_reference, p.currency
     FROM receipts r JOIN payments p ON p.id = r.payment_id
     WHERE p.resident_id = ? ORDER BY r.id DESC`,
    auth.residentId,
  );
}

export async function residentReceipt(db: D1Database, auth: AuthUser, id: number) {
  const row = await one(
    db,
    `SELECT r.*, p.amount_minor, p.method, p.payment_reference, p.currency, p.resident_id
     FROM receipts r JOIN payments p ON p.id = r.payment_id WHERE r.id = ?`,
    id,
  );
  if (!row || (row as { resident_id: number }).resident_id !== auth.residentId) fail(404, "not_found", "Receipt not found");
  return row;
}

export async function residentRoom(db: D1Database, auth: AuthUser) {
  const booking = await one<{ status: string }>(db, `SELECT status FROM bookings WHERE resident_id = ? ORDER BY id DESC LIMIT 1`, auth.residentId);
  const allocation = await one(
    db,
    `SELECT a.id, a.status, a.starts_on, a.created_at, a.academic_session_id,
            b.bed_code, b.label AS bed_label, r.room_code, r.name AS room_name, s.name AS session_name
     FROM allocations a
     JOIN beds b ON b.id = a.bed_id
     JOIN rooms r ON r.id = b.room_id
     JOIN academic_sessions s ON s.id = a.academic_session_id
     WHERE a.resident_id = ? AND a.status = 'active' LIMIT 1`,
    auth.residentId,
  );
  return { allocation: allocation ?? null, bookingStatus: (booking as { status?: string } | null)?.status ?? null };
}

export async function residentMaintenance(db: D1Database, auth: AuthUser) {
  return all(db, `SELECT * FROM maintenance_requests WHERE resident_id = ? ORDER BY id DESC`, auth.residentId);
}

export async function residentCreateMaintenance(db: D1Database, auth: AuthUser, body: Record<string, unknown>) {
  return createMaintenance(db, auth, { ...body, residentId: auth.residentId });
}

export async function residentInbox(db: D1Database, auth: AuthUser) {
  return all(
    db,
    `SELECT d.id, d.status, d.delivered_at, d.read_at, m.subject, m.body, m.sent_at
     FROM portal_message_deliveries d
     JOIN messages m ON m.id = d.message_id
     WHERE d.user_id = ?
     ORDER BY d.id DESC`,
    auth.userId,
  );
}

export async function residentInboxItem(db: D1Database, auth: AuthUser, id: number) {
  const row = await one(
    db,
    `SELECT d.id, d.status, d.delivered_at, d.read_at, m.subject, m.body, m.sent_at
     FROM portal_message_deliveries d
     JOIN messages m ON m.id = d.message_id
     WHERE d.id = ? AND d.user_id = ?`,
    id, auth.userId,
  );
  if (!row) fail(404, "not_found", "Message not found");
  return row;
}

export async function markInboxRead(db: D1Database, auth: AuthUser, id: number) {
  await run(
    db,
    `UPDATE portal_message_deliveries SET status = 'read', read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?`,
    nowIso(), id, auth.userId,
  );
  return residentInboxItem(db, auth, id);
}

export async function listResidentAnnouncements(db: D1Database) {
  return residentAnnouncements(db);
}

export function requiredDocsReady(docs: Array<{ documentType?: string; document_type?: string; status: string }>) {
  const ok = new Set(
    docs
      .filter((d) => d.status !== "deleted" && d.status !== "rejected")
      .map((d) => (d.documentType ?? d.document_type) as string),
  );
  return ok.has("student_card") && ok.has("ghana_card");
}
