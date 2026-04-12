ALTER TABLE todos ADD COLUMN created_via_token_id TEXT REFERENCES api_tokens(id) ON DELETE SET NULL;
