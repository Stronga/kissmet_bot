import type { AuthUser } from "../env";
import { hashOtp, hashPassword, hashSessionToken, generateOtp, generateToken, verifyOtp, verifyPassword } from "../auth/crypto";
import { permissionsForRole } from "../auth/permissions";
import { allowStaffLogin } from "../auth/rate-limit";
import { fail } from "../lib/http";
import { writeAudit } from "../lib/audit";
import { all, allocateCode, one, run } from "../lib/db";
import { addSeconds, isPast, nowIso } from "../lib/time";
import { mockSms, maskPhone } from "./sms.service";

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;

type UserRow = {
  id: number;
  email: string | null;
  phone: string | null;
  display_name: string;
  user_type: "resident" | "staff" | "system";
  status: string;
  username: string | null;
  password_hash: string | null;
};

type StaffJoin = UserRow & {
  staff_id: number;
  staff_status: string;
  role_code: string;
};

export async function staffLogin(
  db: D1Database,
  identifier: string,
  password: string,
  meta: { ipHash?: string; userAgent?: string },
) {
  const key = await hashSessionToken(identifier.toLowerCase());
  if (!allowStaffLogin(key)) {
    fail(429, "rate_limited", "Too many login attempts. Try again later.");
  }

  const user = await one<StaffJoin>(
    db,
    `SELECT u.*, s.id AS staff_id, s.status AS staff_status, r.code AS role_code
     FROM users u
     JOIN staff s ON s.user_id = u.id
     JOIN roles r ON r.id = s.role_id
     WHERE lower(u.email) = lower(?) OR lower(u.username) = lower(?)`,
    identifier,
    identifier,
  );

  if (!user || !user.password_hash) {
    await writeAudit(db, { action: "auth.staff.login_failed", entityType: "user", metadata: { reason: "not_found" } });
    fail(401, "invalid_credentials", "Invalid identifier or password");
  }
  if (user.status !== "active" || user.staff_status !== "active" || user.user_type !== "staff") {
    await writeAudit(db, { action: "auth.staff.login_failed", entityType: "user", entityId: user.id, metadata: { reason: "inactive" } });
    fail(401, "invalid_credentials", "Invalid identifier or password");
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    await writeAudit(db, { action: "auth.staff.login_failed", entityType: "user", entityId: user.id, metadata: { reason: "bad_password" } });
    fail(401, "invalid_credentials", "Invalid identifier or password");
  }

  const { token, auth } = await createSession(db, user, user.staff_id, null, user.role_code, meta);
  await writeAudit(db, {
    actor: auth,
    action: "auth.staff.login",
    entityType: "user",
    entityId: user.id,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });
  return { token, user: publicAuth(auth) };
}

export async function requestResidentOtp(
  db: D1Database,
  institutionCode: string,
  studentId: string,
  meta: { ipHash?: string },
) {
  const generic = { ok: true, message: "If the account exists, a verification code was sent." };
  const resident = await one<{
    id: number;
    user_id: number;
    phone: string | null;
    status: string;
    user_status: string;
  }>(
    db,
    `SELECT r.id, r.user_id, u.phone, r.status, u.status AS user_status
     FROM residents r
     JOIN users u ON u.id = r.user_id
     JOIN institutions i ON i.id = r.institution_id
     WHERE lower(i.code) = lower(?) AND r.student_id = ?`,
    institutionCode,
    studentId,
  );

  const rateKey = await hashSessionToken(`${institutionCode.toLowerCase()}|${studentId}|${meta.ipHash ?? ""}`);
  const recent = await one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM otp_codes
     WHERE rate_limit_key = ? AND purpose = 'resident_login'
       AND requested_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')`,
    rateKey,
  );
  if ((recent?.c ?? 0) >= 5) return generic;

  if (!resident || !resident.phone || resident.user_status !== "active") {
    await writeAudit(db, { action: "auth.resident.otp_requested", entityType: "resident", metadata: { found: false } });
    return generic;
  }

  const otp = generateOtp();
  await persistOtp(db, {
    userId: resident.user_id,
    residentId: resident.id,
    purpose: "resident_login",
    otp,
    rateKey,
    ipHash: meta.ipHash ?? null,
  });
  await mockSms.sendOtp(resident.phone, otp);
  await writeAudit(db, {
    action: "auth.resident.otp_requested",
    entityType: "resident",
    entityId: resident.id,
    metadata: { destination: maskPhone(resident.phone) },
  });
  return generic;
}

