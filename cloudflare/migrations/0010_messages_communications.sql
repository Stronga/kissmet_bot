CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'individual_resident', 'selected_residents', 'room', 'selected_rooms',
    'group', 'all_residents', 'staff'
  )),
  target_label TEXT,
  target_config_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sent', 'partially_failed', 'failed', 'archived')),
  created_by_staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  sent_by_staff_id INTEGER REFERENCES staff(id) ON DELETE RESTRICT,
  sent_at TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);

CREATE INDEX idx_messages_status_target ON messages(status, target_type);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);

CREATE TABLE message_channels (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('portal', 'sms', 'email')),
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  UNIQUE (message_id, channel)
);

CREATE INDEX idx_message_channels_message ON message_channels(message_id, channel);

CREATE TABLE message_recipient_snapshots (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('resident', 'staff')),
  display_name TEXT NOT NULL,
  resident_id INTEGER REFERENCES residents(id) ON DELETE RESTRICT,
  resident_code TEXT,
  student_id TEXT,
  institution_name TEXT,
  staff_id INTEGER REFERENCES staff(id) ON DELETE RESTRICT,
  staff_code TEXT,
  room_id INTEGER REFERENCES rooms(id) ON DELETE RESTRICT,
  room_code TEXT,
  sms_eligible INTEGER NOT NULL DEFAULT 0 CHECK (sms_eligible IN (0, 1)),
  email_eligible INTEGER NOT NULL DEFAULT 0 CHECK (email_eligible IN (0, 1)),
  portal_eligible INTEGER NOT NULL DEFAULT 1 CHECK (portal_eligible IN (0, 1)),
  UNIQUE (message_id, user_id)
);

CREATE INDEX idx_message_snapshots_message ON message_recipient_snapshots(message_id);

CREATE TABLE message_delivery_attempts (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  recipient_snapshot_id INTEGER NOT NULL REFERENCES message_recipient_snapshots(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'failed')),
  provider_message_id TEXT,
  provider_status TEXT,
  failure_reason TEXT,
  idempotency_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (message_id, recipient_snapshot_id, channel, idempotency_key)
);

CREATE INDEX idx_message_delivery_summary ON message_delivery_attempts(message_id, channel, status);

CREATE TABLE portal_message_deliveries (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  recipient_snapshot_id INTEGER NOT NULL REFERENCES message_recipient_snapshots(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read')),
  delivered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at TEXT,
  UNIQUE (message_id, recipient_snapshot_id)
);

CREATE INDEX idx_portal_message_user_status ON portal_message_deliveries(user_id, status);
