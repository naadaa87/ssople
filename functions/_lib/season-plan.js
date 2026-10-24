// 시즌 준비 — 시즌 마케팅 기획서(2026 하반기 · 2027) 운영판
// 기획서 내용은 내부 운영 자료라 공개 저장소에 두지 않는다. 대표 관리자가 「시즌 준비」 화면에서 기획서 데이터 파일(.json)을
// 한 번 올리면 meta 표(season_plan)에 들어가고, 운영진이 체크하거나 고친 값만 season_marks 표에 남는다. k 는 '종류:아이디'.
//   w:26-3:1  주차별 할 일(2026 하반기 3주차 두 번째)   m:2027-01:p0  월별 할 일(o 운영 포인트 / p 다음 달 준비)
//   o:27-52   노출 시작(일정 아이디)                    e:27-58       일정 확인·메모·날짜/등급 고침
//   d:2027-11-14 날짜 등급 고침·메모                     c:27-0        채널 담당·마지막 게시일
//   q:27-2    발표 전 일정 확인
import { HttpError, todayKST, addDays, isYmd, str, nowIso, parseJSON, weekdayOf, sha256hex } from './util.js';
import { getMeta, setMeta } from './db.js';
import { MONTH_INDEX, INDEX_SRC } from './seasons-data.js';

const GRADES = ['S', 'A', 'B', 'C'];
const GV = { S: 4, A: 3, B: 2, C: 1 };
const MAX_ITEMS = 120;
const FILE_KIND = 'ssople-season-plan';

/* ---------------- 기획서 데이터 (meta 표, 판이 바뀔 때만 다시 읽음) ---------------- */
let CACHE = { ver: null };

function indexOf(plan) {
  return {
    EV: new Map(plan.events.map((e) => [e.id, e])),
    WK: new Map(plan.weeks.map((w) => [`${w.p}-${w.i}`, w])),
    MO: new Map(plan.months.map((m) => [m.ym, m])),
    PL: new Map(plan.plans.map((p) => [p.id, p])),
  };
}

/** 올린 기획서 { ver, plan, ix } — 아직 없으면 null */
export async function getPlan(db) {
  const ver = await getMeta(db, 'season_plan_ver');
  if (!ver) return null;
  if (CACHE.ver === ver && CACHE.plan) return CACHE;
  const plan = parseJSON(await getMeta(db, 'season_plan'), null);
  if (!plan || !Array.isArray(plan.events)) return null;
  CACHE = { ver, plan, ix: indexOf(plan) };
  return CACHE;
}

/* ---------------- 올린 파일 검사 · 정리 ---------------- */
const bad = (m) => new HttpError(400, `기획서 파일을 읽지 못했어요. ${m}`);
const S = (v, max = 800) => (v == null ? '' : String(v).slice(0, max));
const ymdOrNull = (v) => (v && isYmd(v) ? v : null);
const arr = (v, max = 400) => (Array.isArray(v) ? v.slice(0, max) : []);
const strRow = (r, n) => arr(r, n).map((x) => S(x));

