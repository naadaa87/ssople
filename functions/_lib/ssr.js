// 공유 미리보기(카카오톡·검색)용 — 정적 화면에 제목·설명·대표 이미지를 채워 보낸다
import { ensureSchema } from './db.js';
import { loadSpaces, publicSpace, photoUrl } from './spaces.js';
import { parseJSON, todayKST } from './util.js';
import { imgUrl } from './community.js';
import { getSettings } from './db.js';
import { verifyTags, orgJsonLd, websiteJsonLd, roomJsonLd, breadcrumbJsonLd, areaJsonLd, areaHtml, areaPaths, findArea, jsonLdTag, minPrice, featList, areaGuideFaq, areaGuideDesc } from './seo.js';
import { MAGAZINE } from './magazine-index.js';
import { GAMES } from './games-index.js';

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
    if (env.DB) { await ensureSchema(env); env.__origin = siteBase(url, await getSettings(env.DB).catch(() => ({}))); meta = await metaFn(env, context.params, url); }
  } catch (e) { meta = null; }
  const base = env.__origin || url.origin;
  const abs = (u) => (!u ? '' : /^https?:\/\//.test(u) ? u : base + u);
  const title = meta?.title ? (meta.fullTitle ? meta.title : `${meta.title} | 쏘플파티룸`) : null;
  const verify = await verifyTags(env);
  const injected = meta?.html || {};
  const rw = new HTMLRewriter()
    .on('title', { element(el) { if (title) el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { if (meta?.desc) el.setAttribute('content', meta.desc); } })
    .on('meta[name="keywords"]', { element(el) { if (meta?.keywords) el.setAttribute('content', meta.keywords); } })
    .on('meta[property="og:title"]', { element(el) { if (title) el.setAttribute('content', title); } })
    .on('meta[property="og:description"]', { element(el) { if (meta?.desc) el.setAttribute('content', meta.desc); } })
    .on('meta[property="og:image"]', { element(el) { if (meta?.image) el.setAttribute('content', abs(meta.image)); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', base + url.pathname); } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', base + url.pathname); } })
    .on('head', {
      element(el) {
        if (verify) el.append(verify, { html: true });
        if (meta?.data) el.append(`<script>window.__SSR__=${safeJson(meta.data)}</script>`, { html: true });
        if (meta?.noindex) el.append('<meta name="robots" content="noindex">', { html: true });
        for (const j of meta?.jsonld || []) el.append(jsonLdTag(j), { html: true });
      },
    });
  for (const [sel, htmlStr] of Object.entries(injected)) rw.on(sel, { element(el) { el.setInnerContent(htmlStr, { html: true }); } });
  const out = rw.transform(tpl);
  const headers = new Headers(out.headers);
  headers.set('cache-control', 'public, max-age=60');
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(out.body, { status: meta ? 200 : 404, headers });
}

/** 빌드 때 화면 파일에 넣어 둔 기본 주소 — 서버가 실제 주소로 바꿔 끼운다 (build.py SITE와 같아야 한다) */
export const BUILD_SITE = 'https://ssople.pages.dev';

