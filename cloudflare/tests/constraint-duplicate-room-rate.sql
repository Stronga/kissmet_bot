PRAGMA foreign_keys = ON;
-- Expected to FAIL: two active rates for same room/session
INSERT INTO room_rates (room_id, academic_session_id, rate_code, amount_minor, currency, status)
VALUES (9001, 9001, 'VERIFY-RATE-DUP', 260000, 'GHS', 'active');
