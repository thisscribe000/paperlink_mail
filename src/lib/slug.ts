const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const BASE = ALPHABET.length;

export function generateSlug(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let value = 0;

  for (let i = 0; i < length; i++) {
    value = (value << 8) | bytes[i];
  }

  let slug = '';
  let remaining = value;
  for (let i = 0; i < length; i++) {
    slug = ALPHABET[remaining % BASE] + slug;
    remaining = Math.floor(remaining / BASE);
  }

  if (slug.length < length) {
    const padding = Array.from(bytes).slice(0, length - slug.length).map((b: number) => ALPHABET[b % BASE]).join('');
    return padding + slug;
  }

  return slug;
}