// API 라우터 — /api/* 요청을 각 기능으로 나눠 보낸다
import { Ctx } from './ctx.js';
import { HttpError, getCookie } from './util.js';
import { edgeServe, contentVersion, availVersion, setEdge, normQuery } from './edge.js';
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
import * as imwebPhotos from './imweb-photos.js';
import * as seasons from './seasons.js';
import * as seasonPlan from './season-plan.js';
import * as live from './live.js';
import * as hostcenter from './hostcenter.js';
import * as bills from './bills.js';
import * as hostdesk from './hostdesk.js';

const ROUTES = [];
function route(method, path, fn) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)(\+)?/g, (_, k, plus) => { keys.push(k); return plus ? '(.+)' : '([^/]+)'; }) + '/?$');
  ROUTES.push({ method, re, keys, fn, path });
}

spaces.register(route);
spaces.registerAdmin(route);
spaces.registerHost(route);
spaces.registerApps(route);
avail.register(route, { maybeSync: hostsync.maybeSync });
avail.registerHostOcc(route);
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
imwebPhotos.register(route);
seasons.register(route);
seasonPlan.register(route);
live.register(route);
live.registerAdmin(route);
hostcenter.register(route);
bills.register(route);
hostdesk.register(route);

// sendBeacon(클릭 기록)과 토큰 인증(수신 API)은 사용자 지정 헤더를 붙일 수 없어 예외
const NO_CSRF = new Set(['/api/click', '/api/sync/push', '/api/sync/run']);

// 누구에게나 같은 공개 데이터 — Cloudflare 가장자리에 잠깐 두고 나눠 써요 (로그인·회원별 데이터는 넣지 않아요)
//  [주소, 보관 초, 버전(true: 지점·설정을 고치면 바로 새로, 'avail': 예약 마감 칸이 바뀌면 바로 새로)]
const EDGE_API = [
  [/^\/api\/site$/, 60, true],
  [/^\/api\/spaces$/, 60, true],
  [/^\/api\/spaces\/S-\d{4}$/, 60, true],
  [/^\/api\/home$/, 60, true],
  [/^\/api\/partners$/, 300, true],
  [/^\/api\/avail$/, 30, 'avail'],
];

export async function handle(context) {
  setEdge(context.request.url, context.env);
  const method0 = context.request.method;
  const path0 = new URL(context.request.url).pathname.replace(/\/+$/, '') || '/';
  // 로그인하지 않은 손님의 「내 정보」 — DB를 거치지 않고 바로 (모든 화면이 부르는 요청이에요)
  if (method0 === 'GET' && path0 === '/api/me' && !getCookie(context.request, 'sp_s')) {
    return new Response(JSON.stringify({ ok: true, user: null }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (method0 === 'GET') {
    const hit = EDGE_API.find(([re]) => re.test(path0));
    if (hit) {
      const [, ttl, versioned] = hit;
      const v = versioned === 'avail' ? await availVersion() : versioned ? await contentVersion() : '';
      return edgeServe(context, `api${path0}?${normQuery(context.request.url)}#${v}`, () => run(context), { ttl, browser: 'no-store' });
    }
  }
  return run(context);
}

async function run(context) {
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
    // 호스트 노출 기간 알림 — 하루 한 번 (날짜가 바뀐 뒤 처음 걸린 요청 하나만 실제로 돈다)
    if (Math.random() < 0.05) c.wait(bills.hostDaily(c.db).catch((e) => console.error('호스트 알림 작업 실패', e && e.message)));
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
