// 지점 — 목록·상세, 관리자 수정
import { HttpError, parseJSON, nowIso, str, int, url, isYmd, maskPhones, shuffle, oneOf, todayKST } from './util.js';
import { seedOf, notiStmt, notiManyStmt, getSettings } from './db.js';
import { regionPath, areaPath } from './slugs.js';

let cache = null;
let cacheAt = 0;
export function invalidateSpaces() { cache = null; }

/** 지점 사진 최대 장수 (아임웹 게시물 사진이 가장 많은 지점이 30장) */
export const PHOTO_MAX = 40;

export async function loadSpaces(db, { all = false } = {}) {
  if (!cache || Date.now() - cacheAt > 60000) {
    const rows = (await db.prepare('SELECT code, name, region, area, visible, sort, data, updated_at FROM spaces ORDER BY sort, code').all()).results || [];
    cache = rows.map((r) => ({
      ...parseJSON(r.data, {}),
      code: r.code, name: r.name, region: r.region, area: r.area, visible: !!r.visible, sort: r.sort, updated_at: r.updated_at,
    }));
    cacheAt = Date.now();
  }
  // 손님 화면 — 공개 지점 중 호스트가 「잠시 쉬기」로 둔 지점은 뺀다
  return all ? cache : cache.filter((s) => s.visible && !s.hostPaused);
}

export function photoUrl(p) {
  if (!p) return '';
  const k = typeof p === 'string' ? p : p.k;
  if (!k) return '';
  return /^https?:\/\//.test(k) ? k : '/api/img/' + k;
}

export function publicSpace(s) {
  const { aliases, visible, sort, edited, photoSrc, ...rest } = s;
  rest.photos = (s.photos || []).map(photoUrl).filter(Boolean);
  // 지역·동네 화면 주소 — 화면 스크립트가 한글 주소(/area/건대) 대신 정식 주소(/area/gundae)로 연결하게
  rest.rp = regionPath(s.region);
  rest.ap = areaPath(s.area);
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
    // 근처 지점 — 같은 동네 → 같은 권역 순, 같은 묶음 안에서는 랜덤
    const near = shuffle(list)
      .filter((x) => x.code !== s.code)
      .map((x) => ({ x, w: (x.area === s.area ? 0 : x.region === s.region ? 1 : 2) }))
      .sort((a, b) => a.w - b.w)
      .slice(0, 6)
      .map((o) => o.x.code);
    return { space: publicSpace(s), reviews: { n: rv?.n || 0, avg: rv?.avg ?? null }, near };
  });
}

/* ---------------- 호스트 센터: 내 지점 보기·고치기 ---------------- */
/** 호스트가 고치면 운영팀이 꼭 봐야 하는 칸 — 손님이 예약·방문할 때 바로 쓰는 정보 */
const IMPORTANT_FIELDS = new Set(['booking', 'book', 'pkgs', 'hourly', 'addr', 'place', 'hostPaused', 'hostBiz', 'base', 'max']);
export const FIELD_LABEL = {
  intro: '소개', notice: '지점 공지', detail: '공간 상세', care: '이용 안내', facs: '시설 목록', tags: '태그', photos: '사진', feat: '시설', info: '이용 정보',
  addFeeLabel: '인원 추가 요금', depositLabel: '보증금', place: '네이버 지도', items: '비품', social: 'SNS·후기', pkgs: '패키지 요금', book: '네이버 예약 페이지',
  base: '기준 인원', max: '최대 인원', addFee: '인원 추가 요금(원)', booking: '예약 방식', hourly: '시간제 요금', addr: '주소', hostPaused: '노출 잠시 쉬기', hostBiz: '사업자 정보',
};
async function ownSpace(c, code, { own = false } = {}) {
  const u = await c.needUser();
  const codes = hostCodes(u);
  const adm = u.role === 'admin' || u.role === 'staff';
  if (!adm && !codes.includes(code)) throw new HttpError(403, '이 지점을 볼 권한이 없어요.');
  const s = (await loadSpaces(c.db, { all: true })).find((x) => x.code === code);
  if (!s) throw new HttpError(404, '지점을 찾을 수 없어요.');
  if (own && !adm && !(s.listing && s.listing.type === 'host')) throw new HttpError(403, '호스트가 직접 운영하는 지점만 쓸 수 있어요. 쏘플 위탁운영 지점은 운영팀이 관리해요.');
  return { u, s, adm };
}
export function registerHost(route) {
  route('GET', '/api/host/spaces', async (c) => {
    const u = await c.needUser();
    const codes = hostCodes(u);
    if (!codes.length && u.role !== 'admin' && u.role !== 'staff') throw new HttpError(403, '호스트 권한이 있는 회원만 쓸 수 있어요. 관리자에게 지점 연결을 요청해 주세요.');
    const list = await loadSpaces(c.db, { all: true });
    const mine = codes.length ? list.filter((s) => codes.includes(s.code)) : list;
    return { spaces: mine.map((s) => ({ ...s, photoUrls: (s.photos || []).map(photoUrl) })) };
  });
  route('PUT', '/api/host/spaces/:code', async (c) => {
    const u = await c.needUser();
    const codes = hostCodes(u);
    const adm = u.role === 'admin' || u.role === 'staff';
    if (!adm && !codes.includes(c.params.code)) throw new HttpError(403, '이 지점을 고칠 권한이 없어요.');
    await c.limit('he:' + u.id, 60, 3600, '저장을 너무 자주 했어요. 잠시 후 다시 해 주세요.');
    const b = await c.body();
    const list = await loadSpaces(c.db, { all: true });
    const prev = list.find((s) => s.code === c.params.code);
    if (!prev) throw new HttpError(404, '지점을 찾을 수 없어요.');
    const next = cleanHostInput(b, prev);
    const changed = Object.keys(FIELD_LABEL).filter((k) => k in b && JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null));
    next.edited = true;
    next.hostEditedAt = nowIso();
    await saveSpace(c.db, prev.code, next, { visible: prev.visible, sort: prev.sort });
    if (changed.length) {
      c.wait(c.db.prepare('INSERT INTO host_edits (code, uid, nick, fields, important, at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(prev.code, u.id, u.nick || '', changed.join(','), changed.some((k) => IMPORTANT_FIELDS.has(k)) ? 1 : 0, nowIso()).run().catch(() => {}));
    }
    return { ok: true, changed };
  });
  /* 내 지점 성과 — 지점 화면을 본 수, 예약 버튼을 누른 수(방식별), 문의·후기 (개인 정보 없이 숫자만) */
  route('GET', '/api/host/stats', async (c) => {
    const code = String(c.q.get('code') || '');
    await ownSpace(c, code);
    const days = int(c.q.get('days'), { min: 7, max: 90, def: 30 });
    const from = addDaysYmd(todayKST(), -(days - 1));
    const rows = (await c.db.prepare(
      `SELECT substr(datetime(at, '+9 hours'), 1, 10) AS d, kind, COUNT(*) AS n FROM clicks WHERE code = ? AND at >= ? GROUP BY d, kind`,
    ).bind(code, new Date(Date.parse(from + 'T00:00:00+09:00')).toISOString()).all()).results || [];
    const [qna, open, rv] = await Promise.all([
      c.db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE board = 'qna' AND hidden = 0 AND code = ? AND created_at >= ?`).bind(code, from).first(),
      c.db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE board = 'qna' AND hidden = 0 AND code = ? AND answered = 0`).bind(code).first(),
      c.db.prepare(`SELECT COUNT(*) AS n, ROUND(AVG(rating), 1) AS avg FROM posts WHERE board = 'review' AND hidden = 0 AND code = ?`).bind(code).first(),
    ]);
    const daily = {};
    const kinds = {};
    for (const r of rows) {
      const k = r.kind === 'view' ? 'view' : r.kind === 'share' ? 'share' : 'book';
      (daily[r.d] = daily[r.d] || { view: 0, book: 0, share: 0 })[k] += r.n;
      if (r.kind !== 'view') kinds[r.kind] = (kinds[r.kind] || 0) + r.n;
    }
    const series = [];
    for (let i = 0; i < days; i++) { const d = addDaysYmd(from, i); series.push({ d, ...(daily[d] || { view: 0, book: 0, share: 0 }) }); }
    const sum = (k) => series.reduce((a, x) => a + x[k], 0);
    return { code, days, from, series, total: { view: sum('view'), book: sum('book'), share: sum('share') }, kinds, qna: qna?.n || 0, qnaOpen: open?.n || 0, reviews: { n: rv?.n || 0, avg: rv?.avg ?? null } };
  });
}

