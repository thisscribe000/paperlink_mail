-- PaperLink Mail Schema
-- Run: wrangler d1 migrations apply paperlink-storage --remote

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gmail',
  email_address TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  last_sync_at INTEGER,
  created_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id)
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  thread_id TEXT,
  subject TEXT,
  snippet TEXT,
  sender_name TEXT,
  sender_email TEXT,
  recipient TEXT,
  body_text TEXT,
  body_html TEXT,
  timestamp INTEGER,
  is_read INTEGER DEFAULT 0,
  labels TEXT,
  created_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_timestamp ON emails(timestamp);
