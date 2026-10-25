// 서버 공통 도구

export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
export const SQUARE_CODE_RE = /^SQ[1-9]$/;
export const SQUARE_CODES = ['SQ1', 'SQ2', 'SQ3', 'SQ4', 'SQ5', 'SQ6', 'SQ7', 'SQ8', 'SQ9'];

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = '';
  for (const b of bytes) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

export function normCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function readJson(req, max = 20_000) {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, '요청이 너무 커요.');
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, '요청 형식이 올바르지 않아요.'); }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function ipKey(req) {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'local';
  return (await sha256('sl-ip:' + ip)).slice(0, 20);
}

export function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  if (x.length !== y.length) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

// 한국 시간 기준 날짜 (YYYY-MM-DD)
export function kstDay(ms = Date.now()) {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

export function cleanDev(dev) {
  const d = String(dev || '');
  return /^[a-zA-Z0-9_-]{8,64}$/.test(d) ? d : '';
}
