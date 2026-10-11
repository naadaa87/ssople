// 요청 하나의 문맥 — 로그인 사용자, 관리자 권한, 요청 횟수 제한, 응답
import {
  HttpError, J, getCookie, setCookie, sha256hex, nowSec, nowIso, randToken, ageOn, todayKST, b64url, safeEqual,
} from './util.js';

const USER_COOKIE = 'sp_s';
const ADMIN_COOKIE = 'sp_a';
const USER_TTL = 30 * 24 * 3600;
const ADMIN_TTL = 12 * 3600;
const ITER = 100000;

const enc = (s) => new TextEncoder().encode(s);
function unb64(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return b64url(bits);
}
export async function hashPw(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64url(salt)}$${await pbkdf2(pw, salt, ITER)}`;
}
export async function verifyPw(pw, stored) {
  const [alg, it, salt, hash] = String(stored || '').split('$');
  if (alg !== 'pbkdf2' || !salt || !hash) return false;
  const got = await pbkdf2(pw, unb64(salt), Number(it) || ITER);
  return safeEqual(got, hash);
}

export function publicUser(u) {
  if (!u) return null;
  const age = ageOn(u.birth, todayKST());
  return {
    id: u.id, email: u.email, nick: u.nick, region: u.region || '', intro: u.intro || '', avatar: u.avatar || '',
    role: u.role, adult: age != null && age >= 19, birth: u.birth, marketing: !!u.marketing, created_at: u.created_at,
  };
}

export class Ctx {
  constructor(context) {
    this.context = context;
    this.req = context.request;
    this.env = context.env || {};
    this.url = new URL(this.req.url);
    this.q = this.url.searchParams;
    this.params = {};
    this.outHeaders = [];
    this.ip = this.req.headers.get('CF-Connecting-IP') || this.req.headers.get('x-real-ip') || '0.0.0.0';
    this._user = undefined;
    this._admin = undefined;
  }
  get db() { return this.env.DB; }
  wait(p) {
    try { if (this.context.waitUntil) this.context.waitUntil(p); else p.catch(() => {}); } catch { /* 무시 */ }
  }
  async ih() {
    if (!this._ih) this._ih = (await sha256hex('ip|' + this.ip + '|' + (this.env.IP_SALT || 'ssople-web'))).slice(0, 16);
    return this._ih;
  }
  async body() {
    if (this._body === undefined) {
      const t = await this.req.text();
      try { this._body = t ? JSON.parse(t) : {}; } catch { throw new HttpError(400, '요청 형식이 올바르지 않아요.'); }
      if (!this._body || typeof this._body !== 'object' || Array.isArray(this._body)) this._body = {};
    }
    return this._body;
  }

  /* ---------- 회원 ---------- */
  async rawUser() {
    if (this._user !== undefined) return this._user;
    this._user = null;
    const tok = getCookie(this.req, USER_COOKIE);
    if (!tok || tok.length > 100) return null;
    const th = await sha256hex(tok);
    const u = await this.db.prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.uid WHERE s.th = ? AND s.exp > ? AND s.admin = 0`,
    ).bind(th, nowSec()).first();
    if (!u || u.status !== 'active') return null;
    this._user = u;
    this._th = th;
    if (!u.last_at || Date.now() - Date.parse(u.last_at) > 3600e3) {
      this.wait(this.db.prepare('UPDATE users SET last_at = ? WHERE id = ?').bind(nowIso(), u.id).run());
    }
    return u;
  }
  async user() { const u = await this.rawUser(); return u ? publicUser(u) : null; }
  async needUser() {
    const u = await this.user();
    if (!u) throw new HttpError(401, '로그인이 필요해요.', { needLogin: true });
    return u;
  }
  async needAdult() {
    const u = await this.needUser();
    if (!u.adult) throw new HttpError(403, '만 19세 이상 회원만 이용할 수 있어요.');
    return u;
  }
  async startSession(uid) {
    const tok = randToken(32);
    const th = await sha256hex(tok);
    await this.db.prepare('INSERT INTO sessions (th, uid, admin, exp, created_at) VALUES (?, ?, 0, ?, ?)')
      .bind(th, uid, nowSec() + USER_TTL, nowIso()).run();
    this.outHeaders.push(['set-cookie', setCookie(USER_COOKIE, tok, { maxAge: USER_TTL })]);
    if (Math.random() < 0.05) this.wait(this.db.prepare('DELETE FROM sessions WHERE exp < ?').bind(nowSec()).run());
  }
  async endSession() {
    const tok = getCookie(this.req, USER_COOKIE);
    if (tok) await this.db.prepare('DELETE FROM sessions WHERE th = ?').bind(await sha256hex(tok)).run();
    this.outHeaders.push(['set-cookie', setCookie(USER_COOKIE, '', { maxAge: 0 })]);
  }

  /* ---------- 관리자 ---------- */
  async adminLevel() {
    if (this._admin !== undefined) return this._admin;
    this._admin = null;
    const tok = getCookie(this.req, ADMIN_COOKIE);
    if (tok && tok.length < 100) {
      const r = await this.db.prepare('SELECT exp FROM sessions WHERE th = ? AND admin = 1 AND exp > ?')
        .bind(await sha256hex(tok), nowSec()).first();
      if (r) { this._admin = 'admin'; return this._admin; }
    }
    const u = await this.rawUser();
    if (u && (u.role === 'admin' || u.role === 'staff')) this._admin = u.role;
    return this._admin;
  }
  async needAdmin(level = 'staff') {
    const lv = await this.adminLevel();
    if (!lv) throw new HttpError(401, '관리자 로그인이 필요해요.', { needAdmin: true });
    if (level === 'admin' && lv !== 'admin') throw new HttpError(403, '대표 관리자만 할 수 있어요.');
    return lv;
  }
  async startAdminSession() {
    const tok = randToken(32);
    await this.db.prepare('INSERT INTO sessions (th, uid, admin, exp, created_at) VALUES (?, NULL, 1, ?, ?)')
      .bind(await sha256hex(tok), nowSec() + ADMIN_TTL, nowIso()).run();
    this.outHeaders.push(['set-cookie', setCookie(ADMIN_COOKIE, tok, { maxAge: ADMIN_TTL })]);
  }
  async endAdminSession() {
    const tok = getCookie(this.req, ADMIN_COOKIE);
    if (tok) await this.db.prepare('DELETE FROM sessions WHERE th = ?').bind(await sha256hex(tok)).run();
    this.outHeaders.push(['set-cookie', setCookie(ADMIN_COOKIE, '', { maxAge: 0 })]);
  }

  /* ---------- 도배 방지 ---------- */
  async limit(key, max, sec, msg = '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.') {
    const now = nowSec();
    const r = await this.db.prepare(
      `INSERT INTO rl (k, n, reset) VALUES (?, 1, ?)
       ON CONFLICT(k) DO UPDATE SET n = CASE WHEN reset <= ? THEN 1 ELSE n + 1 END,
                                    reset = CASE WHEN reset <= ? THEN ? ELSE reset END
       RETURNING n`,
    ).bind(key, now + sec, now, now, now + sec).first();
    if (Math.random() < 0.02) this.wait(this.db.prepare('DELETE FROM rl WHERE reset < ?').bind(now - 86400).run());
    if (r && r.n > max) throw new HttpError(429, msg);
  }

  json(data, status = 200) {
    const res = J(data, status);
    for (const [k, v] of this.outHeaders) res.headers.append(k, v);
    return res;
  }
}