function cleanPlanFile(f) {
  if (!f || typeof f !== 'object' || f.kind !== FILE_KIND || !f.plan) throw bad('쏘플 시즌 기획서 데이터 파일(.json)을 골라 주세요.');
  const P = f.plan;
  if (!Array.isArray(P.plans) || !P.plans.length || P.plans.length > 10) throw bad('기획서 목록이 없어요.');
  const plans = P.plans.map((p) => {
    if (!p || !/^\d{2}$/.test(p.id)) throw bad('기획서 아이디가 이상해요.');
    return {
      id: p.id, name: S(p.name, 40), title: S(p.title, 120), base: ymdOrNull(p.base) || '', from: ymdOrNull(p.from) || '', to: ymdOrNull(p.to) || '',
      file: S(p.file, 200), scope: strRow(p.scope, 20), dayRule: S(p.dayRule, 1000),
      grades: arr(p.grades, 4).map((r) => strRow(r, 4)), principles: strRow(p.principles, 20), features: strRow(p.features, 30),
      holidays3: arr(p.holidays3, 30).map((r) => strRow(r, 3)), rates: arr(p.rates, 10).map((r) => strRow(r, 3)),
      openPlan: arr(p.openPlan, 30).map((r) => strRow(r, 4)), targets: arr(p.targets, 40).map((r) => strRow(r, 7)),
      channels: arr(p.channels, 30).map((r) => strRow(r, 4)), packages: strRow(p.packages, 40), order: strRow(p.order, 20),
      notes: arr(p.notes, 30).map((r) => strRow(r, 2)), confirms: arr(p.confirms, 40).map((r) => strRow(r, 2)), sources: arr(p.sources, 30).map((r) => strRow(r, 2)),
    };
  });
  const pids = new Set(plans.map((p) => p.id));
  if (pids.size !== plans.length) throw bad('같은 기획서가 두 번 들어 있어요.');
  if (!Array.isArray(P.events) || !P.events.length || P.events.length > 1000) throw bad('일정이 없어요.');
  const seen = new Set();
  const events = P.events.map((e) => {
    if (!e || !/^\d{2}-\d{1,3}$/.test(e.id) || seen.has(e.id) || !pids.has(e.p)) throw bad('일정 아이디가 이상해요.');
    seen.add(e.id);
    if (!isYmd(e.s) || !isYmd(e.e) || e.e < e.s || !GRADES.includes(e.g)) throw bad(`일정 ${e.id}의 날짜·등급이 이상해요.`);
    const out = {
      id: e.id, p: e.p, s: e.s, e: e.e, lb: S(e.lb, 80), cat: S(e.cat, 40), n: S(e.n, 200), sn: S(e.sn || e.n, 60), g: e.g, band: S(e.band, 60),
      who: S(e.who), pt: S(e.pt), ct: S(e.ct), how: S(e.how), pkg: S(e.pkg, 200), op: S(e.op, 60), od: ymdOrNull(e.od), on: S(e.on, 60), note: S(e.note),
      key: e.key ? 1 : 0, chk: e.chk ? 1 : 0,
    };
    if (Array.isArray(e.ds)) out.ds = e.ds.filter(isYmd).slice(0, 60);
    return out;
  });
  if (!P.days || typeof P.days !== 'object') throw bad('날짜별 등급이 없어요.');
  const days = {};
  const dk = Object.keys(P.days);
  if (dk.length > 1500) throw bad('날짜가 너무 많아요.');
  for (const d of dk) {
    const v = P.days[d];
    if (!isYmd(d) || !Array.isArray(v) || !GRADES.includes(v[0])) throw bad(`${d} 등급이 이상해요.`);
    days[d] = [v[0], S(v[1], 2), S(v[2], 40), S(v[3], 300), S(v[4], 200), S(v[5], 300)];
  }
  const due = (x) => [S(x && x[0], 300), ymdOrNull(x && x[1])];
  const weeks = arr(P.weeks, 120).map((w) => {
    if (!w || !pids.has(w.p) || !Number.isInteger(w.i) || !isYmd(w.s) || !isYmd(w.e)) throw bad('주차별 할 일이 이상해요.');
    return { p: w.p, i: w.i, s: w.s, e: w.e, key: S(w.key, 300), band: S(w.band, 200), who: S(w.who, 300), todo: arr(w.todo, 20).map(due) };
  });
  const months = arr(P.months, 60).map((m) => {
    if (!m || !/^\d{4}-\d{2}$/.test(m.ym) || !pids.has(m.p)) throw bad('월별 계획이 이상해요.');
    return { ym: m.ym, p: m.p, theme: S(m.theme, 120), key: S(m.key, 400), who: S(m.who, 300), price: S(m.price, 300), ops: arr(m.ops, 20).map(due), prep: arr(m.prep, 20).map(due) };
  });
  return { plans, events, days, weeks, months };
}

/* ---------------- 체크 항목 ---------------- */
/** 기획서에 실제로 있는 항목인지 — 있으면 종류 글자, 없으면 null */
export function kindOf(k, P) {
  if (!P) return null;
  const m = /^([wmoedcq]):([0-9A-Za-z:-]{1,24})$/.exec(String(k || ''));
  if (!m) return null;
  const [, t, rest] = m;
  const { EV, WK, MO, PL } = P.ix;
  let x;
  switch (t) {
    case 'w': x = /^(\d{2}-\d{1,2}):(\d{1,2})$/.exec(rest); return x && WK.get(x[1]) && WK.get(x[1]).todo[+x[2]] ? t : null;
    case 'm': x = /^(\d{4}-\d{2}):([op])(\d{1,2})$/.exec(rest); return x && MO.get(x[1]) && MO.get(x[1])[x[2] === 'o' ? 'ops' : 'prep'][+x[3]] ? t : null;
    case 'o': case 'e': return EV.has(rest) ? t : null;
    case 'd': return P.plan.days[rest] ? t : null;
    case 'c': x = /^(\d{2})-(\d{1,2})$/.exec(rest); return x && PL.get(x[1]) && PL.get(x[1]).channels[+x[2]] ? t : null;
    case 'q': x = /^(\d{2})-(\d{1,2})$/.exec(rest); return x && PL.get(x[1]) && PL.get(x[1]).confirms[+x[2]] ? t : null;
    default: return null;
  }
}

