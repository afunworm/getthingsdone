-- Per-user, per-project notification preferences
-- project_id NULL = global default for all projects
CREATE TABLE IF NOT EXISTS notification_settings (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  on_task_created INTEGER NOT NULL DEFAULT 1,
  on_task_deleted INTEGER NOT NULL DEFAULT 1,
  on_task_updated INTEGER NOT NULL DEFAULT 1,
  on_task_comment INTEGER NOT NULL DEFAULT 1,
  on_upcoming     INTEGER NOT NULL DEFAULT 1,
  upcoming_hours  INTEGER NOT NULL DEFAULT 24,
  on_past_due     INTEGER NOT NULL DEFAULT 1,
  notify_app      INTEGER NOT NULL DEFAULT 1,
  notify_email    INTEGER NOT NULL DEFAULT 0,
  notify_toast    INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, project_id)
);

-- Custom per-task reminders set by individual users
CREATE TABLE IF NOT EXISTS todo_reminders (
  id         TEXT PRIMARY KEY,
  todo_id    TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remind_at  INTEGER NOT NULL,
  label      TEXT,
  sent       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_todo_reminders_unsent
  ON todo_reminders(remind_at, sent) WHERE sent = 0;

-- Dedup log so upcoming/past-due notifications fire at most once per period
CREATE TABLE IF NOT EXISTS notification_sent_log (
  id       TEXT PRIMARY KEY,
  todo_id  TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type     TEXT NOT NULL,  -- 'upcoming' | 'past_due'
  sent_day TEXT NOT NULL,  -- YYYY-MM-DD, past_due resets daily
  UNIQUE(todo_id, user_id, type, sent_day)
);
