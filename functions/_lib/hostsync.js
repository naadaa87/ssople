// 호스트 예약 DB(HOSTDB) 읽기 전용 동기화 + 엑셀/수동/수신 API 방막기
//  · HOSTDB 에는 어떤 쓰기도 하지 않는다 (SELECT / PRAGMA 만 사용)
//  · 고객 이름·연락처는 가져오지 않는다. 지점·날짜·시간·예약번호 해시만 남긴다.
//  · D1 무료 한도(계정 전체 하루 읽기 500만 줄 · 쓰기 10만 줄)를 호스트 센터와 함께 쓰므로
//    바뀐 게 있을 때만 읽고, 달라진 칸만 고쳐 쓴다.
import {
  HttpError, lit, qid, addDays, todayKST, nowIso, chunk, isYmd, parseJSON, int, str, safeEqual,
} from './util.js';
import { getMeta, setMeta, housekeep } from './db.js';
import { loadSpaces, makeResolver } from './spaces.js';
import { pkgsOf, slotSpan, clearAvailCache, computeAvail } from './avail.js';

const CANCEL = /취소|cancel|환불|refund|거절|reject|삭제|delete|void|만료|expire/i;
const WIN_BACK = 2;
const WIN_FWD = 130;   // 고객 화면에서 고를 수 있는 날짜(오늘부터 120일 + 7일 보기)를 덮는 기간
const FULL_EVERY = 30 * 60e3;   // 바뀐 흔적이 없어도 30분마다 한 번은 기간 전체를 다시 읽는다

const normKey = (s) => String(s || '').toLowerCase().replace(/[\s_\-]/g, '');
export function pickCol(cols, cands, { exclude = null, loose = true } = {}) {
  const ks = cols.filter((c) => !(exclude && exclude.test(c))).map((c) => ({ raw: c, k: normKey(c) }));
  for (const cand of cands) { const t = normKey(cand); const hit = ks.find((x) => x.k === t); if (hit) return hit.raw; }
  if (!loose) return null;
  for (const cand of cands) {
    const t = normKey(cand);
    if (t.length < 4) continue;
    const hit = ks.find((x) => x.k.includes(t));
    if (hit) return hit.raw;
  }
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
export function normDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && v.length >= 10 && v[4] === '-' && v[7] === '-') { const r = v.slice(0, 10); if (isYmd(r)) return r; }
  if (typeof v === 'number') {
    if (v > 1e12) return new Date(v + 9 * 3600e3).toISOString().slice(0, 10);
    if (v > 1e9) return new Date(v * 1000 + 9 * 3600e3).toISOString().slice(0, 10);
    if (v > 20000 && v < 90000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400e3).toISOString().slice(0, 10);
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) { const r = `${m[1]}-${pad(m[2])}-${pad(m[3])}`; return isYmd(r) ? r : null; }
  m = s.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) { const r = `20${m[1]}-${pad(m[2])}-${pad(m[3])}`; return isYmd(r) ? r : null; }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) { const r = `${m[1]}-${m[2]}-${m[3]}`; return isYmd(r) ? r : null; }
  return null;
}
/** 시각 → 0~1439 분. 못 읽으면 null */
export function normTime(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (v >= 0 && v < 1) return Math.round(v * 1440) % 1440;       // 엑셀 시간
    if (v > 20000 && v < 90000) { const f = v - Math.floor(v); return f ? Math.round(f * 1440) % 1440 : null; }
    return null;
  }
  const s = String(v);
  const pm = /오후|PM|pm/.test(s), am = /오전|AM|am/.test(s);
  let m = s.match(/(\d{1,2}):(\d{2})/);
  let h, mi;
  if (m) { h = +m[1]; mi = +m[2]; } else {
    m = s.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
    if (!m) return null;
    h = +m[1]; mi = m[2] ? +m[2] : 0;
  }
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 24 || mi > 59) return null;
  return (h * 60 + mi) % 1440;
}
export function slotOf(raw) {
  const s = String(raw || '');
  if (!s) return null;
  if (/투나잇|tonight/i.test(s)) return 'tonight';
  if (/올데이|종일|all[\s_-]?day/i.test(s)) return 'allday';
  if (/풀패키지|full/i.test(s)) return 'full';
  if (/3시간|hour3|3h/i.test(s)) return 'hour3';
  if (/오전|morning/i.test(s)) return 'morning';
  if (/밤|야간|night/i.test(s)) return 'night';
  if (/낮|주간|day/i.test(s)) return 'day';
  if (/^(all|전체)$/i.test(s.trim())) return 'all';
  return null;
}

/** 시작·종료(분)와 구분값으로 실제 막을 시간 계산 */
export function spanFor(space, slot, sMin, eMin) {
  const pk = pkgsOf(space || {});
  if (sMin != null && eMin != null) {
    let e = eMin;
    if (e <= sMin) e += 1440;
    return { slot: slot || (sMin >= 1020 ? 'night' : 'day'), s: sMin, e };
  }
  if (sMin != null && !slot) slot = sMin >= 1020 ? 'night' : 'day';
  const [s, e] = slotSpan(pk, slot || 'all');
  return { slot: slot || 'all', s, e };
}

