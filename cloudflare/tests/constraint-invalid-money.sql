PRAGMA foreign_keys = ON;
-- Expected to FAIL: amount_minor must be > 0
INSERT INTO payments (payment_reference, booking_id, resident_id, amount_minor, currency, method, status)
VALUES ('VERIFY-PAY-BAD', 9001, 9002, 0, 'GHS', 'cash', 'pending');
