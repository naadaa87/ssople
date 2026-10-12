// 지점 — 목록·상세, 관리자 수정
import { HttpError, parseJSON, nowIso, str, int, url, isYmd } from './util.js';
import { seedOf } from './db.js';

let cache = null;
let cacheAt = 0;
export function invalidateSpaces() { cache = null; }

export async function loadSpaces(db, { all = false } = {}) {
  if (!cache || Date.now() - cacheAt > 60000) {
    const rows = (await db.prepare('SELECT code, name, region, area, visible, sort, data, updated_at FROM spaces ORDER BY sort, code').all()).results || [];
    cache = rows.map((r) => ({
      ...parseJSON(r.data, {}),
      code: r.code, name: r.name, region: r.region, area: r.area, visible: !!r.visible, sort: r.sort, updated_at: r.updated_at,
    }));
    cacheAt = Date.now();
  }
  return all ? cache : cache.filter((s) => s.visible);
}

export function photoUrl(p) {
  if (!p) return '';
  const k = typeof p === 'string' ? p : p.k;
  if (!k) return '';
  return /^https?:\/\//.test(k) ? k : '/api/img/' + k;
}

export function publicSpace(s) {
  const { aliases, visible, sort, edited, ...rest } = s;
  rest.photos = (s.photos || []).map(photoUrl).filter(Boolean);
  return rest;
}

/** 이름·코드·별칭으로 지점 찾기 (호스트 동기화·엑셀 업로드 공용) */
export function normName(s) {
  return String(s || '').toLowerCase().replace(/쏘플|파티룸|ssople|party\s?room|[\s_\-·.()[\]]/g, '');
}
export function makeResolver(spaces, aliasMap = {}) {
  const byCode = new Map();
  const byName = new Map();
  for (const s of spaces) {
    byCode.set(s.code, s.code);
    const n = normName(s.name);
    byName.set(n, s.code);
    if (s.short && !byName.has(normName(s.short))) byName.set(normName(s.short), s.code);
    if (s.area && s.short) byName.set(normName(s.area + s.short), s.code);
    for (const a of s.aliases || []) if (a) byName.set(normName(a), s.code);
  }
  for (const [label, code] of Object.entries(aliasMap || {})) if (byCode.has(code)) byName.set(normName(label), code);
  // 짧은 이름이 여러 지점에 겹치면(예: 플레이션) 자동 연결하지 않는다
  const shortCount = {};
  for (const s of spaces) { const k = normName(s.short); shortCount[k] = (shortCount[k] || 0) + 1; }
  for (const [k, n] of Object.entries(shortCount)) if (n > 1) byName.delete(k);

  return function resolve(label) {
    if (label == null) return null;
    const raw = String(label).trim();
    if (!raw) return null;
    const m = raw.match(/^S-?0*(\d{1,4})$/i);
    if (m) { const c = 'S-' + String(Number(m[1])).padStart(4, '0'); if (byCode.has(c)) return c; }
    const n = normName(raw);
    if (!n) return null;
    if (byName.has(n)) return byName.get(n);
    // 포함 관계로 하나만 걸리면 연결
    const hits = new Set();
    for (const [k, code] of byName) {
      if (k.length >= 3 && (n.includes(k) || k.includes(n))) hits.add(code);
    }
    return hits.size === 1 ? [...hits][0] : null;
  };
}

/* ---------------- 공개 API ---------------- */
export function register(route) {
  route('GET', '/api/spaces', async (c) => {
    const list = await loadSpaces(c.db);
    const stats = (await c.db.prepare(
      `SELECT code, COUNT(*) AS n, ROUND(AVG(rating), 1) AS avg FROM posts WHERE board = 'review' AND hidden = 0 AND code IS NOT NULL GROUP BY code`,
    ).all()).results || [];
    const rv = Object.fromEntries(stats.map((r) => [r.code, { n: r.n, avg: r.avg }]));
    return { spaces: list.map((s) => ({ ...publicSpace(s), reviews: rv[s.code] || { n: 0, avg: null } })) };
  });

  route('GET', '/api/spaces/:code', async (c) => {
    const list = await loadSpaces(c.db);
    const s = list.find((x) => x.code === c.params.code);
    if (!s) throw new HttpError(404, '지점을 찾을 수 없어요.');
    const rv = await c.db.prepare(
      `SELECT COUNT(*) AS n, ROUND(AVG(rating), 1) AS avg FROM posts WHERE board = 'review' AND hidden = 0 AND code = ?`,
    ).bind(s.code).first();
    const near = list
      .filter((x) => x.code !== s.code)
      .map((x) => ({ x, w: (x.area === s.area ? 0 : x.region === s.region ? 1 : 2) }))
      .sort((a, b) => a.w - b.w || a.x.sort - b.x.sort)
      .slice(0, 6)
      .map((o) => o.x.code);
    return { space: publicSpace(s), reviews: { n: rv?.n || 0, avg: rv?.avg ?? null }, near };
  });
}

