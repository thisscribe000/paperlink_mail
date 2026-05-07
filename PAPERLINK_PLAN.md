# PaperLink Ecosystem Plan

## What Are We Building

PaperLink is a **Telegram-first communication ecosystem** — not another app with a dashboard. Telegram IS the frontend. Users interact with products through bots, chats, and inline menus. No heavy mobile apps, no enterprise dashboards.

Two connected products:
- **PaperLink Storage** — File upload/hosting infrastructure (MVP, building first)
- **PaperLink Mail** — Telegram-native email management (Phase 2)

Core principle: build modular systems that scale independently, share auth, and monetise independently.

---

## Architecture Overview

### Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend Runtime | Cloudflare Workers (TypeScript + Hono) | Edge deployment, generous free tier (100k req/day), zero-ops scaling |
| Framework | Hono v4 | Lightweight, TypeScript-native, same code runs on CF Workers or Bun |
| Database | Cloudflare D1 (SQLite) | Serverless, free up to 500k reads/day, no connection pooling needed |
| File Storage | Cloudflare R2 | S3-compatible, $0 free tier (10GB storage, 100k reads, 10k writes) |
| Telegram Bot | Python (python-telegram-bot, polling) | Fast to prototype, familiar from existing paperlink_os/system projects |
| Authentication | Telegram Init Data | No separate auth system — Telegram IS the identity layer |

### Infrastructure Cost (MVP)

| Service | Free Tier | Cost at 1,000 Users |
|---|---|---|
| Cloudflare Workers | 100k req/day | ~$5/mo beyond free |
| Cloudflare D1 | 500k reads, 100k writes/day | ~$5/mo beyond free |
| Cloudflare R2 | 10GB storage, 100k reads, 10k writes | ~$1/mo beyond free |
| Telegram Bot | Free (polling) | Free |

**Total MVP cost: ~$0–10/month.** Scales linearly and cheaply.

---

## Phase 1: PaperLink Storage MVP

### What it does
- Users send files to the Telegram bot → bot uploads to R2 → returns a shareable link
- Links are public by default, slug-based (e.g. `paperlink.app/f/Ab3xZq`)
- Users can list, delete their files via bot

### Bot Commands
```
/start       — Welcome + main menu
/help        — Usage guide
/files       — List recent uploads
/delete <slug> — Delete a file
(Also: send any document/photo → auto-upload)
```

### API Endpoints (Cloudflare Workers)
```
POST   /files/upload     — Upload file (auth: Telegram init data)
GET    /f/:slug          — Download/view file (public or auth-gated)
DELETE /files/:slug       — Delete (owner only)
GET    /files            — List user's files (auth required)
GET    /health           — Health check
```

### Database Schema (D1)

```sql
-- Users (Telegram identity)
CREATE TABLE users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  storage_used INTEGER DEFAULT 0,
  created_at INTEGER
);

-- Files metadata
CREATE TABLE files (
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
```

### User Flow
1. User opens Telegram bot → taps "Upload File"
2. Sends document/photo/video
3. Bot downloads → POSTs to Worker API → R2 stores file → D1 records metadata
4. Bot returns link: `paperlink.app/f/Ab3xZq`
5. User taps Copy/Delete/Open from inline keyboard

