CREATE TABLE maintenance_request_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  prefix TEXT NOT NULL DEFAULT 'KSM-MNT-',
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0),
  padding INTEGER NOT NULL DEFAULT 4 CHECK (padding >= 4),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO maintenance_request_sequence (id, prefix, next_value, padding) VALUES (1, 'KSM-MNT-', 1, 4);

CREATE INDEX idx_allocations_session_status ON allocations(academic_session_id, status);
CREATE INDEX idx_bookings_session_status ON bookings(academic_session_id, status);
CREATE INDEX idx_applications_session_status ON applications(academic_session_id, status);
CREATE INDEX idx_payments_created ON payments(created_at);
CREATE INDEX idx_maintenance_created ON maintenance_requests(created_at);
