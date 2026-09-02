CREATE TABLE announcements (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('all', 'residents', 'staff')),
  severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal', 'important', 'high_alert')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'expired', 'archived')),
  starts_at TEXT,
  published_at TEXT,
  expires_at TEXT,
  published_by_staff_id INTEGER REFERENCES staff(id) ON DELETE RESTRICT,
  created_by_staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);

CREATE INDEX idx_announcements_status_severity ON announcements(status, severity);
CREATE INDEX idx_announcements_current ON announcements(status, starts_at, expires_at);

CREATE TABLE announcement_channels (
  id INTEGER PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('resident_portal', 'staff_portal', 'public_website', 'sms', 'email')),
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (announcement_id, channel)
);

CREATE INDEX idx_announcement_channels_lookup ON announcement_channels(announcement_id, channel, status);

CREATE TABLE announcement_delivery_attempts (
  id INTEGER PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE RESTRICT,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('resident', 'staff')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_message_id TEXT,
  provider_status TEXT,
  failure_reason TEXT,
  idempotency_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (announcement_id, channel, recipient_user_id, idempotency_key)
);

CREATE INDEX idx_announcement_delivery_announcement ON announcement_delivery_attempts(announcement_id, channel, status);