const rowOut = (r) => ({ k: r.k, done: !!r.done, doneAt: r.done_at || null, owner: r.owner || '', memo: r.memo || '', val: parseJSON(r.val, null), at: r.updated_at || null });

export async function loadMarks(db) {
  const r = await db.prepare('SELECT * FROM season_marks').all();
  return (r.results || []).map(rowOut);
}

/** 고친 날짜·등급·노출일을 얹은 일정 */
export function effEvent(e, mk) {
  const v = (mk && mk.val) || {};
  const moved = !!(v.s || v.e);
  return { ...e, s: v.s || e.s, e: v.e || e.e, g: v.g || e.g, od: v.od || e.od, ds: moved ? null : e.ds || null };
}

/** 한눈에·메뉴 숫자용 요약 (기획서가 없으면 null) */
export function planSummary(marks, today, P) {
  if (!P) return null;
  const { plan } = P;
  const M = new Map(marks.map((m) => [m.k, m]));
  const done = (k) => !!(M.get(k) && M.get(k).done);
  const evs = plan.events.map((e) => effEvent(e, M.get('e:' + e.id)));
  const soonEnd = addDays(today, 7);
  const items = [];
  for (const e of evs) {
    if (!e.od || done('o:' + e.id) || e.e < today) continue;
    if (e.od <= soonEnd) items.push({ kind: 'open', title: `「${e.sn}」 노출 시작`, sub: e.lb, due: e.od, g: e.g });
  }
  const mon = addDays(today, -((weekdayOf(today) + 6) % 7));
  const wk = plan.weeks.find((w) => w.s === mon);
  if (wk) wk.todo.forEach(([t, due], j) => { if (!done(`w:${wk.p}-${wk.i}:${j}`)) items.push({ kind: 'week', title: t, sub: `${wk.i}주차 할 일`, due: due || wk.e }); });
  for (const m of plan.months) {
    if (m.ym < addDays(today, -31).slice(0, 7) || m.ym > soonEnd.slice(0, 7)) continue;
    for (const [list, tag] of [[m.ops, 'o'], [m.prep, 'p']]) {
      list.forEach(([t, due], j) => {
        if (!due || done(`m:${m.ym}:${tag}${j}`)) return;
        if (due <= soonEnd && due >= addDays(today, -31)) items.push({ kind: 'month', title: t, sub: `${+m.ym.slice(5)}월 ${tag === 'o' ? '운영 포인트' : '다음 달 준비'}`, due });
      });
    }
  }
  items.sort((a, b) => a.due.localeCompare(b.due));
  const late = items.filter((x) => x.due < today).length;
  const day = plan.days[today];
  const dm = M.get('d:' + today);
  const onToday = evs.filter((e) => (e.ds ? e.ds.includes(today) : e.s <= today && today <= e.e)).sort((a, b) => GV[b.g] - GV[a.g]);
  return {
    late, week: items.length - late,
    today: day ? { d: today, g: (dm && dm.val && dm.val.g) || day[0], events: onToday.slice(0, 3).map((e) => e.sn) } : null,
    top: items.slice(0, 6).map((x) => ({ ...x, dday: Math.round((Date.parse(x.due) - Date.parse(today)) / 864e5) })),
  };
}

function cleanVal(kind, v, isAdmin) {
  if (v == null) return null;
  if (typeof v !== 'object') throw new HttpError(400, '고칠 값을 다시 확인해 주세요.');
  if (kind === 'd') {
    if (!isAdmin) throw new HttpError(403, '날짜 등급은 대표 관리자만 바꿀 수 있어요.');
    if (!v.g) return null;
    if (!GRADES.includes(v.g)) throw new HttpError(400, '등급은 S·A·B·C 중에서 골라 주세요.');
    return { g: v.g };
  }
  if (kind === 'e') {
    if (!isAdmin) throw new HttpError(403, '일정 날짜·등급은 대표 관리자만 바꿀 수 있어요.');
    const out = {};
    for (const f of ['s', 'e', 'od']) {
      if (v[f]) { if (!isYmd(v[f])) throw new HttpError(400, '날짜를 다시 골라 주세요.'); out[f] = v[f]; }
    }
    if (out.s && out.e && out.e < out.s) throw new HttpError(400, '끝나는 날이 시작일보다 빨라요.');
    if (v.g) { if (!GRADES.includes(v.g)) throw new HttpError(400, '등급은 S·A·B·C 중에서 골라 주세요.'); out.g = v.g; }
    return Object.keys(out).length ? out : null;
  }
  if (kind === 'c') {
    if (!v.last) return null;
    if (!isYmd(v.last)) throw new HttpError(400, '게시한 날짜를 골라 주세요.');
    return { last: v.last };
  }
  throw new HttpError(400, '이 항목에는 고칠 값이 없어요.');
}

