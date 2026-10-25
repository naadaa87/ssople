// 쏘플 온라인 파티룸 실시간 서버 — 요청을 나눠 주는 입구
// 게임 화면은 쏘플 홈페이지(ssople.com/live)에 있고, 이 서버는 실시간 연결과 방 관리만 해요.
// /ws/방코드      실시간 연결 (방 서버로 전달)
// /api/...        방 만들기, 방 정보, 공개 파티 목록, 설정 — 홈페이지 주소에서 부를 수 있게 열어 둠(CORS)
// /api/admin/...  관리자 기능 (ADMIN_PASSWORD 필요) — 화면은 /admin.html
// 예전 주소(/r/방코드 등)는 홈페이지의 같은 화면으로 옮겨 줘요.
import { Room } from './room.js';
import { Hub, CONTENT_TYPES } from './hub.js';
import { generateContent, validateItem } from './ai.js';
import { makeMeta } from '../../live/shared/engine.js';
import { cleanLine } from '../../live/shared/filter.js';
import { json, readJson, HttpError, newCode, normCode, ROOM_CODE_RE, SQUARE_CODE_RE, ipKey, safeEqual, cleanDev } from './util.js';

export { Room, Hub };

const VERSION = '2.0.0';
const HOME = (env) => String(env.HOME_URL || 'https://ssople.com').replace(/\/+$/, '');
const STAT_KEYS = new Set(['share', 'card', 'invite', 'qr', 'photo_save', 'booking', 'kakao', 'install']);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    const origin = req.headers.get('Origin') || '';
    try {
      if (p.startsWith('/ws/')) return await socket(req, env, ctx, url);
      if (p.startsWith('/api/admin/')) return await admin(req, env, ctx, url);
      if (p.startsWith('/api/')) {
        if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), env, origin, true);
        return cors(await api(req, env, ctx, url), env, origin);
      }
      // 예전 주소와 첫 화면은 홈페이지의 온라인 파티룸으로
      const m = p.match(/^\/(r|tv)\/([A-Za-z0-9]{3,8})\/?$/);
      if (m) return Response.redirect(`${HOME(env)}/live/${m[1]}/${normCode(m[2])}`, 302);
      if (p === '/' || p === '/index.html' || p === '/square' || p === '/demo') return Response.redirect(`${HOME(env)}/live${p === '/square' || p === '/demo' ? p : ''}`, 302);
      if (p === '/admin') return Response.redirect(new URL('/admin.html', url).toString(), 302);
      return env.ASSETS.fetch(req);
    } catch (err) {
      const res = err instanceof HttpError ? json({ error: err.message }, err.status) : (console.error(err), json({ error: '잠시 문제가 생겼어요. 다시 시도해 주세요.' }, 500));
      return p.startsWith('/api/') && !p.startsWith('/api/admin/') ? cors(res, env, origin) : res;
    }
  },
};

const hubOf = (env) => env.HUB.getByName('hub');

// ---------- 다른 주소(홈페이지)에서 부르기 ----------
const DEFAULT_ORIGINS = ['https://ssople.com', 'https://www.ssople.com', 'https://ssople.pages.dev', 'https://*.ssople.pages.dev'];
export function originAllowed(env, origin, selfHost) {
  if (!origin) return true;
  let u;
  try { u = new URL(origin); } catch { return false; }
  if (selfHost && u.host === selfHost) return true;
  if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && env.ALLOW_LOCAL !== '0') return true;
  const list = DEFAULT_ORIGINS.concat(String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean));
  return list.some((pat) => {
    if (pat === '*') return true;
    const m = pat.match(/^(https?):\/\/\*\.(.+)$/);
    if (m) return u.protocol === m[1] + ':' && u.hostname.endsWith('.' + m[2]);
    return pat.replace(/\/+$/, '') === u.origin;
  });
}
function cors(res, env, origin, preflight) {
  if (!origin || !originAllowed(env, origin)) return res;
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Vary', 'Origin');
  if (preflight) {
    h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'content-type');
    h.set('Access-Control-Max-Age', '86400');
  }
  return new Response(res.body, { status: res.status, headers: h });
}

// ---------- 실시간 연결 ----------
async function socket(req, env, ctx, url) {
  if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket 연결만 받아요.' }, 426);
  const origin = req.headers.get('Origin');
  if (origin && !originAllowed(env, origin, url.host)) return json({ error: 'forbidden' }, 403);
  const code = normCode(url.pathname.split('/')[2]);
  if (!ROOM_CODE_RE.test(code) && !SQUARE_CODE_RE.test(code)) return json({ error: 'notfound' }, 404);
  const dev = cleanDev(url.searchParams.get('dev'));
  if (dev && url.searchParams.get('role') !== 'tv') ctx.waitUntil(hubOf(env).seen(dev).catch(() => {}));
  const fwd = new URL(req.url);
  fwd.searchParams.set('code', code);
  return env.ROOM.getByName(code).fetch(new Request(fwd, req));
}