### Project Structure
```
paperlink_mail/           # Monorepo for now (Storage + Mail share infra later)
├── src/
│   ├── index.ts          # Worker entry point
│   ├── routes/
│   │   ├── files.ts      # Upload/serve/delete/list endpoints
│   │   └── health.ts     # Health check
│   ├── lib/
│   │   ├── auth.ts       # Telegram init data verification
│   │   ├── slug.ts       # Short slug generation (8-char base62)
│   │   └── r2.ts         # R2 helpers
│   ├── middleware/
│   │   └── auth.ts       # Auth middleware for Hono
│   └── types.ts          # Shared TypeScript types
├── bot/
│   ├── bot.py            # Telegram bot entry point (polling)
│   ├── handlers.py       # Command/callback/message handlers
│   ├── api_client.py     # Async HTTP client for Worker API
│   └── utils.py          # Menu builders, formatters
├── schema.sql            # D1 migration file
├── wrangler.toml         # Cloudflare config (D1 + R2 bindings)
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Phase 2: PaperLink Mail MVP

### What it does
- Users connect Gmail/Outlook via OAuth
- Emails sync to D1 (metadata) + R2 (attachments)
- Inbox rendered as threaded Telegram messages
- Reply via Telegram → sent via Gmail SMTP
- Delivery/open tracking via R2-hosted 1x1 pixel
- Disposable email addresses forwarded to Telegram

### Bot Commands (Mail)
```
/inbox        — Show recent emails as threaded messages
/connect gmail — OAuth flow
/send to@domain.com — Compose and send
/track        — Toggle delivery notifications
/disposable   — Create temp email address
```

### Mail Architecture
- **Gmail OAuth** → access_token stored in D1, refresh_token for background sync
- **Sync job** (CF Cron or external worker) → fetches new emails every 5 min → renders in Telegram
- **Attachments** → uploaded to R2 via Storage API → linked, not embedded
- **Tracking pixel** → tiny 1x1 image on R2, loaded when email opened → logged to D1 → bot notifies user
- **Voice replies** → Telegram voice note → transcribed (future) or sent as audio attachment

### Mail Database Tables (Phase 2)
```sql
-- Connected email accounts
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  provider TEXT,           -- 'gmail', 'outlook', 'imap'
  access_token TEXT,
  refresh_token TEXT,
  email_address TEXT,
  last_sync_at INTEGER
);

-- Emails (threaded)
CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  thread_id TEXT,          -- groups replies
  subject TEXT,
  snippet TEXT,
  sender TEXT,
  timestamp INTEGER,
  is_read INTEGER DEFAULT 0,
  labels TEXT              -- JSON array
);

-- Delivery tracking
CREATE TABLE tracking (
  id TEXT PRIMARY KEY,
  email_id TEXT,
  status TEXT,             -- 'sent', 'delivered', 'opened'
  updated_at INTEGER
);
```

---

## Development Phases

### Phase 1: Storage MVP (2–4 weeks)
- **Week 1**: Project scaffold, D1 + R2 setup, upload/download API
- **Week 2**: Bot file handlers, link generation, public access
- **Week 3**: Delete, list, expiry, basic UI polish
- **Week 4**: Bug fixes, test with real users, deploy

### Phase 2: Mail MVP (4–8 weeks)
- **Sprint 1**: Gmail OAuth flow, token storage
- **Sprint 2**: Inbox sync job, Telegram rendering
- **Sprint 3**: Reply/send via bot, delivery tracking
- **Sprint 4**: Disposable email, voice support, polish

### Phase 3+: TBD
- Storage: private links, expiry controls, analytics, pro tier
- Mail: Outlook/IMAP, template system, rich compose
- Cross-product: Storage attachments in Mail threads

---

## Free-Tier Sustainability

| Tactic | How |
|---|---|
| Telegram as frontend | Zero UI development cost — bot IS the app |
| Cloudflare free tiers | Workers + D1 + R2 cover small-to-medium usage |
| R2 for all storage | No per-GB cost until user growth |
| Pro tier (future) | Larger files, custom domains, no expiry, analytics |

Pro upsell hooks: custom expiry, larger files, private links, analytics, branded domains.

---

## Risk Analysis

| Risk | Mitigation |
|---|---|
| Gmail API rate limits | Cache aggressively, sync every 5–10 min not real-time |
| Telegram message limits | Long emails truncated with "View full" → link to web view |
| Bot polling reliability | Use webhook mode in production (not polling) |
| Storage scaling | R2 is effectively unlimited — pricing is linear and cheap |
| Attachment handling | Stream from R2 → Telegram directly (no RAM issues) |
| Cold starts on Workers | Hono starts fast on CF Workers, D1 queries are quick |

---

## What NOT to Build Early

- Gmail clone or heavy email UI
- Standalone mobile apps (Telegram IS the mobile app)
- Enterprise dashboards
- AI/ML systems
- Multiple connected accounts UI (one Gmail per user for MVP)
- Full-text search (basic SQL LIKE for MVP)
- Web dashboard (bot menu is enough for v1)

---

## Recommended Reading

- Hono framework: `file:///Users/christembassyabujazone1/.config/opencode/skills/hono/SKILL.md`
- Cloudflare Workers + D1 patterns already familiar from your existing projects

---

*Last updated: 2026-05-07*