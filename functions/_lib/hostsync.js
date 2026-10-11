// 호스트 예약 DB(HOSTDB) 읽기 전용 동기화 + 엑셀/수동/수신 API 방막기
//  · HOSTDB 에는 어떤 쓰기도 하지 않는다 (SELECT / PRAGMA 만 사용)
//  · 고객 이름·연락처는 가져오지 않는다. 지점·날짜·시간·예약번호 해시만 남긴다.
import {
  HttpError, lit, qid, addDays, todayKST, nowIso, sha256hex, chunk, isYmd, parseJSON, int, str, safeEqual,
} from './util.js';
import { getMeta, setMeta, getSettings } from './db.js';
import { loadSpaces, makeResolver } from './spaces.js';
import { pkgsOf, slotSpan, clearAvailCache, computeAvail } from './avail.js';

const CANCEL = /취소|cancel|환불|refund|거절|reject|삭제|delete|void|만료|expire/i;
const WIN_BACK = 2;
const WIN_FWD = 150;

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
  const col = {
    code: mc.code || pickCol(cols, ['branch_code', 'space_code', 'store_code', 'scode', 'spot_code', 'room_code'], { exclude: /_id$/i }),
    bname: mc.bname || pickCol(cols, ['branch_name', 'space_name', 'store_name', 'shop_name', 'room_name', 'place_name', 'branch', 'space', 'store', '지점'], { exclude: /_id$|id$|code$/i }),
    bid: mc.bid || pickCol(cols, ['branch_id', 'space_id', 'store_id', 'room_id', 'shop_id', 'place_id'], { loose: false }),
    date: mc.date || pickCol(cols, ['use_date', 'res_date', 'reserve_date', 'reservation_date', 'booking_date', 'checkin_date', 'visit_date', 'start_date', 'use_day', 'date', 'ymd', '이용일'], { exclude: notTime }),
    start: mc.start || pickCol(cols, ['start_t', 'start_time', 'checkin_time', 'from_time', 'start_at', 'starts_at', 'begin_at', 'start'], { exclude: notTime }),
    end: mc.end || pickCol(cols, ['end_t', 'end_time', 'checkout_time', 'to_time', 'end_at', 'ends_at', 'finish_at', 'end'], { exclude: notTime }),
    slot: mc.slot || pickCol(cols, ['slot', 'time_slot', 'slot_type', 'time_type', 'package', 'pkg', 'product_name', 'item_name', 'product', 'session', '구분'], { exclude: /_id$/i }),
    status: mc.status || pickCol(cols, ['status', 'state', 'res_status', 'reservation_status', 'booking_status', '상태'], { exclude: /deposit|pay|refund/i }),
    resno: mc.resno || pickCol(cols, ['resno', 'reservation_no', 'res_no', 'booking_no', 'reservation_code', 'booking_code', 'order_no', 'code', 'number', '예약번호'], { exclude: /branch|space|store/i }),
  };
  if (col.bname && col.bname === col.bid) col.bname = null;
  if (col.start && col.start === col.date) col.start = null;
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
  return { tables, tbl, cols, col, bmapInfo, closures };
}

async function loadBranchMap(H, info) {
  if (!info) return null;
  const sel = [`${qid(info.id)} AS id`];
  if (info.code) sel.push(`${qid(info.code)} AS code`);
  if (info.name) sel.push(`${qid(info.name)} AS name`);
  const rs = (await H.prepare(`SELECT ${sel.join(', ')} FROM ${qid(info.table)}`).all()).results || [];
  return new Map(rs.map((r) => [String(r.id), r]));
}

/** 예약 표에서 필요한 칸만 읽는다 — 고객 이름·전화번호 같은 칸은 아예 가져오지 않는다 */
function selCols(D) {
  const set = new Set(Object.values(D.col).filter(Boolean));
  if (D.cols && D.cols.includes('id')) set.add('id');
  return [...set].map(qid).join(', ') || qid(D.col.date);
}
const CLOSURE_COLS = ['id', 'branch_id', 'branch_code', 'branch_name', 'slot', 'kind', 'weekday', 'start_date', 'end_date', 'date', 'd', 'day'];

function okCode(c) { return typeof c === 'string' && /^S-\d{4}$/.test(c); }
function okSlot(s) { return s == null || /^[a-z0-9]{1,10}$/.test(s); }

/* ---------------- 동기화 ---------------- */
let running = null;
export async function syncHost(env, { reason = 'auto' } = {}) {
  if (running) return running;
  running = doSync(env, reason).finally(() => { running = null; });
  return running;
}

