ALTER TABLE todos ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('priority_labels', '{"1":"Low","2":"Medium","3":"Urgent"}');
