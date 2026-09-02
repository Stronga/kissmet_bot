import type { AuthUser } from "../env";
import { optionalString, requirePositiveInt, requireString } from "../auth/validation";
import { writeAudit } from "../lib/audit";
import { all, allocateCode, one, run } from "../lib/db";
import { fail } from "../lib/http";
import { parseMoneyToMinorUnits } from "../lib/money";

export async function listInstitutions(db: D1Database) {
  return all(db, `SELECT * FROM institutions ORDER BY name`);
}

export async function listAcademicSessions(db: D1Database) {
  return all(db, `SELECT * FROM academic_sessions ORDER BY starts_on DESC`);
}

export async function listResidents(db: D1Database, search: string, limit: number, offset: number) {
  const q = `%${search}%`;
  return all(
    db,
    `SELECT * FROM residents
     WHERE (? = '' OR resident_code LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR student_id LIKE ?)
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    search, q, q, q, q, limit, offset,
  );
}

export async function getResident(db: D1Database, id: number) {
  const row = await one(db, `SELECT * FROM residents WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Resident not found");
  return row;
}

export async function createResident(
  db: D1Database,
  actor: AuthUser,
  body: Record<string, unknown>,
) {
  const firstName = requireString(body.firstName ?? body.first_name, "firstName");
  const lastName = requireString(body.lastName ?? body.last_name, "lastName");
  const gender = requireString(body.gender, "gender");
  if (!["female", "male", "other"].includes(gender)) fail(400, "invalid_input", "Invalid gender");
  const institutionId = requirePositiveInt(body.institutionId ?? body.institution_id, "institutionId");
  const studentId = requireString(body.studentId ?? body.student_id, "studentId");
  const phone = requireString(body.phone, "phone");
  const email = optionalString(body.email, "email");
  const middleName = optionalString(body.middleName ?? body.middle_name, "middleName");

  const inst = await one<{ status: string }>(db, `SELECT status FROM institutions WHERE id = ?`, institutionId);
  if (!inst || inst.status !== "active") fail(400, "invalid_institution", "Institution is not available");
  const taken = await one(db, `SELECT id FROM residents WHERE institution_id = ? AND student_id = ?`, institutionId, studentId);
  if (taken) fail(409, "student_id_taken", "Student ID already exists at this institution");
  if (await one(db, `SELECT id FROM users WHERE phone = ?`, phone)) fail(409, "phone_taken", "Phone already registered");

  const displayName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const userIns = await run(
    db,
    `INSERT INTO users (email, phone, display_name, user_type, status) VALUES (?, ?, ?, 'resident', 'active')`,
    email, phone, displayName,
  );
  const userId = Number(userIns.meta.last_row_id);
  const residentCode = await allocateCode(db, "resident_code_sequence");
  const resIns = await run(
    db,
    `INSERT INTO residents (user_id, resident_code, first_name, last_name, middle_name, gender, institution_id, student_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'prospect')`,
    userId, residentCode, firstName, lastName, middleName, gender, institutionId, studentId,
  );
  const id = Number(resIns.meta.last_row_id);
  await writeAudit(db, { actor, action: "admin.residents.created", entityType: "resident", entityId: id, metadata: { resident_code: residentCode } });
  return getResident(db, id);
}

export async function listRooms(db: D1Database) {
  return all(db, `SELECT * FROM rooms ORDER BY room_code`);
}

export async function getRoom(db: D1Database, id: number) {
  const row = await one(db, `SELECT * FROM rooms WHERE id = ?`, id);
  if (!row) fail(404, "not_found", "Room not found");
  return row;
}

export async function createRoom(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const roomCode = requireString(body.roomCode ?? body.room_code, "roomCode");
  const name = requireString(body.name, "name");
  const capacity = requirePositiveInt(body.capacity, "capacity");
  const genderPolicy = requireString(body.genderPolicy ?? body.gender_policy, "genderPolicy");
  if (!["female", "male", "any"].includes(genderPolicy)) fail(400, "invalid_input", "Invalid gender policy");
  const floor = optionalString(body.floor, "floor");
  try {
    const ins = await run(
      db,
      `INSERT INTO rooms (room_code, name, floor, capacity, gender_policy, status) VALUES (?, ?, ?, ?, ?, 'available')`,
      roomCode, name, floor, capacity, genderPolicy,
    );
    const id = Number(ins.meta.last_row_id);
    await writeAudit(db, { actor, action: "admin.rooms.created", entityType: "room", entityId: id });
    return getRoom(db, id);
  } catch (err) {
    fail(409, "duplicate", "Room code already exists");
  }
}

export async function listBeds(db: D1Database, roomId: number) {
  return all(db, `SELECT * FROM beds WHERE room_id = ? ORDER BY label`, roomId);
}

export async function createBed(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const roomId = requirePositiveInt(body.roomId ?? body.room_id, "roomId");
  const label = requireString(body.label, "label");
  const room = await one<{ capacity: number }>(db, `SELECT capacity FROM rooms WHERE id = ?`, roomId);
  if (!room) fail(404, "not_found", "Room not found");
  const count = await one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM beds WHERE room_id = ? AND status IN ('available', 'maintenance', 'inactive')`,
    roomId,
  );
  if ((count?.c ?? 0) >= room.capacity) fail(400, "capacity_exceeded", "Active bed inventory has reached configured room capacity");
  const bedCode = `${(await getRoom(db, roomId) as { room_code: string }).room_code}-${label}`;
  try {
    const ins = await run(
      db,
      `INSERT INTO beds (room_id, bed_code, label, status) VALUES (?, ?, ?, 'available')`,
      roomId, bedCode, label,
    );
    const id = Number(ins.meta.last_row_id);
    await writeAudit(db, { actor, action: "admin.beds.created", entityType: "bed", entityId: id });
    return one(db, `SELECT * FROM beds WHERE id = ?`, id);
  } catch {
    fail(409, "duplicate", "Bed code or label already exists");
  }
}

async function hasActiveAllocationForRoom(db: D1Database, roomId: number) {
  const row = await one(
    db,
    `SELECT a.id FROM allocations a JOIN beds b ON b.id = a.bed_id
     WHERE b.room_id = ? AND a.status = 'active' LIMIT 1`,
    roomId,
  );
  return Boolean(row);
}

async function hasActiveAllocationForBed(db: D1Database, bedId: number) {
  const row = await one(db, `SELECT id FROM allocations WHERE bed_id = ? AND status = 'active' LIMIT 1`, bedId);
  return Boolean(row);
}

export async function updateRoomStatus(db: D1Database, actor: AuthUser, id: number, status: string) {
  if (!["available", "maintenance", "inactive", "archived"].includes(status)) fail(400, "invalid_status", "Invalid room status");
  const room = await getRoom(db, id);
  if (status !== "available" && (await hasActiveAllocationForRoom(db, id))) {
    fail(409, "room_occupied", "An actively allocated room cannot be taken out of service");
  }
  await run(db, `UPDATE rooms SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, status, id);
  await writeAudit(db, { actor, action: "admin.rooms.status_changed", entityType: "room", entityId: id, metadata: { status } });
  return getRoom(db, id);
}