async function doSync(env, reason) {
  const db = env.DB;
  const at = nowIso();
  const diag = { at, reason, bound: !!env.HOSTDB, ok: false };
  try {
    if (!env.HOSTDB) throw new Error('HOSTDB(호스트 예약 DB)가 연결되지 않았어요.');
    const H = env.HOSTDB;
    const hm = parseJSON(await getMeta(db, 'host_map'), {}) || {};
    const D = await detect(H, hm);
    diag.tables = D.tables;
    if (D.error) throw new Error(D.error);
    diag.table = D.tbl; diag.columns = D.cols; diag.col = D.col; diag.branchTable = D.bmapInfo?.table || null; diag.closuresTable = D.closures;
    const col = D.col;
    if (!col.date) throw new Error(`예약 표(${D.tbl})에서 이용 날짜 칸을 찾지 못했어요.`);
    if (!col.code && !col.bname && !col.bid) throw new Error(`예약 표(${D.tbl})에서 지점 칸을 찾지 못했어요.`);

    const today = todayKST();
    const from = addDays(today, -WIN_BACK), to = addDays(today, WIN_FWD);
    const T = qid(D.tbl), DC = qid(col.date);
    const sample = (await H.prepare(`SELECT ${DC} AS d FROM ${T} WHERE ${DC} IS NOT NULL LIMIT 5`).all()).results || [];
    const iso = sample.length > 0 && sample.every((r) => /^\d{4}-\d{2}-\d{2}/.test(String(r.d)));
    let rows;
    if (iso) {
      rows = (await H.prepare(`SELECT ${selCols(D)} FROM ${T} WHERE substr(${DC}, 1, 10) BETWEEN ? AND ? LIMIT 20000`).bind(from, to).all()).results || [];
      const st = await H.prepare(`SELECT COUNT(*) AS n, MAX(substr(${DC}, 1, 10)) AS mx FROM ${T}`).first();
      diag.total = st?.n ?? null; diag.latest = st?.mx ?? null;
    } else {
      rows = (await H.prepare(`SELECT ${selCols(D)} FROM ${T} LIMIT 20000`).all()).results || [];
      diag.total = rows.length;
    }
    if (D.cols.includes('created_at')) {
      const lc = await H.prepare(`SELECT MAX(created_at) AS mx FROM ${T}`).first();
      diag.latestCreated = lc?.mx ?? null;
    }

    const spaces = await loadSpaces(db, { all: true });
    const resolve = makeResolver(spaces, hm.alias || {});
    const byCode = Object.fromEntries(spaces.map((s) => [s.code, s]));
    const bmap = await loadBranchMap(H, D.bmapInfo);
    const unmatched = {};
    const statuses = {};
    const out = [];
    let inWin = 0, active = 0;
    for (const r of rows) {
      const d = normDate(r[col.date]);
      if (!d || d < from || d > to) continue;
      inWin++;
      const stRaw = col.status ? String(r[col.status] ?? '') : '';
      if (stRaw) statuses[stRaw] = (statuses[stRaw] || 0) + 1;
      if (CANCEL.test(stRaw)) continue;
      active++;
      const labels = [];
      if (col.code) labels.push(r[col.code]);
      if (bmap && col.bid) { const b = bmap.get(String(r[col.bid])); if (b) { labels.push(b.code); labels.push(b.name); } }
      if (col.bname) labels.push(r[col.bname]);
      let code = null;
      for (const l of labels) { code = resolve(l); if (code) break; }
      if (!code) {
        const show = labels.find((l) => l != null && String(l).trim()) ?? (col.bid ? `#${r[col.bid]}` : '(빈칸)');
        unmatched[String(show)] = (unmatched[String(show)] || 0) + 1;
        continue;
      }
      const sMin = col.start ? normTime(r[col.start]) : (iso ? null : normTime(r[col.date]));
      const eMin = col.end ? normTime(r[col.end]) : null;
      const slot = slotOf(col.slot ? r[col.slot] : '') || null;
      const sp = spanFor(byCode[code], slot, sMin, eMin);
      const no = col.resno ? r[col.resno] : (r.id ?? '');
      out.push({ code, d, slot: okSlot(sp.slot) ? sp.slot : null, s: sp.s, e: sp.e, ref: (await sha256hex('r|' + String(no))).slice(0, 12) });
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
            const sp = spanFor(byCode[code], slot === 'all' ? 'all' : slot, null, null);
            out.push({ code, d, slot: sp.slot, s: sp.s, e: sp.e, ref: 'cl' + String(c.id ?? '').slice(0, 8) });
            closN++;
          }
        }
      } catch (e) { diag.closuresError = String(e.message || e); }
    }

    const clean = out.filter((r) => okCode(r.code) && isYmd(r.d) && okSlot(r.slot));
    const stmts = [db.prepare(`DELETE FROM occ WHERE src = 'host'`)];
    for (const part of chunk(clean, 400)) {
      stmts.push(db.prepare(
        'INSERT INTO occ (code, d, slot, s, e, src, kind, ref, created_at) VALUES '
        + part.map((r) => `(${lit(r.code)}, ${lit(r.d)}, ${lit(r.slot)}, ${lit(r.s)}, ${lit(r.e)}, 'host', 'block', ${lit(String(r.ref).replace(/[^\w]/g, ''))}, ${lit(at)})`).join(', '),
      ));
    }
    await db.batch(stmts);
    clearAvailCache();

    Object.assign(diag, {
      ok: true, window: [from, to], rowsInWindow: inWin, active, blocks: clean.length, closures: closN,
      unmatched: Object.entries(unmatched).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([label, n]) => ({ label, n })),
      statuses: Object.entries(statuses).slice(0, 20).map(([s, n]) => ({ s, n })),
    });
    await setMeta(db, 'host_ok_at', at);
  } catch (e) {
    diag.error = String(e.message || e);
  }
  await setMeta(db, 'host_diag', JSON.stringify(diag));
  await db.prepare('INSERT INTO sync_log (src, at, ok, n, msg) VALUES (?, ?, ?, ?, ?)')
    .bind('host', at, diag.ok ? 1 : 0, diag.blocks || 0, diag.ok ? `${reason} · 예약 ${diag.active}건 → 마감 ${diag.blocks}칸` : diag.error).run();
  if (Math.random() < 0.1) await db.prepare('DELETE FROM sync_log WHERE id < (SELECT MAX(id) - 300 FROM sync_log)').run();
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

