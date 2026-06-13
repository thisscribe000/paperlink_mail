-- PaperLink Storage Schema - Initial migration

CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  storage_used INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS files (
  slug TEXT PRIMARY KEY,
  user_id TEXT,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  is_public INTEGER DEFAULT 1,
  expires_at INTEGER,
  created_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expires_at);