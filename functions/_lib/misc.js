// 사이트 정보 · 메인 화면 묶음 · 문의 · 제휴 · 사진 올리기
import { HttpError, str, nowIso, todayKST, addDays, slug, kstNow, maskPhones, parseJSON, dispNick } from './util.js';
import { getSettings, publicSettings, SCHEMA_VERSION, getMeta } from './db.js';
import { loadSpaces } from './spaces.js';
import { imgUrl, checkText } from './community.js';

export const APP_VERSION = '2026.10.13';

export const INQUIRY_KINDS = {
  partner: '제휴 혜택 제공',
  corporate: '기업·단체 행사',
  space: '공간 입점·위탁운영 상담',
  startup: '창업·입점 상담',
  collab: '브랜드 협업·촬영',
  etc: '기타 문의',
};

export function register(route) {
  route('GET', '/api/health', async (c) => {
    const out = { ok: true, app: 'ssople-web', version: APP_VERSION, schema: SCHEMA_VERSION, bound: { db: !!c.env.DB, host: !!c.env.HOSTDB, photos: !!c.env.PHOTOS } };
    try {
      const n = await c.db.prepare('SELECT COUNT(*) AS n, SUM(visible) AS v FROM spaces').first();
      out.spaces = n?.n ?? 0;
      out.open = n?.v ?? 0;
      const m = (await c.db.prepare(`SELECT k, v FROM meta WHERE k IN ('seed', 'host_ok_at', 'cron_at')`).all()).results || [];
      const mv = Object.fromEntries(m.map((r) => [r.k, r.v]));
      out.seed = mv.seed || null;
      out.sync = { host: mv.host_ok_at || null, cron: mv.cron_at || null };
    } catch (e) { out.ok = false; out.error = String(e.message || e); }
    return out;
  });

  route('GET', '/api/site', async (c) => {
    const s = await getSettings(c.db);
    const spaces = await loadSpaces(c.db);
    const regions = {};
    for (const x of spaces) regions[x.region] = (regions[x.region] || 0) + 1;
    return { settings: publicSettings(s), spaces: spaces.length, regions };
  });

  route('GET', '/api/home', async (c) => {
    const today = todayKST();
    const s = await getSettings(c.db);
    const spaces = await loadSpaces(c.db);
    const nm = Object.fromEntries(spaces.map((x) => [x.code, x.name]));
    const [ev, cr, mt, rv, tp, nt, pt, top] = await Promise.all([
      c.db.prepare(`SELECT id, title, summary, cover, cat, d, d2, t1, code, place, cap, going, price, mode, members_only FROM events WHERE status IN ('open','closed') AND COALESCE(d2, d) >= ? ORDER BY d LIMIT 4`).bind(today).all(),
      c.db.prepare(`SELECT c.id, c.title, c.d, c.t, c.code, c.region, c.need, c.accepted, c.cost, u.nick, u.avatar FROM crews c LEFT JOIN users u ON u.id = c.uid WHERE c.status = 'open' AND c.d >= ? ORDER BY c.d LIMIT 6`).bind(today).all(),
      c.db.prepare(`SELECT m.id, m.title, m.cat, m.region, m.members, m.cap, m.cover, m.join_mode FROM meetups m WHERE m.status = 'active' ORDER BY m.members DESC, m.id DESC LIMIT 6`).all(),
      c.db.prepare(`SELECT p.id, p.title, p.body, p.imgs, p.code, p.rating, p.verified, p.likes, p.created_at, u.nick, u.avatar FROM posts p LEFT JOIN users u ON u.id = p.uid WHERE p.board = 'review' AND p.hidden = 0 ORDER BY p.id DESC LIMIT 6`).all(),
      c.db.prepare(`SELECT p.id, p.title, p.body, p.imgs, p.likes, p.cmts, p.created_at, u.nick FROM posts p LEFT JOIN users u ON u.id = p.uid WHERE p.board = 'tip' AND p.hidden = 0 ORDER BY p.likes DESC, p.id DESC LIMIT 4`).all(),
      c.db.prepare(`SELECT id, title, created_at FROM posts WHERE board = 'notice' AND hidden = 0 ORDER BY pinned DESC, id DESC LIMIT 1`).first(),
      c.db.prepare(`SELECT id, name, cat, benefit, url, img, region, tier FROM partners WHERE active = 1 ORDER BY sort, id DESC LIMIT 8`).all(),
      c.db.prepare(`SELECT code, COUNT(*) AS n FROM clicks WHERE at >= ? GROUP BY code ORDER BY n DESC LIMIT 8`).bind(addDays(today, -30)).all(),
    ]);
    const featured = String(s['home.featured'] || '').split(',').map((x) => x.trim()).filter((x) => nm[x]);
    for (const r of top.results || []) if (featured.length < 8 && nm[r.code] && !featured.includes(r.code)) featured.push(r.code);
    const first = (imgs) => { const a = parseJSON(imgs, []); return a[0] ? imgUrl(a[0]) : ''; };
    return {
      featured,
      events: (ev.results || []).map((e) => ({ ...e, cover: e.cover ? imgUrl(e.cover) : '', spaceName: nm[e.code] || null })),
      crews: (cr.results || []).map((r) => ({ ...r, spaceName: nm[r.code] || null })),
      meetups: (mt.results || []).map((m) => ({ ...m, cover: m.cover ? imgUrl(m.cover) : '' })),
      reviews: (rv.results || []).map((p) => ({ id: p.id, title: p.title, excerpt: String(p.body).slice(0, 90), img: first(p.imgs), code: p.code, spaceName: nm[p.code] || null, rating: p.rating, verified: !!p.verified, likes: p.likes, created_at: p.created_at, author: { nick: dispNick(p.nick), avatar: p.avatar || '' } })),
      tips: (tp.results || []).map((p) => ({ id: p.id, title: p.title, excerpt: String(p.body).slice(0, 70), img: first(p.imgs), likes: p.likes, cmts: p.cmts, nick: dispNick(p.nick) })),
      notice: nt || null,
      partners: (pt.results || []).map((p) => ({ ...p, img: p.img ? imgUrl(p.img) : '' })),
    };
  });

  route('GET', '/api/partners', async (c) => {
    const rows = (await c.db.prepare(`SELECT id, name, cat, benefit, body, url, img, region, tier, code FROM partners WHERE active = 1 ORDER BY sort, id DESC LIMIT 200`).all()).results || [];
    return { items: rows.map((p) => ({ ...p, img: p.img ? imgUrl(p.img) : '' })) };
  });

  route('POST', '/api/contact', async (c) => {
    await c.limit('ct:' + (await c.ih()), 5, 3600, '문의는 1시간에 5번까지 보낼 수 있어요.');
    const b = await c.body();
    const kind = INQUIRY_KINDS[b.kind] ? b.kind : 'etc';
    const name = str(b.name, { max: 30, required: true, name: '이름' });
    const org = str(b.org, { max: 60, name: '회사·단체명' });
    const contact = str(b.contact, { max: 60, required: true, name: '연락처' });
    if (!/@/.test(contact) && !/\d{2,}[\d\s-]{6,}/.test(contact)) throw new HttpError(400, '답장받을 이메일이나 전화번호를 적어 주세요.');
    const body = str(b.body, { max: 3000, min: 10, required: true, multiline: true, name: '문의 내용' });
    if (!b.agree) throw new HttpError(400, '개인정보 수집·이용에 동의해 주세요.');
    await checkText(c.db, body);
    const u = await c.user();
    await c.db.prepare('INSERT INTO inquiries (kind, name, org, contact, body, status, uid, ih, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(kind, name, org || null, contact, body, 'new', u?.id || null, await c.ih(), nowIso()).run();
    return { ok: true };
  });

  /* ---------- 사진 ---------- */
  route('POST', '/api/upload', async (c) => {
    const u = await c.user();
    const adm = await c.adminLevel();
    if (!u && !adm) throw new HttpError(401, '로그인이 필요해요.', { needLogin: true });
    if (!c.env.PHOTOS) throw new HttpError(503, '사진 저장소(PHOTOS)가 아직 연결되지 않았어요. 관리자에게 알려 주세요.');
    await c.limit('up:' + (u ? u.id : 'adm'), adm ? 400 : 40, 3600, '사진을 너무 많이 올렸어요. 잠시 후 다시 해 주세요.');
    const ct = (c.req.headers.get('content-type') || '').split(';')[0].trim();
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[ct];
    if (!ext) throw new HttpError(400, '사진 파일(jpg, png, webp)만 올릴 수 있어요.');
    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.byteLength > 5 * 1024 * 1024) throw new HttpError(413, '사진이 너무 커요. 5MB 이하로 올려 주세요.');
    if (buf.byteLength < 64) throw new HttpError(400, '사진 파일이 비어 있어요.');
    const magic = {
      jpg: buf[0] === 0xff && buf[1] === 0xd8,
      png: buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
      gif: buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46,
      webp: buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45,
    }[ext];
    if (!magic) throw new HttpError(400, '사진 파일이 아닌 것 같아요.');
    const n = kstNow();
    const key = `u/${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, '0')}/${slug(16)}.${ext}`;
    await c.env.PHOTOS.put(key, buf, {
      httpMetadata: { contentType: ct, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { uid: String(u ? u.id : 'admin') },
    });
    return { ok: true, key, url: '/api/img/' + key };
  });

  route('GET', '/api/img/:key+', async (c) => {
    const key = c.params.key;
    if (!/^u\/\d{6}\/[A-Za-z0-9]{8,24}\.(jpg|png|webp|gif)$/.test(key)) throw new HttpError(404, '사진을 찾을 수 없어요.');
    if (!c.env.PHOTOS) throw new HttpError(404, '사진을 찾을 수 없어요.');
    const obj = await c.env.PHOTOS.get(key);
    if (!obj) throw new HttpError(404, '사진을 찾을 수 없어요.');
    return new Response(obj.body, {
      headers: {
        'content-type': obj.httpMetadata?.contentType || 'image/jpeg',
        'cache-control': 'public, max-age=31536000, immutable',
        etag: obj.httpEtag || '',
        'x-content-type-options': 'nosniff',
      },
    });
  });
}

export { maskPhones, getMeta };
