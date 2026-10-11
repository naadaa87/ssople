// 공유 미리보기(카카오톡·검색)용 — 정적 화면에 제목·설명·대표 이미지를 채워 보낸다
import { ensureSchema } from './db.js';
import { loadSpaces, publicSpace, photoUrl } from './spaces.js';
import { parseJSON, todayKST } from './util.js';
import { imgUrl } from './community.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');
const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(LS, '\\u2028').replace(PS, '\\u2029');
const won = (n) => (n ? (n % 10000 === 0 ? `${n / 10000}만원` : `${(n / 10000).toFixed(1)}만원`) : '');

export async function renderPage(context, template, metaFn) {
  const { request, env } = context;
  const url = new URL(request.url);
  const tpl = await env.ASSETS.fetch(new Request(new URL(template, url.origin), { headers: { accept: 'text/html' } }));
  if (!tpl.ok) return tpl;
  let meta = null;
  try {
    if (env.DB) { await ensureSchema(env); meta = await metaFn(env, context.params, url); }
  } catch (e) { meta = null; }
  const abs = (u) => (!u ? '' : /^https?:\/\//.test(u) ? u : url.origin + u);
  const title = meta?.title ? `${meta.title} | 쏘플파티룸` : null;
  const rw = new HTMLRewriter()
    .on('title', { element(el) { if (title) el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { if (meta?.desc) el.setAttribute('content', meta.desc); } })
    .on('meta[property="og:title"]', { element(el) { if (title) el.setAttribute('content', title); } })
    .on('meta[property="og:description"]', { element(el) { if (meta?.desc) el.setAttribute('content', meta.desc); } })
    .on('meta[property="og:image"]', { element(el) { if (meta?.image) el.setAttribute('content', abs(meta.image)); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', url.origin + url.pathname); } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', url.origin + url.pathname); } })
    .on('head', {
      element(el) {
        if (meta?.data) el.append(`<script>window.__SSR__=${safeJson(meta.data)}</script>`, { html: true });
        if (meta?.noindex) el.append('<meta name="robots" content="noindex">', { html: true });
      },
    });
  const out = rw.transform(tpl);
  const headers = new Headers(out.headers);
  headers.set('cache-control', 'public, max-age=60');
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(out.body, { status: meta ? 200 : 404, headers });
}

/** 고정 화면(홈·지점 찾기 등) — 공유 미리보기 주소만 실제 접속한 도메인으로 채운다 */
export async function renderStatic(context) {
  const res = await context.next();
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('text/html')) return res;
  const url = new URL(context.request.url);
  const abs = (u) => (!u ? u : /^https?:\/\//.test(u) ? u : url.origin + (u.startsWith('/') ? u : '/' + u));
  const here = url.origin + (url.pathname === '/index' ? '/' : url.pathname);
  return new HTMLRewriter()
    .on('meta[property="og:image"]', { element(el) { el.setAttribute('content', abs(el.getAttribute('content'))); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', here); } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', here); } })
    .transform(res);
}

/* ---------------- 화면별 정보 ---------------- */
export async function roomMeta(env, params) {
  const code = String(params.code || '').toUpperCase();
  const s = (await loadSpaces(env.DB)).find((x) => x.code === code);
  if (!s) return null;
  const mins = (s.pkgs || []).map((p) => Math.min(...(p.p || []).filter(Boolean))).filter((n) => Number.isFinite(n));
  const from = mins.length ? Math.min(...mins) : null;
  const feats = [];
  if (s.feat?.karaoke?.on) feats.push('노래방');
  if (s.feat?.bbq?.on) feats.push('바베큐');
  if (s.feat?.pet?.on) feats.push('애견 동반');
  if ((s.feat?.zones || []).length) feats.push(...s.feat.zones.slice(0, 2));
  const desc = [`${s.region} ${s.area}`, s.base && s.max ? `기준 ${s.base}명 · 최대 ${s.max}명` : '', from ? `${won(from)}부터` : '', feats.join('·')]
    .filter(Boolean).join(' | ') + ' — 빈 방 확인하고 네이버 예약으로 바로 잡으세요.';
  return { title: `${s.name} 파티룸`, desc, image: (s.photos || [])[0] ? photoUrl(s.photos[0]) : '/assets/img/og.png', data: { space: publicSpace(s) } };
}

export async function postMeta(env, params) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return null;
  const p = await env.DB.prepare('SELECT id, board, title, body, imgs, hidden FROM posts WHERE id = ?').bind(id).first();
  if (!p) return null;
  if (p.hidden || p.board === 'mb') return { title: '커뮤니티', desc: '쏘플파티룸 커뮤니티', noindex: true };
  const imgs = parseJSON(p.imgs, []);
  return { title: p.title || '커뮤니티 글', desc: String(p.body).replace(/\s+/g, ' ').slice(0, 110), image: imgs[0] ? imgUrl(imgs[0]) : null };
}

