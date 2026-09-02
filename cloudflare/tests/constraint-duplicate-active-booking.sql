PRAGMA foreign_keys = ON;
-- Expected to FAIL: two pending bookings for same resident/session
INSERT INTO bookings (booking_number, resident_id, academic_session_id, application_id, status, total_amount_minor, currency, priced_room_id, priced_room_rate_id)
VALUES ('VERIFY-BOOK-DUP', 9002, 9001, 9001, 'pending', 250000, 'GHS', 9001, 9001);