/** 이 화면의 대표 주소: 설정에 대표 주소(seo.canonical_host)가 있으면 그것, 없으면 지금 접속한 주소 */
export function siteBase(url, st) {
  const host = String((st && st['seo.canonical_host']) || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (host) return 'https://' + host;
  // 미리보기 배포(브랜치.ssople.pages.dev)는 정식 주소를 기본 주소로 가리킨다
  if (/^[^.]+\.ssople\.pages\.dev$/.test(url.hostname)) return BUILD_SITE;
  return url.origin;
}

/** 고정 화면(홈·지점 찾기·파티 가이드 등) — 정식 주소·공유 주소·빵부스러기를 실제 대표 주소로 채운다 */
export async function renderStatic(context) {
  let res = await context.next();
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('text/html')) return res;
  const url = new URL(context.request.url);
  let st = {};
  let extra = '';
  try {
    if (context.env.DB) {
      await ensureSchema(context.env);
      st = await getSettings(context.env.DB);
      extra += await verifyTags(context.env);
    }
  } catch { /* DB 연결 전이면 기본 화면만 */ }
  const base = siteBase(url, st);
  const abs = (u) => (!u ? u : /^https?:\/\//.test(u) ? u : base + (u.startsWith('/') ? u : '/' + u));
  const here = base + (url.pathname === '/index' ? '/' : url.pathname);
  if (here === base + '/') extra += jsonLdTag(orgJsonLd(base, st)) + jsonLdTag(websiteJsonLd(base));
  if (base !== BUILD_SITE) {
    // 화면 파일 안의 기본 주소(정식 주소·빵부스러기·글 구조화 데이터)를 대표 주소로
    const body = (await res.text()).split(BUILD_SITE).join(base);
    const h = new Headers(res.headers); h.delete('content-length'); h.delete('etag');
    res = new Response(body, { status: res.status, headers: h });
  }
  return new HTMLRewriter()
    .on('meta[property="og:image"]', { element(el) { el.setAttribute('content', abs(el.getAttribute('content'))); } })
    .on('meta[property="og:url"]', { element(el) { if (!el.getAttribute('content')) el.setAttribute('content', here); } })
    .on('link[rel="canonical"]', { element(el) { if (!el.getAttribute('href')) el.setAttribute('href', here); } })
    .on('head', { element(el) { if (extra) el.append(extra, { html: true }); } })
    .transform(res);
}

/* ---------------- 화면별 정보 ---------------- */
/** 지점 시설에 맞는 파티 가이드 글 링크 (검색 로봇용 — 고객 화면은 room.js가 카드로 다시 그린다) */
function roomGuideLinks(s) {
  const f = s.feat || {}, out = [];
  if ((s.max || 0) >= 20) out.push('year-end-party-guide', 'large-group-partyrooms');
  if (f.bbq && f.bbq.on) out.push('rooftop-terrace-partyrooms');
  if (f.pet && f.pet.on) out.push('pet-friendly-partyroom');
  if (f.console) out.push('tv-party-games');
  if (f.karaoke && f.karaoke.on) out.push('karaoke-party-tips');
  out.push('birthday-party-guide', 'party-checklist', 'party-games-50');
  const arts = [...new Set(out)].slice(0, 3).map((x) => MAGAZINE.find((m) => m.slug === x)).filter(Boolean);
  if (!arts.length) return '';
  return `<p class="muted small" style="margin-top:14px">파티 준비 가이드: ${arts.map((a) => `<a class="link" href="/magazine/${esc(a.slug)}">${esc(a.title)}</a>`).join(' · ')} · <a class="link" href="/magazine">전체 보기</a></p>`;
}

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
    .filter(Boolean).join(' | ') + ' — 요금 확인하고 네이버 예약으로 바로 잡으세요.';
  let st = {};
  try { st = await getSettings(env.DB); } catch { st = {}; }
  const origin = env.__origin || '';
  const all = featList(s);
  const summary = `<nav class="crumb" aria-label="현재 위치" style="padding-top:22px"><a href="/">홈</a><span>›</span><a href="/locations">지역별 지점</a><span>›</span><a href="/area/${esc(encodeURIComponent(s.area))}">${esc(s.region)} ${esc(s.area)}</a><span>›</span><b>${esc(s.name)}</b></nav>
<h1 class="h1" style="margin-top:10px">${esc(s.name)} <span class="muted" style="font-size:.55em;font-weight:600">${esc(s.region)} ${esc(s.area)} 파티룸</span></h1>
<p class="lead">${esc(s.addr || '')}${s.base && s.max ? ` · 기준 ${esc(s.base)}명, 최대 ${esc(s.max)}명` : ''}${s.info?.size ? ` · ${esc(s.info.size)}` : ''}${from ? ` · ${esc(won(from))}부터` : ''}</p>
${all.length ? `<p class="muted">${all.map((f) => esc(f)).join(' · ')}</p>` : ''}
${s.intro ? String(s.intro).split(/\n\s*\n/).map((pg) => `<p style="margin-top:12px">${esc(pg.trim())}</p>`).join('') : ''}
${roomGuideLinks(s)}
<div class="skel" style="height:360px;margin-top:22px;border-radius:22px"></div>`;
  return {
    title: `${s.name} 파티룸 — ${s.region} ${s.area}`, desc, image: (s.photos || [])[0] ? photoUrl(s.photos[0]) : '/assets/img/og.jpg', data: { space: publicSpace(s) },
    keywords: [`${s.area} 파티룸`, `${s.region} 파티룸`, `${s.area} 파티룸 대여`, `${s.name}`, '쏘플파티룸', ...all.slice(0, 4).map((f) => `${f} 파티룸`)].join(', '),
    jsonld: [roomJsonLd(origin, s, st), breadcrumbJsonLd(origin, [['홈', '/'], ['지역별 지점', '/locations'], [`${s.region} ${s.area}`, `/area/${encodeURIComponent(s.area)}`], [s.name, `/room/${s.code}`]])],
    html: { '#roomRoot': summary },
  };
}

