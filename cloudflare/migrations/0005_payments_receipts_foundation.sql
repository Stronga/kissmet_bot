CREATE TABLE payment_reference_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  prefix TEXT NOT NULL DEFAULT 'KSM-PAY-',
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0),
  padding INTEGER NOT NULL DEFAULT 4 CHECK (padding >= 4),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO payment_reference_sequence (id, prefix, next_value, padding) VALUES (1, 'KSM-PAY-', 1, 4);

CREATE TABLE receipt_number_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  prefix TEXT NOT NULL DEFAULT 'KSM-RCP-',
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0),
  padding INTEGER NOT NULL DEFAULT 4 CHECK (padding >= 4),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO receipt_number_sequence (id, prefix, next_value, padding) VALUES (1, 'KSM-RCP-', 1, 4);

CREATE TABLE payment_confirmation_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  requirement_type TEXT NOT NULL DEFAULT 'full' CHECK (requirement_type IN ('full', 'fixed', 'percentage')),
  fixed_amount_minor INTEGER CHECK (fixed_amount_minor IS NULL OR fixed_amount_minor > 0),
  percentage_basis_points INTEGER CHECK (percentage_basis_points IS NULL OR (percentage_basis_points > 0 AND percentage_basis_points <= 10000)),
  currency TEXT NOT NULL DEFAULT 'GHS',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by_staff_id INTEGER REFERENCES staff(id) ON DELETE RESTRICT
);

INSERT INTO payment_confirmation_settings (id, requirement_type, currency)
VALUES (1, 'full', 'GHS');
