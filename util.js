// 공통 도구 — 응답, 날짜(한국 시간), 난수, 해시, 입력값 검사
export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const fail = (status, message, extra) => new HttpError(status, message, extra);
export const bad = (message) => new HttpError(400, message);

export function J(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/* ---------- 한국 시간 ---------- */
const KST = 9 * 3600 * 1000;
export const kstNow = () => new Date(Date.now() + KST);            // getUTC* 로 읽는다
export const todayKST = () => kstNow().toISOString().slice(0, 10);
export const nowIso = () => new Date().toISOString();
export const nowSec = () => Math.floor(Date.now() / 1000);
export function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayDiff(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
export function kstMinuteOfDay() { const n = kstNow(); return n.getUTCHours() * 60 + n.getUTCMinutes(); }
export const weekdayOf = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay(); // 0=일
export function ageOn(birth, today = todayKST()) {
  if (!isYmd(birth)) return null;
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let a = ty - by;
  if (tm < bm || (tm === bm && td < bd)) a--;
  return a;
}

/* ---------- 난수 · 해시 ---------- */
export function b64url(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function randToken(bytes = 24) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return b64url(a); }
const AL = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function slug(n = 8) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  let s = ''; for (let i = 0; i < n; i++) s += AL[a[i] % AL.length];
  return s;
}
export async function sha256hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let r = a.length === b.length ? 0 : 1;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

/* ---------- 입력값 ---------- */
export function str(v, { max = 200, min = 0, name = '내용', required = false, multiline = false } = {}) {
  let s = v == null ? '' : String(v);
  s = s.replace(/\u0000/g, '');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (required && !s) throw bad(`${name}을(를) 입력해 주세요.`);
  if (s && s.length < min) throw bad(`${name}은(는) ${min}자 이상 입력해 주세요.`);
  if (s.length > max) throw bad(`${name}은(는) ${max}자까지 쓸 수 있어요.`);
  return s;
}
export function int(v, { min = -Infinity, max = Infinity, def = null, name = '숫자' } = {}) {
  if (v === '' || v == null) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.floor(n) !== n) throw bad(`${name} 값이 올바르지 않아요.`);
  if (n < min || n > max) throw bad(`${name}은(는) ${min}~${max} 사이로 입력해 주세요.`);
  return n;
}
export function oneOf(v, list, def) { return list.includes(v) ? v : def; }
export function isUrl(s) {
  try { const u = new URL(String(s)); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}
export function url(v, { name = '링크', required = false } = {}) {
  const s = str(v, { max: 500, name });
  if (!s) { if (required) throw bad(`${name}을(를) 입력해 주세요.`); return ''; }
  if (!isUrl(s)) throw bad(`${name}은(는) http:// 또는 https:// 로 시작하는 주소여야 해요.`);
  return s;
}
export const PHONE_RE = /01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/g;
export function maskPhones(s) { return String(s || '').replace(PHONE_RE, (m) => m.slice(0, 3) + '-****-****'); }
export function parseJSON(s, def) { try { return s ? JSON.parse(s) : def; } catch { return def; } }
export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

/* ---------- 쿠키 ---------- */
export function getCookie(req, name) {
  const h = req.headers.get('cookie') || '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
export function setCookie(name, value, { maxAge = 0, httpOnly = true } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure${httpOnly ? '; HttpOnly' : ''}`;
}

/* ---------- SQL 리터럴 (검증된 값만) ---------- */
export function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') { if (!Number.isFinite(v)) return 'NULL'; return String(Math.trunc(v)); }
  return "'" + String(v).replace(/'/g, "''") + "'";
}
export const qid = (id) => '"' + String(id).replace(/"/g, '""') + '"';

/** D1 LIKE 패턴 50바이트 제한에 맞게 검색어를 줄인다 */
export function likeSafe(q, maxBytes = 44) {
  let s = String(q || '').replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const te = new TextEncoder();
  while (s && te.encode(s).length > maxBytes) s = s.slice(0, -1);
  return s;
}

export function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

/** 탈퇴한 회원은 닉네임 대신 '탈퇴한 회원'으로 보여 준다 */
export const dispNick = (n) => (!n || /^탈퇴\d+$/.test(n) ? '탈퇴한 회원' : n);