/* ---------------- 방문 인증용 예약 확인 ---------------- */
export async function hostFindReservation(env, { code, d, resno }) {
  if (!env.HOSTDB) return { ok: false, reason: 'nobind' };
  try {
    const hm = parseJSON(await getMeta(env.DB, 'host_map'), {}) || {};
    const D = await detect(env.HOSTDB, hm);
    if (D.error || !D.col.resno || !D.col.date) return { ok: false, reason: 'nodetect' };
    const want = String(resno).trim();
    const rs = (await env.HOSTDB.prepare(`SELECT ${selCols(D)} FROM ${qid(D.tbl)} WHERE CAST(${qid(D.col.resno)} AS TEXT) = ? LIMIT 5`).bind(want).all()).results || [];
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

/* ---------------- 라우트 ---------------- */
export function register(route) {
  // 외부 수집기용 수신 API — SYNC_TOKEN 비밀값이 있어야 동작
  route('POST', '/api/sync/push', async (c) => {
    const tok = (c.req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!c.env.SYNC_TOKEN || !tok || !safeEqual(tok, c.env.SYNC_TOKEN)) throw new HttpError(401, '토큰이 올바르지 않아요.');
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
    const [diag, map, logs] = await Promise.all([
      getMeta(c.db, 'host_diag'), getMeta(c.db, 'host_map'),
      c.db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 30').all(),
    ]);
    const counts = (await c.db.prepare(`SELECT src, COUNT(*) AS n FROM occ WHERE d >= ? GROUP BY src`).bind(todayKST()).all()).results || [];
    return {
      bound: { host: !!c.env.HOSTDB, photos: !!c.env.PHOTOS, push: !!c.env.SYNC_TOKEN },
      diag: parseJSON(diag, null), map: parseJSON(map, {}), logs: logs.results || [], counts,
    };
  });

  route('POST', '/api/admin/sync', async (c) => {
    await c.needAdmin();
    await setMeta(c.db, 'host_try_at', nowIso());
    const diag = await syncHost(c.env, { reason: '수동' });
    return { synced: !!diag.ok, diag };
  });

  route('PUT', '/api/admin/hostmap', async (c) => {
    await c.needAdmin('admin');
    const b = await c.body();
    const map = {};
    if (b.table) map.table = str(b.table, { max: 60 });
    if (b.cols && typeof b.cols === 'object') {
      map.cols = {};
      for (const k of ['code', 'bname', 'bid', 'date', 'start', 'end', 'slot', 'status', 'resno']) if (b.cols[k]) map.cols[k] = str(b.cols[k], { max: 60 });
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
    await setMeta(c.db, 'upload_at', nowIso());
    await c.db.prepare('INSERT INTO sync_log (src, at, ok, n, msg) VALUES (?, ?, 1, ?, ?)')
      .bind('upload', nowIso(), out.length, `${str(b.file, { max: 80 }) || '엑셀'} · ${out.length}건 반영, ${skipped.length}건 제외`).run();
    return { ok: true, saved: out.length, skipped: skipped.length, batch };
  });

  route('DELETE', '/api/admin/occ/upload', async (c) => {
    await c.needAdmin();
    await c.db.prepare(`DELETE FROM occ WHERE src = 'upload'`).run();
    clearAvailCache();
    return { ok: true };
  });
}
