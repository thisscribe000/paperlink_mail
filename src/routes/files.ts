import { Hono } from 'hono';
import { verifyTelegramInitData } from '../lib/auth';
import { generateSlug } from '../lib/slug';
import { fileKey } from '../lib/r2';
import type { Env } from '../types';

const files = new Hono<{ Bindings: Env }>();

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/wav',
  'application/pdf',
  'application/zip',
  'text/plain', 'text/html', 'text/css', 'text/javascript',
  'application/javascript',
]);

files.post('/upload', async c => {
  const initData = c.req.header('X-Telegram-Init-Data');
  if (!initData) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const user = await verifyTelegramInitData(initData, c.env.BOT_SECRET);
  if (!user) {
    return c.json({ error: 'Invalid auth' }, 401);
  }

  let body;
  try {
    body = await c.req.parseBody({ all: true });
  } catch {
    return c.json({ error: 'Failed to parse body' }, 400);
  }

  const file = body['file'];
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB` }, 400);
  }

  const mimeType = file.type || 'application/octet-stream';
  if (!ALLOWED_TYPES.has(mimeType)) {
    return c.json({ error: 'File type not allowed' }, 400);
  }

  const data = await file.arrayBuffer();
  const slug = generateSlug(8);
  const key = fileKey(slug);

  const headers = new Headers();
  headers.set('content-type', mimeType);
  await c.env.STORAGE.put(key, data, { httpMetadata: headers });

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = null;

  await c.env.DB.prepare(`
    INSERT INTO files (slug, user_id, original_name, mime_type, size_bytes, is_public, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(slug, user.telegram_id, file.name, mimeType, data.byteLength, expiresAt, now).run();

  return c.json({
    slug,
    url: `${c.env.APP_URL}/f/${slug}`,
    original_name: file.name,
    size: data.byteLength,
    mime_type: mimeType,
    expires_at: expiresAt,
  }, 201);
});

files.get('/:slug', async c => {
  const slug = c.req.param('slug');
  if (!slug || slug.length < 3) {
    return c.json({ error: 'Invalid slug' }, 400);
  }

  const result = await c.env.DB.prepare('SELECT * FROM files WHERE slug = ?').bind(slug).first();
  if (!result) {
    return c.json({ error: 'Not found' }, 404);
  }

  const fileRecord = result as Record<string, unknown>;
  const expiresAt = fileRecord.expires_at as number | null;
  if (expiresAt && expiresAt < Math.floor(Date.now() / 1000)) {
    return c.json({ error: 'Expired' }, 410);
  }

  const key = fileKey(slug);
  const object = await c.env.STORAGE.get(key);
  if (!object) {
    return c.json({ error: 'File missing from storage' }, 500);
  }

  const isPublic = fileRecord.is_public as number;
  if (!isPublic) {
    const initData = c.req.header('X-Telegram-Init-Data');
    const user = initData ? await verifyTelegramInitData(initData, c.env.BOT_SECRET) : null;
    if (!user || user.telegram_id !== fileRecord.user_id) {
      return c.json({ error: 'Private file' }, 403);
    }
  }

  const etag = object.httpEtag;
  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return c.body(null, { status: 304 });
  }

  const meta = object.httpMetadata;
  const contentType = meta ? (meta as { contentType?: string }).contentType : undefined;
  const headers = new Headers();
  headers.set('Content-Type', contentType || 'application/octet-stream');
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', etag);
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Content-Disposition', `inline; filename="${fileRecord.original_name}"`);

  return c.body(object.body, { headers });
});

files.delete('/:slug', async c => {
  const initData = c.req.header('X-Telegram-Init-Data');
  if (!initData) return c.json({ error: 'Unauthorized' }, 401);

  const user = await verifyTelegramInitData(initData, c.env.BOT_SECRET);
  if (!user) return c.json({ error: 'Invalid auth' }, 401);

  const slug = c.req.param('slug');
  const result = await c.env.DB.prepare('SELECT * FROM files WHERE slug = ?').bind(slug).first();
  if (!result) return c.json({ error: 'Not found' }, 404);

  const fileRecord = result as Record<string, unknown>;
  if (fileRecord.user_id !== user.telegram_id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await c.env.STORAGE.delete(fileKey(slug));
  await c.env.DB.prepare('DELETE FROM files WHERE slug = ?').bind(slug).run();

  return c.json({ deleted: true, slug });
});

files.get('/', async c => {
  const initData = c.req.header('X-Telegram-Init-Data');
  if (!initData) return c.json({ error: 'Unauthorized' }, 401);

  const user = await verifyTelegramInitData(initData, c.env.BOT_SECRET);
  if (!user) return c.json({ error: 'Invalid auth' }, 401);

  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const { results } = await c.env.DB.prepare(
    'SELECT slug, original_name, mime_type, size_bytes, is_public, expires_at, created_at FROM files WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(user.telegram_id, limit, offset).all();

  const files = (results as Record<string, unknown>[]).map(f => ({
    slug: f.slug,
    url: `${c.env.APP_URL}/f/${f.slug}`,
    original_name: f.original_name,
    mime_type: f.mime_type,
    size: f.size_bytes,
    is_public: !!f.is_public,
    expires_at: f.expires_at,
    created_at: f.created_at,
  }));

  return c.json({ files, limit, offset });
});

export default files;