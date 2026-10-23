// 시즌 준비 — 공간대여 시즌 달력과 시즌별 할 일 (관리자)
// 기본 할 일은 seasons-data.js 에서 날짜를 계산하고, 운영진이 체크·고친 값만 season_tasks 표에 남긴다.
import { HttpError, todayKST, addDays, dayDiff, isYmd, str, nowIso, parseJSON, weekdayOf } from './util.js';
import { getMeta, setMeta } from './db.js';
import { SEASONS, LUNAR, KEY_FIXED, KEY_YEAR, MONTH_INDEX, LEVELS, CATS, INDEX_SRC } from './seasons-data.js';

const BACK = 14;      // 지난 시즌도 2주 동안은 남은 일을 보여 준다
const AHEAD = 365;    // 앞으로 1년 안에 마감이 있는 시즌
const SKEY_RE = /^(\d{4}):([A-Za-z]{2,20})$/;
const BY_ID = Object.fromEntries(SEASONS.map((s) => [s.id, s]));

function rangeOf(s, y, dates) {
  const key = `${y}:${s.id}`;
  if (dates[key] && isYmd(dates[key][0]) && isYmd(dates[key][1])) return { key, start: dates[key][0], end: dates[key][1], custom: true };
  if (s.lunar) {
    const l = LUNAR[y] && LUNAR[y][s.lunar];
    return l ? { key, start: l[0], end: l[1] } : { key, start: null, end: null };
  }
  const [a, b] = s.when(y);
  return { key, start: a, end: b };
}
const dueOf = (t, r) => (typeof t[1] === 'number' ? addDays(r.start, t[1]) : addDays(r.end, t[1].end));

/** 오늘 기준으로 보여 줄 시즌 목록 (날짜 계산만, DB 없이) */
export function instances(today, dates = {}) {
  const from = addDays(today, -BACK), to = addDays(today, AHEAD);
  const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4)) + 1;
  const list = [], missing = [];
  for (let y = y0; y <= y1; y++) {
    for (const s of SEASONS) {
      const r = rangeOf(s, y, dates);
      if (!r.start) {
        if (y >= Number(today.slice(0, 4)) && y <= Number(to.slice(0, 4))) missing.push({ key: r.key, id: s.id, y, name: s.name });
        continue;
      }
      const tasks = s.tasks.map((t) => ({ tkey: t[0], due: dueOf(t, r), cat: t[2], title: t[3], detail: t[4] || '', link: t[5] || null }));
      const first = tasks.reduce((m, t) => (t.due < m ? t.due : m), r.start);
      const last = tasks.reduce((m, t) => (t.due > m ? t.due : m), r.end);
      if (last < from || first > to) continue;
      list.push({
        key: r.key, id: s.id, y, name: s.name, level: s.level, levelName: LEVELS[s.level], start: r.start, end: r.end,
        customDates: !!r.custom, lunar: !!s.lunar, who: s.who || [], points: s.points || [], links: s.links || [],
        idx: (s.months || []).map((m) => [m, MONTH_INDEX[m] ?? null]), tasks,
      });
    }
  }
  list.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  return { from, to, list, missing };
}

async function datesOf(db) { return parseJSON(await getMeta(db, 'season_dates'), {}) || {}; }

/** 시즌 목록 + 운영진이 체크·고친 값 + 직접 더한 할 일 */
export async function loadPlan(db, today = todayKST()) {
  const dates = await datesOf(db);
  const plan = instances(today, dates);
  const keys = plan.list.map((i) => i.key);
  const rows = keys.length
    ? ((await db.prepare(`SELECT * FROM season_tasks WHERE skey IN (${keys.map(() => '?').join(',')})`).bind(...keys).all()).results || [])
    : [];
  const byKey = new Map(rows.filter((r) => r.tkey).map((r) => [r.skey + '|' + r.tkey, r]));
  const view = (skey, base, r) => {
    const due = (r && r.due) || base.due;
    return {
      id: r ? r.id : null, skey, tkey: base.tkey || null, custom: !!(r && r.custom),
      title: (r && r.title) || base.title, detail: base.detail || '', cat: (r && r.cat) || base.cat, due, dday: dayDiff(today, due),
      done: !!(r && r.done), doneAt: (r && r.done_at) || null, owner: (r && r.owner) || '', memo: (r && r.memo) || '',
      hidden: !!(r && r.hidden), link: base.link || null, edited: !!(r && (r.title || r.due || r.cat)),
    };
  };
  for (const i of plan.list) {
    const tasks = i.tasks.map((t) => view(i.key, t, byKey.get(i.key + '|' + t.tkey)));
    for (const r of rows) if (r.skey === i.key && !r.tkey) tasks.push(view(i.key, { title: r.title, cat: r.cat, due: r.due, detail: '' }, r));
    tasks.sort((a, b) => a.due.localeCompare(b.due) || (a.custom - b.custom));
    i.tasks = tasks;
    const live = tasks.filter((t) => !t.hidden);
    i.total = live.length;
    i.done = live.filter((t) => t.done).length;
    i.late = live.filter((t) => !t.done && t.due < today).length;
    i.state = today < i.start ? 'before' : today > i.end ? 'after' : 'now';
    i.dday = dayDiff(today, i.start);
  }
  plan.today = today;
  plan.dates = dates;
  return plan;
}

