import { Hono } from 'hono';
import { verifyTelegramInitData } from '../lib/auth';
import type { Env } from '../types';

const health = new Hono<{ Bindings: Env }>();

health.get('/', c => {
  return c.json({
    status: 'ok',
    service: 'paperlink-storage',
    timestamp: Math.floor(Date.now() / 1000),
  });
});

health.get('/auth-test', async c => {
  const initData = c.req.header('X-Telegram-Init-Data');
  if (!initData) {
    return c.json({ error: 'No auth header' }, 401);
  }
  const user = await verifyTelegramInitData(initData, c.env.BOT_SECRET);
  if (!user) {
    return c.json({ error: 'Invalid auth' }, 401);
  }
  return c.json({ ok: true, user });
});

export default health;