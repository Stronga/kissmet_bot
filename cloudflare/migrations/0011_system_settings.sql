CREATE TABLE system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  organization_name TEXT NOT NULL DEFAULT 'Kissmet Hostel',
  admin_portal_title TEXT NOT NULL DEFAULT 'Kissmet Admin',
  resident_portal_title TEXT NOT NULL DEFAULT 'Kissmet Resident Portal',
  support_email TEXT,
  support_phone TEXT,
  address_text TEXT,
  default_currency TEXT NOT NULL DEFAULT 'GHS',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO system_settings (
  id, organization_name, admin_portal_title, resident_portal_title, default_currency
) VALUES (
  1, 'Kissmet Hostel', 'Kissmet Admin', 'Kissmet Resident Portal', 'GHS'
);
