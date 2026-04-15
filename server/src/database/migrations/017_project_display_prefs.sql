-- Move display prefs (badge count, highlight) from per-user to per-project
ALTER TABLE projects ADD COLUMN show_task_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN count_mode TEXT NOT NULL DEFAULT 'new';
ALTER TABLE projects ADD COLUMN highlight_color TEXT;

-- Seed from existing owner prefs where available
UPDATE projects SET
  show_task_count = COALESCE(
    (SELECT upr.show_task_count FROM user_project_prefs upr
     WHERE upr.project_id = projects.id AND upr.user_id = projects.owner_id),
    1
  ),
  count_mode = COALESCE(
    (SELECT upr.count_mode FROM user_project_prefs upr
     WHERE upr.project_id = projects.id AND upr.user_id = projects.owner_id),
    'new'
  ),
  highlight_color = (
    SELECT upr.highlight_color FROM user_project_prefs upr
    WHERE upr.project_id = projects.id AND upr.user_id = projects.owner_id
  );
