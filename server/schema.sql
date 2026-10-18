PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  campus_id TEXT NOT NULL REFERENCES campuses(id),
  rfid_uid_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('student', 'employee')),
  card_active INTEGER NOT NULL CHECK (card_active IN (0, 1)),
  safety_briefing_completed INTEGER NOT NULL CHECK (safety_briefing_completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS gateway_devices (
  device_id TEXT PRIMARY KEY,
  campus_id TEXT NOT NULL REFERENCES campuses(id),
  door_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS active_sessions (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  campus_id TEXT NOT NULL REFERENCES campuses(id),
  checked_in_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_logs (
  id TEXT PRIMARY KEY,
  campus_id TEXT NOT NULL REFERENCES campuses(id),
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('check_in', 'check_out', 'access_denied')),
  masked_uid TEXT NOT NULL,
  reason TEXT,
  door_id TEXT NOT NULL,
  retention_expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_logs_expires_at ON access_logs(retention_expires_at);
CREATE INDEX IF NOT EXISTS idx_access_logs_campus_timestamp ON access_logs(campus_id, timestamp);

CREATE TABLE IF NOT EXISTS gateway_nonces (
  device_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, nonce)
);

INSERT OR IGNORE INTO campuses(id, name) VALUES
  ('dhbw-mgt', 'DHBW Bad Mergentheim'),
  ('dhbw-mosbach', 'DHBW Mosbach'),
  ('dhbw-heilbronn', 'DHBW Heilbronn'),
  ('dhbw-stuttgart', 'DHBW Stuttgart');
