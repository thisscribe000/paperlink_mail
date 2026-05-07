export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  APP_URL: string;
  BOT_SECRET: string;
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