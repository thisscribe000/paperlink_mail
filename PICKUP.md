# PaperLink Storage - Resume Guide

## Where We Left Off

Storage MVP is working locally. Need to deploy to Cloudflare.

**Stuck at:** Creating D1 database — need a new API token with proper permissions.

## Step 1: Create API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **"Create Custom Token"**
3. Name: `paperlink-deploy`
4. Add permissions:
   - Account: Memberships → Read
   - D1: Database → Edit
   - Workers: Workers Script → Edit
5. Create and copy token

## Step 2: Continue Deploy

```bash
export CLOUDFLARE_API_TOKEN=your_new_token
wrangler d1 create paperlink-storage --location=weur --update-config
wrangler d1 migrations apply paperlink-storage --remote
npm run deploy
```

## Step 3: Push to GitHub

```bash
git add .
git commit -m "feat: deploy Storage MVP to Cloudflare"
git push origin main
```

## Bot Running?

If bot is still running in terminal, great. If not:
```bash
cd bot && ./venv/bin/python bot.py
```

Backend (keep running):
```bash
npm run dev
```