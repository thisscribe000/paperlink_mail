import { Hono } from 'hono';
import health from './routes/health';
import files from './routes/files';
import { fileKey } from './lib/r2';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  c.header('X-PaperLink-Version', '1.0.0');
  await next();
});

app.route('/', health);
app.route('/files', files);

app.get('/f/:slug', async c => {
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
    return c.json({ error: 'Private file' }, 403);
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

app.notFound(c => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

export default app;