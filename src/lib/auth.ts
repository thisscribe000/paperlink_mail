import type { AuthUser } from '../types';

export async function verifyTelegramInitData(initData: string, botSecret: string): Promise<AuthUser | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const dataKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const secretKey = await crypto.subtle.sign('HMAC', dataKey, new TextEncoder().encode(botSecret));
    const keyBytes = new Uint8Array(secretKey);

    const importedKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', importedKey, new TextEncoder().encode(dataCheckString));
    const hashBuffer = new Uint8Array(sig);
    const calculatedHash = Array.from(hashBuffer).map(b => b.toString(16).padStart(2, '0')).join('');

    if (calculatedHash !== hash) return null;

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null;

    const userStr = params.get('user');
    if (!userStr) return null;

    const user = JSON.parse(decodeURIComponent(userStr));
    return {
      telegram_id: String(user.id),
      username: user.username || '',
      first_name: user.first_name || '',
    };
  } catch {
    return null;
  }
}