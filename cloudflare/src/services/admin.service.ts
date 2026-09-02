import type { AuthUser } from "../env";
import { hashPassword, generateStaffPassword } from "../auth/crypto";
import { optionalString, requirePositiveInt, requireString } from "../auth/validation";
import { redactMetadata, writeAudit } from "../lib/audit";
import { all, one, run } from "../lib/db";
import { fail } from "../lib/http";
import { parseMoneyToMinorUnits, percentageToBasisPoints } from "../lib/money";
import { nowIso } from "../lib/time";
import { revokeUserSessions } from "./auth.service";

export async function dashboardOverview(db: D1Database) {
  const residents = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM residents WHERE status IN ('resident', 'applicant', 'prospect')`);
  const applicants = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM residents WHERE status = 'applicant'`);
  const bookings = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM bookings WHERE status IN ('pending', 'confirmed')`);
  return {
    residents: residents?.c ?? 0,
    applicants: applicants?.c ?? 0,
    activeBookings: bookings?.c ?? 0,
  };
}

export async function dashboardOccupancy(db: D1Database) {
  const usable = await one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM beds b JOIN rooms r ON r.id = b.room_id
     WHERE b.status = 'available' AND r.status = 'available'`,
  );
  const occupied = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM allocations WHERE status = 'active'`);
  const rooms = await all<{
    id: number;
    room_code: string;
    name: string;
    capacity: number;
    gender_policy: string;
    status: string;
    usable_beds: number;
    occupied_beds: number;
  }>(
    db,
    `SELECT r.id, r.room_code, r.name, r.capacity, r.gender_policy, r.status,
            (SELECT COUNT(*) FROM beds b WHERE b.room_id = r.id AND b.status = 'available') AS usable_beds,
            (SELECT COUNT(*) FROM allocations a JOIN beds b ON b.id = a.bed_id WHERE b.room_id = r.id AND a.status = 'active') AS occupied_beds
     FROM rooms r ORDER BY r.room_code`,
  );
  const usableBeds = usable?.c ?? 0;
  const occupiedBeds = occupied?.c ?? 0;
  return {
    usableBeds,
    occupiedBeds,
    availableBeds: Math.max(usableBeds - occupiedBeds, 0),
    occupancyPercent: usableBeds === 0 ? 0 : Math.round((occupiedBeds * 10000) / usableBeds) / 100,
    rooms: rooms.map((room) => ({
      ...room,
      available_beds: Math.max(room.usable_beds - room.occupied_beds, 0),
    })),
  };
}

export async function dashboardFinance(db: D1Database) {
  const expected = await one<{ s: number }>(
    db,
    `SELECT COALESCE(SUM(total_amount_minor), 0) AS s FROM bookings WHERE status IN ('pending', 'confirmed', 'completed')`,
  );
  const verified = await one<{ s: number }>(
    db, `SELECT COALESCE(SUM(amount_minor), 0) AS s FROM payments WHERE status = 'verified'`,
  );
  const pending = await one<{ s: number }>(
    db, `SELECT COALESCE(SUM(amount_minor), 0) AS s FROM payments WHERE status IN ('pending', 'submitted')`,
  );
  const refunded = await one<{ s: number }>(
    db, `SELECT COALESCE(SUM(amount_minor), 0) AS s FROM payments WHERE status = 'refunded'`,
  );
  return {
    expectedRevenueMinor: expected?.s ?? 0,
    verifiedRevenueMinor: verified?.s ?? 0,
    pendingSubmittedMinor: pending?.s ?? 0,
    refundedMinor: refunded?.s ?? 0,
    currency: "GHS",
  };
}

export async function dashboardApplications(db: D1Database) {
  const rows = await all<{ status: string; c: number }>(db, `SELECT status, COUNT(*) AS c FROM applications GROUP BY status`);
  const bookings = await all<{ status: string; c: number }>(db, `SELECT status, COUNT(*) AS c FROM bookings GROUP BY status`);
  return { applications: rows, bookings };
}

export async function dashboardMaintenance(db: D1Database) {
  const rows = await all<{ status: string; c: number }>(db, `SELECT status, COUNT(*) AS c FROM maintenance_requests GROUP BY status`);
  const pick = (s: string) => rows.find((r) => r.status === s)?.c ?? 0;
  return { open: pick("open"), assigned: pick("assigned"), inProgress: pick("in_progress"), resolved: pick("resolved"), rows };
}

export async function dashboardAnnouncements(db: D1Database) {
  const published = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM announcements WHERE status = 'published'`);
  const draft = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM announcements WHERE status = 'draft'`);
  const high = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM announcements WHERE severity = 'high_alert' AND status IN ('draft', 'published')`);
  return { published: published?.c ?? 0, draft: draft?.c ?? 0, highAlert: high?.c ?? 0 };
}

