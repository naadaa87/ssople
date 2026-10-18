// API 라우터 — /api/* 요청을 각 기능으로 나눠 보낸다
import { Ctx } from './ctx.js';
import { HttpError } from './util.js';
import { ensureSchema, housekeep } from './db.js';
import * as spaces from './spaces.js';
import * as avail from './avail.js';
import * as hostsync from './hostsync.js';
import * as community from './community.js';
import * as groups from './groups.js';
import * as events from './events.js';
import * as invites from './invites.js';
import * as account from './account.js';
import * as misc from './misc.js';
import * as admin from './admin.js';

const ROUTES = [];
function route(method, path, fn) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)(\+)?/g, (_, k, plus) => { keys.push(k); return plus ? '(.+)' : '([^/]+)'; }) + '/?$');
  ROUTES.push({ method, re, keys, fn, path });
}

spaces.register(route);
spaces.registerAdmin(route);
spaces.registerHost(route);
avail.register(route, { maybeSync: hostsync.maybeSync });
hostsync.register(route);
hostsync.registerAdmin(route);
community.register(route);
groups.registerMeetups(route);
groups.registerCrews(route);
events.register(route);
events.registerAdmin(route);
invites.register(route);
account.register(route);
account.registerAdminAuth(route);
misc.register(route);
admin.register(route);

// sendBeacon(클릭 기록)과 토큰 인증(수신 API)은 사용자 지정 헤더를 붙일 수 없어 예외
const NO_CSRF = new Set(['/api/click', '/api/sync/push', '/api/sync/run']);

export async function handle(context) {
  const c = new Ctx(context);
  const method = c.req.method === 'HEAD' ? 'GET' : c.req.method;
  const path = c.url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (method !== 'GET' && !NO_CSRF.has(path)) {
      if (c.req.headers.get('x-sp') !== '1') throw new HttpError(403, '잘못된 요청이에요.');
      const origin = c.req.headers.get('origin');
      if (origin && origin !== c.url.origin) throw new HttpError(403, '다른 사이트에서 온 요청은 받을 수 없어요.');
    }
    if (path === '/api/health') {
      try { await ensureSchema(c.env); } catch (e) {
        return c.json({ ok: false, app: 'ssople-web', version: misc.APP_VERSION, error: e.message, bound: { db: !!c.env.DB, host: !!c.env.HOSTDB, photos: !!c.env.PHOTOS } }, 503);
      }
    } else {
      await ensureSchema(c.env);
    }
    if (Math.random() < 0.02) c.wait(housekeep(c.db).catch((e) => console.error('정리 작업 실패', e && e.message)));
    for (const r of ROUTES) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      r.keys.forEach((k, i) => { try { c.params[k] = decodeURIComponent(m[i + 1]); } catch { c.params[k] = m[i + 1]; } });
      const out = await r.fn(c);
      if (out instanceof Response) {
        for (const [k, v] of c.outHeaders) out.headers.append(k, v);
        return out;
      }
      return c.json({ ok: true, ...(out || {}) });
    }
    throw new HttpError(404, '없는 주소예요.');
  } catch (e) {
    if (e instanceof HttpError) return c.json({ ok: false, error: e.message, ...(e.extra || {}) }, e.status);
    console.error('API 오류', method, path, (e && e.stack) || e);
    return c.json({ ok: false, error: '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }, 500);
  }
}

export const routeList = () => ROUTES.map((r) => `${r.method} ${r.path}`);
