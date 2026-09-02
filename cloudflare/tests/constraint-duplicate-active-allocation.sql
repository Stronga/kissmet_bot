PRAGMA foreign_keys = ON;
-- Expected to FAIL: two active allocations for the same bed
INSERT INTO allocations (booking_id, resident_id, academic_session_id, bed_id, assigned_by_staff_id, status, starts_on)
VALUES (9001, 9002, 9001, 9001, 9001, 'active', '2026-02-01');
