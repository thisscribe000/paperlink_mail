export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  APP_URL: string;
  BOT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

export interface User {
  telegram_id: string;
  username: string | null;
  storage_used: number;
  created_at: number;
}

export interface FileRecord {
  slug: string;
  user_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  is_public: number;
  expires_at: number | null;
  created_at: number;
}

export interface UploadResult {
  slug: string;
  url: string;
  size: number;
  mime_type: string;
  expires_at: number | null;
}

export interface AuthUser {
  telegram_id: string;
  username: string;
  first_name: string;
}

export interface Account {
  id: string;
  user_id: string;
  provider: string;
  email_address: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: number | null;
  last_sync_at: number | null;
  created_at: number;
}

export interface EmailRecord {
  id: string;
  account_id: string;
  thread_id: string | null;
  subject: string | null;
  snippet: string | null;
  sender_name: string | null;
  sender_email: string | null;
  recipient: string | null;
  body_text: string | null;
  body_html: string | null;
  timestamp: number | null;
  is_read: number;
  labels: string | null;
  created_at: number;
}