export async function verifyResidentOtp(
  db: D1Database,
  institutionCode: string,
  studentId: string,
  otp: string,
  meta: { ipHash?: string; userAgent?: string },
) {
  const resident = await one<UserRow & { resident_id: number; role_code: string | null }>(
    db,
    `SELECT u.*, r.id AS resident_id
     FROM residents r
     JOIN users u ON u.id = r.user_id
     JOIN institutions i ON i.id = r.institution_id
     WHERE lower(i.code) = lower(?) AND r.student_id = ?`,
    institutionCode,
    studentId,
  );
  if (!resident) fail(401, "invalid_otp", "Invalid or expired verification code");

  await consumeOtp(db, resident.id, resident.resident_id, "resident_login", otp);
  const { token, auth } = await createSession(db, resident, null, resident.resident_id, "resident", meta);
  await writeAudit(db, {
    actor: auth,
    action: "auth.resident.login",
    entityType: "resident",
    entityId: resident.resident_id,
  });
  return { token, user: publicAuth(auth) };
}

export type RegistrationPayload = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender: "female" | "male" | "other";
  phone: string;
  email?: string | null;
  institutionId: number;
  studentId: string;
  dateOfBirth?: string | null;
};

export async function requestRegistrationOtp(db: D1Database, payload: RegistrationPayload, meta: { ipHash?: string }) {
  const institution = await one<{ id: number; status: string }>(
    db,
    `SELECT id, status FROM institutions WHERE id = ?`,
    payload.institutionId,
  );
  if (!institution || institution.status !== "active") fail(400, "invalid_institution", "Institution is not available");

  const existingStudent = await one(
    db,
    `SELECT id FROM residents WHERE institution_id = ? AND student_id = ?`,
    payload.institutionId,
    payload.studentId,
  );
  if (existingStudent) fail(409, "student_id_taken", "A resident with this student ID already exists at that institution");

  const existingPhone = await one(db, `SELECT id FROM users WHERE phone = ?`, payload.phone);
  if (existingPhone) fail(409, "phone_taken", "This phone number is already registered");

  if (payload.email) {
    const existingEmail = await one(db, `SELECT id FROM users WHERE lower(email) = lower(?)`, payload.email);
    if (existingEmail) fail(409, "email_taken", "This email is already registered");
  }

  const rateKey = await hashSessionToken(`reg|${payload.phone}|${meta.ipHash ?? ""}`);
  const recent = await one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM otp_codes WHERE rate_limit_key = ? AND purpose = 'phone_verification'
       AND requested_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')`,
    rateKey,
  );
  if ((recent?.c ?? 0) >= 5) fail(429, "rate_limited", "Too many verification requests. Try again later.");

  const otp = generateOtp();
  await persistOtp(db, {
    userId: null,
    residentId: null,
    purpose: "phone_verification",
    otp,
    rateKey,
    ipHash: meta.ipHash ?? null,
    registrationPayload: payload,
  });
  await mockSms.sendOtp(payload.phone, otp);
  await writeAudit(db, {
    action: "auth.registration.otp_requested",
    entityType: "otp",
    metadata: { destination: maskPhone(payload.phone) },
  });
  return { ok: true, message: `We sent a verification code to ${maskPhone(payload.phone)}.` };
}