// ---------- 일반 API ----------
async function api(req, env, ctx, url) {
  const p = url.pathname;
  const hub = hubOf(env);

  if (p === '/api/config' && req.method === 'GET') {
    const info = await hub.publicInfo();
    return json({
      ok: true, version: VERSION, home: HOME(env),
      brand: env.BRAND_NAME || '쏘플 온라인 파티룸',
      ai: !!env.ANTHROPIC_API_KEY,
      kakaoKey: env.KAKAO_JS_KEY || null,
      bookingUrl: env.BOOKING_URL || HOME(env) + '/rooms',
      notice: info.notice || '', event: info.event || null,
      square: info.square, squareCount: info.squareCount || 0,
    });
  }

  if (p === '/api/rooms' && req.method === 'POST') {
    const body = await readJson(req);
    const dev = cleanDev(body.dev);
    if (!dev) throw new HttpError(400, '기기 정보를 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.');
    const ip = await ipKey(req);
    if (!(await hub.hit('create', ip, 12, 3600_000))) throw new HttpError(429, '방을 너무 많이 만들었어요. 한 시간쯤 뒤에 다시 시도해 주세요.');
    const kind = body.kind === 'home' ? 'home' : 'party';
    for (let i = 0; i < 6; i++) {
      const code = newCode();
      const meta = makeMeta({ ...body, code, kind, hostDev: dev });
      const created = await hub.createRoom(code, { kind, name: meta.name, theme: meta.theme, isPublic: meta.isPublic, capacity: meta.capacity });
      if (!created) continue;
      if (await env.ROOM.getByName(code).init(meta)) return json({ code, room: { kind, name: meta.name, theme: meta.theme, capacity: meta.capacity, isPublic: meta.isPublic } });
    }
    throw new HttpError(500, '방 코드를 만들지 못했어요. 다시 시도해 주세요.');
  }

  const m = p.match(/^\/api\/rooms\/([A-Za-z0-9]{3,8})$/);
  if (m && req.method === 'GET') {
    const code = normCode(m[1]);
    if (!ROOM_CODE_RE.test(code)) return json({ exists: false }, 404);
    const info = await env.ROOM.getByName(code).peek();
    if (!info) return json({ exists: false }, 404);
    return json({ exists: true, room: info });
  }

  if (p === '/api/public' && req.method === 'GET') return json(await hub.listPublic(), 200, { 'cache-control': 'public, max-age=10' });

  if (p === '/api/stat' && req.method === 'POST') {
    const body = await readJson(req, 500);
    if (STAT_KEYS.has(body.k)) ctx.waitUntil(hub.bump({ [body.k]: 1 }).catch(() => {}));
    return json({ ok: true });
  }

  return json({ error: '찾는 주소가 없어요.' }, 404);
}

