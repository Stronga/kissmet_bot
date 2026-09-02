import type { AuthUser } from "../env";
import { optionalString, requirePositiveInt, requireString } from "../auth/validation";
import { writeAudit } from "../lib/audit";
import { all, allocateCode, one, run } from "../lib/db";
import { fail } from "../lib/http";
import { nowIso } from "../lib/time";

const APP_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled", "archived"],
  submitted: ["under_review", "cancelled"],
  under_review: ["approved", "rejected"],
  approved: ["archived"],
  rejected: ["archived"],
  cancelled: ["archived"],
};

const BOOKING_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled", "expired", "archived"],
  confirmed: ["completed", "cancelled", "archived"],
  cancelled: ["archived"],
  expired: ["archived"],
  completed: ["archived"],
};

export async function listApplications(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  return all(
    db,
    `SELECT * FROM applications
     WHERE (? = '' OR application_number LIKE ? OR status LIKE ?)
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    search, q, q, limit, offset,
  );
}

export async function getApplication(db: D1Database, id: number) {
  const row = await one(db, `SELECT * FROM applications WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Application not found");
  return row;
}

export async function createApplication(db: D1Database, actor: AuthUser, residentId: number, academicSessionId: number, notes?: string | null) {
  const session = await one<{ status: string }>(db, `SELECT status FROM academic_sessions WHERE id = ?`, academicSessionId);
  if (!session || session.status !== "active") fail(400, "invalid_session", "Applications require the active academic session");
  const number = await allocateCode(db, "application_number_sequence");
  try {
    const ins = await run(
      db,
      `INSERT INTO applications (application_number, resident_id, academic_session_id, status, notes)
       VALUES (?, ?, ?, 'draft', ?)`,
      number, residentId, academicSessionId, notes ?? null,
    );
    const id = Number(ins.meta.last_row_id);
    await run(db, `UPDATE residents SET status = CASE WHEN status IN ('prospect') THEN 'applicant' ELSE status END, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, residentId);
    await writeAudit(db, { actor, action: "application.created", entityType: "application", entityId: id, metadata: { application_number: number } });
    return getApplication(db, id);
  } catch {
    fail(409, "duplicate_application", "An active application already exists for this resident and session");
  }
}

export async function changeApplicationStatus(
  db: D1Database,
  actor: AuthUser,
  id: number,
  status: string,
  decisionNotes?: string | null,
) {
  const app = await one<{ id: number; status: string; resident_id: number }>(db, `SELECT id, status, resident_id FROM applications WHERE id = ?`, id);
  if (!app) fail(404, "not_found", "Application not found");
  if (!(APP_TRANSITIONS[app.status] ?? []).includes(status)) {
    fail(400, "invalid_transition", `Cannot change application from ${app.status} to ${status}`);
  }
  const reviewed = ["approved", "rejected"].includes(status);
  await run(
    db,
    `UPDATE applications SET
        status = ?,
        decision_notes = COALESCE(?, decision_notes),
        reviewed_at = CASE WHEN ? THEN ? ELSE reviewed_at END,
        reviewed_by_staff_id = CASE WHEN ? THEN ? ELSE reviewed_by_staff_id END,
        submitted_at = CASE WHEN ? = 'submitted' AND submitted_at IS NULL THEN ? ELSE submitted_at END,
        archived_at = CASE WHEN ? = 'archived' THEN ? ELSE archived_at END,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
    status,
    decisionNotes ?? null,
    reviewed ? 1 : 0,
    nowIso(),
    reviewed ? 1 : 0,
    actor.staffId,
    status,
    nowIso(),
    status,
    nowIso(),
    id,
  );
  await writeAudit(db, {
    actor,
    action: "admin.applications.status_changed",
    entityType: "application",
    entityId: id,
    metadata: { from: app.status, to: status },
  });
  return getApplication(db, id);
}

export async function listBookings(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  return all(
    db,
    `SELECT * FROM bookings
     WHERE (? = '' OR booking_number LIKE ? OR status LIKE ?)
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    search, q, q, limit, offset,
  );
}

export async function getBooking(db: D1Database, id: number) {
  const row = await one(db, `SELECT * FROM bookings WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Booking not found");
  return row;
}

export async function createBooking(db: D1Database, actor: AuthUser, applicationId: number, roomId: number) {
  const app = await one<{
    id: number;
    status: string;
    resident_id: number;
    academic_session_id: number;
  }>(db, `SELECT id, status, resident_id, academic_session_id FROM applications WHERE id = ?`, applicationId);
  if (!app) fail(404, "not_found", "Application not found");
  if (app.status !== "approved") fail(400, "application_not_approved", "Booking requires an approved application");
  const rate = await one<{ id: number; amount_minor: number; currency: string; status: string }>(
    db,
    `SELECT id, amount_minor, currency, status FROM room_rates
     WHERE room_id = ? AND academic_session_id = ? AND status = 'active'`,
    roomId,
    app.academic_session_id,
  );
  if (!rate) fail(400, "no_active_rate", "Selected room has no active rate for this academic session");
  const number = await allocateCode(db, "booking_number_sequence");
  try {
    const ins = await run(
      db,
      `INSERT INTO bookings (
          booking_number, resident_id, academic_session_id, application_id, status,
          total_amount_minor, currency, priced_room_id, priced_room_rate_id
       ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      number, app.resident_id, app.academic_session_id, app.id, rate.amount_minor, rate.currency, roomId, rate.id,
    );
    const id = Number(ins.meta.last_row_id);
    await writeAudit(db, {
      actor,
      action: "admin.bookings.created",
      entityType: "booking",
      entityId: id,
      metadata: { booking_number: number, priced_room_id: roomId, priced_room_rate_id: rate.id, total_amount_minor: rate.amount_minor },
    });
    return getBooking(db, id);
  } catch {
    fail(409, "duplicate_booking", "An active booking already exists for this resident and session");
  }
}

type ConfirmationSettings = {
  requirement_type: "full" | "fixed" | "percentage";
  fixed_amount_minor: number | null;
  percentage_basis_points: number | null;
};

export function confirmationThreshold(total: number, settings: ConfirmationSettings): number {
  if (settings.requirement_type === "fixed") {
    return Math.min(settings.fixed_amount_minor ?? total, total);
  }
  if (settings.requirement_type === "percentage") {
    const bps = settings.percentage_basis_points ?? 10000;
    return Math.floor((total * bps + 9999) / 10000);
  }
  return total;
}

export async function paymentSummary(db: D1Database, bookingId: number) {
  const booking = await one<{
    id: number;
    total_amount_minor: number;
    currency: string;
    status: string;
    payment_attention_required: number;
    payment_attention_reason: string | null;
  }>(db, `SELECT id, total_amount_minor, currency, status, payment_attention_required, payment_attention_reason FROM bookings WHERE id = ?`, bookingId);
  if (!booking) fail(404, "not_found", "Booking not found");
  const verified = await one<{ s: number }>(
    db,
    `SELECT COALESCE(SUM(amount_minor), 0) AS s FROM payments WHERE booking_id = ? AND status = 'verified'`,
    bookingId,
  );
  const settings = await one<ConfirmationSettings>(db, `SELECT requirement_type, fixed_amount_minor, percentage_basis_points FROM payment_confirmation_settings WHERE id = 1`);
  const verifiedTotal = verified?.s ?? 0;
  const outstanding = booking.total_amount_minor - verifiedTotal;
  const threshold = confirmationThreshold(booking.total_amount_minor, settings ?? { requirement_type: "full", fixed_amount_minor: null, percentage_basis_points: null });
  return {
    bookingId: booking.id,
    currency: booking.currency,
    totalAmountMinor: booking.total_amount_minor,
    verifiedPaymentsMinor: verifiedTotal,
    outstandingMinor: outstanding,
    pendingSubmittedPaymentsMinor: null,
    confirmationThresholdMinor: threshold,
    confirmationRequirementMet: verifiedTotal >= threshold,
    paymentAttentionRequired: Boolean(booking.payment_attention_required),
    paymentAttentionReason: booking.payment_attention_reason,
    bookingStatus: booking.status,
  };
}

export async function changeBookingStatus(db: D1Database, actor: AuthUser, id: number, status: string) {
  const booking = await one<{ id: number; status: string }>(db, `SELECT id, status FROM bookings WHERE id = ?`, id);
  if (!booking) fail(404, "not_found", "Booking not found");
  if (!(BOOKING_TRANSITIONS[booking.status] ?? []).includes(status)) {
    fail(400, "invalid_transition", `Cannot change booking from ${booking.status} to ${status}`);
  }
  if (status === "confirmed") {
    const summary = await paymentSummary(db, id);
    if (!summary.confirmationRequirementMet) {
      fail(400, "threshold_not_met", "Verified payments do not meet the confirmation threshold");
    }
  }
  await run(
    db,
    `UPDATE bookings SET status = ?, archived_at = CASE WHEN ? = 'archived' THEN ? ELSE archived_at END,
        payment_attention_required = CASE WHEN ? = 'confirmed' THEN 0 ELSE payment_attention_required END,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
    status, status, nowIso(), status, id,
  );
  await writeAudit(db, { actor, action: "admin.bookings.status_changed", entityType: "booking", entityId: id, metadata: { from: booking.status, to: status } });
  return getBooking(db, id);
}

export async function listPayments(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  return all(
    db,
    `SELECT * FROM payments WHERE (? = '' OR payment_reference LIKE ? OR status LIKE ?)
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    search, q, q, limit, offset,
  );
}

export async function getPayment(db: D1Database, id: number) {
  const row = await one(db, `SELECT * FROM payments WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Payment not found");
  return row;
}

export async function createPayment(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const bookingId = requirePositiveInt(body.bookingId ?? body.booking_id, "bookingId");
  const residentId = requirePositiveInt(body.residentId ?? body.resident_id, "residentId");
  const amountMinor = requirePositiveInt(body.amountMinor ?? body.amount_minor, "amountMinor");
  const currency = optionalString(body.currency, "currency") ?? "GHS";
  const method = requireString(body.method, "method");
  if (!["cash", "bank_transfer", "mobile_money", "card", "other"].includes(method)) fail(400, "invalid_input", "Invalid payment method");
  const booking = await one<{ resident_id: number; total_amount_minor: number; currency: string }>(
    db, `SELECT resident_id, total_amount_minor, currency FROM bookings WHERE id = ?`, bookingId,
  );
  if (!booking) fail(404, "not_found", "Booking not found");
  if (booking.resident_id !== residentId) fail(400, "resident_mismatch", "Payment resident must match the booking");
  if (booking.currency !== currency) fail(400, "currency_mismatch", "Payment currency must match the booking");
  const inflight = await one<{ s: number }>(
    db,
    `SELECT COALESCE(SUM(amount_minor), 0) AS s FROM payments
     WHERE booking_id = ? AND status IN ('pending', 'submitted', 'verified')`,
    bookingId,
  );
  if ((inflight?.s ?? 0) + amountMinor > booking.total_amount_minor) {
    fail(400, "overpayment", "Payment would exceed the captured booking total");
  }
  const reference = await allocateCode(db, "payment_reference_sequence");
  const ins = await run(
    db,
    `INSERT INTO payments (payment_reference, booking_id, resident_id, amount_minor, currency, method, status, paid_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    reference, bookingId, residentId, amountMinor, currency, method,
    optionalString(body.paidAt ?? body.paid_at, "paidAt"),
    optionalString(body.notes, "notes"),
  );
  const id = Number(ins.meta.last_row_id);
  await writeAudit(db, { actor, action: "admin.payments.created", entityType: "payment", entityId: id, metadata: { payment_reference: reference } });
  return getPayment(db, id);
}

const PAYMENT_TRANSITIONS: Record<string, string[]> = {
  pending: ["submitted", "cancelled", "archived"],
  submitted: ["cancelled", "archived"],
  verified: ["archived"],
  rejected: ["archived"],
  refunded: ["archived"],
  cancelled: ["archived"],
};

export async function changePaymentStatus(db: D1Database, actor: AuthUser, id: number, status: string) {
  const payment = await one<{ status: string }>(db, `SELECT status FROM payments WHERE id = ?`, id);
  if (!payment) fail(404, "not_found", "Payment not found");
  if (!(PAYMENT_TRANSITIONS[payment.status] ?? []).includes(status)) {
    fail(400, "invalid_transition", `Use dedicated verify/reject/refund endpoints for financial decisions. Cannot change from ${payment.status} to ${status}`);
  }
  await run(db, `UPDATE payments SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, status, id);
  await writeAudit(db, { actor, action: "admin.payments.status_changed", entityType: "payment", entityId: id, metadata: { from: payment.status, to: status } });
  return getPayment(db, id);
}

export async function verifyPayment(db: D1Database, actor: AuthUser, id: number) {
  const payment = await one<{ id: number; status: string; booking_id: number; amount_minor: number }>(
    db, `SELECT id, status, booking_id, amount_minor FROM payments WHERE id = ?`, id,
  );
  if (!payment) fail(404, "not_found", "Payment not found");
  if (payment.status !== "submitted") fail(400, "invalid_transition", "Only submitted payments can be verified");
  const booking = await one<{ total_amount_minor: number; status: string }>(
    db, `SELECT total_amount_minor, status FROM bookings WHERE id = ?`, payment.booking_id,
  );
  if (!booking) fail(404, "not_found", "Booking not found");
  const verified = await one<{ s: number }>(
    db, `SELECT COALESCE(SUM(amount_minor), 0) AS s FROM payments WHERE booking_id = ? AND status = 'verified'`, payment.booking_id,
  );
  if ((verified?.s ?? 0) + payment.amount_minor > booking.total_amount_minor) {
    fail(400, "overpayment", "Verification would exceed the captured booking total");
  }
  await run(
    db,
    `UPDATE payments SET status = 'verified', verified_at = ?, verified_by_staff_id = ?, updated_at = ? WHERE id = ?`,
    nowIso(), actor.staffId, nowIso(), id,
  );
  await writeAudit(db, { actor, action: "admin.payments.verified", entityType: "payment", entityId: id });
  return getPayment(db, id);
}

export async function rejectPayment(db: D1Database, actor: AuthUser, id: number) {
  const payment = await one<{ status: string }>(db, `SELECT status FROM payments WHERE id = ?`, id);
  if (!payment) fail(404, "not_found", "Payment not found");
  if (!["pending", "submitted"].includes(payment.status)) fail(400, "invalid_transition", "Only pending or submitted payments can be rejected");
  await run(db, `UPDATE payments SET status = 'rejected', rejected_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), id);
  await writeAudit(db, { actor, action: "admin.payments.rejected", entityType: "payment", entityId: id });
  return getPayment(db, id);
}

export async function refundPayment(db: D1Database, actor: AuthUser, id: number) {
  const payment = await one<{ status: string; booking_id: number }>(db, `SELECT status, booking_id FROM payments WHERE id = ?`, id);
  if (!payment) fail(404, "not_found", "Payment not found");
  if (payment.status !== "verified") fail(400, "invalid_transition", "Only verified payments can be refunded");
  await run(db, `UPDATE payments SET status = 'refunded', refunded_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), id);
  const booking = await one<{ status: string }>(db, `SELECT status FROM bookings WHERE id = ?`, payment.booking_id);
  const summary = await paymentSummary(db, payment.booking_id);
  if (booking?.status === "confirmed" && !summary.confirmationRequirementMet) {
    await run(
      db,
      `UPDATE bookings SET payment_attention_required = 1, payment_attention_reason = ?, updated_at = ? WHERE id = ?`,
      "Verified payments fell below the confirmation threshold after refund",
      nowIso(),
      payment.booking_id,
    );
    await writeAudit(db, {
      actor,
      action: "admin.payments.refunded_attention",
      entityType: "booking",
      entityId: payment.booking_id,
      metadata: { payment_id: id },
    });
  }
  await writeAudit(db, { actor, action: "admin.payments.refunded", entityType: "payment", entityId: id });
  return getPayment(db, id);
}

export async function listReceipts(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  return all(
    db,
    `SELECT * FROM receipts WHERE (? = '' OR receipt_number LIKE ? OR status LIKE ?)
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    search, q, q, limit, offset,
  );
}

export async function getReceipt(db: D1Database, id: number) {
  const row = await one(
    db,
    `SELECT r.*, p.amount_minor, p.method, p.paid_at, p.verified_at, p.payment_reference, p.booking_id, p.resident_id, p.currency AS payment_currency, p.status AS payment_status
     FROM receipts r JOIN payments p ON p.id = r.payment_id WHERE r.id = ?`,
    id,
  );
  if (!row) fail(404, "not_found", "Receipt not found");
  return row;
}

export async function issueReceipt(db: D1Database, actor: AuthUser, paymentId: number) {
  const payment = await one<{ status: string }>(db, `SELECT status FROM payments WHERE id = ?`, paymentId);
  if (!payment) fail(404, "not_found", "Payment not found");
  if (payment.status !== "verified") fail(400, "payment_not_verified", "Receipts can only be issued against verified payments");
  const existing = await one(db, `SELECT id FROM receipts WHERE payment_id = ? AND status = 'issued'`, paymentId);
  if (existing) fail(409, "receipt_exists", "This payment already has an issued receipt");
  const number = await allocateCode(db, "receipt_number_sequence");
  const ins = await run(
    db,
    `INSERT INTO receipts (receipt_number, payment_id, issued_by_staff_id, status, issued_at)
     VALUES (?, ?, ?, 'issued', ?)`,
    number, paymentId, actor.staffId, nowIso(),
  );
  const id = Number(ins.meta.last_row_id);
  await writeAudit(db, { actor, action: "admin.receipts.issued", entityType: "receipt", entityId: id, metadata: { receipt_number: number } });
  return getReceipt(db, id);
}

export async function voidReceipt(db: D1Database, actor: AuthUser, id: number, reason: string) {
  const receipt = await one<{ status: string }>(db, `SELECT status FROM receipts WHERE id = ?`, id);
  if (!receipt) fail(404, "not_found", "Receipt not found");
  if (receipt.status !== "issued") fail(400, "invalid_transition", "Only issued receipts can be voided");
  await run(
    db,
    `UPDATE receipts SET status = 'voided', voided_at = ?, void_reason = ?, updated_at = ? WHERE id = ?`,
    nowIso(), reason, nowIso(), id,
  );
  await writeAudit(db, { actor, action: "admin.receipts.voided", entityType: "receipt", entityId: id });
  return getReceipt(db, id);
}

export async function listAllocations(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  return all(
    db,
    `SELECT * FROM allocations WHERE (? = '' OR status LIKE ?)
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    search, q, limit, offset,
  );
}

export async function getAllocation(db: D1Database, id: number) {
  const row = await one(db, `SELECT * FROM allocations WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Allocation not found");
  return row;
}

async function assertBedAllocatable(
  db: D1Database,
  bedId: number,
  booking: {
    id: number;
    resident_id: number;
    academic_session_id: number;
    priced_room_id: number | null;
    total_amount_minor: number;
    currency: string;
    status: string;
  },
) {
  if (booking.status !== "confirmed") fail(400, "booking_not_confirmed", "Allocation requires a confirmed booking");
  const bed = await one<{ id: number; room_id: number; status: string }>(db, `SELECT id, room_id, status FROM beds WHERE id = ?`, bedId);
  if (!bed || bed.status !== "available") fail(400, "bed_unavailable", "Selected bed is not available");
  const room = await one<{ id: number; status: string; gender_policy: string }>(db, `SELECT id, status, gender_policy FROM rooms WHERE id = ?`, bed.room_id);
  if (!room || room.status !== "available") fail(400, "room_unavailable", "Selected room is not available");
  const resident = await one<{ gender: string }>(db, `SELECT gender FROM residents WHERE id = ?`, booking.resident_id);
  if (room.gender_policy !== "any" && resident && room.gender_policy !== resident.gender) {
    fail(400, "gender_mismatch", "Room gender policy is not compatible with the resident");
  }
  if (booking.priced_room_id && bed.room_id !== booking.priced_room_id) {
    const destRate = await one<{ amount_minor: number; currency: string }>(
      db,
      `SELECT amount_minor, currency FROM room_rates
       WHERE room_id = ? AND academic_session_id = ? AND status = 'active'`,
      bed.room_id,
      booking.academic_session_id,
    );
    if (!destRate || destRate.amount_minor !== booking.total_amount_minor || destRate.currency !== booking.currency) {
      fail(400, "price_mismatch", "Destination room active rate must match the booking captured amount and currency");
    }
  }
  return bed;
}

export async function createAllocation(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const bookingId = requirePositiveInt(body.bookingId ?? body.booking_id, "bookingId");
  const residentId = requirePositiveInt(body.residentId ?? body.resident_id, "residentId");
  const academicSessionId = requirePositiveInt(body.academicSessionId ?? body.academic_session_id, "academicSessionId");
  const bedId = requirePositiveInt(body.bedId ?? body.bed_id, "bedId");
  const startsOn = requireString(body.startsOn ?? body.starts_on, "startsOn");
  const booking = await one<{
    id: number;
    resident_id: number;
    academic_session_id: number;
    priced_room_id: number | null;
    total_amount_minor: number;
    currency: string;
    status: string;
  }>(db, `SELECT * FROM bookings WHERE id = ?`, bookingId);
  if (!booking) fail(404, "not_found", "Booking not found");
  if (booking.resident_id !== residentId || booking.academic_session_id !== academicSessionId) {
    fail(400, "mismatch", "Allocation resident/session must match the booking");
  }
  await assertBedAllocatable(db, bedId, booking);
  try {
    const ins = await run(
      db,
      `INSERT INTO allocations (booking_id, resident_id, academic_session_id, bed_id, assigned_by_staff_id, status, starts_on, notes)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      bookingId, residentId, academicSessionId, bedId, actor.staffId, startsOn, optionalString(body.notes, "notes"),
    );
    const id = Number(ins.meta.last_row_id);
    await run(db, `UPDATE residents SET status = 'resident', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, residentId);
    await writeAudit(db, { actor, action: "admin.allocations.created", entityType: "allocation", entityId: id });
    return getAllocation(db, id);
  } catch {
    fail(409, "duplicate_allocation", "Bed or resident already has an active allocation");
  }
}

export async function transferAllocation(db: D1Database, actor: AuthUser, id: number, bedId: number, notes?: string | null) {
  const current = await one<{
    id: number;
    status: string;
    booking_id: number;
    resident_id: number;
    academic_session_id: number;
    bed_id: number;
    starts_on: string;
  }>(db, `SELECT * FROM allocations WHERE id = ?`, id);
  if (!current || current.status !== "active") fail(400, "invalid_allocation", "Only active allocations can be transferred");
  const booking = await one<{
    id: number;
    resident_id: number;
    academic_session_id: number;
    priced_room_id: number | null;
    total_amount_minor: number;
    currency: string;
    status: string;
  }>(db, `SELECT * FROM bookings WHERE id = ?`, current.booking_id);
  if (!booking) fail(404, "not_found", "Booking not found");
  await assertBedAllocatable(db, bedId, booking);
  await run(
    db,
    `UPDATE allocations SET status = 'transferred', ended_at = ?, updated_at = ? WHERE id = ?`,
    nowIso(), nowIso(), id,
  );
  const ins = await run(
    db,
    `INSERT INTO allocations (booking_id, resident_id, academic_session_id, bed_id, assigned_by_staff_id, status, starts_on, notes)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    current.booking_id, current.resident_id, current.academic_session_id, bedId, actor.staffId, current.starts_on, notes ?? null,
  );
  const newId = Number(ins.meta.last_row_id);
  await writeAudit(db, { actor, action: "admin.allocations.transferred", entityType: "allocation", entityId: newId, metadata: { from: id, to_bed_id: bedId } });
  return getAllocation(db, newId);
}

const ALLOC_TRANSITIONS: Record<string, string[]> = {
  active: ["ended", "cancelled", "archived"],
  ended: ["archived"],
  cancelled: ["archived"],
  transferred: ["archived"],
};

export async function changeAllocationStatus(db: D1Database, actor: AuthUser, id: number, status: string) {
  const row = await one<{ status: string; resident_id: number }>(db, `SELECT status, resident_id FROM allocations WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Allocation not found");
  if (!(ALLOC_TRANSITIONS[row.status] ?? []).includes(status)) {
    fail(400, "invalid_transition", `Cannot change allocation from ${row.status} to ${status}`);
  }
  await run(
    db,
    `UPDATE allocations SET status = ?, ended_at = CASE WHEN ? IN ('ended', 'cancelled') THEN ? ELSE ended_at END,
        archived_at = CASE WHEN ? = 'archived' THEN ? ELSE archived_at END, updated_at = ?
     WHERE id = ?`,
    status, status, nowIso(), status, nowIso(), nowIso(), id,
  );
  await writeAudit(db, { actor, action: "admin.allocations.status_changed", entityType: "allocation", entityId: id, metadata: { from: row.status, to: status } });
  return getAllocation(db, id);
}
