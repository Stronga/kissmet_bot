-- Schema verification (intentionally bypasses production service workflows)
PRAGMA foreign_keys = ON;

INSERT INTO users (id, email, phone, display_name, user_type, status, username)
VALUES (9001, 'verify-staff@kissmet.local', '+233200000001', 'Verify Staff', 'staff', 'active', 'verify_staff');

INSERT INTO staff (id, user_id, role_id, staff_code, job_title, status)
VALUES (9001, 9001, 1, 'VERIFY-STF-1', 'Verifier', 'active');

INSERT INTO institutions (id, code, name, status)
VALUES (9001, 'verify-ug', 'Verification University', 'active');

INSERT INTO academic_sessions (id, code, name, starts_on, ends_on, status)
VALUES (9001, 'VERIFY-2026', 'Verification Session', '2026-01-01', '2026-12-31', 'draft');

INSERT INTO users (id, email, phone, display_name, user_type, status)
VALUES (9002, 'verify-resident@kissmet.local', '+233200000002', 'Verify Resident', 'resident', 'active');

INSERT INTO residents (id, user_id, resident_code, first_name, last_name, gender, institution_id, student_id, status)
VALUES (9002, 9002, 'VERIFY-RES-1', 'Verify', 'Resident', 'female', 9001, 'VERIFY-STU-1', 'applicant');

INSERT INTO rooms (id, room_code, name, capacity, gender_policy, status)
VALUES (9001, 'VERIFY-R1', 'Verification Room', 2, 'female', 'available');

INSERT INTO beds (id, room_id, bed_code, label, status)
VALUES (9001, 9001, 'VERIFY-R1-A', 'A', 'available'),
       (9002, 9001, 'VERIFY-R1-B', 'B', 'available');

INSERT INTO room_rates (id, room_id, academic_session_id, rate_code, amount_minor, currency, status)
VALUES (9001, 9001, 9001, 'VERIFY-RATE-1', 250000, 'GHS', 'active');

INSERT INTO applications (id, application_number, resident_id, academic_session_id, status)
VALUES (9001, 'VERIFY-APP-1', 9002, 9001, 'approved');

INSERT INTO bookings (id, booking_number, resident_id, academic_session_id, application_id, status, total_amount_minor, currency, priced_room_id, priced_room_rate_id)
VALUES (9001, 'VERIFY-BOOK-1', 9002, 9001, 9001, 'confirmed', 250000, 'GHS', 9001, 9001);

INSERT INTO allocations (id, booking_id, resident_id, academic_session_id, bed_id, assigned_by_staff_id, status, starts_on)
VALUES (9001, 9001, 9002, 9001, 9001, 9001, 'active', '2026-01-15');

INSERT INTO payments (id, payment_reference, booking_id, resident_id, amount_minor, currency, method, status)
VALUES (9001, 'VERIFY-PAY-1', 9001, 9002, 250000, 'GHS', 'mobile_money', 'submitted');

INSERT INTO receipts (id, receipt_number, payment_id, issued_by_staff_id, status)
VALUES (9001, 'VERIFY-REC-1', 9001, 9001, 'issued');

INSERT INTO documents (id, owner_user_id, resident_id, document_type, status, r2_bucket, r2_key, original_filename, content_type, size_bytes)
VALUES (9001, 9002, 9002, 'student_card', 'uploaded', 'kissmet-documents', 'verify/student-card.pdf', 'student-card.pdf', 'application/pdf', 1024);

INSERT INTO maintenance_requests (id, request_number, resident_id, room_id, bed_id, category, priority, title, status)
VALUES (9001, 'VERIFY-MNT-1', 9002, 9001, 9001, 'plumbing', 'normal', 'Verification leak', 'open');

INSERT INTO announcements (id, title, body, audience, severity, status, created_by_staff_id)
VALUES (9001, 'Verification Announcement', 'Schema verification body', 'residents', 'normal', 'draft', 9001);

INSERT INTO announcement_channels (announcement_id, channel, status)
VALUES (9001, 'resident_portal', 'enabled');

INSERT INTO otp_codes (user_id, resident_id, purpose, code_hash, status, expires_at, attempt_count, max_attempts, rate_limit_key)
VALUES (9002, 9002, 'resident_login', 'verify-otp-hash', 'pending', '2099-01-01T00:00:00.000Z', 0, 5, 'verify-otp');

INSERT INTO sessions (user_id, session_token_hash, status, expires_at)
VALUES (9001, 'verify-session-hash', 'active', '2099-01-01T00:00:00.000Z');

INSERT INTO audit_logs (actor_user_id, actor_staff_id, action, entity_type, entity_id, metadata_json)
VALUES (9001, 9001, 'verify.schema', 'schema', 1, '{"ok":true}');

INSERT INTO messages (id, subject, body, target_type, target_label, target_config_json, status, created_by_staff_id)
VALUES (9001, 'Verification Message', 'Schema verification message', 'all_residents', 'All residents', '{}', 'sent', 9001);

INSERT INTO message_channels (message_id, channel, status)
VALUES (9001, 'portal', 'enabled');

SELECT 'schema_verification_ok' AS result;
