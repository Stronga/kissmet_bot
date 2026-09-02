import type { AuthUser } from "../env";
import { optionalString, requirePositiveInt, requireString } from "../auth/validation";
import { writeAudit } from "../lib/audit";
import { all, allocateCode, one, run } from "../lib/db";
import { fail } from "../lib/http";
import { nowIso } from "../lib/time";
import { mockEmail, mockSms } from "./sms.service";

const MNT_TRANSITIONS: Record<string, string[]> = {
  open: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["resolved", "cancelled"],
  resolved: ["closed", "in_progress"],
  closed: ["archived"],
  cancelled: ["archived"],
};

export async function listMaintenance(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  return all(
    db,
    `SELECT * FROM maintenance_requests
     WHERE (? = '' OR request_number LIKE ? OR title LIKE ? OR status LIKE ?)
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    search, q, q, q, limit, offset,
  );
}

export async function getMaintenance(db: D1Database, id: number) {
  const row = await one(db, `SELECT * FROM maintenance_requests WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Maintenance request not found");
  return row;
}

export async function createMaintenance(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const category = requireString(body.category, "category");
  if (!["plumbing", "electrical", "furniture", "cleaning", "security", "other"].includes(category)) {
    fail(400, "invalid_input", "Invalid maintenance category");
  }
  const priority = optionalString(body.priority, "priority") ?? "normal";
  if (!["low", "normal", "high", "urgent"].includes(priority)) fail(400, "invalid_input", "Invalid priority");
  const title = requireString(body.title, "title", 1, 200);
  const number = await allocateCode(db, "maintenance_request_sequence");
  const residentId = body.residentId ?? body.resident_id ? requirePositiveInt(body.residentId ?? body.resident_id, "residentId") : null;
  let roomId = body.roomId ?? body.room_id ? requirePositiveInt(body.roomId ?? body.room_id, "roomId") : null;
  let bedId = body.bedId ?? body.bed_id ? requirePositiveInt(body.bedId ?? body.bed_id, "bedId") : null;
  if (residentId && !roomId) {
    const alloc = await one<{ bed_id: number; room_id: number }>(
      db,
      `SELECT a.bed_id, b.room_id FROM allocations a JOIN beds b ON b.id = a.bed_id
       WHERE a.resident_id = ? AND a.status = 'active' LIMIT 1`,
      residentId,
    );
    if (alloc) {
      bedId = bedId ?? alloc.bed_id;
      roomId = roomId ?? alloc.room_id;
    }
  }
  const ins = await run(
    db,
    `INSERT INTO maintenance_requests (request_number, resident_id, room_id, bed_id, category, priority, title, description, status, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    number, residentId, roomId, bedId, category, priority, title, optionalString(body.description, "description"), nowIso(),
  );
  const id = Number(ins.meta.last_row_id);
  await writeAudit(db, { actor, action: "admin.maintenance.created", entityType: "maintenance_request", entityId: id, metadata: { request_number: number } });
  return getMaintenance(db, id);
}

export async function assignMaintenance(db: D1Database, actor: AuthUser, id: number, staffId: number) {
  const row = await one<{ status: string }>(db, `SELECT status FROM maintenance_requests WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Maintenance request not found");
  if (row.status !== "open") fail(400, "invalid_transition", "Only open requests can be assigned");
  const staff = await one<{ code: string; staff_status: string }>(
    db,
    `SELECT r.code, s.status AS staff_status FROM staff s JOIN roles r ON r.id = s.role_id WHERE s.id = ?`,
    staffId,
  );
  if (!staff || staff.staff_status !== "active" || !["maintenance", "manager", "super_admin"].includes(staff.code)) {
    fail(400, "invalid_assignee", "Assignee must be active maintenance, manager, or super admin staff");
  }
  await run(
    db,
    `UPDATE maintenance_requests SET status = 'assigned', assigned_to_staff_id = ?, assigned_at = ?, updated_at = ? WHERE id = ?`,
    staffId, nowIso(), nowIso(), id,
  );
  await writeAudit(db, { actor, action: "admin.maintenance.assigned", entityType: "maintenance_request", entityId: id, metadata: { staff_id: staffId } });
  return getMaintenance(db, id);
}

export async function transitionMaintenance(db: D1Database, actor: AuthUser, id: number, action: "start" | "resolve" | "close" | "cancel") {
  const map = { start: "in_progress", resolve: "resolved", close: "closed", cancel: "cancelled" } as const;
  const next = map[action];
  const row = await one<{ status: string }>(db, `SELECT status FROM maintenance_requests WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Maintenance request not found");
  if (!(MNT_TRANSITIONS[row.status] ?? []).includes(next)) {
    fail(400, "invalid_transition", `Cannot ${action} a ${row.status} request`);
  }
  await run(
    db,
    `UPDATE maintenance_requests SET
        status = ?,
        started_at = CASE WHEN ? = 'in_progress' THEN COALESCE(started_at, ?) ELSE started_at END,
        resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END,
        closed_at = CASE WHEN ? = 'closed' THEN ? ELSE closed_at END,
        updated_at = ?
     WHERE id = ?`,
    next, next, nowIso(), next, nowIso(), next, nowIso(), nowIso(), id,
  );
  await writeAudit(db, { actor, action: `admin.maintenance.${action}`, entityType: "maintenance_request", entityId: id });
  return getMaintenance(db, id);
}

export async function listAnnouncements(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  const items = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM announcements
     WHERE (? = '' OR title LIKE ? OR audience LIKE ? OR status LIKE ? OR severity LIKE ?)
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    search, q, q, q, q, limit, offset,
  );
  const ids = items.map((i) => i.id as number);
  const channels = ids.length
    ? await all<{ announcement_id: number; channel: string; status: string }>(
        db,
        `SELECT announcement_id, channel, status FROM announcement_channels WHERE announcement_id IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      )
    : [];
  const deliveries = ids.length
    ? await all<{ announcement_id: number; channel: string; status: string; c: number }>(
        db,
        `SELECT announcement_id, channel, status, COUNT(*) AS c FROM announcement_delivery_attempts
         WHERE announcement_id IN (${ids.map(() => "?").join(",")}) GROUP BY announcement_id, channel, status`,
        ...ids,
      )
    : [];
  return items.map((item) => ({
    ...item,
    channels: channels.filter((c) => c.announcement_id === item.id),
    deliveryCounts: deliveries.filter((d) => d.announcement_id === item.id),
  }));
}

export async function getAnnouncement(db: D1Database, id: number) {
  const item = await one(db, `SELECT * FROM announcements WHERE id = ?`, id);
  if (!item) fail(404, "not_found", "Announcement not found");
  const channels = await all(db, `SELECT announcement_id, channel, status FROM announcement_channels WHERE announcement_id = ?`, id);
  const deliveryCounts = await all(
    db,
    `SELECT channel, status, COUNT(*) AS c FROM announcement_delivery_attempts WHERE announcement_id = ? GROUP BY channel, status`,
    id,
  );
  return { ...item, channels, deliveryCounts };
}

export async function createAnnouncement(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const title = requireString(body.title, "title");
  const bodyText = requireString(body.body, "body", 1, 20000);
  const audience = requireString(body.audience, "audience");
  if (!["all", "residents", "staff"].includes(audience)) fail(400, "invalid_input", "Invalid audience");
  const severity = optionalString(body.severity, "severity") ?? "normal";
  if (!["normal", "important", "high_alert"].includes(severity)) fail(400, "invalid_input", "Invalid severity");
  const channels = Array.isArray(body.channels) ? body.channels.map(String) : ["resident_portal"];
  const ins = await run(
    db,
    `INSERT INTO announcements (title, body, audience, severity, status, starts_at, expires_at, created_by_staff_id)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
    title, bodyText, audience, severity,
    optionalString(body.startsAt ?? body.starts_at, "startsAt"),
    optionalString(body.expiresAt ?? body.expires_at, "expiresAt"),
    actor.staffId,
  );
  const id = Number(ins.meta.last_row_id);
  for (const channel of channels) {
    if (!["resident_portal", "staff_portal", "public_website", "sms", "email"].includes(channel)) continue;
    await run(db, `INSERT INTO announcement_channels (announcement_id, channel, status) VALUES (?, ?, 'enabled')`, id, channel);
  }
  await writeAudit(db, { actor, action: "admin.announcements.created", entityType: "announcement", entityId: id });
  return getAnnouncement(db, id);
}

export async function updateAnnouncement(db: D1Database, actor: AuthUser, id: number, body: Record<string, unknown>) {
  const existing = await one<{ status: string }>(db, `SELECT status FROM announcements WHERE id = ?`, id);
  if (!existing) fail(404, "not_found", "Announcement not found");
  if (existing.status !== "draft") fail(400, "not_draft", "Only drafts can be edited");
  await run(
    db,
    `UPDATE announcements SET
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        audience = COALESCE(?, audience),
        severity = COALESCE(?, severity),
        starts_at = COALESCE(?, starts_at),
        expires_at = COALESCE(?, expires_at),
        updated_at = ?
     WHERE id = ?`,
    optionalString(body.title, "title"),
    optionalString(body.body, "body", 20000),
    optionalString(body.audience, "audience"),
    optionalString(body.severity, "severity"),
    optionalString(body.startsAt ?? body.starts_at, "startsAt"),
    optionalString(body.expiresAt ?? body.expires_at, "expiresAt"),
    nowIso(),
    id,
  );
  if (Array.isArray(body.channels)) {
    await run(db, `DELETE FROM announcement_channels WHERE announcement_id = ?`, id);
    for (const channel of body.channels.map(String)) {
      if (!["resident_portal", "staff_portal", "public_website", "sms", "email"].includes(channel)) continue;
      await run(db, `INSERT INTO announcement_channels (announcement_id, channel, status) VALUES (?, ?, 'enabled')`, id, channel);
    }
  }
  await writeAudit(db, { actor, action: "admin.announcements.updated", entityType: "announcement", entityId: id });
  return getAnnouncement(db, id);
}

export async function publishAnnouncement(db: D1Database, actor: AuthUser, id: number) {
  const item = await getAnnouncement(db, id) as unknown as { status: string; channels: Array<{ channel: string }> };
  if (item.status !== "draft") fail(400, "invalid_transition", "Only drafts can be published");
  const channels = item.channels.map((c) => c.channel);
  if ((channels.includes("sms") || channels.includes("email")) && !actor.permissions.includes("announcement:external_delivery")) {
    fail(403, "forbidden", "External delivery permission is required to publish SMS/email announcements");
  }
  await run(
    db,
    `UPDATE announcements SET status = 'published', published_at = ?, published_by_staff_id = ?, updated_at = ? WHERE id = ?`,
    nowIso(), actor.staffId, nowIso(), id,
  );
  await writeAudit(db, { actor, action: "admin.announcements.published", entityType: "announcement", entityId: id });
  return getAnnouncement(db, id);
}

export async function expireAnnouncement(db: D1Database, actor: AuthUser, id: number) {
  const item = await one<{ status: string }>(db, `SELECT status FROM announcements WHERE id = ?`, id);
  if (!item) fail(404, "not_found", "Announcement not found");
  if (item.status !== "published") fail(400, "invalid_transition", "Only published announcements can expire");
  await run(db, `UPDATE announcements SET status = 'expired', updated_at = ? WHERE id = ?`, nowIso(), id);
  await writeAudit(db, { actor, action: "admin.announcements.expired", entityType: "announcement", entityId: id });
  return getAnnouncement(db, id);
}

export async function archiveAnnouncement(db: D1Database, actor: AuthUser, id: number) {
  const item = await one<{ status: string }>(db, `SELECT status FROM announcements WHERE id = ?`, id);
  if (!item) fail(404, "not_found", "Announcement not found");
  if (!["draft", "published", "expired"].includes(item.status)) fail(400, "invalid_transition", "Cannot archive this announcement");
  await run(db, `UPDATE announcements SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), id);
  await writeAudit(db, { actor, action: "admin.announcements.archived", entityType: "announcement", entityId: id });
  return getAnnouncement(db, id);
}

export async function publicAnnouncements(db: D1Database) {
  const now = nowIso();
  return all(
    db,
    `SELECT a.id, a.title, a.body, a.severity, a.published_at, a.expires_at
     FROM announcements a
     JOIN announcement_channels c ON c.announcement_id = a.id AND c.channel = 'public_website' AND c.status = 'enabled'
     WHERE a.status = 'published'
       AND (a.starts_at IS NULL OR a.starts_at <= ?)
       AND (a.expires_at IS NULL OR a.expires_at >= ?)`,
    now, now,
  );
}

export async function residentAnnouncements(db: D1Database) {
  const now = nowIso();
  return all(
    db,
    `SELECT a.id, a.title, a.body, a.severity, a.published_at, a.expires_at
     FROM announcements a
     JOIN announcement_channels c ON c.announcement_id = a.id AND c.channel = 'resident_portal' AND c.status = 'enabled'
     WHERE a.status = 'published' AND a.audience IN ('all', 'residents')
       AND (a.starts_at IS NULL OR a.starts_at <= ?)
       AND (a.expires_at IS NULL OR a.expires_at >= ?)
     ORDER BY a.published_at DESC`,
    now, now,
  );
}

type TargetConfig = {
  residentId?: number;
  residentIds?: number[];
  roomId?: number;
  roomIds?: number[];
  group?: string;
  staffIds?: number[];
  roleCodes?: string[];
  academicSessionId?: number;
};

function normalizePositiveIds(ids: unknown, field: string): number[] {
  if (!Array.isArray(ids) || ids.length === 0) fail(400, "empty_targets", `${field} must contain at least one positive ID`);
  const out = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!out.length) fail(400, "empty_targets", `${field} must contain at least one positive ID`);
  return out;
}