export function register(route) {
  // 기획서 내용(처음 한 번) + 체크·고친 값
  route('GET', '/api/admin/seasons/plan', async (c) => {
    const lv = await c.needAdmin();
    const P = await getPlan(c.db);
    const have = c.q.get('have');
    return {
      ver: P ? P.ver : null, empty: !P, data: P && have !== P.ver ? P.plan : null,
      at: P ? await getMeta(c.db, 'season_plan_at') : null,
      marks: P ? await loadMarks(c.db) : [], today: todayKST(), canEdit: lv === 'admin',
      monthIndex: MONTH_INDEX, indexSrc: INDEX_SRC,
    };
  });

  // 기획서 데이터 파일 올리기 (대표 관리자) — 다시 올리면 새 파일로 바뀌고, 체크해 둔 값은 그대로 남는다
  route('POST', '/api/admin/seasons/plan', async (c) => {
    await c.needAdmin('admin');
    const b = await c.body();
    const plan = cleanPlanFile(b.file);
    const body = JSON.stringify(plan);
    if (body.length > 1_500_000) throw bad('파일이 너무 커요.');
    const ver = (await sha256hex(body)).slice(0, 12);
    await setMeta(c.db, 'season_plan', body);
    await setMeta(c.db, 'season_plan_ver', ver);
    await setMeta(c.db, 'season_plan_at', nowIso());
    CACHE = { ver: null };
    return { ok: true, ver, plans: plan.plans.map((p) => p.name), events: plan.events.length, days: Object.keys(plan.days).length };
  });

  // 체크·담당·메모·고친 값 저장 (한 번에 여러 개)
  route('POST', '/api/admin/seasons/marks', async (c) => {
    const lv = await c.needAdmin();
    const P = await getPlan(c.db);
    if (!P) throw new HttpError(400, '기획서 파일을 먼저 올려 주세요.');
    const b = await c.body();
    const list = Array.isArray(b.items) ? b.items : [];
    if (!list.length) throw new HttpError(400, '저장할 항목이 없어요.');
    if (list.length > MAX_ITEMS) throw new HttpError(400, `한 번에 ${MAX_ITEMS}개까지 저장할 수 있어요.`);
    const keys = [...new Set(list.map((x) => String((x && x.k) || '')))];
    if (keys.length !== list.length) throw new HttpError(400, '같은 항목이 두 번 들어 있어요.');
    for (const k of keys) if (!kindOf(k, P)) throw new HttpError(400, '기획서에 없는 항목이에요. 화면을 새로 고쳐 주세요.');
    const ph = keys.map(() => '?').join(',');
    const cur = new Map(((await c.db.prepare(`SELECT * FROM season_marks WHERE k IN (${ph})`).bind(...keys).all()).results || []).map((r) => [r.k, r]));
    const at = nowIso();
    const rows = list.map((x) => {
      const kind = kindOf(x.k, P);
      const r = cur.get(x.k) || { k: x.k, done: 0, done_at: null, owner: null, memo: null, val: null };
      const next = { ...r };
      if ('done' in x) { next.done = x.done ? 1 : 0; next.done_at = x.done ? (r.done ? r.done_at : at) : null; }
      if ('owner' in x) next.owner = str(x.owner, { max: 20, name: '담당' }) || null;
      if ('memo' in x) next.memo = str(x.memo, { max: 300, multiline: true, name: '메모' }) || null;
      if ('val' in x) {
        const v = cleanVal(kind, x.val, lv === 'admin');
        next.val = v ? JSON.stringify(v) : null;
      }
      next.updated_at = at;
      return next;
    });
    const stmts = rows.map((r) => c.db.prepare(
      `INSERT INTO season_marks (k, done, done_at, owner, memo, val, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(k) DO UPDATE SET done = excluded.done, done_at = excluded.done_at, owner = excluded.owner, memo = excluded.memo, val = excluded.val, updated_at = excluded.updated_at`,
    ).bind(r.k, r.done, r.done_at, r.owner, r.memo, r.val, r.updated_at));
    for (let k = 0; k < stmts.length; k += 50) await c.db.batch(stmts.slice(k, k + 50));
    return { ok: true, marks: rows.map(rowOut) };
  });
}