/* ---------------- 호스트 DB 구조 찾기 ---------------- */
// 고객 개인정보 칸은 처음부터 고르지 않는다 (이름·전화·메모 등)
const PERSONAL = /phone|tel$|^tel|mobile|hp$|contact|e?mail|birth|addr|account|card|memo|note|request|password|salt|token/i;
const PERSON_NAME = /^(name|names|customer|customer_?name|guest|guest_?name|booker|booker_?name|user|user_?name|member|member_?name|nick|nickname|이름|예약자|고객명)$/i;
export const isPersonalCol = (c) => !!c && (PERSONAL.test(c) || PERSON_NAME.test(c));
async function detect(H, hm = {}) {
  const tables = ((await H.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'`,
  ).all()).results || []).map((r) => r.name);
  const tbl = (hm.table && tables.includes(hm.table)) ? hm.table
    : (tables.find((n) => /^reservations?$/i.test(n)) || tables.find((n) => /reserv|booking|예약/i.test(n) && !/log|history|memo|note/i.test(n)));
  if (!tbl) return { tables, error: `예약 표를 찾지 못했어요. (찾은 표: ${tables.join(', ') || '없음'})` };
  const cols = ((await H.prepare(`PRAGMA table_info(${qid(tbl)})`).all()).results || []).map((r) => r.name);
  const mc = hm.cols || {};
  const notTime = /created|updated|deleted|paid|cancel|canceled|refund|approved/i;
  const ex = (re) => new RegExp(`${re.source}|${PERSONAL.source}`, 'i');
  const col = {
    code: mc.code || pickCol(cols, ['branch_code', 'space_code', 'store_code', 'scode', 'spot_code', 'room_code'], { exclude: ex(/_id$/) }),
    bname: mc.bname || pickCol(cols, ['branch_name', 'space_name', 'store_name', 'shop_name', 'room_name', 'place_name', 'branch', 'space', 'store', '지점'], { exclude: ex(/_id$|id$|code$|customer|guest|user|booker|member|^name$/) }),
    bid: mc.bid || pickCol(cols, ['branch_id', 'space_id', 'store_id', 'room_id', 'shop_id', 'place_id'], { loose: false }),
    date: mc.date || pickCol(cols, ['use_date', 'res_date', 'reserve_date', 'reservation_date', 'booking_date', 'checkin_date', 'visit_date', 'start_date', 'use_day', 'date', 'ymd', '이용일'], { exclude: ex(notTime) }),
    start: mc.start || pickCol(cols, ['start_t', 'start_time', 'checkin_time', 'from_time', 'start_at', 'starts_at', 'begin_at', 'start'], { exclude: ex(notTime) }),
    end: mc.end || pickCol(cols, ['end_t', 'end_time', 'checkout_time', 'to_time', 'end_at', 'ends_at', 'finish_at', 'end'], { exclude: ex(notTime) }),
    slot: mc.slot || pickCol(cols, ['slot', 'time_slot', 'slot_type', 'time_type', 'package', 'pkg', 'product_name', 'item_name', 'product', 'session', '구분'], { exclude: ex(/_id$|customer|guest|user|booker/) }),
    status: mc.status || pickCol(cols, ['status', 'state', 'res_status', 'reservation_status', 'booking_status', '상태'], { exclude: ex(/deposit|pay|refund/) }),
    resno: mc.resno || pickCol(cols, ['resno', 'reservation_no', 'res_no', 'booking_no', 'reservation_code', 'booking_code', 'order_no', 'code', 'number', '예약번호'], { exclude: ex(/branch|space|store|name/) }),
    created: mc.created || pickCol(cols, ['created_at', 'created', 'reg_date', 'registered_at', 'regdate', 'inserted_at', '등록일'], { loose: false }),
    channel: mc.channel || pickCol(cols, ['channel', 'platform', 'via', '채널'], { loose: false }),
    source: pickCol(cols, ['source', 'origin', '경로'], { loose: false }),
  };
  if (col.bname && col.bname === col.bid) col.bname = null;
  if (col.start && col.start === col.date) col.start = null;
  for (const k of Object.keys(col)) if (col[k] && (!cols.includes(col[k]) || isPersonalCol(col[k]))) col[k] = null;   // 칸 이름이 틀렸거나 고객 개인정보 칸이면 쓰지 않는다
  let bmapInfo = null;
  if (col.bid) {
    const btbl = tables.find((n) => /^branch(es)?$/i.test(n)) || tables.find((n) => /^spaces?$|^stores?$|^rooms?$/i.test(n))
      || tables.find((n) => n !== tbl && /branch|space|store|shop|지점/i.test(n) && !/photo|log|note|member|setting|notice|review/i.test(n));
    if (btbl) {
      const bcols = ((await H.prepare(`PRAGMA table_info(${qid(btbl)})`).all()).results || []).map((r) => r.name);
      bmapInfo = {
        table: btbl,
        id: pickCol(bcols, ['id'], { loose: false }),
        code: pickCol(bcols, ['code', 'branch_code', 'scode', 'space_code'], { loose: false }),
        name: pickCol(bcols, ['name', 'branch_name', 'title', 'space_name'], { loose: false }),
      };
      if (!bmapInfo.id) bmapInfo = null;
    }
  }
  const closures = tables.find((n) => /^closures?$|^blocks?$|^holidays?$|휴무/i.test(n)) || null;
  // 예약을 바꿀 때마다 한 줄씩 쌓이는 기록 표 — 마지막 번호만 보고 '바뀐 게 있나'를 판단한다
  const logTables = tables.filter((n) => n !== tbl && (/(reserv|booking|예약).*(log|hist|event|change)/i.test(n) || /^(audit|activity|change)_?logs?$/i.test(n))).slice(0, 2);
  return { tables, tbl, cols, col, bmapInfo, closures, logTables };
}

async function loadBranchMap(H, info) {
  if (!info) return null;
  const sel = [`${qid(info.id)} AS id`];
  if (info.code) sel.push(`${qid(info.code)} AS code`);
  if (info.name) sel.push(`${qid(info.name)} AS name`);
  const rs = (await H.prepare(`SELECT ${sel.join(', ')} FROM ${qid(info.table)} LIMIT 2000`).all()).results || [];
  return new Map(rs.map((r) => [String(r.id), r]));
}

/** 예약 표에서 필요한 칸만 읽는다 — 고객 이름·전화번호 같은 칸은 아예 가져오지 않는다 */
function selCols(D) {
  const set = new Set(Object.values(D.col).filter(Boolean));
  if (D.cols && D.cols.includes('id')) set.add('id');
  return [...set].filter((c) => !isPersonalCol(c)).map(qid).join(', ') || qid(D.col.date);
}
const CLOSURE_COLS = ['id', 'branch_id', 'branch_code', 'branch_name', 'slot', 'kind', 'weekday', 'start_date', 'end_date', 'date', 'd', 'day'];

