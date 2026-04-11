-- Per-user inbox display order (sidebar)
CREATE TABLE IF NOT EXISTS user_project_order (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_ids TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id)
);

-- Per-user per-inbox display preferences (badge count, highlight)
CREATE TABLE IF NOT EXISTS user_project_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  show_task_count INTEGER NOT NULL DEFAULT 0,
  count_mode TEXT NOT NULL DEFAULT 'new',
  highlight_color TEXT,
  PRIMARY KEY (user_id, project_id)
);
