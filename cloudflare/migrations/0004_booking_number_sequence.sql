CREATE TABLE booking_number_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  prefix TEXT NOT NULL DEFAULT 'KSM-BKG-',
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0),
  padding INTEGER NOT NULL DEFAULT 4 CHECK (padding >= 4),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO booking_number_sequence (id, prefix, next_value, padding) VALUES (1, 'KSM-BKG-', 1, 4);