export async function reportOverview(db: D1Database, sessionId?: number) {
  const sessionFilter = sessionId ? "AND academic_session_id = ?" : "";
  const binds = sessionId ? [sessionId] : [];
  const occupancy = await dashboardOccupancy(db);
  const finance = await dashboardFinance(db);
  const apps = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM applications WHERE 1=1 ${sessionFilter}`, ...binds);
  const bookings = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM bookings WHERE 1=1 ${sessionFilter}`, ...binds);
  return { occupancy, finance, applications: apps?.c ?? 0, bookings: bookings?.c ?? 0 };
}

export async function reportOccupancy(db: D1Database) {
  return dashboardOccupancy(db);
}

export async function reportResidents(db: D1Database, status?: string) {
  const rows = status
    ? await all(db, `SELECT * FROM residents WHERE status = ? ORDER BY last_name`, status)
    : await all(db, `SELECT * FROM residents ORDER BY last_name`);
  return { items: rows };
}

export async function reportApplicationsBookings(db: D1Database, sessionId?: number, bookingStatus?: string) {
  const appSql = sessionId
    ? `SELECT status, COUNT(*) AS c FROM applications WHERE academic_session_id = ? GROUP BY status`
    : `SELECT status, COUNT(*) AS c FROM applications GROUP BY status`;
  const bookSql = sessionId
    ? `SELECT status, COUNT(*) AS c FROM bookings WHERE academic_session_id = ? GROUP BY status`
    : `SELECT status, COUNT(*) AS c FROM bookings GROUP BY status`;
  const applications = sessionId ? await all(db, appSql, sessionId) : await all(db, appSql);
  let bookings = sessionId ? await all<{ status: string; c: number }>(db, bookSql, sessionId) : await all<{ status: string; c: number }>(db, bookSql);
  if (bookingStatus) bookings = bookings.filter((b) => b.status === bookingStatus);
  return { applications, bookings };
}