export async function areaMeta(env, params) {
  const spaces = (await loadSpaces(env.DB)).filter((s) => s.visible);
  const a = findArea(params.slug, spaces);
  if (!a) return null;
  const origin = env.__origin || '';
  const names = a.list.map((s) => s.name).slice(0, 6).join(', ');
  const feats = [...new Set(a.list.flatMap((s) => featList(s)))].slice(0, 5);
  return {
    title: `${a.name} 파티룸 ${a.list.length}곳 — 쏘플파티룸`, fullTitle: true,
    desc: (areaGuideDesc(a) ? areaGuideDesc(a).slice(0, 150) + ' ' : '') + `${names}${a.list.length > 6 ? ' 등' : ''} ${a.list.length}곳의 요금·인원·시설을 비교하고 네이버 예약으로 바로 잡으세요.`,
    keywords: [`${a.name} 파티룸`, `${a.name} 파티룸 대여`, `${a.name} 파티룸 추천`, `${a.name} 생일파티 장소`, `${a.name} 모임 장소`, a.kind === 'area' ? `${a.region} 파티룸` : '', '쏘플파티룸'].filter(Boolean).join(', '),
    image: a.list.flatMap((s) => s.photos || []).map(photoUrl).find(Boolean) || '/assets/img/og.jpg',
    data: { area: { kind: a.kind, name: a.name, region: a.region, codes: a.list.map((s) => s.code) } },
    jsonld: [areaJsonLd(origin, a), breadcrumbJsonLd(origin, a.kind === 'area' ? [['홈', '/'], ['지역별 지점', '/locations'], [a.region, `/area/${encodeURIComponent(a.region)}`], [a.name, `/area/${encodeURIComponent(a.name)}`]] : [['홈', '/'], ['지역별 지점', '/locations'], [a.name, `/area/${encodeURIComponent(a.name)}`]]), areaGuideFaq(a)].filter(Boolean),
    html: { '#areaRoot': areaHtml(origin, a) },
  };
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
  const pages = ['/', '/rooms', '/locations', '/startup', '/host', '/academy', '/event', '/meetups', '/crew', '/community', '/play', '/planner', '/invite', '/membership', '/partners', '/corporate', '/guide', '/about',
    '/purpose-birthday', '/purpose-bridal', '/purpose-yearend', '/purpose-workshop', '/purpose-filming', '/purpose-reunion', '/terms', '/privacy', '/policy'];
  const urls = pages.map((p) => ({ loc: origin + p }));
  urls.push({ loc: origin + '/magazine' });
  for (const m of MAGAZINE) urls.push({ loc: `${origin}/magazine/${m.slug}`, lastmod: m.date });
  urls.push({ loc: origin + '/games' });
  for (const g of GAMES) urls.push({ loc: `${origin}/games/${g.slug}` });
  try {
    if (env.DB) {
      await ensureSchema(env);
      const spaces = await loadSpaces(env.DB);
      for (const a of areaPaths(spaces)) urls.push({ loc: origin + a.path });
      for (const s of spaces) urls.push({ loc: `${origin}/room/${s.code}`, lastmod: (s.updated_at || '').slice(0, 10) });
      const ev = (await env.DB.prepare(`SELECT id, updated_at FROM events WHERE status IN ('open','closed') AND COALESCE(d2, d) >= ?`).bind(todayKST()).all()).results || [];
      for (const e of ev) urls.push({ loc: `${origin}/e/${e.id}`, lastmod: (e.updated_at || '').slice(0, 10) });
      const ps = (await env.DB.prepare(`SELECT id, updated_at FROM posts WHERE hidden = 0 AND board IN ('review','tip','qna','free','notice','host') ORDER BY id DESC LIMIT 300`).all()).results || [];
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

/** RSS — 네이버 서치어드바이저 "RSS 제출"용. 행사·공지·팁·후기 글을 최근 순으로 */
export async function rss(context) {
  const { env, request } = context;
  const origin = new URL(request.url).origin;
  const items = [];
  const rfc = (iso) => { const d = iso ? new Date(iso) : new Date(); return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString(); };
  const cut = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  try {
    if (env.DB) {
      await ensureSchema(env);
      const ev = (await env.DB.prepare(`SELECT id, title, summary, d, created_at, updated_at FROM events WHERE status IN ('open','closed','done') ORDER BY id DESC LIMIT 30`).all()).results || [];
      for (const e of ev) items.push({ title: e.title, link: `${origin}/e/${e.id}`, desc: e.summary || `${e.d || ''} 쏘플파티룸 행사`, at: e.updated_at || e.created_at, cat: '행사' });
      const ps = (await env.DB.prepare(`SELECT id, board, title, body, created_at, updated_at FROM posts WHERE hidden = 0 AND board IN ('notice','tip','review','qna','free','host') ORDER BY id DESC LIMIT 60`).all()).results || [];
      const BOARD = { notice: '공지', tip: '팁', review: '후기', qna: '질문', free: '자유', host: '지점 소식' };
      for (const p of ps) items.push({ title: p.title || cut(p.body, 40), link: `${origin}/c/${p.id}`, desc: cut(p.body, 200), at: p.updated_at || p.created_at, cat: BOARD[p.board] || '커뮤니티' });
      const sp = await loadSpaces(env.DB);
      for (const s of sp.slice(0, 40)) items.push({ title: `${s.name} 파티룸 — ${s.region} ${s.area}`, link: `${origin}/room/${s.code}`, desc: `${s.addr || ''} 기준 ${s.base || '-'}명 · 최대 ${s.max || '-'}명. 요금 확인 후 네이버 예약.`, at: s.updated_at, cat: '지점' });
    }
  } catch { /* DB 연결 전이면 고정 글만 */ }
  const fixed = [
    { title: '파티룸은 쏘플, 우리 쏘플에서 만나요', link: origin + '/', desc: '전국 쏘플파티룸 지점의 낮·밤 요금과 시설을 확인하고 네이버 예약으로 바로 잡으세요.', cat: '안내' },
    { title: '파티룸 창업안내 — 상권 분석부터 오픈 홍보까지', link: origin + '/startup', desc: '비어 있는 공간을 파티룸으로. 340곳 넘게 열어 본 데이터로 상권 분석, 매물, 기획, 인테리어, 촬영, 오픈 홍보까지 한 번에.', cat: '창업' },
    { title: '호스트 센터 — 공간 등록 · 위탁운영', link: origin + '/host', desc: '운영 중인 파티룸을 쏘플에 등록하면 쏘플 손님에게 노출되고 예약은 네이버 예약으로 이어져요. 프리미엄존 월 5만원, 플러스존 월 3만원. 위탁운영은 매출의 20%.', cat: '호스트' },
    { title: '쏘플 공간 아카데미 — 공간 운영·창업 커뮤니티', link: origin + '/academy', desc: '파티룸과 공간대여 사업에 관심 있는 분들이 모이는 정기 모임, 현장 투어, 온라인 스터디.', cat: '아카데미' },
    { title: '이용 안내 — 예약부터 입장까지', link: origin + '/guide', desc: '예약, 입장, 보증금, 미성년자 이용까지 자주 묻는 내용을 모았어요.', cat: '안내' },
  ];
  for (const m of MAGAZINE) items.push({ title: m.title, link: `${origin}/magazine/${m.slug}`, desc: m.desc, at: m.date + 'T09:00:00+09:00', cat: '파티 가이드 · ' + m.catLabel });
  items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const all = [...items.slice(0, 150), ...fixed];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>쏘플파티룸</title>
<link>${esc(origin)}/</link>
<description>전국 파티룸 예약 · 생일파티, 브라이덜 샤워, 워크숍, 모임 공간 — 쏘플파티룸 소식</description>
<language>ko</language>
<lastBuildDate>${rfc(all[0]?.at)}</lastBuildDate>
<atom:link href="${esc(origin)}/rss.xml" rel="self" type="application/rss+xml"/>
${all.map((i) => `<item><title>${esc(i.title)}</title><link>${esc(i.link)}</link><guid isPermaLink="true">${esc(i.link)}</guid><description>${esc(i.desc)}</description><category>${esc(i.cat)}</category><pubDate>${rfc(i.at)}</pubDate></item>`).join('\n')}
</channel>
</rss>
`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=1800' } });
}
