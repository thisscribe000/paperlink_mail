import { Hono } from 'hono';
import { verifyTelegramInitData } from '../lib/auth';
import type { Env, Account } from '../types';

const mail = new Hono<{ Bindings: Env }>();

const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.modify';

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function googleOAuthUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.APP_URL}/mail/callback`,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

mail.get('/connect/:telegramId', async c => {
  const telegramId = c.req.param('telegramId');

  const state = `${telegramId}:${Math.floor(Date.now() / 1000)}`;
  const url = googleOAuthUrl(c.env, state);

  return c.redirect(url, 302);
});

mail.get('/callback', async c => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.html('<html><body><h2>Missing authorization code</h2></body></html>', 400);
  }

  const parts = state.split(':');
  const telegramId = parts[0];

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${c.env.APP_URL}/mail/callback`,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokens = await tokenResp.json() as Record<string, unknown>;
    if (!tokens.access_token) {
      return c.html(`<html><body><h2>Auth failed: ${JSON.stringify(tokens)}</h2></body></html>`, 400);
    }

    const expiresAt = tokens.expires_in
      ? Math.floor(Date.now() / 1000) + (tokens.expires_in as number)
      : null;

    const accountId = generateId();
    const now = Math.floor(Date.now() / 1000);

    let emailAddress = '';
    const profileResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileResp.ok) {
      const profile = await profileResp.json() as Record<string, unknown>;
      emailAddress = (profile.emailAddress as string) || '';
    }

    await c.env.DB.prepare(`
      INSERT INTO accounts (id, user_id, provider, email_address, access_token, refresh_token, token_expires_at, last_sync_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_expires_at = excluded.token_expires_at,
        email_address = excluded.email_address
    `).bind(
      accountId, telegramId, 'gmail', emailAddress,
      tokens.access_token, tokens.refresh_token || null,
      expiresAt, now, now
    ).run();

    return c.html(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>✅ Gmail Connected!</h2>
        <p>${emailAddress}</p>
        <p>Go back to Telegram and use <b>/inbox</b> to see your emails.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return c.html(`<html><body><h2>Auth failed</h2></body></html>`, 500);
  }
});

async function getAccessToken(env: Env, account: Account): Promise<string | null> {
  if (account.access_token && account.token_expires_at &&
      account.token_expires_at > Math.floor(Date.now() / 1000)) {
    return account.access_token;
  }

  if (!account.refresh_token) return null;

  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: account.refresh_token,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const tokens = await resp.json() as Record<string, unknown>;
    if (!tokens.access_token) return null;

    const expiresAt = tokens.expires_in
      ? Math.floor(Date.now() / 1000) + (tokens.expires_in as number)
      : null;

    await env.DB.prepare(`
      UPDATE accounts SET access_token = ?, token_expires_at = ? WHERE id = ?
    `).bind(tokens.access_token, expiresAt, account.id).run();

    return tokens.access_token as string;
  } catch {
    return null;
  }
}

mail.get('/inbox', async c => {
  const initData = c.req.header('X-Telegram-Init-Data');
  if (!initData) return c.json({ error: 'Unauthorized' }, 401);

  const user = await verifyTelegramInitData(initData, c.env.BOT_SECRET);
  if (!user) return c.json({ error: 'Invalid auth' }, 401);

  const account = await c.env.DB.prepare(
    'SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(user.telegram_id).first() as Account | null;

  if (!account) {
    return c.json({ error: 'No account connected. Use /connect first.' }, 404);
  }

  const accessToken = await getAccessToken(c.env, account);
  if (!accessToken) {
    return c.json({ error: 'Token refresh failed. Reconnect with /connect.' }, 401);
  }

  const maxResults = Math.min(parseInt(c.req.query('limit') || '10', 10), 50);
  const gmailResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in:inbox`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!gmailResp.ok) {
    return c.json({ error: 'Failed to fetch emails from Gmail' }, 502);
  }

  const gmailData = await gmailResp.json() as Record<string, unknown>;
  const messages = (gmailData.messages as Array<Record<string, unknown>>) || [];

  const now = Math.floor(Date.now() / 1000);
  const emails = [];

  for (const msg of messages) {
    const msgId = msg.id as string;

    const existing = await c.env.DB.prepare('SELECT id FROM emails WHERE id = ?').bind(msgId).first();
    if (!existing) {
      const detailResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=To`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (detailResp.ok) {
        const detail = await detailResp.json() as Record<string, unknown>;
        const headers = (detail.payload as Record<string, unknown>)?.headers as Array<Record<string, string>> || [];
        const headerMap: Record<string, string> = {};
        for (const h of headers) {
          headerMap[h.name.toLowerCase()] = h.value;
        }

        const from = headerMap['from'] || '';
        const fromMatch = from.match(/^(?:([^<]+)\s*)?<([^>]+)>$/);
        const senderName = fromMatch ? fromMatch[1].trim() : from;
        const senderEmail = fromMatch ? fromMatch[2] : from;

        const internalDate = parseInt(detail.internalDate as string, 10);
        const timestamp = internalDate ? Math.floor(internalDate / 1000) : now;

        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO emails (id, account_id, thread_id, subject, snippet, sender_name, sender_email, recipient, timestamp, is_read, labels, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          msgId, account.id,
          (detail.threadId as string) || null,
          headerMap['subject'] || '(No subject)',
          (detail.snippet as string) || '',
          senderName || senderEmail, senderEmail,
          headerMap['to'] || '',
          timestamp, 1, '[]', now
        ).run();
      }
    }

    const email = await c.env.DB.prepare(
      'SELECT id, thread_id, subject, snippet, sender_name, sender_email, timestamp, is_read FROM emails WHERE id = ?'
    ).bind(msgId).first();

    if (email) {
      emails.push(email);
    }
  }

  await c.env.DB.prepare('UPDATE accounts SET last_sync_at = ? WHERE id = ?')
    .bind(now, account.id).run();

  return c.json({
    account: { email_address: account.email_address },
    emails,
  });
});

mail.delete('/disconnect', async c => {
  const initData = c.req.header('X-Telegram-Init-Data');
  if (!initData) return c.json({ error: 'Unauthorized' }, 401);

  const user = await verifyTelegramInitData(initData, c.env.BOT_SECRET);
  if (!user) return c.json({ error: 'Invalid auth' }, 401);

  await c.env.DB.prepare('DELETE FROM emails WHERE account_id IN (SELECT id FROM accounts WHERE user_id = ?)')
    .bind(user.telegram_id).run();
  await c.env.DB.prepare('DELETE FROM accounts WHERE user_id = ?')
    .bind(user.telegram_id).run();

  return c.json({ disconnected: true });
});

export default mail;