export async function verifyRegistrationOtp(
  db: D1Database,
  phone: string,
  otp: string,
  meta: { ipHash?: string; userAgent?: string },
) {
  const row = await one<{
    id: number;
    code_hash: string;
    status: string;
    expires_at: string;
    attempt_count: number;
    max_attempts: number;
    registration_payload_json: string | null;
  }>(
    db,
    `SELECT * FROM otp_codes
     WHERE purpose = 'phone_verification' AND status = 'pending'
       AND json_extract(registration_payload_json, '$.phone') = ?
     ORDER BY id DESC LIMIT 1`,
    phone,
  );
  if (!row) fail(401, "invalid_otp", "Invalid or expired verification code");
  await consumeOtpRow(db, row, otp);
  if (!row.registration_payload_json) fail(400, "invalid_registration", "Registration data is missing");
  const payload = JSON.parse(row.registration_payload_json) as RegistrationPayload;

  const displayName = [payload.firstName, payload.middleName, payload.lastName].filter(Boolean).join(" ");
  const userInsert = await run(
    db,
    `INSERT INTO users (email, phone, display_name, user_type, status)
     VALUES (?, ?, ?, 'resident', 'active')`,
    payload.email ?? null,
    payload.phone,
    displayName,
  );
  const userId = Number(userInsert.meta.last_row_id);
  const residentCode = await allocateCode(db, "resident_code_sequence");
  const resInsert = await run(
    db,
    `INSERT INTO residents (
        user_id, resident_code, first_name, last_name, middle_name, gender, date_of_birth,
        institution_id, student_id, status, phone_verified_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'prospect', ?)`,
    userId,
    residentCode,
    payload.firstName,
    payload.lastName,
    payload.middleName ?? null,
    payload.gender,
    payload.dateOfBirth ?? null,
    payload.institutionId,
    payload.studentId,
    nowIso(),
  );
  const residentId = Number(resInsert.meta.last_row_id);
  const user = await one<UserRow>(db, `SELECT * FROM users WHERE id = ?`, userId);
  if (!user) fail(500, "registration_failed", "Could not create resident account");
  const { token, auth } = await createSession(db, user, null, residentId, "resident", meta);
  await writeAudit(db, {
    actor: auth,
    action: "resident.registered",
    entityType: "resident",
    entityId: residentId,
    metadata: { resident_code: residentCode },
  });
  return { token, user: publicAuth(auth), residentCode };
}

export async function logout(db: D1Database, auth: AuthUser) {
  await run(
    db,
    `UPDATE sessions SET status = 'revoked', revoked_at = ?, revocation_reason = 'logout'
     WHERE id = ? AND status = 'active'`,
    nowIso(),
    auth.sessionId,
  );
  await writeAudit(db, { actor: auth, action: "auth.logout", entityType: "session", entityId: auth.sessionId });
}

export async function revokeUserSessions(db: D1Database, userId: number, reason: string) {
  await run(
    db,
    `UPDATE sessions SET status = 'revoked', revoked_at = ?, revocation_reason = ?
     WHERE user_id = ? AND status = 'active'`,
    nowIso(),
    reason,
    userId,
  );
}

export async function loadAuthFromToken(db: D1Database, token: string): Promise<AuthUser> {
  const hash = await hashSessionToken(token);
  const row = await one<{
    session_id: number;
    session_status: string;
    expires_at: string;
    user_id: number;
    email: string | null;
    phone: string | null;
    display_name: string;
    user_type: AuthUser["userType"];
    user_status: string;
    username: string | null;
    staff_id: number | null;
    staff_status: string | null;
    role_code: string | null;
    resident_id: number | null;
  }>(
    db,
    `SELECT s.id AS session_id, s.status AS session_status, s.expires_at,
            u.id AS user_id, u.email, u.phone, u.display_name, u.user_type, u.status AS user_status, u.username,
            st.id AS staff_id, st.status AS staff_status, r.code AS role_code,
            res.id AS resident_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN staff st ON st.user_id = u.id
     LEFT JOIN roles r ON r.id = st.role_id
     LEFT JOIN residents res ON res.user_id = u.id
     WHERE s.session_token_hash = ?`,
    hash,
  );
  if (!row) fail(401, "unauthorized", "Authentication required");
  if (row.session_status !== "active" || row.user_status !== "active" || isPast(row.expires_at)) {
    fail(401, "unauthorized", "Session is no longer valid");
  }
  const role = row.user_type === "resident" ? "resident" : row.role_code;
  if (row.user_type === "staff" && row.staff_status !== "active") {
    fail(401, "unauthorized", "Session is no longer valid");
  }
  return {
    userId: row.user_id,
    staffId: row.staff_id,
    residentId: row.resident_id,
    userType: row.user_type,
    role,
    permissions: permissionsForRole(role),
    displayName: row.display_name,
    email: row.email,
    username: row.username,
    sessionId: row.session_id,
  };
}

export function publicAuth(auth: AuthUser) {
  return {
    id: auth.userId,
    displayName: auth.displayName,
    email: auth.email,
    username: auth.username,
    userType: auth.userType,
    role: auth.role,
    permissions: auth.permissions,
    staffId: auth.staffId,
    residentId: auth.residentId,
  };
}