export async function resolveMessageRecipients(db: D1Database, targetType: string, config: TargetConfig): Promise<Array<Record<string, unknown>>> {
  if (targetType === "individual_resident") {
    const id = config.residentId;
    if (!id || id <= 0) fail(400, "empty_targets", "individual_resident requires exactly one positive resident ID");
    return recipientRows(db, [id], "resident");
  }
  if (targetType === "selected_residents") {
    const ids = normalizePositiveIds(config.residentIds, "residentIds");
    return recipientRows(db, ids, "resident");
  }
  if (targetType === "room") {
    const id = config.roomId;
    if (!id || id <= 0) fail(400, "empty_targets", "room targeting requires exactly one positive room ID");
    const ids = await allocatedResidentIds(db, [id]);
    return recipientRows(db, ids, "resident");
  }
  if (targetType === "selected_rooms") {
    const roomIds = normalizePositiveIds(config.roomIds, "roomIds");
    const ids = await allocatedResidentIds(db, roomIds);
    return recipientRows(db, ids, "resident");
  }
  if (targetType === "all_residents") {
    const rows = await all<{ id: number }>(
      db,
      `SELECT r.id FROM residents r JOIN users u ON u.id = r.user_id WHERE r.status != 'archived' AND u.status = 'active'`,
    );
    return recipientRows(db, rows.map((r) => r.id), "resident");
  }
  if (targetType === "staff") {
    let rows: Array<{ id: number }> = [];
    if (config.staffIds?.length) {
      const ids = normalizePositiveIds(config.staffIds, "staffIds");
      rows = await all<{ id: number }>(db, `SELECT user_id AS id FROM staff WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
    } else if (config.roleCodes?.length) {
      rows = await all<{ id: number }>(
        db,
        `SELECT s.user_id AS id FROM staff s JOIN roles r ON r.id = s.role_id WHERE r.code IN (${config.roleCodes.map(() => "?").join(",")})`,
        ...config.roleCodes,
      );
    } else {
      rows = await all<{ id: number }>(db, `SELECT user_id AS id FROM staff WHERE status = 'active'`);
    }
    return staffRecipientRows(db, rows.map((r) => r.id));
  }
  if (targetType === "group") {
    const group = config.group ?? "";
    if (group === "current_residents") {
      const rows = await all<{ id: number }>(db, `SELECT id FROM residents WHERE status = 'resident'`);
      return recipientRows(db, rows.map((r) => r.id), "resident");
    }
    if (group === "applicants") {
      const rows = await all<{ id: number }>(db, `SELECT id FROM residents WHERE status = 'applicant'`);
      return recipientRows(db, rows.map((r) => r.id), "resident");
    }
    if (group === "active_allocations") {
      const rows = await all<{ id: number }>(db, `SELECT DISTINCT resident_id AS id FROM allocations WHERE status = 'active'`);
      return recipientRows(db, rows.map((r) => r.id), "resident");
    }
    if (group === "outstanding_balance") {
      const rows = await all<{ id: number }>(
        db,
        `SELECT b.resident_id AS id FROM bookings b
         WHERE b.status IN ('pending', 'confirmed')
         GROUP BY b.id
         HAVING b.total_amount_minor > (
           SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.booking_id = b.id AND p.status = 'verified'
         )`,
      );
      return recipientRows(db, rows.map((r) => r.id), "resident");
    }
    if (group === "academic_session") {
      const sessionId = config.academicSessionId;
      if (!sessionId || sessionId <= 0) fail(400, "empty_targets", "academic_session group requires a positive academicSessionId");
      const rows = await all<{ id: number }>(
        db,
        `SELECT DISTINCT resident_id AS id FROM applications
         WHERE academic_session_id = ? AND status IN ('submitted', 'under_review', 'approved')`,
        sessionId,
      );
      return recipientRows(db, rows.map((r) => r.id), "resident");
    }
    fail(400, "invalid_target", "Unknown group target");
  }
  fail(400, "invalid_target", "Unknown message target type");
}

async function allocatedResidentIds(db: D1Database, roomIds: number[]) {
  const rows = await all<{ resident_id: number }>(
    db,
    `SELECT DISTINCT a.resident_id FROM allocations a
     JOIN beds b ON b.id = a.bed_id
     WHERE a.status = 'active' AND b.room_id IN (${roomIds.map(() => "?").join(",")})`,
    ...roomIds,
  );
  return rows.map((r) => r.resident_id);
}

async function recipientRows(db: D1Database, residentIds: number[], kind: "resident"): Promise<Array<Record<string, unknown>>> {
  if (!residentIds.length) return [];
  return all<Record<string, unknown>>(
    db,
    `SELECT u.id AS user_id, u.display_name, u.phone, u.email, r.id AS resident_id, r.resident_code, r.student_id,
            i.name AS institution_name, NULL AS staff_id, NULL AS staff_code, al.room_id, rm.room_code
     FROM residents r
     JOIN users u ON u.id = r.user_id
     JOIN institutions i ON i.id = r.institution_id
     LEFT JOIN allocations al ON al.resident_id = r.id AND al.status = 'active'
     LEFT JOIN beds bd ON bd.id = al.bed_id
     LEFT JOIN rooms rm ON rm.id = bd.room_id
     WHERE r.id IN (${residentIds.map(() => "?").join(",")})`,
    ...residentIds,
  ).then((rows) => rows.map((row) => ({ ...row, recipient_kind: kind })));
}

async function staffRecipientRows(db: D1Database, userIds: number[]): Promise<Array<Record<string, unknown>>> {
  if (!userIds.length) return [];
  return all<Record<string, unknown>>(
    db,
    `SELECT u.id AS user_id, u.display_name, u.phone, u.email, NULL AS resident_id, NULL AS resident_code, NULL AS student_id,
            NULL AS institution_name, s.id AS staff_id, s.staff_code, NULL AS room_id, NULL AS room_code
     FROM users u JOIN staff s ON s.user_id = u.id
     WHERE u.id IN (${userIds.map(() => "?").join(",")})`,
    ...userIds,
  ).then((rows) => rows.map((row) => ({ ...row, recipient_kind: "staff" })));
}

export async function previewMessage(db: D1Database, targetType: string, config: TargetConfig) {
  const recipients = await resolveMessageRecipients(db, targetType, config);
  return {
    recipientCount: recipients.length,
    recipients: recipients.map((r) => ({
      displayName: r.display_name,
      residentCode: r.resident_code,
      studentId: r.student_id,
      institutionName: r.institution_name,
      staffCode: r.staff_code,
      roomCode: r.room_code,
      smsEligible: Boolean(r.phone),
      emailEligible: Boolean(r.email),
      portalEligible: true,
    })),
  };
}

export async function listMessages(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  return all(
    db,
    `SELECT * FROM messages
     WHERE (? = '' OR subject LIKE ? OR target_label LIKE ? OR target_type LIKE ? OR status LIKE ?)
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    search, q, q, q, q, limit, offset,
  );
}

export async function getMessage(db: D1Database, id: number) {
  const message = await one(db, `SELECT * FROM messages WHERE id = ?`, id);
  if (!message) fail(404, "not_found", "Message not found");
  const channels = await all(db, `SELECT channel, status FROM message_channels WHERE message_id = ?`, id);
  const snapshots = await all(
    db,
    `SELECT display_name, resident_code, student_id, institution_name, staff_code, room_code, recipient_kind,
            sms_eligible, email_eligible, portal_eligible
     FROM message_recipient_snapshots WHERE message_id = ?`,
    id,
  );
  const delivery = await all(
    db,
    `SELECT channel, status, COUNT(*) AS c FROM message_delivery_attempts WHERE message_id = ? GROUP BY channel, status`,
    id,
  );
  return { ...message, channels, recipients: snapshots, deliverySummary: delivery };
}

export async function createMessageDraft(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const targetType = requireString(body.targetType ?? body.target_type, "targetType");
  const config = (body.targetConfig ?? body.target_config ?? {}) as TargetConfig;
  const preview = await previewMessage(db, targetType, config);
  const subject = requireString(body.subject, "subject");
  const text = requireString(body.body, "body", 1, 20000);
  const channels = Array.isArray(body.channels) ? body.channels.map(String) : ["portal"];
  if ((channels.includes("sms") || channels.includes("email")) && !actor.permissions.includes("message:external_delivery")) {
    fail(403, "forbidden", "External delivery permission is required for SMS/email messages");
  }
  const ins = await run(
    db,
    `INSERT INTO messages (subject, body, target_type, target_label, target_config_json, status, created_by_staff_id, idempotency_key)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
    subject, text, targetType, optionalString(body.targetLabel ?? body.target_label, "targetLabel") ?? targetType,
    JSON.stringify(config), actor.staffId, optionalString(body.idempotencyKey ?? body.idempotency_key, "idempotencyKey"),
  );
  const id = Number(ins.meta.last_row_id);
  for (const channel of channels) {
    if (!["portal", "sms", "email"].includes(channel)) continue;
    await run(db, `INSERT INTO message_channels (message_id, channel, status) VALUES (?, ?, 'enabled')`, id, channel);
  }
  await writeAudit(db, { actor, action: "admin.messages.created", entityType: "message", entityId: id, metadata: { recipientCount: preview.recipientCount } });
  return getMessage(db, id);
}

export async function sendMessage(db: D1Database, actor: AuthUser, id: number, idempotencyKey?: string | null) {
  const message = await one<{
    id: number;
    status: string;
    subject: string;
    body: string;
    target_type: string;
    target_config_json: string;
  }>(db, `SELECT * FROM messages WHERE id = ?`, id);
  if (!message) fail(404, "not_found", "Message not found");
  if (!["draft", "queued"].includes(message.status)) fail(400, "invalid_status", "Only draft or queued messages can be sent");
  const channels = await all<{ channel: string }>(db, `SELECT channel FROM message_channels WHERE message_id = ? AND status = 'enabled'`, id);
  const channelNames = channels.map((c) => c.channel);
  if ((channelNames.includes("sms") || channelNames.includes("email")) && !actor.permissions.includes("message:external_delivery")) {
    fail(403, "forbidden", "External delivery permission is required");
  }
  const config = JSON.parse(message.target_config_json || "{}") as TargetConfig;
  const recipients = await resolveMessageRecipients(db, message.target_type, config);
  const key = idempotencyKey ?? `send-${id}-${Date.now()}`;
  let failed = 0;
  let sent = 0;
  for (const recipient of recipients) {
    const snap = await run(
      db,
      `INSERT OR IGNORE INTO message_recipient_snapshots (
          message_id, user_id, recipient_kind, display_name, resident_id, resident_code, student_id, institution_name,
          staff_id, staff_code, room_id, room_code, sms_eligible, email_eligible, portal_eligible
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      id, recipient.user_id, recipient.recipient_kind, recipient.display_name, recipient.resident_id, recipient.resident_code,
      recipient.student_id, recipient.institution_name, recipient.staff_id, recipient.staff_code, recipient.room_id, recipient.room_code,
      recipient.phone ? 1 : 0, recipient.email ? 1 : 0,
    );
    const snapshot = await one<{ id: number }>(
      db, `SELECT id FROM message_recipient_snapshots WHERE message_id = ? AND user_id = ?`, id, recipient.user_id,
    );
    if (!snapshot) continue;
    if (channelNames.includes("portal")) {
      await run(
        db,
        `INSERT OR IGNORE INTO portal_message_deliveries (message_id, recipient_snapshot_id, user_id, status, delivered_at)
         VALUES (?, ?, ?, 'unread', ?)`,
        id, snapshot.id, recipient.user_id, nowIso(),
      );
      sent += 1;
    }
    if (channelNames.includes("sms") && recipient.phone) {
      const result = await mockSms.sendMessage(String(recipient.phone), `${message.subject}\n${message.body}`);
      await run(
        db,
        `INSERT OR IGNORE INTO message_delivery_attempts (message_id, recipient_snapshot_id, channel, status, provider_message_id, provider_status, idempotency_key)
         VALUES (?, ?, 'sms', 'sent', ?, 'mock', ?)`,
        id, snapshot.id, result.providerMessageId, key,
      );
      sent += 1;
    }
    if (channelNames.includes("email") && recipient.email) {
      const result = await mockEmail.sendEmail(String(recipient.email), message.subject, message.body);
      await run(
        db,
        `INSERT OR IGNORE INTO message_delivery_attempts (message_id, recipient_snapshot_id, channel, status, provider_message_id, provider_status, idempotency_key)
         VALUES (?, ?, 'email', 'sent', ?, 'mock', ?)`,
        id, snapshot.id, result.providerMessageId, key,
      );
      sent += 1;
    }
    void snap;
    void failed;
  }
  const status = recipients.length === 0 ? "failed" : "sent";
  await run(
    db,
    `UPDATE messages SET status = ?, sent_by_staff_id = ?, sent_at = ?, updated_at = ?, idempotency_key = COALESCE(idempotency_key, ?) WHERE id = ?`,
    status, actor.staffId, nowIso(), nowIso(), key, id,
  );
  await writeAudit(db, { actor, action: "admin.messages.sent", entityType: "message", entityId: id, metadata: { recipients: recipients.length } });
  return getMessage(db, id);
}

export async function archiveMessage(db: D1Database, actor: AuthUser, id: number) {
  const row = await one<{ status: string }>(db, `SELECT status FROM messages WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Message not found");
  await run(db, `UPDATE messages SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), id);
  await writeAudit(db, { actor, action: "admin.messages.archived", entityType: "message", entityId: id });
  return getMessage(db, id);
}