export async function meetupMeta(env, params) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return null;
  const m = await env.DB.prepare('SELECT id, title, intro, cover, cat, region, members, status FROM meetups WHERE id = ?').bind(id).first();
  if (!m || m.status === 'deleted') return null;
  if (m.status === 'hidden') return { title: '모임', desc: '쏘플파티룸 모임', noindex: true };
  return { title: `${m.title} · ${m.cat} 모임`, desc: `${m.region} · 멤버 ${m.members}명 — ${String(m.intro || '').replace(/\s+/g, ' ').slice(0, 90)}`, image: m.cover ? imgUrl(m.cover) : null };
}

export async function crewMeta(env, params) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return null;
  const c = await env.DB.prepare('SELECT id, title, body, d, t, need, accepted, status FROM crews WHERE id = ?').bind(id).first();
  if (!c || c.status === 'deleted') return null;
  if (c.status === 'hidden') return { title: '파티팀 모집', desc: '쏘플파티룸 파티팀 모집', noindex: true };
  const md = c.d ? `${Number(c.d.slice(5, 7))}월 ${Number(c.d.slice(8))}일` : '';
  return { title: c.title, desc: `${md} ${c.t || ''} · ${c.accepted}/${c.need}명 — ${String(c.body || '').replace(/\s+/g, ' ').slice(0, 80)}`, image: null };
}

export async function eventMeta(env, params) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return null;
  const e = await env.DB.prepare('SELECT id, title, summary, cover, d, status FROM events WHERE id = ?').bind(id).first();
  if (!e || !['open', 'closed', 'done'].includes(e.status)) return null;
  const md = e.d ? `${Number(e.d.slice(5, 7))}월 ${Number(e.d.slice(8))}일` : '';
  return { title: e.title, desc: `${md} · ${e.summary || '쏘플파티룸 행사'}`, image: e.cover ? imgUrl(e.cover) : null };
}

export async function inviteMeta(env, params) {
  const id = String(params.id || '');
  if (!/^[A-Za-z0-9]{6,12}$/.test(id)) return null;
  const i = await env.DB.prepare('SELECT i.id, i.title, i.host, i.d, i.t, i.cover, u.nick FROM invites i LEFT JOIN users u ON u.id = i.uid WHERE i.id = ?').bind(id).first();
  if (!i) return null;
  const md = i.d ? `${Number(i.d.slice(5, 7))}월 ${Number(i.d.slice(8))}일 ${i.t || ''}` : '';
  return { title: `${i.title} 초대장`, desc: `${i.host || i.nick}님이 초대했어요. ${md}`.trim() + ' — 참석 여부를 알려 주세요.', image: i.cover ? imgUrl(i.cover) : '/assets/img/og-invite.png', noindex: true };
}

export async function sitemap(context) {
  const { env, request } = context;
  const origin = new URL(request.url).origin;
  const pages = ['/', '/rooms', '/locations', '/event', '/meetups', '/crew', '/community', '/play', '/planner', '/invite', '/membership', '/partners', '/corporate', '/guide', '/about',
    '/purpose-birthday', '/purpose-bridal', '/purpose-yearend', '/purpose-workshop', '/purpose-filming', '/purpose-reunion', '/terms', '/privacy', '/policy'];
  const urls = pages.map((p) => ({ loc: origin + p }));
  try {
    if (env.DB) {
      await ensureSchema(env);
      for (const s of await loadSpaces(env.DB)) urls.push({ loc: `${origin}/room/${s.code}`, lastmod: (s.updated_at || '').slice(0, 10) });
      const ev = (await env.DB.prepare(`SELECT id, updated_at FROM events WHERE status IN ('open','closed') AND COALESCE(d2, d) >= ?`).bind(todayKST()).all()).results || [];
      for (const e of ev) urls.push({ loc: `${origin}/e/${e.id}`, lastmod: (e.updated_at || '').slice(0, 10) });
      const ps = (await env.DB.prepare(`SELECT id, updated_at FROM posts WHERE hidden = 0 AND board IN ('review','tip','qna','free','notice') ORDER BY id DESC LIMIT 300`).all()).results || [];
      for (const p of ps) urls.push({ loc: `${origin}/c/${p.id}`, lastmod: (p.updated_at || '').slice(0, 10) });
      const ms = (await env.DB.prepare(`SELECT id FROM meetups WHERE status = 'active' ORDER BY id DESC LIMIT 200`).all()).results || [];
      for (const m of ms) urls.push({ loc: `${origin}/m/${m.id}` });
    }
  } catch { /* DB 연결 전이면 기본 페이지만 */ }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ''}</url>`).join('\n')
    + '\n</urlset>\n';
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
