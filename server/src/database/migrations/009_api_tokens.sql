CREATE TABLE IF NOT EXISTS api_tokens (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER
);
