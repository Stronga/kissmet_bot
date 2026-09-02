PRAGMA foreign_keys = ON;
-- Expected to FAIL: booking references missing application
INSERT INTO bookings (booking_number, resident_id, academic_session_id, application_id, status, total_amount_minor, currency)
VALUES ('VERIFY-BOOK-FK', 9002, 9001, 999999, 'pending', 250000, 'GHS');