function okCode(c) { return typeof c === 'string' && /^S-\d{4}$/.test(c); }
function okSlot(s) { return s == null || /^[a-z0-9]{1,10}$/.test(s); }

/** 바뀐 게 있는지 몇 줄만 읽고 판단할 때 쓰는 값 (표마다 마지막 줄 번호) */
async function fingerprint(H, D) {
  const one = async (sql) => { try { return await H.prepare(sql).first(); } catch { return null; } };
  const parts = [];
  const r = await one(`SELECT MAX(rowid) AS m FROM ${qid(D.tbl)}`);
  parts.push(r ? r.m : '');
  for (const t of D.logTables || []) { const x = await one(`SELECT MAX(rowid) AS m FROM ${qid(t)}`); parts.push(x ? x.m : ''); }
  if (D.closures) { const x = await one(`SELECT COUNT(*) AS n, MAX(rowid) AS m FROM ${qid(D.closures)}`); parts.push(x ? `${x.n}/${x.m}` : ''); }
  return parts.join('|');
}
/** 취소·환불·거절 같은 상태를 DB 쪽에서 거르는 조건 (JS의 CANCEL과 같은 뜻) */
const CANCEL_WORDS = ['cancel', 'refund', 'reject', 'delete', 'void', 'expire', '취소', '환불', '거절', '삭제', '만료'];
function cancelSql(c) {
  return CANCEL_WORDS.map((w) => `LOWER(COALESCE(${c}, '')) LIKE '%${w}%'`).join(' OR ');
}
/** 빠른 53비트 해시 (암호용 아님 — 바뀌었는지 비교만 한다) */
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const strHash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

/** 호스트 예약 한 줄 → 홈페이지 지점 코드 */
function branchOf(r, col, bmap, resolve) {
  const labels = [];
  if (col.code) labels.push(r[col.code]);
  if (bmap && col.bid) { const b = bmap.get(String(r[col.bid])); if (b) { labels.push(b.code); labels.push(b.name); } }
  if (col.bname) labels.push(r[col.bname]);
  for (const l of labels) { const code = resolve(l); if (code) return { code, label: l }; }
  const show = labels.find((l) => l != null && String(l).trim()) ?? (col.bid ? `#${r[col.bid]}` : '(빈칸)');
  return { code: null, label: String(show) };
}

const keyOf = (r) => `${r.code}|${r.d}|${r.slot ?? ''}|${r.s ?? ''}|${r.e ?? ''}|${r.ref ?? ''}`;
const metaStmt = (db, k, v) => db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v));
/** 여러 곳에서 동시에 칸을 고치지 않도록 90초짜리 잠금 (D1 한 줄로) */
async function takeLock(db, at) {
  const stale = new Date(Date.parse(at) - 90e3).toISOString();
  const r = await db.prepare(`INSERT INTO meta (k, v) VALUES ('sync_lock', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v WHERE meta.v < ?`).bind(at, stale).run();
  return !!(r && r.meta && r.meta.changes);
}

/* ---------------- 동기화 ---------------- */
let running = null;
export async function syncHost(env, opt = {}) {
  if (running) return running;
  running = doSync(env, opt).finally(() => { running = null; });
  return running;
}

/**
 * 1) 예약 표·기록 표의 마지막 번호와 날짜로 '바뀐 게 있나' 먼저 본다 (몇 줄만 읽음)
 * 2) 바뀌었거나 30분이 지났으면 오늘-2일 ~ 150일 뒤 예약만 읽는다 (지점 번호 + 날짜 색인 사용)
 * 3) 홈페이지 DB에는 달라진 칸만 지우고 넣는다 (D1 하루 쓰기 한도를 아끼려고)
 */
