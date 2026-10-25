// 온라인 파티룸 초대 링크 (/live/r/방코드) — 앱 화면을 그대로 보여 주되,
// 카카오톡·문자 미리보기에 방 이름이 보이도록 제목과 설명만 바꾼다
import { getSettings, ensureSchema } from '../../_lib/db.js';

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function roomInfo(env, code) {
  if (!/^[A-Za-z0-9]{3,8}$/.test(code) || !env.DB) return null;
  try {
    await ensureSchema(env);
    const st = await getSettings(env.DB);
    const server = String(st['live.server'] || '').trim().replace(/\/+$/, '');
    if (!server) return null;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(`${server}/api/rooms/${code.toUpperCase()}`, { signal: ctl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.exists ? j.room : null;
  } catch { return null; }
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!['GET', 'HEAD'].includes(request.method)) return context.next();
  const res = await env.ASSETS.fetch(new URL('/live/app', request.url));
  const room = await roomInfo(env, String(params.code || ''));
  if (!room) return res;
  const home = room.kind === 'home';
  const title = `${room.name} · ${home ? '집들이 초대장' : '초대장'}`;
  const who = room.hostNick || room.owner || '';
  const desc = (who ? `${who}님이 ${home ? '집들이에' : '온라인 파티룸에'} 초대했어요.` : `${home ? '집들이' : '온라인 파티룸'} 초대장이 왔어요.`)
    + ' 링크를 누르고 이름만 정하면 바로 들어와요.' + (room.count ? ` 지금 ${room.count}명이 놀고 있어요.` : '');
  const h = new Headers(res.headers);
  h.set('cache-control', 'no-store');
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', title); } })
    .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('head', { element(el) { el.append(`<meta property="og:url" content="${esc(new URL(request.url).origin + '/live/r/' + String(params.code).toUpperCase())}">`, { html: true }); } })
    .transform(new Response(res.body, { status: res.status, headers: h }));
}