// ---------- 관리자 API ----------
async function admin(req, env, ctx, url) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: '관리자 비밀번호(ADMIN_PASSWORD)가 아직 설정되지 않았어요. 안내서의 비밀번호 설정 단계를 먼저 진행해 주세요.' }, 503);
  }
  const hub = hubOf(env);
  const ip = await ipKey(req);
  if ((await hub.countHits('authfail', ip, 600_000)) >= 10) return json({ error: '비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 시도해 주세요.' }, 429);
  const key = req.headers.get('x-admin-key') || '';
  if (!safeEqual(key, env.ADMIN_PASSWORD)) {
    await hub.hit('authfail', ip, 1000, 600_000);
    return json({ error: '비밀번호가 맞지 않아요.' }, 401);
  }

  const p = url.pathname.slice('/api/admin'.length);
  const method = req.method;
  let m;

  if (p === '/summary') return json({ ...(await hub.summary()), ai: !!env.ANTHROPIC_API_KEY, version: VERSION });

  if (p === '/rooms') return json({ live: await hub.liveRooms(), recent: await hub.recentRooms() });
  if ((m = p.match(/^\/rooms\/([A-Z0-9]{3,8})$/)) && method === 'GET') {
    const v = await env.ROOM.getByName(m[1]).adminView();
    return v ? json(v) : json({ error: '방을 찾을 수 없어요.' }, 404);
  }
  if ((m = p.match(/^\/rooms\/([A-Z0-9]{3,8})\/close$/)) && method === 'POST') return json({ ok: await env.ROOM.getByName(m[1]).adminClose() });

  if (p === '/reports' && method === 'GET') return json({ reports: await hub.listReports(url.searchParams.get('status') || 'open') });
  if ((m = p.match(/^\/reports\/(\d+)$/)) && method === 'POST') {
    const body = await readJson(req);
    const r = await hub.getReport(Number(m[1]));
    if (!r) throw new HttpError(404, '신고를 찾을 수 없어요.');
    const action = ['dismiss', 'ban', 'close'].includes(body.action) ? body.action : 'dismiss';
    const validRoom = ROOM_CODE_RE.test(r.code) || SQUARE_CODE_RE.test(r.code);
    if (action === 'ban') {
      await hub.ban(r.target_dev, `신고 #${r.id} · ${r.target}`);
      if (validRoom) await env.ROOM.getByName(r.code).adminKick(r.target_dev).catch(() => {});
    }
    if (action === 'close' && ROOM_CODE_RE.test(r.code)) await env.ROOM.getByName(r.code).adminClose().catch(() => {});
    await hub.setReport(r.id, 'done', action);
    return json({ ok: true });
  }

  if (p === '/bans' && method === 'GET') return json({ bans: await hub.listBans() });
  if ((m = p.match(/^\/bans\/([A-Za-z0-9_-]{8,64})\/remove$/)) && method === 'POST') { await hub.unban(m[1]); return json({ ok: true }); }

  if (p === '/content' && method === 'GET') {
    const status = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
    return json({ items: await hub.listContent(status), counts: await hub.contentCounts() });
  }
  if (p === '/content' && method === 'POST') {
    const body = await readJson(req);
    if (!CONTENT_TYPES.includes(body.type)) throw new HttpError(400, '콘텐츠 종류를 골라 주세요.');
    const item = validateItem(body.type, body.item);
    if (!item) throw new HttpError(400, '내용을 확인해 주세요. 빈칸이 있거나 쓸 수 없는 표현이 들어 있어요.');
    const n = await hub.addContent(body.type, [item], 'approved', 'admin');
    return json({ ok: true, added: n });
  }
  if (p === '/content/generate' && method === 'POST') {
    if (!env.ANTHROPIC_API_KEY) throw new HttpError(400, 'AI 문제 만들기는 ANTHROPIC_API_KEY를 설정한 뒤에 쓸 수 있어요.');
    const body = await readJson(req);
    if (!CONTENT_TYPES.includes(body.type)) throw new HttpError(400, '콘텐츠 종류를 골라 주세요.');
    if (!(await hub.hit('gen', 'admin', 30, 3600_000))) throw new HttpError(429, '한 시간에 30번까지 만들 수 있어요.');
    let items;
    try { items = await generateContent(env, body.type, body.n, body.topic); } catch (err) { throw new HttpError(502, 'AI가 응답하지 않았어요. 잠시 뒤 다시 시도해 주세요. ' + String(err.message || '').slice(0, 120)); }
    const added = await hub.addContent(body.type, items, 'pending', 'ai');
    return json({ ok: true, made: items.length, added });
  }
  if ((m = p.match(/^\/content\/(\d+)$/)) && method === 'POST') {
    const body = await readJson(req);
    const row = await hub.getContent(Number(m[1]));
    if (!row) throw new HttpError(404, '콘텐츠를 찾을 수 없어요.');
    if (body.action === 'delete') { await hub.setContent(row.id, 'delete'); return json({ ok: true }); }
    const status = body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : body.action === 'pending' ? 'pending' : null;
    if (!status) throw new HttpError(400, '처리 방법을 골라 주세요.');
    let item;
    if (body.item !== undefined) {
      item = validateItem(row.type, body.item);
      if (!item) throw new HttpError(400, '고친 내용을 확인해 주세요.');
    }
    await hub.setContent(row.id, status, item);
    return json({ ok: true });
  }

  if (p === '/settings' && method === 'GET') return json(await hub.getSettings());
  if (p === '/settings' && method === 'POST') {
    const body = await readJson(req);
    const next = {};
    if (typeof body.notice === 'string') next.notice = cleanLine(body.notice, 200);
    if (body.event === null) next.event = null;
    else if (body.event && typeof body.event === 'object') {
      const title = cleanLine(body.event.title || '', 40);
      const at = Number(body.event.at);
      if (!title || !Number.isFinite(at)) throw new HttpError(400, '행사 이름과 시간을 모두 넣어 주세요.');
      next.event = { title, at, desc: cleanLine(body.event.desc || '', 80) };
    }
    return json(await hub.setSettings(next));
  }

  return json({ error: '찾는 주소가 없어요.' }, 404);
}