async function doSync(env, { reason = '자동', force = false } = {}) {
  const db = env.DB;
  const at = nowIso();
  const diag = { at, reason, bound: !!env.HOSTDB, ok: false };
  let locked = null;
  try {
    if (!env.HOSTDB) throw new Error('HOSTDB(호스트 예약 DB)가 연결되지 않았어요.');
    const H = env.HOSTDB;
    const [hmRaw, stRaw, prevRaw] = await Promise.all([getMeta(db, 'host_map'), getMeta(db, 'host_state'), getMeta(db, 'host_diag')]);
    const hm = parseJSON(hmRaw, {}) || {};
    const state = parseJSON(stRaw, {}) || {};
    const prev = parseJSON(prevRaw, null);
    const D = await detect(H, hm);
    diag.tables = D.tables;
    if (D.error) throw new Error(D.error);
    Object.assign(diag, { table: D.tbl, columns: D.cols, col: D.col, branchTable: D.bmapInfo?.table || null, closuresTable: D.closures, logTables: D.logTables });
    const col = D.col;
    if (!col.date) throw new Error(`예약 표(${D.tbl})에서 이용 날짜 칸을 찾지 못했어요.`);
    if (!col.code && !col.bname && !col.bid) throw new Error(`예약 표(${D.tbl})에서 지점 칸을 찾지 못했어요.`);

    const today = todayKST();
    const fp = await fingerprint(H, D);
    const key = `${fp}#${today}#${strHash(hmRaw || '')}`;
    const recent = state.fullAt && Date.now() - Date.parse(state.fullAt) < FULL_EVERY;
    if (!force && recent && state.key === key && prev && prev.ok) {
      // 바뀐 게 없다 — 몇 줄만 읽고 끝. '살아 있음' 시각만 남긴다
      await setMeta(db, 'host_ok_at', at);
      return { ...prev, checkedAt: at, skipped: true, added: 0, removed: 0 };
    }

    const from = addDays(today, -WIN_BACK), to = addDays(today, WIN_FWD);
    const T = qid(D.tbl), DC = qid(col.date);
    const sample = (await H.prepare(`SELECT ${DC} AS d FROM ${T} WHERE ${DC} IS NOT NULL ORDER BY rowid DESC LIMIT 5`).all()).results || [];
    const iso = sample.length > 0 && sample.every((r) => /^\d{4}-\d{2}-\d{2}/.test(String(r.d)));
    const bmap = await loadBranchMap(H, D.bmapInfo);
    // 같은 지점·날짜·구분은 DB에서 한 줄로 묶어서 받는다 (Workers 무료 요금제의 요청당 CPU 10ms 안에서 끝내려고)
    // 취소된 예약도 DB 쪽에서 미리 걸러 낸다
    const gcols = [...new Set([col.code, col.bid, col.bname, col.date, col.start, col.end, col.slot].filter(Boolean))].map(qid).join(', ');
    const notCancel = col.status ? ` AND NOT (${cancelSql(qid(col.status))})` : '';
    let where = '1 = 1';
    const binds = [];
    if (iso) {
      where = `${DC} >= ? AND ${DC} < ?`;
      binds.push(from, addDays(to, 1));
      // 지점 번호 + 이용일 색인을 탈 수 있게 지점 번호를 함께 건다 (읽는 줄 수가 기간 안 예약 수 정도로 줄어든다)
      if (col.bid && bmap && bmap.size && bmap.size <= 500) {
        const ids = [...bmap.keys()];
        const num = ids.every((x) => /^\d{1,12}$/.test(x));
        where = `${qid(col.bid)} IN (${ids.map((x) => (num ? x : lit(x))).join(', ')}) AND ${where}`;
      }
    }
    const rows = (await H.prepare(`SELECT ${gcols}, COUNT(*) AS _n FROM ${T} WHERE ${where}${notCancel} GROUP BY ${gcols} LIMIT 20000`).bind(...binds).all()).results || [];
    if (col.created) {
      const lc = await H.prepare(`SELECT ${qid(col.created)} AS c FROM ${T} ORDER BY rowid DESC LIMIT 1`).first();
      diag.latestCreated = lc?.c ?? null;
    }
    // 예약 상태별 건수는 손으로 불러올 때만 센다 (자동 실행에서는 읽는 줄 수를 아낀다)
    let statuses = null;
    if (reason === '수동' && col.status && iso) {
      statuses = (await H.prepare(`SELECT ${qid(col.status)} AS s, COUNT(*) AS n FROM ${T} WHERE ${where} GROUP BY 1 ORDER BY 2 DESC LIMIT 20`).bind(...binds).all()).results || [];
    }
    diag.lastNo = String(fp).split('|')[0] || null;

    const spaces = await loadSpaces(db, { all: true });
    const resolve = makeResolver(spaces, hm.alias || {});
    const unmatched = {};
    const want = [];
    const memo = new Map();
    const once = (k, fn) => { if (!memo.has(k)) memo.set(k, fn()); return memo.get(k); };
    let active = 0, latest = null;
    for (const r of rows) {
      const d = normDate(r[col.date]);
      if (!d || d < from || d > to) continue;
      const n = Number(r._n) || 1;
      active += n;
      if (!latest || d > latest) latest = d;
      const bk = `b|${col.code ? r[col.code] : ''}|${col.bid ? r[col.bid] : ''}|${col.bname ? r[col.bname] : ''}`;
      const b = once(bk, () => branchOf(r, col, bmap, resolve));
      if (!b.code) { unmatched[b.label] = (unmatched[b.label] || 0) + n; continue; }
      const sMin = col.start ? once('t|' + r[col.start], () => normTime(r[col.start])) : (iso ? null : normTime(r[col.date]));
      const eMin = col.end ? once('t|' + r[col.end], () => normTime(r[col.end])) : null;
      let slot = col.slot ? once('s|' + r[col.slot], () => slotOf(r[col.slot]) || null) : null;
      let s = null, e = null;
      if (sMin != null && eMin != null) { s = sMin; e = eMin <= sMin ? eMin + 1440 : eMin; slot = slot || (sMin >= 1020 ? 'night' : 'day'); }
      else if (sMin != null && !slot) slot = sMin >= 1020 ? 'night' : 'day';
      // 시각이 없으면 칸만 남기고, 막을 시간은 화면에서 지점 패키지 시간으로 계산한다 (패키지 시간을 고치면 바로 맞춰짐)
      want.push({ code: b.code, d, slot: okSlot(slot) ? (slot || 'all') : 'all', s, e, ref: null });
    }

    // 호스트 휴무(closures): 지정일 / 요일 반복 / 기간
    let closN = 0;
    if (D.closures) {
      try {
        const ccols = ((await H.prepare(`PRAGMA table_info(${qid(D.closures)})`).all()).results || []).map((r) => r.name).filter((n) => CLOSURE_COLS.includes(n));
        const cs = ccols.length ? (await H.prepare(`SELECT ${ccols.map(qid).join(', ')} FROM ${qid(D.closures)} LIMIT 5000`).all()).results || [] : [];
        for (const c of cs) {
          const labels = [];
          if (bmap && c.branch_id != null) { const b = bmap.get(String(c.branch_id)); if (b) labels.push(b.code, b.name); }
          if (c.branch_code) labels.push(c.branch_code);
          if (c.branch_name) labels.push(c.branch_name);
          let code = null;
          for (const l of labels) { code = resolve(l); if (code) break; }
          if (!code) continue;
          const slot = c.slot && c.slot !== 'all' ? slotOf(c.slot) || 'all' : 'all';
          const dates = [];
          const kind = String(c.kind || 'date');
          if (kind === 'weekly' && c.weekday != null) {
            for (let i = 0; i <= WIN_FWD; i += 1) { const d = addDays(today, i); if (new Date(d + 'T00:00:00Z').getUTCDay() === Number(c.weekday)) dates.push(d); }
          } else if (kind === 'period' && c.start_date && c.end_date) {
            const a = normDate(c.start_date), b = normDate(c.end_date);
            if (a && b) for (let d = a < from ? from : a; d <= b && d <= to; d = addDays(d, 1)) dates.push(d);
          } else {
            const d = normDate(c.date ?? c.d ?? c.day);
            if (d && d >= from && d <= to) dates.push(d);
          }
          for (const d of dates) {
            want.push({ code, d, slot, s: null, e: null, ref: 'cl' + String(c.id ?? '').replace(/\W/g, '').slice(0, 8) });
            closN++;
          }
        }
      } catch (e) { diag.closuresError = String(e.message || e); }
    }

    // 달라진 칸만 반영 — 결과 전체의 지문이 지난번과 같으면 홈페이지 DB의 칸은 읽지도 쓰지도 않는다
    const clean = want.filter((r) => okCode(r.code) && isYmd(r.d) && okSlot(r.slot));
    const wantKeys = clean.map(keyOf).sort();
    const setHash = `${wantKeys.length}:${cyrb53(wantKeys.join('\n'))}`;
    const fullRecon = force || state.day !== today;     // 하루 한 번은 실제 칸과 전부 맞춰 본다 (중복·누락 바로잡기)
    const changed = fullRecon || state.setHash !== setHash;
    let add = [], del = [];
    if (changed) {
      if (!(await takeLock(db, at))) {
        // 다른 곳에서 같은 작업이 돌고 있다 — 이번에는 건너뛴다
        return { ...(prev || diag), checkedAt: at, skipped: true, busy: true, added: 0, removed: 0 };
      }
      locked = at;
      const prevKeys = fullRecon ? null : await getMeta(db, 'host_keys');
      let scope = null;                                  // 다시 맞춰 볼 지점·날짜 (null이면 전체)
      if (prevKeys != null) {
        const cnt = new Map();
        for (const k of prevKeys ? prevKeys.split('\n') : []) cnt.set(k, (cnt.get(k) || 0) + 1);
        const touched = new Set();
        for (const k of wantKeys) { const c = cnt.get(k); if (c) cnt.set(k, c - 1); else touched.add(k.split('|', 2).join('|')); }
        for (const [k, c] of cnt) if (c > 0) touched.add(k.split('|', 2).join('|'));
        if (touched.size <= 600) scope = [...touched];
      }
      let actual = [];
      if (scope) {
        for (const part of chunk(scope, 200)) {
          const vals = part.map((x) => { const [c, d] = x.split('|'); return `(${lit(c)}, ${lit(d)})`; }).join(', ');
          actual = actual.concat((await db.prepare(`SELECT id, code, d, slot, s, e, ref FROM occ WHERE src = 'host' AND (code, d) IN (VALUES ${vals})`).all()).results || []);
        }
      } else {
        actual = (await db.prepare(`SELECT id, code, d, slot, s, e, ref FROM occ WHERE src = 'host'`).all()).results || [];
      }
      const inScope = scope ? new Set(scope) : null;
      const desired = inScope ? clean.filter((r) => inScope.has(`${r.code}|${r.d}`)) : clean;
      const pool = new Map();
      for (const r of actual) { const k = keyOf(r); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(r.id); }
      for (const r of desired) { const ids = pool.get(keyOf(r)); if (ids && ids.length) ids.pop(); else add.push(r); }
      del = [...pool.values()].flat();
    }
    // 칸 고치기와 상태 기록을 한 묶음으로 — 중간에 끊겨도 어긋나지 않게
    const stmts = [];
    for (const part of chunk(del, 500)) stmts.push(db.prepare(`DELETE FROM occ WHERE src = 'host' AND id IN (${part.map((x) => Number(x)).join(', ')})`));
    for (const part of chunk(add, 500)) {
      stmts.push(db.prepare(
        'INSERT INTO occ (code, d, slot, s, e, src, kind, ref, created_at) VALUES '
        + part.map((r) => `(${lit(r.code)}, ${lit(r.d)}, ${lit(r.slot)}, ${lit(r.s)}, ${lit(r.e)}, 'host', 'block', ${r.ref ? lit(String(r.ref).replace(/[^\w]/g, '')) : 'NULL'}, ${lit(at)})`).join(', '),
      ));
    }
    stmts.push(metaStmt(db, 'host_ok_at', at), metaStmt(db, 'host_state', JSON.stringify({ key, fullAt: at, setHash, day: today })));
    if (changed) stmts.push(metaStmt(db, 'host_keys', wantKeys.join('\n')));
    if (locked) { stmts.push(db.prepare(`UPDATE meta SET v = '' WHERE k = 'sync_lock' AND v = ?`).bind(locked)); locked = null; }
    await db.batch(stmts);
    if (add.length || del.length) clearAvailCache();

    Object.assign(diag, {
      ok: true, window: [from, to], active, blocks: clean.length, closures: closN, latest,
      added: add.length, removed: del.length,
      unmatched: Object.entries(unmatched).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([label, n]) => ({ label, n })),
      statuses: statuses ? statuses.map((x) => ({ s: String(x.s ?? '(빈칸)'), n: x.n })) : (prev && prev.statuses) || [],
    });
  } catch (e) {
    diag.error = String(e.message || e);
  } finally {
    if (locked) { try { await db.prepare(`UPDATE meta SET v = '' WHERE k = 'sync_lock' AND v = ?`).bind(locked).run(); } catch { /* 90초 뒤 저절로 풀림 */ } }
  }
  await setMeta(db, 'host_diag', JSON.stringify(diag));
  // 기록은 손으로 불렀을 때, 바뀐 게 있을 때, 실패했을 때만 남긴다
  if (reason === '수동' || !diag.ok || diag.added || diag.removed) {
    const msg = diag.ok
      ? `${reason} · 예약 ${diag.active}건 → 마감 ${diag.blocks}칸${diag.added || diag.removed ? ` (새로 ${diag.added} · 풀림 ${diag.removed})` : ' (바뀐 칸 없음)'}`
      : diag.error;
    await db.prepare('INSERT INTO sync_log (src, at, ok, n, msg) VALUES (?, ?, ?, ?, ?)').bind('host', at, diag.ok ? 1 : 0, diag.blocks || 0, msg).run();
    if (Math.random() < 0.1) await db.prepare('DELETE FROM sync_log WHERE id < (SELECT MAX(id) - 300 FROM sync_log)').run();
  }
  return diag;
}

