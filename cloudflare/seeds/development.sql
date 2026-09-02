-- Development seed. Do not use as production data.
-- Super Admin password (plaintext, documented in README): KissmetAdmin123!
PRAGMA foreign_keys = ON;

INSERT INTO users (id, email, phone, display_name, user_type, status, username, password_hash)
VALUES (
  1,
  'admin@kissmetgroup.org',
  '+233200000000',
  'Kissmet Super Admin',
  'staff',
  'active',
  'admin',
  'pbkdf2$sha256$210000$c0fe22a417bd3b885c3c83664e010e10$df8066f69e1a2ae92d9cee13964c940fa0d91beec3defff41671a7bfe65f3b6f'
);

INSERT INTO staff (id, user_id, role_id, staff_code, job_title, hire_date, status)
VALUES (1, 1, 1, 'KSM-STF-0001', 'Hostel Super Admin', '2024-01-01', 'active');

INSERT INTO institutions (id, code, name, status)
VALUES (1, 'ug', 'University of Ghana', 'active');

INSERT INTO academic_sessions (id, code, name, starts_on, ends_on, status)
VALUES (1, '2026-2027', '2026/2027 Academic Year', '2026-08-01', '2027-07-31', 'active');

INSERT INTO rooms (id, room_code, name, floor, capacity, gender_policy, status) VALUES
  (1, 'R101', 'Garden View 101', '1', 2, 'female', 'available'),
  (2, 'R102', 'Courtyard 102', '1', 2, 'female', 'available'),
  (3, 'R201', 'North Wing 201', '2', 2, 'male', 'available'),
  (4, 'R202', 'Studio 202', '2', 1, 'any', 'available');

INSERT INTO beds (id, room_id, bed_code, label, status) VALUES
  (1, 1, 'R101-A', 'A', 'available'),
  (2, 1, 'R101-B', 'B', 'available'),
  (3, 2, 'R102-A', 'A', 'available'),
  (4, 2, 'R102-B', 'B', 'available'),
  (5, 3, 'R201-A', 'A', 'available'),
  (6, 3, 'R201-B', 'B', 'available'),
  (7, 4, 'R202-A', 'A', 'available');

INSERT INTO room_rates (id, room_id, academic_session_id, rate_code, amount_minor, currency, status) VALUES
  (1, 1, 1, 'RATE-R101-2026', 250000, 'GHS', 'active'),
  (2, 2, 1, 'RATE-R102-2026', 250000, 'GHS', 'active'),
  (3, 3, 1, 'RATE-R201-2026', 250000, 'GHS', 'active'),
  (4, 4, 1, 'RATE-R202-2026', 300000, 'GHS', 'active');

INSERT INTO users (id, email, phone, display_name, user_type, status) VALUES
  (2, 'ama.mensah@st.ug.edu.gh', '+233241111111', 'Ama Mensah', 'resident', 'active'),
  (3, 'kofi.asante@st.ug.edu.gh', '+233242222222', 'Kofi Asante', 'resident', 'active'),
  (4, 'efua.boateng@st.ug.edu.gh', '+233243333333', 'Efua Boateng', 'resident', 'active');

INSERT INTO residents (
  id, user_id, resident_code, first_name, last_name, middle_name, gender, institution_id, student_id, status, phone_verified_at
) VALUES
  (1, 2, 'KSM-RES-0001', 'Ama', 'Mensah', NULL, 'female', 1, '10938472', 'applicant', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (2, 3, 'KSM-RES-0002', 'Kofi', 'Asante', NULL, 'male', 1, '10938473', 'applicant', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (3, 4, 'KSM-RES-0003', 'Efua', 'Boateng', 'Akosua', 'female', 1, '10938474', 'prospect', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

UPDATE resident_code_sequence SET next_value = 4, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;

UPDATE system_settings SET
  organization_name = 'Kissmet Hostel',
  support_email = 'support@kissmetgroup.org',
  support_phone = '+233302000000',
  address_text = 'Kissmet Hostel, Accra, Ghana',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 1;
