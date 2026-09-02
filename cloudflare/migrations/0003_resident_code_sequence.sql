-- Backend-generated KSM-RES-xxxx codes, independent of row IDs
CREATE TABLE resident_code_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  prefix TEXT NOT NULL DEFAULT 'KSM-RES-',
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0),
  padding INTEGER NOT NULL DEFAULT 4 CHECK (padding >= 4),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO resident_code_sequence (id, prefix, next_value, padding) VALUES (1, 'KSM-RES-', 1, 4);
