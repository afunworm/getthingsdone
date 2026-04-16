-- Replace global notify_app / notify_email / notify_toast with per-event email_* columns.
-- on_* columns now mean "bell + toast"; email_* columns control per-event email delivery.

DROP TABLE IF EXISTS notification_settings_new;

CREATE TABLE notification_settings_new (
  id               TEXT    PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  project_id       TEXT             REFERENCES projects(id) ON DELETE CASCADE,
  on_task_created  INTEGER NOT NULL DEFAULT 1,
  on_task_deleted  INTEGER NOT NULL DEFAULT 1,
  on_task_updated  INTEGER NOT NULL DEFAULT 1,
  on_task_assigned INTEGER NOT NULL DEFAULT 1,
  on_task_comment  INTEGER NOT NULL DEFAULT 1,
  on_upcoming      INTEGER NOT NULL DEFAULT 1,
  upcoming_hours   INTEGER NOT NULL DEFAULT 24,
  on_past_due      INTEGER NOT NULL DEFAULT 1,
  email_task_created  INTEGER NOT NULL DEFAULT 0,
  email_task_deleted  INTEGER NOT NULL DEFAULT 0,
  email_task_updated  INTEGER NOT NULL DEFAULT 0,
  email_task_assigned INTEGER NOT NULL DEFAULT 0,
  email_task_comment  INTEGER NOT NULL DEFAULT 0,
  email_upcoming      INTEGER NOT NULL DEFAULT 0,
  email_past_due      INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, project_id)
);

INSERT INTO notification_settings_new
  (id, user_id, project_id,
   on_task_created, on_task_deleted, on_task_updated, on_task_assigned, on_task_comment,
   on_upcoming, upcoming_hours, on_past_due,
   email_task_created, email_task_deleted, email_task_updated, email_task_assigned,
   email_task_comment, email_upcoming, email_past_due,
   created_at, updated_at)
SELECT
  id, user_id, project_id,
  on_task_created, on_task_deleted, on_task_updated, on_task_assigned, on_task_comment,
  on_upcoming, upcoming_hours, on_past_due,
  -- seed email_* from the old global notify_email flag
  notify_email, notify_email, notify_email, notify_email, notify_email, notify_email, notify_email,
  created_at, updated_at
FROM notification_settings;

DROP TABLE notification_settings;
ALTER TABLE notification_settings_new RENAME TO notification_settings;