export async function reportFinance(db: D1Database, from?: string, to?: string) {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (from) { clauses.push("created_at >= ?"); binds.push(from); }
  if (to) { clauses.push("created_at <= ?"); binds.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const methods = await all(
    db,
    `SELECT method, status, COALESCE(SUM(amount_minor), 0) AS amount_minor, COUNT(*) AS c
     FROM payments ${where} GROUP BY method, status`,
    ...binds,
  );
  const totals = await dashboardFinance(db);
  return { ...totals, methods };
}

export async function reportOutstanding(db: D1Database) {
  const rows = await all(
    db,
    `SELECT b.id, b.booking_number, b.resident_id, b.total_amount_minor, b.currency, b.status,
            COALESCE((SELECT SUM(p.amount_minor) FROM payments p WHERE p.booking_id = b.id AND p.status = 'verified'), 0) AS verified_minor,
            b.total_amount_minor - COALESCE((SELECT SUM(p.amount_minor) FROM payments p WHERE p.booking_id = b.id AND p.status = 'verified'), 0) AS outstanding_minor
     FROM bookings b
     WHERE b.status IN ('pending', 'confirmed')
     ORDER BY outstanding_minor DESC`,
  );
  return { items: rows };
}

export async function reportMaintenance(db: D1Database, from?: string, to?: string) {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (from) { clauses.push("created_at >= ?"); binds.push(from); }
  if (to) { clauses.push("created_at <= ?"); binds.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const byStatus = await all(db, `SELECT status, COUNT(*) AS c FROM maintenance_requests ${where} GROUP BY status`, ...binds);
  const byCategory = await all(db, `SELECT category, COUNT(*) AS c FROM maintenance_requests ${where} GROUP BY category`, ...binds);
  return { byStatus, byCategory };
}

export async function listStaff(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  return all(
    db,
    `SELECT s.id, s.staff_code, s.job_title, s.status AS staff_status, s.hire_date, s.created_at,
            u.id AS user_id, u.display_name, u.username, u.email, u.phone, u.status AS account_status,
            r.id AS role_id, r.code AS role_code, r.name AS role_name
     FROM staff s
     JOIN users u ON u.id = s.user_id
     JOIN roles r ON r.id = s.role_id
     WHERE (? = '' OR s.staff_code LIKE ? OR u.display_name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR r.code LIKE ? OR s.status LIKE ? OR u.status LIKE ?)
     ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    search, q, q, q, q, q, q, q, limit, offset,
  );
}

export async function getStaff(db: D1Database, id: number) {
  const row = await one(
    db,
    `SELECT s.id, s.staff_code, s.job_title, s.status AS staff_status, s.hire_date, s.created_at, s.notes,
            u.id AS user_id, u.display_name, u.username, u.email, u.phone, u.status AS account_status,
            r.id AS role_id, r.code AS role_code, r.name AS role_name
     FROM staff s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = s.role_id WHERE s.id = ?`,
    id,
  );
  if (!row) fail(404, "not_found", "Staff not found");
  return row;
}

export async function listRoles(db: D1Database) {
  return all(db, `SELECT id, code, name, description FROM roles ORDER BY id`);
}

export async function createStaff(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const displayName = requireString(body.displayName ?? body.display_name, "displayName");
  const username = requireString(body.username, "username");
  const email = optionalString(body.email, "email");
  const phone = optionalString(body.phone, "phone");
  const staffCode = requireString(body.staffCode ?? body.staff_code, "staffCode");
  const roleId = requirePositiveInt(body.roleId ?? body.role_id, "roleId");
  const role = await one<{ code: string }>(db, `SELECT code FROM roles WHERE id = ?`, roleId);
  if (!role || role.code === "resident") fail(400, "invalid_role", "Invalid staff role");
  const initial = optionalString(body.password, "password", 200) ?? generateStaffPassword();
  const hash = await hashPassword(initial);
  const userIns = await run(
    db,
    `INSERT INTO users (email, phone, display_name, user_type, status, username, password_hash)
     VALUES (?, ?, ?, 'staff', 'active', ?, ?)`,
    email, phone, displayName, username, hash,
  );
  const userId = Number(userIns.meta.last_row_id);
  const staffIns = await run(
    db,
    `INSERT INTO staff (user_id, role_id, staff_code, job_title, hire_date, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    userId, roleId, staffCode, optionalString(body.jobTitle ?? body.job_title, "jobTitle"), optionalString(body.hireDate ?? body.hire_date, "hireDate"),
  );
  const id = Number(staffIns.meta.last_row_id);
  await writeAudit(db, { actor, action: "admin.staff.created", entityType: "staff", entityId: id, metadata: { staff_code: staffCode, role: role.code } });
  return { staff: await getStaff(db, id), initialPassword: initial };
}

async function countActiveSuperAdmins(db: D1Database) {
  const row = await one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM staff s
     JOIN roles r ON r.id = s.role_id
     JOIN users u ON u.id = s.user_id
     WHERE r.code = 'super_admin' AND s.status = 'active' AND u.status = 'active'`,
  );
  return row?.c ?? 0;
}

export async function changeStaffRole(db: D1Database, actor: AuthUser, id: number, roleId: number) {
  const staff = await one<{ user_id: number; role_code: string }>(
    db, `SELECT s.user_id, r.code AS role_code FROM staff s JOIN roles r ON r.id = s.role_id WHERE s.id = ?`, id,
  );
  if (!staff) fail(404, "not_found", "Staff not found");
  const role = await one<{ code: string }>(db, `SELECT code FROM roles WHERE id = ?`, roleId);
  if (!role || role.code === "resident") fail(400, "invalid_role", "Invalid staff role");
  if (staff.role_code === "super_admin" && role.code !== "super_admin") {
    if ((await countActiveSuperAdmins(db)) <= 1) fail(400, "last_super_admin", "Cannot demote the last active Super Admin");
  }
  await run(db, `UPDATE staff SET role_id = ?, updated_at = ? WHERE id = ?`, roleId, nowIso(), id);
  await revokeUserSessions(db, staff.user_id, "role_changed");
  await writeAudit(db, { actor, action: "admin.staff.role_changed", entityType: "staff", entityId: id, metadata: { role: role.code } });
  return getStaff(db, id);
}

export async function changeStaffStatus(db: D1Database, actor: AuthUser, id: number, status: string) {
  if (!["active", "inactive", "archived"].includes(status)) fail(400, "invalid_status", "Invalid staff status");
  const staff = await one<{ user_id: number; role_code: string }>(
    db, `SELECT s.user_id, r.code AS role_code FROM staff s JOIN roles r ON r.id = s.role_id WHERE s.id = ?`, id,
  );
  if (!staff) fail(404, "not_found", "Staff not found");
  if (staff.user_id === actor.userId && status !== "active") fail(400, "self_deactivation", "You cannot deactivate your own staff record");
  if (staff.role_code === "super_admin" && status !== "active" && (await countActiveSuperAdmins(db)) <= 1) {
    fail(400, "last_super_admin", "Cannot deactivate the last active Super Admin");
  }
  await run(db, `UPDATE staff SET status = ?, updated_at = ? WHERE id = ?`, status, nowIso(), id);
  await revokeUserSessions(db, staff.user_id, "staff_status_changed");
  await writeAudit(db, { actor, action: "admin.staff.status_changed", entityType: "staff", entityId: id, metadata: { status } });
  return getStaff(db, id);
}

export async function changeAccountStatus(db: D1Database, actor: AuthUser, id: number, status: string) {
  if (!["active", "inactive", "suspended", "archived"].includes(status)) fail(400, "invalid_status", "Invalid account status");
  const staff = await one<{ user_id: number; role_code: string }>(
    db, `SELECT s.user_id, r.code AS role_code FROM staff s JOIN roles r ON r.id = s.role_id WHERE s.id = ?`, id,
  );
  if (!staff) fail(404, "not_found", "Staff not found");
  if (staff.user_id === actor.userId && status !== "active") fail(400, "self_deactivation", "You cannot deactivate your own account");
  if (staff.role_code === "super_admin" && status !== "active" && (await countActiveSuperAdmins(db)) <= 1) {
    fail(400, "last_super_admin", "Cannot deactivate the last active Super Admin account");
  }
  await run(db, `UPDATE users SET status = ?, updated_at = ? WHERE id = ?`, status, nowIso(), staff.user_id);
  await revokeUserSessions(db, staff.user_id, "account_status_changed");
  await writeAudit(db, { actor, action: "admin.staff.account_status_changed", entityType: "staff", entityId: id, metadata: { status } });
  return getStaff(db, id);
}

export async function resetStaffPassword(db: D1Database, actor: AuthUser, id: number, requested?: string | null) {
  const staff = await one<{ user_id: number }>(db, `SELECT user_id FROM staff WHERE id = ?`, id);
  if (!staff) fail(404, "not_found", "Staff not found");
  const password = requested && requested.length >= 8 ? requested : generateStaffPassword();
  const hash = await hashPassword(password);
  await run(db, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, hash, nowIso(), staff.user_id);
  await revokeUserSessions(db, staff.user_id, "password_reset");
  await writeAudit(db, { actor, action: "admin.staff.password_reset", entityType: "staff", entityId: id });
  return { temporaryPassword: password };
}

export async function listAuditLogs(
  db: D1Database,
  query: { search: string; actorUserId?: number; actorStaffId?: number; action?: string; entityType?: string; from?: string; to?: string; limit: number; offset: number },
) {
  const clauses = ["1=1"];
  const binds: unknown[] = [];
  if (query.search) {
    clauses.push("(a.action LIKE ? OR a.entity_type LIKE ? OR a.metadata_json LIKE ?)");
    const q = `%${query.search}%`;
    binds.push(q, q, q);
  }
  if (query.actorUserId) { clauses.push("a.actor_user_id = ?"); binds.push(query.actorUserId); }
  if (query.actorStaffId) { clauses.push("a.actor_staff_id = ?"); binds.push(query.actorStaffId); }
  if (query.action) { clauses.push("a.action = ?"); binds.push(query.action); }
  if (query.entityType) { clauses.push("a.entity_type = ?"); binds.push(query.entityType); }
  if (query.from) { clauses.push("a.created_at >= ?"); binds.push(query.from); }
  if (query.to) { clauses.push("a.created_at <= ?"); binds.push(query.to); }
  const where = clauses.join(" AND ");
  const total = await one<{ c: number }>(db, `SELECT COUNT(*) AS c FROM audit_logs a WHERE ${where}`, ...binds);
  const items = await all<Record<string, unknown>>(
    db,
    `SELECT a.*, u.display_name AS actor_display_name, s.staff_code AS actor_staff_code, r.code AS actor_role
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     LEFT JOIN staff s ON s.id = a.actor_staff_id
     LEFT JOIN roles r ON r.id = s.role_id
     WHERE ${where}
     ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    ...binds, query.limit, query.offset,
  );
  return {
    total: total?.c ?? 0,
    items: items.map((item) => ({
      ...item,
      metadata: item.metadata_json ? redactMetadata(JSON.parse(String(item.metadata_json))) : null,
      metadata_json: undefined,
    })),
  };
}

export async function getAuditLog(db: D1Database, id: number) {
  const item = await one<Record<string, unknown>>(
    db,
    `SELECT a.*, u.display_name AS actor_display_name, s.staff_code AS actor_staff_code, r.code AS actor_role
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     LEFT JOIN staff s ON s.id = a.actor_staff_id
     LEFT JOIN roles r ON r.id = s.role_id
     WHERE a.id = ?`,
    id,
  );
  if (!item) fail(404, "not_found", "Audit log not found");
  return {
    ...item,
    metadata: item.metadata_json ? redactMetadata(JSON.parse(String(item.metadata_json))) : null,
    metadata_json: undefined,
  };
}

export async function getSettings(db: D1Database) {
  const general = await one(db, `SELECT * FROM system_settings WHERE id = 1`);
  const payment = await one(db, `SELECT * FROM payment_confirmation_settings WHERE id = 1`);
  const session = await one(db, `SELECT * FROM academic_sessions WHERE status = 'active' LIMIT 1`);
  return {
    general,
    paymentConfirmation: payment,
    academic: { activeSession: session ?? null },
    communications: { sms: "mock", email: "mock" },
    security: {
      runtime: "Cloudflare Workers",
      framework: "Hono",
      database: "Cloudflare D1",
      storage: "Private R2",
      auth: "PBKDF2-SHA256 + hashed sessions + OTP",
      audit: "append-only",
    },
  };
}

export async function updateGeneralSettings(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  await run(
    db,
    `UPDATE system_settings SET
        organization_name = COALESCE(?, organization_name),
        admin_portal_title = COALESCE(?, admin_portal_title),
        resident_portal_title = COALESCE(?, resident_portal_title),
        support_email = COALESCE(?, support_email),
        support_phone = COALESCE(?, support_phone),
        address_text = COALESCE(?, address_text),
        default_currency = COALESCE(?, default_currency),
        updated_at = ?
     WHERE id = 1`,
    optionalString(body.organizationName ?? body.organization_name, "organizationName"),
    optionalString(body.adminPortalTitle ?? body.admin_portal_title, "adminPortalTitle"),
    optionalString(body.residentPortalTitle ?? body.resident_portal_title, "residentPortalTitle"),
    optionalString(body.supportEmail ?? body.support_email, "supportEmail"),
    optionalString(body.supportPhone ?? body.support_phone, "supportPhone"),
    optionalString(body.addressText ?? body.address_text, "addressText", 2000),
    optionalString(body.defaultCurrency ?? body.default_currency, "defaultCurrency"),
    nowIso(),
  );
  await writeAudit(db, { actor, action: "admin.settings.general_updated", entityType: "system_settings", entityId: 1 });
  return getSettings(db);
}

export async function updatePaymentConfirmation(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const type = requireString(body.requirementType ?? body.requirement_type, "requirementType");
  if (!["full", "fixed", "percentage"].includes(type)) fail(400, "invalid_input", "Invalid requirement type");
  let fixed: number | null = null;
  let bps: number | null = null;
  if (type === "fixed") {
    if (body.fixedAmountMinor ?? body.fixed_amount_minor) {
      fixed = requirePositiveInt(body.fixedAmountMinor ?? body.fixed_amount_minor, "fixedAmountMinor");
    } else {
      try { fixed = parseMoneyToMinorUnits(requireString(body.fixedAmount ?? body.fixed_amount, "fixedAmount")); }
      catch (err) { fail(400, "invalid_input", (err as Error).message); }
    }
  }
  if (type === "percentage") {
    if (body.percentageBasisPoints ?? body.percentage_basis_points) {
      bps = requirePositiveInt(body.percentageBasisPoints ?? body.percentage_basis_points, "percentageBasisPoints");
    } else {
      try { bps = percentageToBasisPoints(requireString(body.percentage, "percentage")); }
      catch (err) { fail(400, "invalid_input", (err as Error).message); }
    }
  }
  await run(
    db,
    `UPDATE payment_confirmation_settings SET requirement_type = ?, fixed_amount_minor = ?, percentage_basis_points = ?, updated_at = ?, updated_by_staff_id = ? WHERE id = 1`,
    type, fixed, bps, nowIso(), actor.staffId,
  );
  await writeAudit(db, { actor, action: "admin.settings.payment_confirmation_updated", entityType: "payment_confirmation_settings", entityId: 1, metadata: { requirement_type: type } });
  return getSettings(db);
}

export async function listDocuments(db: D1Database, residentId?: number) {
  if (residentId) {
    return all(
      db,
      `SELECT id, resident_id, application_id, booking_id, payment_id, receipt_id, document_type, status, original_filename, content_type, size_bytes, created_at, rejection_reason
       FROM documents WHERE resident_id = ? AND status != 'deleted' ORDER BY id DESC`,
      residentId,
    );
  }
  return all(
    db,
    `SELECT id, resident_id, application_id, booking_id, payment_id, receipt_id, document_type, status, original_filename, content_type, size_bytes, created_at
     FROM documents WHERE status != 'deleted' ORDER BY id DESC LIMIT 100`,
  );
}

export async function getDocumentMeta(db: D1Database, id: number) {
  const row = await one<Record<string, unknown>>(db, `SELECT * FROM documents WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Document not found");
  return row;
}
