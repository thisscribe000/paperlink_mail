# PaperLink Storage - Resume Guide

## Current Status

- ✅ Deployed to Cloudflare — live at `https://usepaperlink.site`
- ✅ D1 database created + migrations applied
- ✅ R2 bucket `paperlink-files` configured
- ✅ BOT_SECRET set on worker
- Bot not started yet

## Start the Bot

```bash
cd bot && source venv/bin/activate && python bot.py
```

## Backend Dev (local)

```bash
npm run dev
```

## Deploy Updates

```bash
npm run deploy
```

## Set New Secrets

```bash
npx wrangler secret put BOT_SECRET
```
