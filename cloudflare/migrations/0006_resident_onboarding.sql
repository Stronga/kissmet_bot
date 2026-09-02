ALTER TABLE residents ADD COLUMN middle_name TEXT;
ALTER TABLE residents ADD COLUMN phone_verified_at TEXT;

ALTER TABLE otp_codes ADD COLUMN registration_payload_json TEXT;

CREATE TABLE application_number_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  prefix TEXT NOT NULL DEFAULT 'KSM-APP-',
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0),
  padding INTEGER NOT NULL DEFAULT 4 CHECK (padding >= 4),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO application_number_sequence (id, prefix, next_value, padding) VALUES (1, 'KSM-APP-', 1, 4);
