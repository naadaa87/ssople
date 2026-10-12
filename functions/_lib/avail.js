// 예약 현황(빈 방 / 마감) 계산
//  - occ 표: 호스트 동기화(host) · 엑셀 업로드(upload) · 수동 방막기(manual) · 수신 API(push)
//  - 지점마다 패키지 시간(분 단위)을 겹쳐 보고 판단한다. 고객 개인정보는 다루지 않는다.
import { HttpError, addDays, dayDiff, todayKST, kstMinuteOfDay, isYmd, weekdayOf, int, nowIso, parseJSON } from './util.js';
import { getSettings, getMeta } from './db.js';
import { loadSpaces } from './spaces.js';

export const DEF_SPAN = {
  day: [720, 1020], night: [1140, 2040], allday: [720, 1320], tonight: [1140, 1440],
  morning: [540, 900], hour3: [720, 1020], full: [720, 2040],
};

export function pkgsOf(space) {
  return (space.pkgs || []).map((p) => {
    const d = DEF_SPAN[p.k] || [720, 1020];
    const s = Number.isFinite(p.s) ? p.s : d[0];
    const e = Number.isFinite(p.e) ? p.e : d[1];
    return { k: p.k, fam: p.fam || (s >= 1020 ? 'night' : 'day'), s, e, p: p.p || [] };
  });
}

export function slotSpan(pk, slot) {
  if (!slot || slot === 'all' || slot === 'etc') {
    if (!pk.length) return [0, 1440];
    return [Math.min(...pk.map((p) => p.s)), Math.max(...pk.map((p) => p.e))];
  }
  const exact = pk.find((p) => p.k === slot);
  if (exact) return [exact.s, exact.e];
  if (DEF_SPAN[slot]) return DEF_SPAN[slot];
  return slotSpan(pk, 'all');
}

// 요금표 칸: 0=월~목, 1=금, 2=토, 3=일
export const priceIdx = (ymd) => { const w = weekdayOf(ymd); return w === 5 ? 1 : w === 6 ? 2 : w === 0 ? 3 : 0; };

function agg(list) {
  if (!list.length) return '-';
  if (list.includes('o')) return 'o';
  if (list.includes('b')) return 'b';
  return 'c';
}

/** 지점 하나의 날짜별 상태 */
export function spaceStatus(space, rows, { from, days, nowAbs, detail }) {
  const pk = pkgsOf(space);
  const abs = (d, m) => dayDiff(from, d) * 1440 + m;
  const blocks = [];
  const opens = new Set();
  for (const r of rows) {
    if (r.kind === 'open') { opens.add(r.d + '|' + (r.slot || 'all')); continue; }
    const [s, e] = Number.isFinite(r.s) && Number.isFinite(r.e) && r.e > r.s ? [r.s, r.e] : slotSpan(pk, r.slot);
    blocks.push([abs(r.d, s), abs(r.d, e)]);
  }
  let code = '';
  const det = detail ? {} : null;
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const pi = priceIdx(d);
    const fam = { day: [], night: [] };
    const one = {};
    for (const p of pk) {
      if (!p.p[pi]) { one[p.k] = '-'; continue; }   // 그 요일엔 없는 패키지
      const S = abs(d, p.s), E = abs(d, p.e);
      let st;
      if (S <= nowAbs) st = 'c';
      else if (opens.has(d + '|' + p.k) || opens.has(d + '|' + p.fam) || opens.has(d + '|all')) st = 'o';
      else if (blocks.some((b) => b[0] < E && S < b[1])) st = 'b';
      else st = 'o';
      one[p.k] = st;
      (fam[p.fam] || fam.day).push(st);
    }
    code += agg(fam.day) + agg(fam.night);
    if (det) det[d] = one;
  }
  return { code, detail: det };
}

/* ---------------- 살아 있는 데이터인지 ---------------- */
export async function liveState(db, settings) {
  const mode = settings['avail.mode'] || 'auto';
  if (mode === 'off') return { show: false, live: false, mode };
  if (mode === 'on') return { show: true, live: true, mode };
  const [hostOk, upAt, pushAt, coverRaw] = await Promise.all([
    getMeta(db, 'host_ok_at'), getMeta(db, 'upload_at'), getMeta(db, 'push_at'), getMeta(db, 'upload_cover'),
  ]);
  const fresh = (iso, h) => iso && Date.now() - Date.parse(iso) < h * 3600e3;
  let live = !!(fresh(hostOk, 6) || fresh(pushAt, 24));
  if (!live && fresh(upAt, 72)) {
    // 엑셀만 쓸 때: 공개 지점 전부가 최근 3일 안에 채워졌을 때만 '예약 가능'을 보여 준다.
    // 일부 지점만 올렸으면 그 지점들의 마감 칸만 보이고, 나머지는 '네이버에서 확인'으로 둔다.
    const cover = parseJSON(coverRaw, {}) || {};
    const vis = await loadSpaces(db);
    live = vis.length > 0 && vis.every((s) => fresh(cover[s.code], 72));
  }
  return { show: true, live, mode, hostOk, upAt, pushAt };
}

