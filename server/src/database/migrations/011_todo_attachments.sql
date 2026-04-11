CREATE TABLE IF NOT EXISTS todo_attachments (
  id           TEXT    PRIMARY KEY,
  todo_id      TEXT    NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  filename     TEXT    NOT NULL,
  original_name TEXT   NOT NULL,
  mimetype     TEXT    NOT NULL,
  size         INTEGER NOT NULL,
  uploaded_by  TEXT    NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('allowed_upload_extensions', 'jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,txt,zip,mp4,mov', unixepoch());