async function createSession(
  db: D1Database,
  user: UserRow,
  staffId: number | null,
  residentId: number | null,
  role: string | null,
  meta: { ipHash?: string; userAgent?: string },
) {
  const token = generateToken();
  const hash = await hashSessionToken(token);
  const inserted = await run(
    db,
    `INSERT INTO sessions (user_id, session_token_hash, status, expires_at, ip_hash, user_agent)
     VALUES (?, ?, 'active', ?, ?, ?)`,
    user.id,
    hash,
    addSeconds(nowIso(), SESSION_TTL_SECONDS),
    meta.ipHash ?? null,
    meta.userAgent ?? null,
  );
  const auth: AuthUser = {
    userId: user.id,
    staffId,
    residentId,
    userType: user.user_type,
    role,
    permissions: permissionsForRole(role),
    displayName: user.display_name,
    email: user.email,
    username: user.username,
    sessionId: Number(inserted.meta.last_row_id),
  };
  return { token, auth };
}

async function persistOtp(
  db: D1Database,
  input: {
    userId: number | null;
    residentId: number | null;
    purpose: string;
    otp: string;
    rateKey: string;
    ipHash: string | null;
    registrationPayload?: unknown;
  },
) {
  await run(
    db,
    `UPDATE otp_codes SET status = 'revoked' WHERE user_id IS ? AND resident_id IS ? AND purpose = ? AND status = 'pending'`,
    input.userId,
    input.residentId,
    input.purpose,
  );
  const codeHash = await hashOtp(input.otp);
  await run(
    db,
    `INSERT INTO otp_codes (
        user_id, resident_id, purpose, code_hash, status, expires_at, attempt_count, max_attempts,
        rate_limit_key, request_ip_hash, registration_payload_json
     ) VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?)`,
    input.userId,
    input.residentId,
    input.purpose,
    codeHash,
    addSeconds(nowIso(), OTP_TTL_SECONDS),
    OTP_MAX_ATTEMPTS,
    input.rateKey,
    input.ipHash,
    input.registrationPayload ? JSON.stringify(input.registrationPayload) : null,
  );
}

async function consumeOtp(db: D1Database, userId: number, residentId: number, purpose: string, otp: string) {
  const row = await one<{
    id: number;
    code_hash: string;
    status: string;
    expires_at: string;
    attempt_count: number;
    max_attempts: number;
    registration_payload_json: string | null;
  }>(
    db,
    `SELECT * FROM otp_codes WHERE user_id = ? AND resident_id = ? AND purpose = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`,
    userId,
    residentId,
    purpose,
  );
  if (!row) fail(401, "invalid_otp", "Invalid or expired verification code");
  await consumeOtpRow(db, row, otp);
}

async function consumeOtpRow(
  db: D1Database,
  row: { id: number; code_hash: string; expires_at: string; attempt_count: number; max_attempts: number },
  otp: string,
) {
  if (isPast(row.expires_at)) {
    await run(db, `UPDATE otp_codes SET status = 'expired' WHERE id = ?`, row.id);
    fail(401, "invalid_otp", "Invalid or expired verification code");
  }
  if (row.attempt_count >= row.max_attempts) {
    await run(db, `UPDATE otp_codes SET status = 'expired' WHERE id = ?`, row.id);
    fail(401, "invalid_otp", "Too many incorrect attempts");
  }
  const ok = await verifyOtp(otp, row.code_hash);
  if (!ok) {
    const next = row.attempt_count + 1;
    if (next >= row.max_attempts) {
      await run(db, `UPDATE otp_codes SET attempt_count = ?, status = 'expired' WHERE id = ?`, next, row.id);
      fail(401, "invalid_otp", "Too many incorrect attempts");
    }
    await run(db, `UPDATE otp_codes SET attempt_count = ? WHERE id = ?`, next, row.id);
    fail(401, "invalid_otp", "Invalid or expired verification code");
  }
  await run(
    db,
    `UPDATE otp_codes SET status = 'used', used_at = ?, attempt_count = attempt_count + 1 WHERE id = ?`,
    nowIso(),
    row.id,
  );
}

export async function listPublicInstitutions(db: D1Database) {
  return all(db, `SELECT id, code, name FROM institutions WHERE status = 'active' ORDER BY name`);
}
