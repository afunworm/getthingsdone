CREATE TABLE IF NOT EXISTS todo_assignees (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
  assigned_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_todo_assignee_user
  ON todo_assignees(todo_id, user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_todo_assignee_team
  ON todo_assignees(todo_id, team_id) WHERE team_id IS NOT NULL;

-- Migrate existing single-assignee data to the junction table
INSERT OR IGNORE INTO todo_assignees (id, todo_id, user_id)
  SELECT lower(hex(randomblob(16))), id, assignee_user_id
  FROM todos WHERE assignee_user_id IS NOT NULL;

INSERT OR IGNORE INTO todo_assignees (id, todo_id, team_id)
  SELECT lower(hex(randomblob(16))), id, assignee_team_id
  FROM todos WHERE assignee_team_id IS NOT NULL;
