import { Hono } from 'hono';
import health from './routes/health';
import files from './routes/files';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  c.header('X-PaperLink-Version', '1.0.0');
  await next();
});

app.route('/', health);
app.route('/', files);

app.notFound(c => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

export default app;