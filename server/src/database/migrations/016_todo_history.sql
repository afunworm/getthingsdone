CREATE TABLE IF NOT EXISTS todo_history (
  id          TEXT    PRIMARY KEY,
  todo_id     TEXT    NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  changed_by  TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  field       TEXT    NOT NULL,
  old_value   TEXT,
  new_value   TEXT
);
CREATE INDEX IF NOT EXISTS idx_todo_history_todo_id ON todo_history(todo_id);