export async function updateBedStatus(db: D1Database, actor: AuthUser, id: number, status: string) {
  if (!["available", "maintenance", "inactive", "archived"].includes(status)) fail(400, "invalid_status", "Invalid bed status");
  const bed = await one(db, `SELECT * FROM beds WHERE id = ?`, id);
  if (!bed) fail(404, "not_found", "Bed not found");
  if (status !== "available" && (await hasActiveAllocationForBed(db, id))) {
    fail(409, "bed_occupied", "An actively allocated bed cannot be taken out of service");
  }
  await run(db, `UPDATE beds SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, status, id);
  await writeAudit(db, { actor, action: "admin.beds.status_changed", entityType: "bed", entityId: id, metadata: { status } });
  return one(db, `SELECT * FROM beds WHERE id = ?`, id);
}

export async function listRoomRates(db: D1Database, roomId?: number) {
  if (roomId) return all(db, `SELECT * FROM room_rates WHERE room_id = ? ORDER BY id DESC`, roomId);
  return all(db, `SELECT * FROM room_rates ORDER BY id DESC`);
}

export async function createRoomRate(db: D1Database, actor: AuthUser, body: Record<string, unknown>) {
  const roomId = requirePositiveInt(body.roomId ?? body.room_id, "roomId");
  const academicSessionId = requirePositiveInt(body.academicSessionId ?? body.academic_session_id, "academicSessionId");
  const currency = optionalString(body.currency, "currency") ?? "GHS";
  let amountMinor: number;
  if (body.amountMinor !== undefined || body.amount_minor !== undefined) {
    amountMinor = requirePositiveInt(body.amountMinor ?? body.amount_minor, "amountMinor");
  } else {
    try {
      amountMinor = parseMoneyToMinorUnits(requireString(body.amount, "amount"));
    } catch (err) {
      fail(400, "invalid_input", (err as Error).message);
    }
  }
  if (amountMinor <= 0) fail(400, "invalid_input", "Amount must be greater than zero");
  const room = await getRoom(db, roomId) as { room_code: string };
  const session = await one<{ code: string }>(db, `SELECT code FROM academic_sessions WHERE id = ?`, academicSessionId);
  if (!session) fail(404, "not_found", "Academic session not found");
  const rateCode = `RATE-${room.room_code}-${session.code}-${Date.now().toString().slice(-6)}`;
  try {
    const ins = await run(
      db,
      `INSERT INTO room_rates (room_id, academic_session_id, rate_code, amount_minor, currency, status)
       VALUES (?, ?, ?, ?, ?, 'draft')`,
      roomId, academicSessionId, rateCode, amountMinor, currency,
    );
    const id = Number(ins.meta.last_row_id);
    await writeAudit(db, { actor, action: "admin.room_rates.created", entityType: "room_rate", entityId: id });
    return one(db, `SELECT * FROM room_rates WHERE id = ?`, id);
  } catch {
    fail(409, "duplicate", "Rate code already exists");
  }
}

export async function updateRoomRateStatus(db: D1Database, actor: AuthUser, id: number, status: string) {
  if (!["draft", "active", "inactive", "archived"].includes(status)) fail(400, "invalid_status", "Invalid rate status");
  const rate = await one(db, `SELECT * FROM room_rates WHERE id = ?`, id);
  if (!rate) fail(404, "not_found", "Room rate not found");
  try {
    await run(db, `UPDATE room_rates SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, status, id);
  } catch {
    fail(409, "duplicate_active_rate", "Only one active rate is allowed per room and academic session");
  }
  await writeAudit(db, { actor, action: "admin.room_rates.status_changed", entityType: "room_rate", entityId: id, metadata: { status } });
  return one(db, `SELECT * FROM room_rates WHERE id = ?`, id);
}

