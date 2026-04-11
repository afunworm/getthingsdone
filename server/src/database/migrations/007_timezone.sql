ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('default_timezone', 'UTC');