/** 한눈에·메뉴 숫자용 요약 */
export function summarize(plan) {
  const today = plan.today;
  const open = plan.list.flatMap((i) => i.tasks.filter((t) => !t.done && !t.hidden).map((t) => ({ ...t, season: i.name })));
  const late = open.filter((t) => t.due < today);
  const week = open.filter((t) => t.due >= today && t.due <= addDays(today, 7));
  const cur = plan.list.filter((i) => i.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  const pick = (i) => i && { key: i.key, name: i.name, level: i.level, levelName: i.levelName, start: i.start, end: i.end, dday: i.dday, state: i.state, done: i.done, total: i.total };
  return {
    late: late.length, week: week.length,
    now: cur.filter((i) => i.state === 'now').map(pick),
    next: pick(cur.find((i) => i.state === 'before')),
    top: late.concat(week).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5).map((t) => ({ title: t.title, season: t.season, due: t.due, dday: t.dday })),
  };
}

/** 앞으로 12달 — 계절지수·시즌·챙길 날 */
function months(today, plan) {
  const out = [];
  let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  for (let k = 0; k < 12; k++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    const keys = KEY_FIXED.filter(([md]) => md.startsWith(String(m).padStart(2, '0') + '-')).map(([md, n]) => [`${y}-${md}`, n]);
    for (const [d, n] of KEY_YEAR[y] || []) if (d.startsWith(ym)) keys.push([d, n]);
    if (m === 5) { const d = thirdMonday(y, 5); keys.push([d, '성년의 날']); }
    for (const i of plan.list) if (i.lunar && i.start.startsWith(ym)) keys.push([i.start, i.name + ' 시작']);
    keys.sort((a, b) => a[0].localeCompare(b[0]));
    const idx = MONTH_INDEX[m] ?? null;
    const seasons = plan.list.filter((i) => i.start.slice(0, 7) <= ym && i.end.slice(0, 7) >= ym).map((i) => ({ key: i.key, name: i.name, level: i.level }));
    out.push({ ym, y, m, idx, level: idx == null ? null : idx >= 150 ? 'peak' : idx >= 100 ? 'high' : idx < 85 ? 'low' : 'mid', keys, seasons });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
function thirdMonday(y, m) {
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const w = weekdayOf(first);
  return addDays(first, ((8 - w) % 7) + 14);
}

/** 앞으로 12주 수요 신호 — 예약 버튼 클릭(이용 날짜 기준)과 마감된 칸 */
async function signals(db, today) {
  const mon = addDays(today, -((weekdayOf(today) + 6) % 7));
  const end = addDays(mon, 7 * 12 - 1);
  const [ck, oc] = await Promise.all([
    db.prepare(`SELECT d, COUNT(*) AS n FROM clicks WHERE d >= ? AND d <= ? AND kind IN ('book', 'place') GROUP BY d`).bind(mon, end).all(),
    db.prepare(`SELECT d, src, COUNT(*) AS n FROM occ WHERE d >= ? AND d <= ? GROUP BY d, src`).bind(mon, end).all(),
  ]);
  const weeks = Array.from({ length: 12 }, (_, k) => ({ start: addDays(mon, 7 * k), end: addDays(mon, 7 * k + 6), clicks: 0, booked: 0, blocked: 0 }));
  const wk = (d) => Math.floor(dayDiff(mon, d) / 7);
  for (const r of ck.results || []) { const w = weeks[wk(r.d)]; if (w) w.clicks += r.n; }
  for (const r of oc.results || []) { const w = weeks[wk(r.d)]; if (w) { if (r.src === 'manual') w.blocked += r.n; else w.booked += r.n; } }
  return weeks;
}

function cleanDue(v, name = '마감일') {
  if (!isYmd(v)) throw new HttpError(400, `${name}을 날짜로 골라 주세요.`);
  return v;
}

export function register(route) {
  route('GET', '/api/admin/seasons', async (c) => {
    const lv = await c.needAdmin();
    const today = todayKST();
    const plan = await loadPlan(c.db, today);
    return {
      today, indexSrc: INDEX_SRC, cats: CATS, levels: LEVELS,
      months: months(today, plan), seasons: plan.list, missing: plan.missing,
      summary: summarize(plan), signals: await signals(c.db, today), canEditDates: lv === 'admin',
    };
  });

  // 기본 할 일 체크·고치기·숨기기 (skey + tkey) / 직접 더한 할 일 고치기 (id)
  route('PUT', '/api/admin/seasons/task', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    let row = null, skey, tkey = null;
    if (b.id) {
      row = await c.db.prepare('SELECT * FROM season_tasks WHERE id = ?').bind(Number(b.id) || 0).first();
      if (!row) throw new HttpError(404, '할 일을 찾을 수 없어요.');
      skey = row.skey; tkey = row.tkey;
    } else {
      skey = String(b.skey || ''); tkey = String(b.tkey || '');
      const m = SKEY_RE.exec(skey);
      const s = m && BY_ID[m[2]];
      if (!s || !s.tasks.some((t) => t[0] === tkey)) throw new HttpError(400, '시즌 할 일을 찾을 수 없어요.');
      row = await c.db.prepare('SELECT * FROM season_tasks WHERE skey = ? AND tkey = ?').bind(skey, tkey).first();
    }
    const next = {
      title: row ? row.title : null, cat: row ? row.cat : null, due: row ? row.due : null,
      owner: row ? row.owner : null, memo: row ? row.memo : null,
      done: row ? row.done : 0, done_at: row ? row.done_at : null, hidden: row ? row.hidden : 0,
    };
    if ('title' in b) next.title = str(b.title, { max: 60, name: '할 일' }) || (row && row.custom ? row.title : null);
    if ('cat' in b) next.cat = CATS.includes(b.cat) ? b.cat : null;
    if ('due' in b) next.due = b.due ? cleanDue(b.due) : null;
    if ('owner' in b) next.owner = str(b.owner, { max: 20, name: '담당' }) || null;
    if ('memo' in b) next.memo = str(b.memo, { max: 300, multiline: true, name: '메모' }) || null;
    if ('done' in b) { next.done = b.done ? 1 : 0; next.done_at = b.done ? nowIso() : null; }
    if ('hidden' in b) next.hidden = b.hidden ? 1 : 0;
    if (row && row.custom && !next.title) throw new HttpError(400, '할 일 내용을 적어 주세요.');
    const at = nowIso();
    if (row) {
      await c.db.prepare('UPDATE season_tasks SET title = ?, cat = ?, due = ?, owner = ?, memo = ?, done = ?, done_at = ?, hidden = ?, updated_at = ? WHERE id = ?')
        .bind(next.title, next.cat, next.due, next.owner, next.memo, next.done, next.done_at, next.hidden, at, row.id).run();
      return { ok: true, id: row.id };
    }
    const r = await c.db.prepare(
      `INSERT INTO season_tasks (skey, tkey, title, cat, due, owner, memo, done, done_at, hidden, custom, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?) RETURNING id`,
    ).bind(skey, tkey, next.title, next.cat, next.due, next.owner, next.memo, next.done, next.done_at, next.hidden, at, at).first();
    return { ok: true, id: r.id };
  });

  // 할 일 직접 더하기
  route('POST', '/api/admin/seasons/task', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const skey = String(b.skey || '');
    const m = SKEY_RE.exec(skey);
    if (!m || !BY_ID[m[2]]) throw new HttpError(400, '시즌을 골라 주세요.');
    const title = str(b.title, { max: 60, required: true, name: '할 일' });
    const due = cleanDue(b.due);
    const at = nowIso();
    const n = await c.db.prepare('SELECT COUNT(*) AS n FROM season_tasks WHERE skey = ? AND custom = 1').bind(skey).first();
    if (n && n.n >= 40) throw new HttpError(400, '한 시즌에 직접 더하는 할 일은 40개까지예요.');
    const r = await c.db.prepare(
      `INSERT INTO season_tasks (skey, tkey, title, cat, due, owner, memo, done, hidden, custom, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?) RETURNING id`,
    ).bind(skey, title, CATS.includes(b.cat) ? b.cat : '예약 운영', due, str(b.owner, { max: 20, name: '담당' }) || null,
      str(b.memo, { max: 300, multiline: true, name: '메모' }) || null, at, at).first();
    return { ok: true, id: r.id };
  });

  route('DELETE', '/api/admin/seasons/task/:id', async (c) => {
    await c.needAdmin();
    const row = await c.db.prepare('SELECT id, custom FROM season_tasks WHERE id = ?').bind(Number(c.params.id) || 0).first();
    if (!row) throw new HttpError(404, '할 일을 찾을 수 없어요.');
    if (!row.custom) throw new HttpError(400, '기본 할 일은 지우지 않고 숨겨요.');
    await c.db.prepare('DELETE FROM season_tasks WHERE id = ?').bind(row.id).run();
    return { ok: true };
  });

  // 지난 마감 한 번에 정리 — 처음 쓰기 시작할 때 이미 지난 일, 또는 밀린 일을 마친 것/숨김으로
  route('POST', '/api/admin/seasons/bulk', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const action = b.action === 'hide' ? 'hide' : b.action === 'done' ? 'done' : null;
    if (!action) throw new HttpError(400, '정리 방법을 골라 주세요.');
    const today = todayKST();
    const plan = await loadPlan(c.db, today);
    const late = plan.list.flatMap((i) => i.tasks.filter((t) => !t.done && !t.hidden && t.due < today));
    if (!late.length) return { ok: true, n: 0 };
    const at = nowIso();
    const stmts = late.map((t) => {
      if (t.id) {
        return action === 'done'
          ? c.db.prepare('UPDATE season_tasks SET done = 1, done_at = ?, updated_at = ? WHERE id = ?').bind(at, at, t.id)
          : c.db.prepare('UPDATE season_tasks SET hidden = 1, updated_at = ? WHERE id = ?').bind(at, t.id);
      }
      return c.db.prepare(
        `INSERT INTO season_tasks (skey, tkey, done, done_at, hidden, custom, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(skey, tkey) DO UPDATE SET done = excluded.done, done_at = excluded.done_at, hidden = excluded.hidden, updated_at = excluded.updated_at`,
      ).bind(t.skey, t.tkey, action === 'done' ? 1 : 0, action === 'done' ? at : null, action === 'hide' ? 1 : 0, at, at);
    });
    for (let k = 0; k < stmts.length; k += 50) await c.db.batch(stmts.slice(k, k + 50));
    return { ok: true, n: late.length };
  });

  // 시즌 날짜 바꾸기 (설·추석처럼 해마다 바뀌는 날, 또는 지점 사정에 맞춘 조정) — 대표 관리자
  route('PUT', '/api/admin/seasons/dates', async (c) => {
    await c.needAdmin('admin');
    const b = await c.body();
    const skey = String(b.skey || '');
    const m = SKEY_RE.exec(skey);
    if (!m || !BY_ID[m[2]]) throw new HttpError(400, '시즌을 골라 주세요.');
    const dates = await datesOf(c.db);
    if (b.clear) delete dates[skey];
    else {
      const start = cleanDue(b.start, '시작일'), end = cleanDue(b.end, '끝나는 날');
      if (end < start) throw new HttpError(400, '끝나는 날이 시작일보다 빨라요.');
      if (dayDiff(start, end) > 92) throw new HttpError(400, '한 시즌은 석 달(92일)을 넘을 수 없어요.');
      if (start.slice(0, 4) !== m[1] && end.slice(0, 4) !== m[1]) throw new HttpError(400, `${m[1]}년 날짜로 넣어 주세요.`);
      dates[skey] = [start, end];
    }
    await setMeta(c.db, 'season_dates', JSON.stringify(dates));
    return { ok: true };
  });
}