export async function availability(db: D1Database, academicSessionId: number, residentId?: number) {
  const resident = residentId
    ? await one<{ gender: string }>(db, `SELECT gender FROM residents WHERE id = ?`, residentId)
    : null;
  const rooms = await all<{
    id: number;
    room_code: string;
    name: string;
    gender_policy: string;
    status: string;
    capacity: number;
    amount_minor: number;
    currency: string;
    rate_id: number;
  }>(
    db,
    `SELECT r.id, r.room_code, r.name, r.gender_policy, r.status, r.capacity,
            rr.amount_minor, rr.currency, rr.id AS rate_id
     FROM rooms r
     JOIN room_rates rr ON rr.room_id = r.id AND rr.academic_session_id = ? AND rr.status = 'active'
     WHERE r.status = 'available'`,
    academicSessionId,
  );
  const beds = await all<{
    id: number;
    room_id: number;
    bed_code: string;
    label: string;
    status: string;
  }>(
    db,
    `SELECT b.id, b.room_id, b.bed_code, b.label, b.status
     FROM beds b
     WHERE b.status = 'available'
       AND b.id NOT IN (SELECT bed_id FROM allocations WHERE status = 'active')`,
  );
  const filteredRooms = rooms.filter((room) => {
    if (!resident) return true;
    if (room.gender_policy === "any") return true;
    return room.gender_policy === resident.gender;
  });
  return {
    rooms: filteredRooms.map((room) => ({
      ...room,
      beds: beds.filter((b) => b.room_id === room.id),
    })),
  };
}