/* ---------------- 호스트센터: 공간 등록 신청 (작성 중 → 검수 중 → 승인·반려) ---------------- */
export const APP_STATUS = { draft: '작성 중', submitted: '검수 중', approved: '승인', rejected: '반려' };
export const APP_PLANS = { 1: '1개월', 3: '3개월', 6: '6개월', 12: '12개월', ask: '상담 뒤 결정' };
/** 신청서에 들어가는 지점 정보 — 지점 data 와 같은 칸만 (이름·주소·인원은 신청서에서만 적고, 승인 뒤엔 운영팀이 고쳐요) */
const APP_FIELDS = ['name', 'region', 'area', 'addr', 'base', 'max', 'addFee', 'addFeeLabel', 'depositLabel', 'place', 'intro', 'detail', 'care', 'facs', 'tags', 'photos', 'feat', 'info', 'items', 'pkgs', 'hourly', 'booking', 'hostBiz'];
const APP_MAX = 5;
const LINK_MAX = 3;
export function cleanAppData(b, prev = {}) {
  const picked = {};
  for (const k of Object.keys(b || {})) if (APP_FIELDS.includes(k)) picked[k] = b[k];
  const out = cleanSpaceInput(picked, prev);
  if ('hostName' in b) out.hostName = str(b.hostName, { max: 30, name: '호스트 표시 이름' });
  if ('biz' in b) out.biz = oneOf(b.biz, ['yes', 'no'], '');
  if ('plan' in b) out.plan = APP_PLANS[b.plan] ? String(b.plan) : '';
  if ('agree' in b) { out.agree = !!b.agree; out.agreedAt = b.agree ? (prev.agreedAt || nowIso()) : null; }
  return out;
}
/** 제출 전 꼭 있어야 하는 것 — 빠진 항목 목록(비면 제출 가능) */
export function appMissing(d, contact) {
  const miss = [];
  if (!d.name) miss.push('공간 이름');
  if (!d.region || !d.area) miss.push('지역·동네');
  if (!d.addr) miss.push('주소');
  if (!d.base || !d.max) miss.push('기준·최대 인원');
  else if (d.max < d.base) miss.push('최대 인원은 기준 인원보다 많게');
  if (!(d.photos || []).length) miss.push('사진 1장 이상');
  if (!d.intro || d.intro.trim().length < 20) miss.push('소개 20자 이상');
  const hasPkg = (d.pkgs || []).some((p) => (p.p || []).some(Boolean));
  const hasHour = d.hourly && (d.hourly.p || []).some(Boolean);
  if (!hasPkg && !hasHour) miss.push('요금 (시간제 또는 패키지)');
  if (!((d.booking || {}).ways || []).length) miss.push('예약 방식 1개 이상');
  if (!d.plan) miss.push('희망 이용 기간');
  if (!contact) miss.push('운영팀 연락처');
  if (!d.agree) miss.push('등록 안내 동의');
  return miss;
}
const cleanRef = (v) => String(v || '').trim().slice(0, 60).replace(/[^\w.\-:/가-힣 ]/g, '');
const kindOf = (r) => (r.kind === 'link' ? 'link' : 'new');
function appRow(r) {
  const data = parseJSON(r.data, {});
  return {
    id: r.id, kind: kindOf(r), status: r.status, step: r.step, name: r.name, region: r.region, area: r.area, contact: r.contact || '', note: r.note || '', code: r.code || null,
    created_at: r.created_at, updated_at: r.updated_at, submitted_at: r.submitted_at, decided_at: r.decided_at,
    data, photoUrls: (data.photos || []).map(photoUrl),
  };
}
async function myApp(c, id) {
  const u = await c.needUser();
  const r = await c.db.prepare('SELECT * FROM space_apps WHERE id = ? AND uid = ?').bind(int(id, { min: 1 }), u.id).first();
  if (!r) throw new HttpError(404, '신청서를 찾을 수 없어요.');
  return { u, r };
}
/** 운영진(관리자·스태프 회원)에게 알림 — 대표 관리자 비밀번호로만 들어오는 경우엔 관리자 화면 숫자로 확인해요 */
async function notifyStaff(c, text, link) {
  try {
    const ids = ((await c.db.prepare(`SELECT id FROM users WHERE role IN ('admin', 'staff') AND status = 'active' LIMIT 30`).all()).results || []).map((x) => x.id);
    const st = notiManyStmt(c.db, ids, 'admin', text, link);
    if (st) await st.run();
  } catch { /* 알림은 실패해도 신청은 그대로 */ }
}
const addDaysYmd = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** 오늘부터 N개월 노출 — 마지막 날 (예: 10/30 + 1개월 → 11/29) */
export function untilAfter(from, months) {
  const [y, m, d] = from.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return addDaysYmd(t.toISOString().slice(0, 10), -1);
}
export function registerApps(route) {
  route('GET', '/api/host/apps', async (c) => {
    const u = await c.needUser();
    const rows = (await c.db.prepare('SELECT * FROM space_apps WHERE uid = ? ORDER BY id DESC LIMIT 30').bind(u.id).all()).results || [];
    const st = await getSettings(c.db);
    const apps = rows.map(appRow);
    // 결제·연장 안내 — 승인된 신청서가 있거나 이미 지점이 연결된 호스트에게만
    const showPay = apps.some((a) => a.status === 'approved') || hostCodes(u).length > 0;
    return { apps, max: APP_MAX, open: st['host.apply_open'] !== '0', payNote: showPay ? (st['host.pay_note'] || '') : '' };
  });
  route('POST', '/api/host/apps', async (c) => {
    const u = await c.needUser();
    const st = await getSettings(c.db);
    if (st['host.apply_open'] === '0') throw new HttpError(403, '지금은 새 공간 등록 신청을 잠시 받지 않고 있어요. 쏘플 카카오톡 채널로 문의해 주세요.');
    await c.limit('ha:' + u.id, 10, 3600, '신청서를 너무 자주 만들었어요. 잠시 후 다시 해 주세요.');
    const n = await c.db.prepare(`SELECT COUNT(*) AS n FROM space_apps WHERE uid = ? AND kind = 'new' AND status IN ('draft', 'submitted', 'rejected')`).bind(u.id).first();
    if ((n?.n || 0) >= APP_MAX) throw new HttpError(400, `진행 중인 신청서는 ${APP_MAX}개까지만 둘 수 있어요. 쓰지 않는 신청서를 지워 주세요.`);
    const b = await c.body();
    const base = { base: 4, max: 10, addFeeLabel: '', depositLabel: '', pkgs: [], photos: [], tags: [], feat: { karaoke: { on: false, note: '' }, bbq: { on: false, note: '' }, pet: { on: false, note: '' }, zones: [], games: [] }, info: {}, hourly: null, booking: { ways: [], confirm: '', cancel: '', hours: '' }, plan: '' };
    const data = cleanAppData(b.data || {}, base);
    if (b.ref) data.ref = cleanRef(b.ref);
    // 여러 공간을 운영하는 호스트 — 내 다른 신청서·지점에서 공통 정보를 불러와 시작
    if (b.copyFrom) {
      const src = await c.db.prepare('SELECT data FROM space_apps WHERE id = ? AND uid = ?').bind(int(b.copyFrom, { min: 1 }), u.id).first();
      if (src) {
        const sd = parseJSON(src.data, {});
        for (const k of ['region', 'area', 'addr', 'booking', 'care', 'hostName', 'biz', 'hostBiz', 'addFeeLabel', 'addFee', 'depositLabel', 'place', 'info']) if (sd[k] != null) data[k] = sd[k];
        data.name = sd.name ? sd.name + ' (사본)' : '';
      }
    }
    const at = nowIso();
    const r = await c.db.prepare(`INSERT INTO space_apps (uid, kind, status, step, name, region, area, data, created_at, updated_at) VALUES (?, 'new', ?, 1, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(u.id, 'draft', data.name || null, data.region || null, data.area || null, JSON.stringify(data), at, at).first();
    return { ok: true, id: r.id };
  });
  route('PUT', '/api/host/apps/:id', async (c) => {
    const { r } = await myApp(c, c.params.id);
    if (kindOf(r) === 'link') throw new HttpError(400, '지점 연결 요청은 고칠 수 없어요. 지우고 다시 보내 주세요.');
    if (r.status === 'submitted') throw new HttpError(400, '검수 중인 신청서는 고칠 수 없어요. 먼저 「검수 취소」를 눌러 주세요.');
    if (r.status === 'approved') throw new HttpError(400, '승인된 신청서는 고칠 수 없어요. 내 지점 카드에서 고쳐 주세요.');
    const b = await c.body();
    const prev = parseJSON(r.data, {});
    const data = b.data && typeof b.data === 'object' ? cleanAppData(b.data, prev) : prev;
    const step = int(b.step, { min: 1, max: 6, def: r.step });
    let contact = r.contact;
    if ('contact' in b) {
      contact = str(b.contact, { max: 60, name: '연락처' });
      if (contact && !(/@/.test(contact) || /\d{3}[\s.-]?\d{3,4}[\s.-]?\d{4}/.test(contact))) throw new HttpError(400, '연락처는 전화번호나 이메일로 적어 주세요.');
    }
    await c.db.prepare('UPDATE space_apps SET step = ?, name = ?, region = ?, area = ?, data = ?, contact = ?, updated_at = ? WHERE id = ?')
      .bind(step, data.name || null, data.region || null, data.area || null, JSON.stringify(data), contact || null, nowIso(), r.id).run();
    return { ok: true, missing: appMissing(data, contact) };
  });
  route('POST', '/api/host/apps/:id/submit', async (c) => {
    const { u, r } = await myApp(c, c.params.id);
    if (r.status === 'submitted') return { ok: true, status: 'submitted' };
    if (r.status === 'approved') throw new HttpError(400, '이미 승인된 신청서예요.');
    const data = parseJSON(r.data, {});
    const miss = appMissing(data, r.contact);
    if (miss.length) throw new HttpError(400, '아직 빠진 항목이 있어요: ' + miss.join(', '), { missing: miss });
    const at = nowIso();
    await c.db.prepare(`UPDATE space_apps SET status = 'submitted', note = NULL, submitted_at = ?, updated_at = ? WHERE id = ?`).bind(at, at, r.id).run();
    c.wait(notiStmt(c.db, u.id, 'host', `「${data.name}」 공간 등록 신청을 받았어요. 운영팀이 확인한 뒤 알려 드릴게요.`, '/myspace').run().catch(() => {}));
    c.wait(notifyStaff(c, `새 공간 등록 신청 — 「${data.name}」 (${[data.region, data.area].filter(Boolean).join(' ')})`, '/admin#apps'));
    return { ok: true, status: 'submitted' };
  });
  route('POST', '/api/host/apps/:id/withdraw', async (c) => {
    const { r } = await myApp(c, c.params.id);
    if (r.status !== 'submitted') throw new HttpError(400, '검수 중인 신청서만 되돌릴 수 있어요.');
    if (kindOf(r) === 'link') { await c.db.prepare('DELETE FROM space_apps WHERE id = ?').bind(r.id).run(); return { ok: true, status: 'deleted' }; }
    await c.db.prepare(`UPDATE space_apps SET status = 'draft', submitted_at = NULL, updated_at = ? WHERE id = ?`).bind(nowIso(), r.id).run();
    return { ok: true, status: 'draft' };
  });
  route('DELETE', '/api/host/apps/:id', async (c) => {
    const { r } = await myApp(c, c.params.id);
    if (r.status === 'approved') throw new HttpError(400, '승인된 신청서는 지울 수 없어요.');
    await c.db.prepare('DELETE FROM space_apps WHERE id = ?').bind(r.id).run();
    return { ok: true };
  });
  /* 이미 쏘플에서 운영 중인 지점의 점주·매니저 — 내 계정에 지점 연결 요청 (운영팀 확인 뒤 연결) */
  route('POST', '/api/host/links', async (c) => {
    const u = await c.needUser();
    await c.limit('hl:' + u.id, 10, 3600, '요청을 너무 자주 보냈어요. 잠시 후 다시 해 주세요.');
    const b = await c.body();
    const all = await loadSpaces(c.db, { all: true });
    const have = hostCodes(u);
    const codes = [...new Set((Array.isArray(b.codes) ? b.codes : []).map((x) => String(x).trim().toUpperCase()))]
      .filter((x) => /^S-\d{4}$/.test(x) && all.some((s) => s.code === x) && !have.includes(x)).slice(0, 10);
    if (!codes.length) throw new HttpError(400, '연결할 지점을 골라 주세요. 이미 연결된 지점은 다시 고를 수 없어요.');
    const role = oneOf(b.role, ['owner', 'manager', 'staff'], 'owner');
    const contact = str(b.contact, { max: 60, required: true, name: '연락처' });
    if (!(/@/.test(contact) || /\d{3}[\s.-]?\d{3,4}[\s.-]?\d{4}/.test(contact))) throw new HttpError(400, '연락처는 전화번호나 이메일로 적어 주세요.');
    const note = maskPhones(str(b.note, { max: 400, multiline: true }) || '');
    const n = await c.db.prepare(`SELECT COUNT(*) AS n FROM space_apps WHERE uid = ? AND kind = 'link' AND status = 'submitted'`).bind(u.id).first();
    if ((n?.n || 0) >= LINK_MAX) throw new HttpError(400, '확인 중인 연결 요청이 이미 있어요. 운영팀이 확인할 때까지 조금만 기다려 주세요.');
    const first = all.find((s) => s.code === codes[0]);
    const name = first.name + (codes.length > 1 ? ` 외 ${codes.length - 1}곳` : '');
    const data = { codes, names: codes.map((x) => (all.find((s) => s.code === x) || {}).name || x), role, note };
    if (b.ref) data.ref = cleanRef(b.ref);
    const at = nowIso();
    const r = await c.db.prepare(`INSERT INTO space_apps (uid, kind, status, step, name, region, area, data, contact, created_at, updated_at, submitted_at) VALUES (?, 'link', 'submitted', 6, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(u.id, name, first.region, first.area, JSON.stringify(data), contact, at, at, at).first();
    c.wait(notifyStaff(c, `지점 연결 요청 — ${u.nick} 님 → 「${name}」`, '/admin#apps'));
    return { ok: true, id: r.id };
  });

  /* ---- 관리자: 검수 · 승인 · 반려 ---- */
  route('GET', '/api/admin/apps', async (c) => {
    await c.needAdmin();
    const st = c.q.get('status') || 'submitted';
    const where = st === 'all' ? '' : 'WHERE a.status = ?';
    const rows = (await c.db.prepare(`SELECT a.*, u.nick, u.email, u.host_codes FROM space_apps a LEFT JOIN users u ON u.id = a.uid ${where} ORDER BY CASE a.status WHEN 'submitted' THEN 0 ELSE 1 END, a.updated_at DESC LIMIT 100`)
      .bind(...(st === 'all' ? [] : [st])).all()).results || [];
    return { items: rows.map((r) => ({ ...appRow(r), uid: r.uid, memo: r.memo || '', nick: r.nick || '탈퇴한 회원', email: r.email || '', userCodes: hostCodes(r) })) };
  });
  route('POST', '/api/admin/apps/:id', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    await c.db.prepare('UPDATE space_apps SET memo = ? WHERE id = ?').bind(str(b.memo, { max: 1000, multiline: true }) || null, int(c.params.id, { min: 1 })).run();
    return { ok: true };
  });
  route('POST', '/api/admin/apps/:id/reject', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const r = await c.db.prepare('SELECT * FROM space_apps WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!r) throw new HttpError(404, '신청서를 찾을 수 없어요.');
    if (r.status === 'approved') throw new HttpError(400, '이미 승인된 신청서예요.');
    const note = str(b.note, { max: 600, multiline: true, required: true, name: '보완 요청 내용' });
    const at = nowIso();
    const link = kindOf(r) === 'link';
    await c.db.batch([
      c.db.prepare(`UPDATE space_apps SET status = 'rejected', note = ?, decided_at = ?, updated_at = ? WHERE id = ?`).bind(note, at, at, r.id),
      notiStmt(c.db, r.uid, 'host', link ? `「${r.name || '지점'}」 연결 요청을 확인하지 못했어요. 내 공간 관리에서 사유를 확인해 주세요.` : `「${r.name || '공간'}」 등록 신청에 보완 요청이 왔어요. 내용을 고쳐 다시 제출해 주세요.`, '/myspace'),
    ]);
    return { ok: true };
  });
  route('POST', '/api/admin/apps/:id/approve', async (c) => {
    await c.needAdmin('admin');   // 호스트 계정에 지점을 연결하는 일이라 대표 관리자만
    const b = await c.body();
    const r = await c.db.prepare('SELECT * FROM space_apps WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!r) throw new HttpError(404, '신청서를 찾을 수 없어요.');
    if (r.status === 'approved') throw new HttpError(400, '이미 승인된 신청서예요.');
    const d = parseJSON(r.data, {});
    const u = await c.db.prepare('SELECT * FROM users WHERE id = ?').bind(r.uid).first();
    const at = nowIso();
    if (kindOf(r) === 'link') {
      if (!u || u.status !== 'active') throw new HttpError(400, '요청한 회원 계정을 찾을 수 없어요.');
      const all = await loadSpaces(c.db, { all: true });
      const pick = (Array.isArray(b.codes) && b.codes.length ? b.codes : d.codes || []).map((x) => String(x).toUpperCase()).filter((x) => all.some((s) => s.code === x));
      if (!pick.length) throw new HttpError(400, '연결할 지점을 하나 이상 골라 주세요.');
      const codes = [...new Set(hostCodes(u).concat(pick))].slice(0, 30);
      await c.db.batch([
        c.db.prepare(`UPDATE space_apps SET status = 'approved', code = ?, note = NULL, decided_at = ?, updated_at = ? WHERE id = ?`).bind(pick.join(','), at, at, r.id),
        c.db.prepare(`UPDATE users SET host_codes = ?, role = CASE WHEN role = 'member' THEN 'host' ELSE role END WHERE id = ?`).bind(JSON.stringify(codes), u.id),
        notiStmt(c.db, u.id, 'host', `지점 연결이 끝났어요. 이제 내 공간 관리에서 「${r.name}」을 관리할 수 있어요.`, '/myspace'),
      ]);
      return { ok: true, codes: pick };
    }
    const miss = appMissing(d, r.contact);
    if (miss.length) throw new HttpError(400, '신청서에 빠진 항목이 있어요: ' + miss.join(', '));
    const { hostName, biz, agree, agreedAt, plan, ref, ...spaceData } = d;
    const list = await loadSpaces(c.db, { all: true });
    const max = list.reduce((m, s) => Math.max(m, Number(String(s.code).slice(2)) || 0), 0);
    const code = 'S-' + String(max + 1).padStart(4, '0');
    const base = { name: '', short: '', region: '서울', area: '', addr: '', base: 4, max: 10, addFee: null, addFeeLabel: '', deposit: null, depositLabel: '', place: '', pkgs: [], feat: {}, info: {}, tags: [], intro: '', notice: '', photos: [], aliases: [] };
    const next = cleanSpaceInput({ ...spaceData, ...(b.name ? { name: b.name } : {}), ...(b.region ? { region: b.region } : {}), ...(b.area ? { area: b.area } : {}) }, base);
    next.short = next.short || next.name;
    // 노출 끝 날짜 — 관리자가 적은 날짜, 없으면 고른 이용 기간으로 (오늘부터)
    let until = /^\d{4}-\d{2}-\d{2}$/.test(String(b.until || '')) ? b.until : '';
    if (!until && APP_PLANS[plan] && plan !== 'ask' && b.autoUntil !== false) until = untilAfter(todayKST(), Number(plan));
    next.listing = { type: 'host', zone: '', until, hostName: hostName || '', plan: plan || '', since: todayKST() };
    if (biz !== 'yes') delete next.hostBiz;
    next.edited = true;
    next.hostEditedAt = nowIso();
    const codes = u ? hostCodes(u) : [];
    if (u && !codes.includes(code)) codes.push(code);
    await saveSpace(c.db, code, next, { visible: !!b.visible, sort: max + 1 });
    const stmts = [c.db.prepare(`UPDATE space_apps SET status = 'approved', code = ?, note = NULL, decided_at = ?, updated_at = ? WHERE id = ?`).bind(code, at, at, r.id)];
    if (u) {
      stmts.push(c.db.prepare(`UPDATE users SET host_codes = ?, role = CASE WHEN role = 'member' THEN 'host' ELSE role END WHERE id = ?`).bind(JSON.stringify(codes), u.id));
      stmts.push(notiStmt(c.db, u.id, 'host', `「${next.name}」 공간 등록이 승인됐어요. ${b.visible ? '손님 화면에 바로 보여요.' : '내용을 다듬으면 운영팀이 공개해 드려요.'} 결제·노출 기간 안내는 내 공간 관리에서 확인해 주세요.`, '/myspace'));
    }
    await c.db.batch(stmts);
    return { ok: true, code, until };
  });
  /* 호스트가 고친 기록 — 예약 링크·요금·주소처럼 손님에게 중요한 칸은 따로 표시 */
  route('GET', '/api/admin/host-edits', async (c) => {
    await c.needAdmin();
    const only = c.q.get('important') === '1';
    const rows = (await c.db.prepare(`SELECT id, code, uid, nick, fields, important, at FROM host_edits ${only ? 'WHERE important = 1' : ''} ORDER BY id DESC LIMIT 150`).all()).results || [];
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    return { items: rows.map((r) => ({ ...r, spaceName: nm[r.code] || r.code, labels: String(r.fields || '').split(',').filter(Boolean).map((k) => FIELD_LABEL[k] || k) })) };
  });
}

export function hostCodes(u) {
  if (!u) return [];
  const v = u.host_codes ?? u.hostCodes;
  if (!v) return [];
  try { const arr = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(arr) ? arr.filter((x) => /^S-\d{4}$/.test(x)) : []; } catch { return []; }
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
  // 공간 상세(## 소제목 / - 목록 / > 안내 상자), 지점 이용 안내(한 줄에 하나), 시설 목록("분류: 항목, 항목"), 검색 해시태그
  if ('detail' in b) out.detail = maskPhones(str(b.detail, { max: 3000, multiline: true, name: '공간 상세' }));
  if ('care' in b) out.care = maskPhones(str(b.care, { max: 1000, multiline: true, name: '지점 이용 안내' }));
  if ('facs' in b) out.facs = str(b.facs, { max: 800, multiline: true, name: '시설 목록' });
  if ('kw' in b) out.kw = (Array.isArray(b.kw) ? b.kw : String(b.kw).split(',')).map((t) => str(String(t).replace(/^#/, ''), { max: 20 })).filter(Boolean).slice(0, 12);
  if ('tags' in b) out.tags = (Array.isArray(b.tags) ? b.tags : String(b.tags).split(',')).map((t) => str(t, { max: 12 })).filter(Boolean).slice(0, 12);
  if ('aliases' in b) out.aliases = (Array.isArray(b.aliases) ? b.aliases : String(b.aliases).split(',')).map((t) => str(t, { max: 40 })).filter(Boolean).slice(0, 10);
  if ('photos' in b) {
    if (!Array.isArray(b.photos)) throw new HttpError(400, '사진 목록 형식이 올바르지 않아요.');
    out.photos = b.photos.slice(0, PHOTO_MAX).map((p) => {
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
  if ('items' in b) out.items = cleanItems(b.items);
  if ('social' in b && b.social && typeof b.social === 'object') out.social = cleanSocial(b.social);
  if ('booking' in b) out.booking = cleanBooking(b.booking);
  if ('hourly' in b) out.hourly = cleanHourly(b.hourly);
  if ('hostPaused' in b) out.hostPaused = !!b.hostPaused;
  if ('hostBiz' in b) out.hostBiz = cleanBiz(b.hostBiz);
  if ('listing' in b && b.listing && typeof b.listing === 'object') {
    const l = { ...(prev.listing || {}) };
    if ('type' in b.listing) l.type = LISTING_TYPES[b.listing.type] ? b.listing.type : 'managed';
    if ('zone' in b.listing) l.zone = ['premium', 'plus'].includes(b.listing.zone) ? b.listing.zone : '';
    if ('until' in b.listing) l.until = /^\d{4}-\d{2}-\d{2}$/.test(String(b.listing.until || '')) ? b.listing.until : '';
    if ('hostName' in b.listing) l.hostName = str(b.listing.hostName, { max: 30, name: '호스트 표시 이름' });
    out.listing = l;
  }
  return out;
}

/* ---------- 예약 방식 — 호스트가 고른 예약·결제 채널 (손님 화면 예약 버튼) ---------- */
export const BOOK_KINDS = { naver: '네이버 예약', link: '예약 링크', phone: '전화 예약', kakao: '카카오톡 채널', talk: '네이버 톡톡', insta: '인스타그램 DM', sms: '문자 예약', form: '쏘플 문의' };
export const CONFIRM_KINDS = { instant: '바로 확정', approve: '호스트 확인 뒤 확정' };
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
/** 전화번호 — 숫자만 남겨 02-123-4567 / 010-1234-5678 / 1544-3523 모양으로 */
export function cleanPhone(v, name = '전화번호') {
  const d = String(v || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (!/^(0\d{8,10}|1[5-9]\d{6})$/.test(d)) throw new HttpError(400, `${name}를 다시 확인해 주세요. 예) 010-1234-5678`);
  if (d.length === 8) return d.slice(0, 4) + '-' + d.slice(4);
  if (d.startsWith('02')) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
export function cleanBooking(v) {
  if (v == null) return null;
  if (typeof v !== 'object') throw new HttpError(400, '예약 방식 형식이 올바르지 않아요.');
  const seen = new Set();
  const ways = [];
  for (const w of (Array.isArray(v.ways) ? v.ways : []).slice(0, 8)) {
    if (!w || !BOOK_KINDS[w.k] || seen.has(w.k)) continue;
    const o = { k: w.k, label: str(w.label, { max: 20 }) || '', note: str(w.note, { max: 60 }) || '' };
    if (w.k === 'naver' || w.k === 'link' || w.k === 'kakao' || w.k === 'talk' || w.k === 'insta') {
      const u = url(w.v, { name: BOOK_KINDS[w.k] + ' 주소', required: true });
      const h = hostOf(u);
      if (w.k === 'naver' && !(h.endsWith('.naver.com') || h === 'naver.me')) throw new HttpError(400, '네이버 예약 주소는 naver.com 주소만 넣을 수 있어요. 다른 사이트는 「예약 링크」로 넣어 주세요.');
      if (w.k === 'kakao' && !(h.endsWith('.kakao.com') || h === 'kakao.com')) throw new HttpError(400, '카카오톡 채널 주소는 pf.kakao.com 또는 open.kakao.com 주소를 넣어 주세요.');
      if (w.k === 'talk' && h !== 'talk.naver.com') throw new HttpError(400, '네이버 톡톡 주소는 talk.naver.com 으로 시작하는 주소를 넣어 주세요.');
      if (w.k === 'insta' && !(h === 'instagram.com' || h.endsWith('.instagram.com') || h === 'ig.me')) throw new HttpError(400, '인스타그램 주소는 instagram.com 또는 ig.me 주소를 넣어 주세요.');
      if (w.k === 'link' && !/^https:\/\//.test(u)) throw new HttpError(400, '예약 링크는 https:// 로 시작하는 주소만 넣을 수 있어요.');
      o.v = u;
    } else if (w.k === 'phone' || w.k === 'sms') {
      o.v = cleanPhone(w.v, BOOK_KINDS[w.k] + ' 번호');
      if (!o.v) throw new HttpError(400, `${BOOK_KINDS[w.k]} 번호를 넣어 주세요.`);
    } else o.v = '';
    seen.add(w.k);
    ways.push(o);
  }
  return {
    ways,
    confirm: oneOf(v.confirm, Object.keys(CONFIRM_KINDS), ''),
    cancel: maskPhones(str(v.cancel, { max: 600, multiline: true, name: '취소·환불 규정' }) || ''),
    hours: str(v.hours, { max: 60, name: '예약 받는 시간' }) || '',
  };
}
/** 사업자 정보 — 손님 화면 「호스트 정보」에 보여요 (상호·대표자·사업자등록번호·통신판매업 신고번호) */
export function cleanBiz(v) {
  if (v == null || typeof v !== 'object') return null;
  const name = str(v.name, { max: 40, name: '상호' }) || '';
  const ceo = str(v.ceo, { max: 20, name: '대표자' }) || '';
  const d = String(v.no || '').replace(/\D/g, '');
  if (d && d.length !== 10) throw new HttpError(400, '사업자등록번호는 숫자 10자리예요. 예) 123-45-67890');
  const no = d ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : '';
  const mail = str(v.mail, { max: 30, name: '통신판매업 신고번호' }) || '';
  if (!name && !ceo && !no && !mail) return null;
  return { name, ceo, no, mail };
}
/** 시간제 요금 — 요일별 시간당 요금, 최소 이용 시간, 운영 시간. 비우면(null) 시간제를 쓰지 않는 지점 */
export function cleanHourly(v) {
  if (v == null || v === '' || v === false) return null;
  if (typeof v !== 'object') throw new HttpError(400, '시간제 요금 형식이 올바르지 않아요.');
  const min = int(v.min, { min: 1, max: 24, def: 2, name: '최소 이용 시간' });
  const open = int(v.open, { min: 0, max: 1440, def: 600, name: '운영 시작' });
  let close = int(v.close, { min: 0, max: 2880, def: 1440, name: '운영 끝' });
  if (close <= open) close += 1440;
  if (close - open > 1440) throw new HttpError(400, '운영 시간은 24시간을 넘을 수 없어요.');
  if ((close - open) / 60 < min) throw new HttpError(400, '최소 이용 시간이 운영 시간보다 길어요.');
  const p = (Array.isArray(v.p) ? v.p : []).slice(0, 4).map((x) => (x === '' || x == null ? null : int(x, { min: 0, max: 10000000, name: '시간당 요금' })));
  while (p.length < 4) p.push(null);
  if (!p.some((x) => x)) throw new HttpError(400, '시간당 요금을 한 요일이라도 넣어 주세요.');
  return { min, open, close, hrs: hrsLabel(open, close), p, note: str(v.note, { max: 120 }) || '' };
}
/** 가장 싼 요금 — 패키지 최저가와 (시간당 최저가 × 최소 시간) 중 낮은 값 (app.js SP.minPrice 와 같은 규칙) */
export function minPriceOf(s) {
  const mins = (s.pkgs || []).map((p) => Math.min(...(p.p || []).filter(Boolean))).filter((n) => Number.isFinite(n));
  const h = s.hourly;
  if (h && (h.p || []).some(Boolean)) mins.push(Math.min(...h.p.filter(Boolean)) * (h.min || 1));
  return mins.length ? Math.min(...mins) : null;
}

/* ---------- 비품(세부 물품) 목록 — 고객 화면 "비품·물품"에 보여요 ---------- */
export const ITEM_CATS = { kitchen: '주방·식기', furniture: '가구·좌석', av: '영상·음향', party: '파티·꾸미기', play: '놀이·게임', living: '생활·위생', etc: '기타' };
export function cleanItems(v) {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new HttpError(400, '비품 목록 형식이 올바르지 않아요.');
  if (v.length > 150) throw new HttpError(400, '비품은 150개까지 적을 수 있어요.');
  const seen = new Set();
  const out = [];
  for (const it of v) {
    if (!it || typeof it !== 'object') continue;
    const n = str(it.n, { max: 24 });
    if (!n) continue;
    const c = ITEM_CATS[it.c] ? it.c : 'etc';
    const key = c + '|' + n;
    if (seen.has(key)) continue;
    seen.add(key);
    const q = it.q === '' || it.q == null ? null : int(it.q, { min: 0, max: 9999, def: null, name: `${n} 수량` });
    out.push({ c, n: maskPhones(n), q, m: maskPhones(str(it.m, { max: 40 }) || '') });
  }
  return out;
}

/* ---------- SNS·네이버 후기 연결 ---------- */
const SOCIAL_HOSTS = /^(blog\.naver\.com|m\.blog\.naver\.com|naver\.me|map\.naver\.com|m\.place\.naver\.com|place\.naver\.com|(www\.)?instagram\.com|(www\.|m\.)?youtube\.com|youtu\.be|cafe\.naver\.com|m\.cafe\.naver\.com|in\.naver\.com|tv\.naver\.com)$/i;
export function cleanSocial(v) {
  const out = {};
  const tag = String(v.tag || '').trim().replace(/^#/, '');
  if (tag) {
    if (!/^[0-9A-Za-z가-힣_]{2,30}$/.test(tag)) throw new HttpError(400, '인스타그램 해시태그는 띄어쓰기 없이 글자·숫자·_만 써 주세요.');
    out.tag = tag;
  }
  if (v.naver) out.naver = url(v.naver, { name: '네이버 플레이스 주소' });
  const links = Array.isArray(v.links) ? v.links.slice(0, 8) : [];
  out.links = links.map((l, i) => {
    const u = url(l && l.u, { name: `${i + 1}번째 후기 주소` });
    if (!u) return null;
    let host = '';
    try { host = new URL(u).hostname; } catch { /* 아래에서 거름 */ }
    if (!SOCIAL_HOSTS.test(host)) throw new HttpError(400, '후기 주소는 네이버 블로그·카페·플레이스, 인스타그램, 유튜브 주소만 넣을 수 있어요.');
    return { u, t: str(l.t, { max: 60 }) || '' };
  }).filter(Boolean);
  return out;
}

/** 지점 운영 방식 — managed: 쏘플 위탁운영, host: 호스트가 직접 운영(등록 공간), direct: 쏘플 직영 */
export const LISTING_TYPES = { managed: '쏘플 위탁운영', host: '호스트 운영', direct: '쏘플 직영' };
export const LISTING_ZONES = { premium: '프리미엄존', plus: '플러스존' };
/** 노출 존이 기간을 넘겼으면 빈 값으로 본다 */
export function zoneOf(s, today) {
  const l = s.listing || {};
  if (!l.zone) return '';
  if (l.until && today && l.until < today) return '';
  return l.zone;
}

/* ---------- 호스트(매장 운영자)가 자기 지점을 고치는 범위 ---------- */
const HOST_FIELDS = ['intro', 'notice', 'detail', 'care', 'facs', 'tags', 'photos', 'feat', 'info', 'addFeeLabel', 'depositLabel', 'place', 'items', 'social'];
const HOST_FIELDS_OWN = ['pkgs', 'book', 'base', 'max', 'addFee', 'booking', 'hourly', 'addr', 'hostPaused', 'hostBiz'];   // 호스트 운영 공간이면 요금·예약 방식·주소까지
export function cleanHostInput(b, prev) {
  const allow = new Set(HOST_FIELDS.concat(prev.listing && prev.listing.type === 'host' ? HOST_FIELDS_OWN : []));
  const picked = {};
  for (const k of Object.keys(b)) if (allow.has(k)) picked[k] = b[k];
  return cleanSpaceInput(picked, prev);
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
    rest.photos = (prev.photos && prev.photos.length) ? prev.photos : (rest.photos || []);
    if (prev.photoSrc) rest.photoSrc = prev.photoSrc;   // 아임웹 사진 가져오기 기록
    rest.intro = prev.intro || '';
    rest.notice = prev.notice || rest.notice || '';
    rest.aliases = (prev.aliases && prev.aliases.length) ? prev.aliases : (rest.aliases || []);   // 호스트 지점 이름 짝은 지키기
    await saveSpace(c.db, code, rest, { visible: prev.visible !== false, sort: prev.sort ?? sort });
    return { ok: true };
  });
}

export { isYmd };