/* ---------------- 관리자: 지점 수정 ---------------- */
const PKG_KEYS = ['day', 'night', 'allday', 'tonight', 'morning', 'hour3', 'full'];

export function cleanSpaceInput(b, prev = {}) {
  const out = { ...prev };
  if ('name' in b) out.name = str(b.name, { max: 40, required: true, name: '지점명' });
  if ('short' in b) out.short = str(b.short, { max: 30, name: '짧은 이름' }) || out.name;
  if ('region' in b) out.region = str(b.region, { max: 10, required: true, name: '권역' });
  if ('area' in b) out.area = str(b.area, { max: 20, required: true, name: '지역' });
  if ('addr' in b) out.addr = str(b.addr, { max: 120, name: '주소' });
  if ('base' in b) out.base = int(b.base, { min: 1, max: 200, def: null, name: '기준 인원' });
  if ('max' in b) out.max = int(b.max, { min: 1, max: 300, def: null, name: '최대 인원' });
  if ('addFeeLabel' in b) out.addFeeLabel = str(b.addFeeLabel, { max: 40, name: '인원 추가 요금' });
  if ('addFee' in b) out.addFee = int(b.addFee, { min: 0, max: 1000000, def: null, name: '인원 추가 요금(원)' });
  if ('depositLabel' in b) out.depositLabel = str(b.depositLabel, { max: 30, name: '보증금' });
  if ('place' in b) out.place = url(b.place, { name: '네이버 지도 주소' });
  if ('book' in b) out.book = url(b.book, { name: '네이버 예약 페이지 주소' });
  if ('intro' in b) out.intro = str(b.intro, { max: 1500, multiline: true, name: '소개' });
  if ('notice' in b) out.notice = str(b.notice, { max: 400, multiline: true, name: '지점 공지' });
  if ('tags' in b) out.tags = (Array.isArray(b.tags) ? b.tags : String(b.tags).split(',')).map((t) => str(t, { max: 12 })).filter(Boolean).slice(0, 12);
  if ('aliases' in b) out.aliases = (Array.isArray(b.aliases) ? b.aliases : String(b.aliases).split(',')).map((t) => str(t, { max: 40 })).filter(Boolean).slice(0, 10);
  if ('photos' in b) {
    if (!Array.isArray(b.photos)) throw new HttpError(400, '사진 목록 형식이 올바르지 않아요.');
    out.photos = b.photos.slice(0, 12).map((p) => {
      const k = typeof p === 'string' ? p : p && p.k;
      if (!k || !(/^u\/[\w/.-]+$/.test(k) || /^https:\/\//.test(k))) throw new HttpError(400, '사진 주소가 올바르지 않아요.');
      return { k };
    });
  }
  if ('pkgs' in b) {
    if (!Array.isArray(b.pkgs)) throw new HttpError(400, '패키지 형식이 올바르지 않아요.');
    out.pkgs = b.pkgs.slice(0, 8).map((p, i) => {
      const k = PKG_KEYS.includes(p.k) ? p.k : 'day';
      const s = int(p.s, { min: 0, max: 1440, def: 720, name: `${i + 1}번째 패키지 시작` });
      let e = int(p.e, { min: 0, max: 2880, def: 1020, name: `${i + 1}번째 패키지 종료` });
      if (e <= s) e += 1440;
      if (e - s > 1440) throw new HttpError(400, '패키지 이용 시간은 24시간을 넘을 수 없어요.');
      const prices = (Array.isArray(p.p) ? p.p : []).slice(0, 4).map((x) => (x === '' || x == null ? null : int(x, { min: 0, max: 10000000, name: '요금' })));
      while (prices.length < 4) prices.push(null);
      return {
        k, label: str(p.label, { max: 12, name: '패키지 이름' }) || k,
        fam: s >= 1020 ? 'night' : 'day', s, e, hrs: hrsLabel(s, e), hd: false,
        p: prices, url: url(p.url, { name: '네이버 예약 주소' }),
      };
    });
  }
  if ('feat' in b && b.feat && typeof b.feat === 'object') {
    const f = { ...(prev.feat || {}) };
    for (const k of ['karaoke', 'bbq', 'pet']) {
      if (b.feat[k]) f[k] = { on: !!b.feat[k].on, note: str(b.feat[k].note, { max: 80 }) };
    }
    for (const k of ['tv', 'console', 'projector', 'fridge', 'heating']) if (k in b.feat) f[k] = !!b.feat[k];
    if ('elevator' in b.feat) f.elevator = b.feat.elevator === null || b.feat.elevator === '' ? null : !!b.feat.elevator;
    for (const k of ['aircon', 'cook', 'floor', 'floorNote', 'toilet']) if (k in b.feat) f[k] = str(b.feat[k], { max: 60 }) || null;
    if ('games' in b.feat) f.games = (Array.isArray(b.feat.games) ? b.feat.games : String(b.feat.games).split(',')).map((x) => str(x, { max: 20 })).filter(Boolean).slice(0, 30);
    if ('zones' in b.feat) f.zones = (Array.isArray(b.feat.zones) ? b.feat.zones : String(b.feat.zones).split(',')).map((x) => str(x, { max: 12 })).filter(Boolean).slice(0, 8);
    out.feat = f;
  }
  if ('info' in b && b.info && typeof b.info === 'object') {
    const inf = { ...(prev.info || {}) };
    for (const k of ['size', 'sameday', 'tour', 'minors', 'noise', 'parking', 'route']) {
      if (k in b.info) inf[k] = str(b.info[k], { max: 300, multiline: true }) || null;
    }
    out.info = inf;
  }
  return out;
}

export function hrsLabel(s, e) {
  const a = Math.floor(s / 60), am = s % 60;
  const bAbs = Math.floor(e / 60), bm = e % 60;
  const t = (h, m) => (m ? `${h}:${String(m).padStart(2, '0')}` : `${h}`);
  if (e > 1440) return `${t(a, am)}시~익일 ${t(bAbs - 24, bm)}시`;
  return `${t(a, am)}~${t(bAbs, bm)}시`;
}

export async function saveSpace(db, code, data, { visible, sort } = {}) {
  const { code: _c, visible: _v, sort: _s, updated_at: _u, ...rest } = data;
  await db.prepare(
    `INSERT INTO spaces (code, name, region, area, visible, sort, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, region = excluded.region, area = excluded.area,
       visible = excluded.visible, sort = excluded.sort, data = excluded.data, updated_at = excluded.updated_at`,
  ).bind(code, rest.name, rest.region, rest.area, visible ? 1 : 0, sort || 0, JSON.stringify(rest), nowIso()).run();
  invalidateSpaces();
}

export function registerAdmin(route) {
  route('GET', '/api/admin/spaces', async (c) => {
    await c.needAdmin();
    const list = await loadSpaces(c.db, { all: true });
    return { spaces: list.map((s) => ({ ...s, photoUrls: (s.photos || []).map(photoUrl) })) };
  });

  route('PUT', '/api/admin/spaces/:code', async (c) => {
    await c.needAdmin('staff');
    const b = await c.body();
    const list = await loadSpaces(c.db, { all: true });
    const prev = list.find((s) => s.code === c.params.code);
    if (!prev) throw new HttpError(404, '지점을 찾을 수 없어요.');
    const next = cleanSpaceInput(b, prev);
    next.edited = true;   // 지점 기본 데이터가 새 판으로 바뀌어도 관리자가 고친 값은 남긴다
    const visible = 'visible' in b ? !!b.visible : prev.visible;
    const sort = 'sort' in b ? int(b.sort, { min: 0, max: 9999, def: prev.sort }) : prev.sort;
    await saveSpace(c.db, prev.code, next, { visible, sort });
    return { ok: true };
  });

  route('POST', '/api/admin/spaces', async (c) => {
    await c.needAdmin('admin');
    const b = await c.body();
    const list = await loadSpaces(c.db, { all: true });
    const max = list.reduce((m, s) => Math.max(m, Number(String(s.code).slice(2)) || 0), 0);
    const code = 'S-' + String(max + 1).padStart(4, '0');
    const base = {
      name: '', short: '', region: '서울', area: '', addr: '', base: 4, max: 10, addFee: 10000, addFeeLabel: '1인당 1만원',
      deposit: 80000, depositLabel: '8만원', place: '', pkgs: [], feat: { karaoke: { on: false, note: '' }, bbq: { on: false, note: '' }, pet: { on: false, note: '' }, zones: [], games: [] },
      info: {}, tags: [], intro: '', notice: '', photos: [], aliases: [],
    };
    const next = cleanSpaceInput({ ...b }, base);
    next.edited = true;
    if (!next.name || !next.area) throw new HttpError(400, '지점명과 지역은 꼭 입력해 주세요.');
    next.short = next.short || next.name;
    await saveSpace(c.db, code, next, { visible: false, sort: max + 1 });
    return { ok: true, code };
  });

  route('POST', '/api/admin/spaces/:code/reset', async (c) => {
    await c.needAdmin('admin');
    const seed = seedOf(c.params.code);
    if (!seed) throw new HttpError(404, '처음 데이터가 없는 지점이에요.');
    const list = await loadSpaces(c.db, { all: true });
    const prev = list.find((s) => s.code === c.params.code) || {};
    const { code, sort, visible, ...rest } = seed;
    rest.photos = prev.photos || [];
    rest.intro = prev.intro || '';
    rest.notice = prev.notice || rest.notice || '';
    rest.aliases = (prev.aliases && prev.aliases.length) ? prev.aliases : (rest.aliases || []);   // 호스트 지점 이름 짝은 지키기
    await saveSpace(c.db, code, rest, { visible: prev.visible !== false, sort: prev.sort ?? sort });
    return { ok: true };
  });
}

export { isYmd };