export async function maybeSync(env, settings) {
  if (!env.HOSTDB || !env.DB) return;
  const min = Math.max(3, Number(settings['avail.sync_min']) || 10);
  const last = await getMeta(env.DB, 'host_try_at');
  if (last && Date.now() - Date.parse(last) < min * 60e3) return;
  await setMeta(env.DB, 'host_try_at', nowIso());
  await syncHost(env, { reason: '자동' });
}

/** 관리자 확인용: 호스트 DB에 마지막으로 등록된 예약 몇 건 (이름·전화번호 없이) */
export async function hostRecent(env, n = 15) {
  if (!env.HOSTDB) return { ok: false, error: 'HOSTDB(호스트 예약 DB)가 연결되지 않았어요.' };
  try {
    const hm = parseJSON(await getMeta(env.DB, 'host_map'), {}) || {};
    const D = await detect(env.HOSTDB, hm);
    if (D.error) return { ok: false, error: D.error };
    const rs = (await env.HOSTDB.prepare(`SELECT ${selCols(D)} FROM ${qid(D.tbl)} ORDER BY rowid DESC LIMIT ?`).bind(n).all()).results || [];
    const spaces = await loadSpaces(env.DB, { all: true });
    const nm = Object.fromEntries(spaces.map((s) => [s.code, s.name]));
    const resolve = makeResolver(spaces, hm.alias || {});
    const bmap = await loadBranchMap(env.HOSTDB, D.bmapInfo);
    const col = D.col;
    const items = rs.map((r) => {
      const b = branchOf(r, col, bmap, resolve);
      const st = col.status ? String(r[col.status] ?? '') : '';
      return {
        created: col.created ? String(r[col.created] ?? '').slice(0, 19) : null,
        d: normDate(r[col.date]) || String(r[col.date] ?? '').slice(0, 16),
        slot: col.slot ? String(r[col.slot] ?? '').slice(0, 20) : '',
        status: st.slice(0, 20), canceled: CANCEL.test(st),
        via: String((col.channel && r[col.channel]) || (col.source && r[col.source]) || '').slice(0, 30),
        no: col.resno ? String(r[col.resno] ?? '').slice(0, 30) : '',
        branch: b.code ? nm[b.code] : b.label, matched: !!b.code,
      };
    });
    return { ok: true, table: D.tbl, items };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/* ---------------- 방문 인증용 예약 확인 ---------------- */
export async function hostFindReservation(env, { code, d, resno }) {
  if (!env.HOSTDB) return { ok: false, reason: 'nobind' };
  try {
    const hm = parseJSON(await getMeta(env.DB, 'host_map'), {}) || {};
    const D = await detect(env.HOSTDB, hm);
    if (D.error || !D.col.resno || !D.col.date) return { ok: false, reason: 'nodetect' };
    const want = String(resno).trim();
    let rs = (await env.HOSTDB.prepare(`SELECT ${selCols(D)} FROM ${qid(D.tbl)} WHERE ${qid(D.col.resno)} = ? LIMIT 5`).bind(want).all()).results || [];
    if (!rs.length && /^\d{1,15}$/.test(want)) rs = (await env.HOSTDB.prepare(`SELECT ${selCols(D)} FROM ${qid(D.tbl)} WHERE ${qid(D.col.resno)} = ? LIMIT 5`).bind(Number(want)).all()).results || [];
    if (!rs.length) return { ok: false, reason: 'notfound' };
    const spaces = await loadSpaces(env.DB, { all: true });
    const resolve = makeResolver(spaces, hm.alias || {});
    const bmap = await loadBranchMap(env.HOSTDB, D.bmapInfo);
    for (const r of rs) {
      const rd = normDate(r[D.col.date]);
      const st = D.col.status ? String(r[D.col.status] ?? '') : '';
      if (CANCEL.test(st)) return { ok: false, reason: 'canceled' };
      const labels = [];
      if (D.col.code) labels.push(r[D.col.code]);
      if (bmap && D.col.bid) { const b = bmap.get(String(r[D.col.bid])); if (b) labels.push(b.code, b.name); }
      if (D.col.bname) labels.push(r[D.col.bname]);
      let rc = null;
      for (const l of labels) { rc = resolve(l); if (rc) break; }
      if (rd === d && rc === code) return { ok: true };
      if (rd === d && !rc) return { ok: true, weak: true };
    }
    return { ok: false, reason: 'mismatch' };
  } catch (e) {
    return { ok: false, reason: 'error', error: String(e.message || e) };
  }
}

/* ---------------- 업로드/수신 행 정리 ---------------- */
function cleanRows(rows, spaces) {
  if (!Array.isArray(rows)) throw new HttpError(400, '예약 목록 형식이 올바르지 않아요.');
  if (rows.length > 5000) throw new HttpError(400, '한 번에 5,000건까지 올릴 수 있어요.');
  const byCode = Object.fromEntries(spaces.map((s) => [s.code, s]));
  const resolve = makeResolver(spaces);
  const out = [];
  const skipped = [];
  rows.forEach((r, i) => {
    const code = okCode(r.code) ? r.code : resolve(r.code || r.name || r.branch);
    const d = normDate(r.d || r.date);
    if (!code || !byCode[code] || !d) { skipped.push(i + 1); return; }
    if (r.status && CANCEL.test(String(r.status))) return;
    const sMin = Number.isFinite(r.s) ? r.s : normTime(r.start);
    const eMin = Number.isFinite(r.e) ? r.e : normTime(r.end);
    const slot = r.slot && okSlot(r.slot) ? r.slot : slotOf(r.slot || r.pkg || r.item);
    const sp = spanFor(byCode[code], slot, sMin, eMin);
    out.push({ code, d, slot: okSlot(sp.slot) ? sp.slot : null, s: sp.s, e: sp.e, ref: r.ref ? String(r.ref).replace(/[^\w-]/g, '').slice(0, 20) : null });
  });
  return { out, skipped };
}

async function writeRows(db, src, out, { replace = true, batch }) {
  const at = nowIso();
  const stmts = [];
  if (replace && out.length) {
    const codes = [...new Set(out.map((r) => r.code))];
    const min = out.reduce((m, r) => (r.d < m ? r.d : m), out[0].d);
    const max = out.reduce((m, r) => (r.d > m ? r.d : m), out[0].d);
    stmts.push(db.prepare(`DELETE FROM occ WHERE src = ? AND d >= ? AND d <= ? AND code IN (${codes.map(lit).join(', ')})`).bind(src, min, max));
  }
  for (const part of chunk(out, 400)) {
    stmts.push(db.prepare(
      'INSERT INTO occ (code, d, slot, s, e, src, kind, ref, batch, created_at) VALUES '
      + part.map((r) => `(${lit(r.code)}, ${lit(r.d)}, ${lit(r.slot)}, ${lit(r.s)}, ${lit(r.e)}, ${lit(src)}, 'block', ${lit(r.ref)}, ${lit(batch)}, ${lit(at)})`).join(', '),
    ));
  }
  if (stmts.length) await db.batch(stmts);
  clearAvailCache();
}

/** 엑셀로 최근 3일 안에 채운 공개 지점 수 */
export async function uploadCover(db) {
  const cover = parseJSON(await getMeta(db, 'upload_cover'), {}) || {};
  const vis = await loadSpaces(db);
  const fresh = vis.filter((s) => cover[s.code] && Date.now() - Date.parse(cover[s.code]) < 72 * 3600e3).length;
  return { fresh, total: vis.length };
}

/* ---------------- 라우트 ---------------- */
function needToken(c) {
  const tok = (c.req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!c.env.SYNC_TOKEN || !tok || !safeEqual(tok, c.env.SYNC_TOKEN)) throw new HttpError(401, '토큰이 올바르지 않아요.');
}

export function register(route) {
  // 정기 실행(10분마다) — Cloudflare Cron 워커가 부른다. SYNC_TOKEN 비밀값이 있어야 동작
  route('POST', '/api/sync/run', async (c) => {
    try { needToken(c); } catch (e) {
      // 실행기가 왔는데 토큰이 틀렸으면 관리자 화면에 알려 준다 (10분에 한 번만 기록)
      const bad = await getMeta(c.db, 'cron_bad_at');
      if (!bad || Date.now() - Date.parse(bad) > 600e3) await setMeta(c.db, 'cron_bad_at', nowIso());
      throw e;
    }
    const at = nowIso();
    const last = await getMeta(c.db, 'cron_at');
    if (last && Date.now() - Date.parse(last) < 50e3) return { at, ok: true, skipped: true, throttled: true };   // 1분 안에 또 부르면 그냥 넘긴다
    await setMeta(c.db, 'cron_at', at);
    await setMeta(c.db, 'host_try_at', at);
    let r = { ok: false, skipped: false, error: 'HOSTDB(호스트 예약 DB)가 연결되지 않았어요.' };
    if (c.env.HOSTDB) {
      const d = await syncHost(c.env, { reason: '정기' });
      r = { ok: !!d.ok, skipped: !!d.skipped, added: d.added || 0, removed: d.removed || 0, error: d.error || null };
    }
    c.wait(housekeep(c.db).catch(() => {}));
    return { at, ...r };
  });

  // 외부 수집기용 수신 API — SYNC_TOKEN 비밀값이 있어야 동작
  route('POST', '/api/sync/push', async (c) => {
    needToken(c);
    const b = await c.body();
    const spaces = await loadSpaces(c.db, { all: true });
    const { out, skipped } = cleanRows(b.rows, spaces);
    await writeRows(c.db, 'push', out, { replace: b.replace !== false, batch: 'push-' + Date.now() });
    await setMeta(c.db, 'push_at', nowIso());
    await c.db.prepare('INSERT INTO sync_log (src, at, ok, n, msg) VALUES (?, ?, 1, ?, ?)').bind('push', nowIso(), out.length, `수신 ${out.length}건, 제외 ${skipped.length}건`).run();
    return { ok: true, saved: out.length, skipped };
  });
}

export function registerAdmin(route) {
  route('GET', '/api/admin/sync', async (c) => {
    await c.needAdmin();
    const [diag, map, logs, cronAt, okAt, cronBadAt, upAt] = await Promise.all([
      getMeta(c.db, 'host_diag'), getMeta(c.db, 'host_map'),
      c.db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 30').all(),
      getMeta(c.db, 'cron_at'), getMeta(c.db, 'host_ok_at'), getMeta(c.db, 'cron_bad_at'), getMeta(c.db, 'upload_at'),
    ]);
    const counts = (await c.db.prepare(`SELECT src, COUNT(*) AS n FROM occ WHERE d >= ? GROUP BY src`).bind(todayKST()).all()).results || [];
    return {
      bound: { host: !!c.env.HOSTDB, photos: !!c.env.PHOTOS, push: !!c.env.SYNC_TOKEN },
      diag: parseJSON(diag, null), map: parseJSON(map, {}), logs: logs.results || [], counts,
      cronAt: cronAt || null, okAt: okAt || null, cronBadAt: cronBadAt || null, upAt: upAt || null,
      upCover: await uploadCover(c.db),
    };
  });

  // 호스트 DB가 실제로 쓰는 DB인지 눈으로 맞춰 보는 용도 — 가장 최근 등록된 예약 (이름·전화번호 없음)
  route('GET', '/api/admin/sync/recent', async (c) => {
    await c.needAdmin();
    return hostRecent(c.env, int(c.q.get('n'), { min: 5, max: 30, def: 15 }));
  });

  route('POST', '/api/admin/sync', async (c) => {
    await c.needAdmin();
    await setMeta(c.db, 'host_try_at', nowIso());
    const diag = await syncHost(c.env, { reason: '수동', force: true });
    return { synced: !!diag.ok, diag };
  });

  route('PUT', '/api/admin/hostmap', async (c) => {
    await c.needAdmin('admin');
    const b = await c.body();
    const map = {};
    if (b.table) map.table = str(b.table, { max: 60 });
    if (b.cols && typeof b.cols === 'object') {
      map.cols = {};
      for (const k of ['code', 'bname', 'bid', 'date', 'start', 'end', 'slot', 'status', 'resno']) {
        if (!b.cols[k]) continue;
        const v = str(b.cols[k], { max: 60 });
        if (isPersonalCol(v)) throw new HttpError(400, `"${v}" 칸은 고객 이름·연락처·메모가 들어 있는 칸이라 고를 수 없어요.`);
        map.cols[k] = v;
      }
    }
    if (b.alias && typeof b.alias === 'object') {
      map.alias = {};
      for (const [k, v] of Object.entries(b.alias).slice(0, 200)) if (okCode(v)) map.alias[str(k, { max: 60 })] = v;
    }
    await setMeta(c.db, 'host_map', JSON.stringify(map));
    return { ok: true };
  });

  // 달력 화면
  route('GET', '/api/admin/occ', async (c) => {
    await c.needAdmin();
    const from = isYmd(c.q.get('from')) ? c.q.get('from') : todayKST();
    const days = int(c.q.get('days'), { min: 1, max: 31, def: 14 });
    const to = addDays(from, days - 1);
    const rows = (await c.db.prepare('SELECT id, code, d, slot, s, e, src, kind, note FROM occ WHERE d >= ? AND d <= ? ORDER BY d, code').bind(addDays(from, -1), to).all()).results || [];
    const av = await computeAvail(c.db, { from, days });
    const spaces = (await loadSpaces(c.db, { all: true })).map((s) => ({ code: s.code, name: s.name, region: s.region, area: s.area, visible: s.visible }));
    return { from, days, rows, avail: av.spaces, spaces };
  });

  route('POST', '/api/admin/occ', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    if (!okCode(b.code) || !isYmd(b.d)) throw new HttpError(400, '지점과 날짜를 확인해 주세요.');
    const slot = ['all', 'day', 'night'].includes(b.slot) ? b.slot : 'all';
    const action = ['block', 'open', 'clear'].includes(b.action) ? b.action : 'block';
    const note = str(b.note, { max: 80 });
    const stmts = [c.db.prepare(`DELETE FROM occ WHERE src = 'manual' AND code = ? AND d = ? AND slot = ?`).bind(b.code, b.d, slot)];
    if (action !== 'clear') {
      const spaces = await loadSpaces(c.db, { all: true });
      const sp = spaces.find((s) => s.code === b.code);
      let s = null, e = null;
      if (action === 'block') {
        const pk = pkgsOf(sp || {});
        const fam = slot === 'all' ? pk : pk.filter((p) => p.fam === slot);
        if (fam.length) { s = Math.min(...fam.map((p) => p.s)); e = Math.max(...fam.map((p) => p.e)); }
        else { [s, e] = slotSpan(pk, slot); }
        if (slot === 'day') {
          // 낮 막기는 밤 패키지까지 번지지 않게 밤 시작 전까지만
          const night = pk.filter((p) => p.fam === 'night');
          if (night.length) e = Math.min(e, Math.min(...night.map((p) => p.s)));
        }
      }
      stmts.push(c.db.prepare(`INSERT INTO occ (code, d, slot, s, e, src, kind, note, created_at) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?)`)
        .bind(b.code, b.d, slot, s, e, action === 'open' ? 'open' : 'block', note || null, nowIso()));
    }
    await c.db.batch(stmts);
    clearAvailCache();
    return { ok: true };
  });

  route('POST', '/api/admin/occ/import', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const spaces = await loadSpaces(c.db, { all: true });
    const { out, skipped } = cleanRows(b.rows, spaces);
    if (!out.length) throw new HttpError(400, '반영할 예약이 없어요. 지점과 날짜 열을 확인해 주세요.');
    const batch = 'up-' + Date.now();
    await writeRows(c.db, 'upload', out, { replace: b.replace !== false, batch });
    const upAt = nowIso();
    await setMeta(c.db, 'upload_at', upAt);
    // 지점마다 언제 엑셀이 들어왔는지 — 모든 공개 지점이 최근 3일 안에 채워졌을 때만 '예약 가능'을 보여 준다
    const cover = parseJSON(await getMeta(c.db, 'upload_cover'), {}) || {};
    for (const code of new Set(out.map((r) => r.code))) cover[code] = upAt;
    await setMeta(c.db, 'upload_cover', JSON.stringify(cover));
    await c.db.prepare('INSERT INTO sync_log (src, at, ok, n, msg) VALUES (?, ?, 1, ?, ?)')
      .bind('upload', nowIso(), out.length, `${str(b.file, { max: 80 }) || '엑셀'} · ${out.length}건 반영, ${skipped.length}건 제외`).run();
    return { ok: true, saved: out.length, skipped: skipped.length, batch };
  });

  route('DELETE', '/api/admin/occ/upload', async (c) => {
    await c.needAdmin();
    await c.db.prepare(`DELETE FROM occ WHERE src = 'upload'`).run();
    await setMeta(c.db, 'upload_cover', '{}');
    clearAvailCache();
    return { ok: true };
  });
}
