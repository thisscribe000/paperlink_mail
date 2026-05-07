# PaperLink — Agent Conventions

## Project Overview

**paperlink_mail** is a monorepo containing the PaperLink ecosystem backend. Currently focused on PaperLink Storage MVP (Phase 1).

- Backend: TypeScript + Hono on Cloudflare Workers
- Bot: Python (python-telegram-bot) polling
- Storage: Cloudflare R2 + D1 (SQLite)

## Directory Structure

```
paperlink_mail/
├── src/                    # TypeScript backend (Cloudflare Workers)
│   ├── index.ts            # Worker entry point
│   ├── routes/             # API route handlers
│   ├── lib/                # Utility helpers (auth, R2, slug)
│   └── types.ts            # Shared TypeScript types + Env interface
├── bot/                    # Python Telegram bot
│   ├── bot.py              # Entry point (polling)
│   ├── handlers.py         # Command/callback/message handlers
│   ├── api_client.py       # Async HTTP client to Worker API
│   ├── utils.py            # Menu builders, formatters
│   └── requirements.txt
├── schema.sql              # D1 migration file (run with wrangler)
├── wrangler.toml          # Cloudflare Workers config (D1 + R2 bindings)
├── PAPERLINK_PLAN.md       # Full ecosystem architecture plan
├── package.json
└── tsconfig.json
```

## Key Patterns

### Types & Env (src/types.ts)
All Workers use the `Env` interface for type-safe bindings. Add new bindings to `Env` and `wrangler.toml`.

### Auth (src/lib/auth.ts)
Telegram init data verification — hash HMAC-SHA256 with bot secret. Used on all user-scoped endpoints. Telegram user ID → unique identity, no separate auth system.

### R2 Storage (src/lib/r2.ts)
Files stored at `files/{slug}`. Helpers for put/get/delete. All file data goes through R2 — no DB storage of large data.

### Slug Generation (src/lib/slug.ts)
8-char base62 random slugs. Collision-check against existing slugs from DB.

### Bot ↔ API Communication
Bot authenticates to Worker API using Telegram init data in `X-Telegram-Init-Data` header. Same verification as browser-based requests.

### API Conventions
- JSON responses with `{ error: string }` on failure
- Status codes: 200 (ok), 201 (created), 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)
- Public endpoints: `GET /f/:slug` (file download)
- Auth endpoints: `POST /files/upload`, `GET /files`, `DELETE /files/:slug`

## Running Locally

```bash
# Backend
npm install
npm run dev          # wrangler dev (hot reload, local D1)
npm run deploy      # deploy to Cloudflare

# Bot
cd bot
pip install -r requirements.txt
python bot.py        # polling mode

# D1 migrations
wrangler d1 migrations apply paperlink-storage --local
```

## Environment Variables

See `.env.example`:
- `BOT_TOKEN` — Telegram bot token
- `BOT_SECRET` — Used for Telegram init data HMAC verification
- `APP_URL` — Public URL of the Worker (e.g. https://paperlink.app)
- `API_BASE_URL` — Worker URL for bot (local: http://localhost:8787)

## Important Rules

1. **One module at a time** — Phase 1 is Storage only. Do not mix in Mail code.
2. **No separate auth system** — Telegram is the identity layer. All auth via init data.
3. **No file duplication** — Files go R2, metadata in D1. No blob storage in D1.
4. **TypeScript strict mode** — `strict: true`, `noImplicitAny: true`. No `any` without reason.
5. **No heavy dependencies** — Hono is it for the backend. Keep Workers lean.
6. **Bot is separate process** — Bot runs Python polling, backend is TS Worker. They talk via HTTP.
7. **No dashboard** — Telegram bot IS the UI. No web admin panels in MVP.

## Current Phase

**Phase 1: PaperLink Storage MVP**
- Status: Scaffolded, core files written
- Next: Install deps, typecheck, configure real D1/R2 via wrangler, test locally

See `PAPERLINK_PLAN.md` for full architecture and roadmap.