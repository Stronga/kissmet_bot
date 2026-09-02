-- Kissmet Hostel canonical D1 schema (Phase 2 foundation)
PRAGMA foreign_keys = ON;

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  display_name TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('resident', 'staff', 'system')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE staff (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  staff_code TEXT NOT NULL UNIQUE,
  job_title TEXT,
  hire_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE academic_sessions (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  CHECK (starts_on <= ends_on)
);

CREATE UNIQUE INDEX idx_one_active_academic_session
  ON academic_sessions(status)
  WHERE status = 'active';

CREATE TABLE institutions (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE residents (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  resident_code TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('female', 'male', 'other')),
  date_of_birth TEXT,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect', 'applicant', 'resident', 'past_resident', 'suspended', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  UNIQUE (institution_id, student_id)
);

CREATE TABLE rooms (
  id INTEGER PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  floor TEXT,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  gender_policy TEXT NOT NULL CHECK (gender_policy IN ('female', 'male', 'any')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'inactive', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);

CREATE TABLE beds (
  id INTEGER PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  bed_code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'inactive', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  UNIQUE (room_id, label)
);

CREATE TABLE room_rates (
  id INTEGER PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  academic_session_id INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  rate_code TEXT NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);

CREATE UNIQUE INDEX idx_room_rates_one_active_per_room_session
  ON room_rates(room_id, academic_session_id)
  WHERE status = 'active';

CREATE TABLE applications (
  id INTEGER PRIMARY KEY,
  application_number TEXT NOT NULL UNIQUE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  academic_session_id INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled', 'archived')),
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by_staff_id INTEGER REFERENCES staff(id) ON DELETE RESTRICT,
  decision_notes TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);

CREATE UNIQUE INDEX idx_applications_one_active_per_resident_session
  ON applications(resident_id, academic_session_id)
  WHERE status IN ('draft', 'submitted', 'under_review', 'approved');

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY,
  booking_number TEXT NOT NULL UNIQUE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  academic_session_id INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired', 'completed', 'archived')),
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);

CREATE UNIQUE INDEX idx_bookings_one_active_per_resident_session
  ON bookings(resident_id, academic_session_id)
  WHERE status IN ('pending', 'confirmed');

CREATE TABLE allocations (
  id INTEGER PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  academic_session_id INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  bed_id INTEGER NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
  assigned_by_staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled', 'transferred', 'archived')),
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT,
  archived_at TEXT
);

CREATE UNIQUE INDEX idx_allocations_one_active_bed
  ON allocations(bed_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX idx_allocations_one_active_resident_session
  ON allocations(resident_id, academic_session_id)
  WHERE status = 'active';

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  payment_reference TEXT NOT NULL UNIQUE,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'mobile_money', 'card', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'verified', 'rejected', 'refunded', 'cancelled', 'archived')),
  paid_at TEXT,
  submitted_at TEXT,
  verified_at TEXT,
  verified_by_staff_id INTEGER REFERENCES staff(id) ON DELETE RESTRICT,
  rejected_at TEXT,
  refunded_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);

CREATE TABLE receipts (
  id INTEGER PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  issued_by_staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'voided', 'archived')),
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  voided_at TEXT,
  void_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  resident_id INTEGER REFERENCES residents(id) ON DELETE RESTRICT,
  application_id INTEGER REFERENCES applications(id) ON DELETE RESTRICT,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE RESTRICT,
  payment_id INTEGER REFERENCES payments(id) ON DELETE RESTRICT,
  receipt_id INTEGER REFERENCES receipts(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL CHECK (document_type IN ('student_card', 'ghana_card', 'profile_photo', 'application_support', 'payment_slip', 'receipt_pdf', 'other')),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'verified', 'rejected', 'deleted', 'archived')),
  r2_bucket TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 TEXT,
  verified_at TEXT,
  verified_by_staff_id INTEGER REFERENCES staff(id) ON DELETE RESTRICT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE maintenance_requests (
  id INTEGER PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  resident_id INTEGER REFERENCES residents(id) ON DELETE RESTRICT,
  room_id INTEGER REFERENCES rooms(id) ON DELETE RESTRICT,
  bed_id INTEGER REFERENCES beds(id) ON DELETE RESTRICT,
  assigned_to_staff_id INTEGER REFERENCES staff(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('plumbing', 'electrical', 'furniture', 'cleaning', 'security', 'other')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled', 'archived')),
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  assigned_at TEXT,
  started_at TEXT,
  resolved_at TEXT,
  closed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE otp_codes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  resident_id INTEGER REFERENCES residents(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL CHECK (purpose IN ('resident_login', 'phone_verification', 'password_reset')),
  code_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= max_attempts),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  rate_limit_key TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  request_ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_otp_rate_limit ON otp_codes(rate_limit_key, purpose, requested_at);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revocation_reason TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT
);

CREATE INDEX idx_sessions_user_status ON sessions(user_id, status);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  metadata_json TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor_user ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_actor_staff ON audit_logs(actor_staff_id);

CREATE INDEX idx_residents_status ON residents(status);
CREATE INDEX idx_residents_institution ON residents(institution_id);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_beds_room_status ON beds(room_id, status);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_allocations_status ON allocations(status);
CREATE INDEX idx_payments_booking_status ON payments(booking_id, status);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);

INSERT INTO roles (code, name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Full administrative control', 1),
  ('manager', 'Manager', 'Broad operational access', 1),
  ('reception', 'Reception', 'Intake and operational resident work', 1),
  ('accounts', 'Accounts', 'Payments, verification, receipts, finance', 1),
  ('maintenance', 'Maintenance', 'Maintenance workflow', 1);