/* ---------------- 짧은 캐시 ---------------- */
const memo = new Map();
export function clearAvailCache() { memo.clear(); }

export async function computeAvail(db, { from, days, codes = null, detail = false }) {
  const key = [from, days, codes ? codes.join(',') : '*', detail ? 1 : 0].join('|');
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < 30000) return hit.v;
  const all = await loadSpaces(db);
  const list = codes ? all.filter((s) => codes.includes(s.code)) : all;
  const to = addDays(from, days - 1);
  let sql = 'SELECT code, d, slot, s, e, src, kind FROM occ WHERE d >= ? AND d <= ?';
  const binds = [addDays(from, -1), to];
  if (codes && codes.length === 1) { sql += ' AND code = ?'; binds.push(codes[0]); }
  const rows = (await db.prepare(sql).bind(...binds).all()).results || [];
  const by = {};
  for (const r of rows) (by[r.code] = by[r.code] || []).push(r);
  const today = todayKST();
  const nowAbs = dayDiff(from, today) * 1440 + kstMinuteOfDay();
  const out = {};
  const det = {};
  for (const s of list) {
    const r = spaceStatus(s, by[s.code] || [], { from, days, nowAbs, detail });
    out[s.code] = r.code;
    if (detail) det[s.code] = r.detail;
  }
  const v = { from, days, today, spaces: out, detail: detail ? det : undefined };
  memo.set(key, { t: Date.now(), v });
  if (memo.size > 200) memo.delete(memo.keys().next().value);
  return v;
}

export function register(route, { maybeSync }) {
  route('GET', '/api/avail', async (c) => {
    const settings = await getSettings(c.db);
    const today = todayKST();
    let from = c.q.get('from') || today;
    if (!isYmd(from)) throw new HttpError(400, '날짜 형식이 올바르지 않아요.');
    if (dayDiff(today, from) < 0) from = today;
    if (dayDiff(today, from) > 120) throw new HttpError(400, '오늘부터 4개월 안의 날짜만 볼 수 있어요.');
    const days = int(c.q.get('days'), { min: 1, max: 62, def: 14, name: '기간' });
    const code = c.q.get('code');
    const codes = code ? code.split(',').filter((x) => /^S-\d{4}$/.test(x)).slice(0, 50) : null;
    const detail = c.q.get('detail') === '1' && codes && codes.length === 1;
    if (maybeSync && c.env.HOSTDB) {
      // 10분마다 도는 실행기(ssople-sync)가 살아 있으면 고객 요청에서는 따로 읽지 않는다
      const [last, cron] = await Promise.all([getMeta(c.db, 'host_ok_at'), getMeta(c.db, 'cron_at')]);
      const cronOn = cron && Date.now() - Date.parse(cron) < 30 * 60e3;
      if (!cronOn) {
        // 실행기가 없으면: 마지막으로 잘 불러온 지 30분이 넘었을 때 이번 요청에서 먼저 새로 읽고 보여 준다 (밤사이 들어온 예약 반영)
        if (!last || Date.now() - Date.parse(last) > 30 * 60e3) { try { await maybeSync(c.env, settings); } catch { /* 표시는 계속 */ } }
        else c.wait(maybeSync(c.env, settings).catch(() => {}));
      }
    }
    const st = await liveState(c.db, settings);
    if (!st.show) return { show: false };
    const v = await computeAvail(c.db, { from, days, codes, detail });
    return { show: true, live: st.live, ...v, asOf: st.hostOk || st.pushAt || st.upAt || null };
  });

  // 네이버 예약·플레이스 버튼 클릭 기록 (개인정보 없이 지점·패키지·날짜만)
  route('POST', '/api/click', async (c) => {
    let b = {};
    try { b = JSON.parse(await c.req.text() || '{}'); } catch { b = {}; }
    const code = /^S-\d{4}$/.test(b.code) ? b.code : null;
    if (!code) return { ok: true };
    const kind = ['book', 'place', 'call', 'kakao', 'share'].includes(b.kind) ? b.kind : 'book';
    const pkg = /^[a-z0-9]{1,10}$/.test(b.pkg || '') ? b.pkg : null;
    const d = isYmd(b.d) ? b.d : null;
    const ih = await c.ih();
    await c.limit('ck:' + ih, 120, 600);
    await c.db.prepare('INSERT INTO clicks (code, kind, pkg, d, at, ih) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(code, kind, pkg, d, nowIso(), ih).run();
    return { ok: true };
  });
}
