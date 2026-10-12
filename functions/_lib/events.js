// 행사 — 쏘플이 여는 파티·클래스, 참가 신청·대기, 캘린더 파일
import { HttpError, str, int, url, nowIso, todayKST, isYmd, dayDiff, maskPhones } from './util.js';
import { notiStmt, badgeStmt } from './db.js';
import { loadSpaces } from './spaces.js';
import { checkText, imgUrl } from './community.js';

export const EVENT_CATS = ['파티', '원데이 클래스', '네트워킹', '시즌 이벤트', '오픈 기념', '기타'];
const PUBLIC_STATUS = `('open','closed','done')`;
const hhmm = (v) => (v && /^\d{1,2}:\d{2}$/.test(String(v)) ? String(v).padStart(5, '0') : null);

function evState(e, today) {
  if (['draft', 'pending', 'hidden', 'rejected'].includes(e.status)) return e.status;
  const last = e.d2 || e.d;
  if (last && last < today) return 'done';
  return e.status;
}
function item(e, today, nm, me = null) {
  return {
    id: e.id, title: e.title, summary: e.summary || '', cover: e.cover ? imgUrl(e.cover) : '', cat: e.cat || '기타',
    d: e.d, d2: e.d2, t1: e.t1, t2: e.t2, code: e.code, spaceName: nm[e.code] || null, place: e.place || '',
    cap: e.cap, going: e.going, price: e.price || '', mode: e.mode, ext_url: e.mode === 'external' ? (e.ext_url || '') : '',
    members_only: !!e.members_only, adult: !!e.adult, max_n: e.max_n || 1, status: evState(e, today), created_at: e.created_at,
  };
}

function cleanEvent(b, prev = {}, { admin = false } = {}) {
  const f = { ...prev };
  f.title = maskPhones(str(b.title ?? prev.title, { max: 60, min: 2, required: true, name: '행사 이름' }));
  f.summary = maskPhones(str(b.summary ?? prev.summary, { max: 120, name: '한 줄 소개' }));
  f.body = maskPhones(str(b.body ?? prev.body, { max: 5000, multiline: true, name: '상세 내용' }));
  f.cat = EVENT_CATS.includes(b.cat) ? b.cat : (prev.cat || '파티');
  const d = b.d ?? prev.d;
  if (!isYmd(d)) throw new HttpError(400, '행사 날짜를 골라 주세요.');
  f.d = d;
  const d2 = b.d2 ?? prev.d2;
  f.d2 = isYmd(d2) && d2 > d ? d2 : null;
  f.t1 = hhmm(b.t1 ?? prev.t1);
  f.t2 = hhmm(b.t2 ?? prev.t2);
  const code = b.code ?? prev.code;
  f.code = code && /^S-\d{4}$/.test(code) ? code : null;
  f.place = maskPhones(str(b.place ?? prev.place, { max: 80, name: '장소' }));
  f.cap = int(b.cap ?? prev.cap, { min: 1, max: 2000, def: null, name: '정원' });
  f.price = str(b.price ?? prev.price, { max: 60, name: '참가비 안내' });
  f.mode = ['rsvp', 'external', 'info'].includes(b.mode) ? b.mode : (prev.mode || 'rsvp');
  f.ext_url = url(b.ext_url ?? prev.ext_url, { name: '신청 링크' });
  if (f.mode === 'external' && !f.ext_url) throw new HttpError(400, '외부 신청 방식이면 신청 링크를 넣어 주세요.');
  f.members_only = (b.members_only ?? prev.members_only) ? 1 : 0;
  f.adult = (b.adult ?? prev.adult) ? 1 : 0;
  f.max_n = int(b.max_n ?? prev.max_n, { min: 1, max: 10, def: 2, name: '1인 신청 가능 인원' });
  const cv = b.cover ?? prev.cover;
  f.cover = cv && /^u\/[\w/.-]{4,90}$/.test(cv) ? cv : null;
  if (admin && b.status) f.status = ['draft', 'open', 'closed', 'hidden', 'pending', 'rejected'].includes(b.status) ? b.status : prev.status || 'open';
  return f;
}

async function recount(db, id) {
  await db.prepare(`UPDATE events SET going = (SELECT COALESCE(SUM(n), 0) FROM event_rsvps WHERE event_id = ? AND status = 'going') WHERE id = ?`).bind(id, id).run();
}

/** 취소가 생기면 대기자를 차례로 확정 */
async function promote(db, e) {
  if (!e.cap) return [];
  const cur = await db.prepare(`SELECT COALESCE(SUM(n), 0) AS g FROM event_rsvps WHERE event_id = ? AND status = 'going'`).bind(e.id).first();
  let room = e.cap - (cur?.g || 0);
  if (room <= 0) return [];
  const waits = (await db.prepare(`SELECT uid, n FROM event_rsvps WHERE event_id = ? AND status = 'wait' ORDER BY created_at LIMIT 50`).bind(e.id).all()).results || [];
  const stmts = [];
  const up = [];
  for (const w of waits) {
    if (w.n > room) continue;
    room -= w.n;
    up.push(w.uid);
    stmts.push(db.prepare(`UPDATE event_rsvps SET status = 'going' WHERE event_id = ? AND uid = ?`).bind(e.id, w.uid));
    stmts.push(notiStmt(db, w.uid, 'event', `대기하던 "${e.title}" 행사 참가가 확정됐어요.`, `/e/${e.id}`));
    stmts.push(badgeStmt(db, w.uid, 'event_goer'));
    if (room <= 0) break;
  }
  if (stmts.length) await db.batch(stmts);
  return up;
}

function nextDay(ymd) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
function icsEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsDate(d, t) {
  const ymd = d.replace(/-/g, '');
  if (!t) return { v: `;VALUE=DATE:${ymd}` };
  return { v: `;TZID=Asia/Seoul:${ymd}T${t.replace(':', '')}00` };
}

export function register(route) {
  route('GET', '/api/evt', async (c) => {
    const today = todayKST();
    const scope = c.q.get('scope') || 'upcoming';
    let where = `status IN ${PUBLIC_STATUS}`;
    const binds = [];
    if (scope === 'upcoming') { where += ' AND COALESCE(d2, d) >= ?'; binds.push(today); }
    if (scope === 'past') { where += ' AND COALESCE(d2, d) < ?'; binds.push(today); }
    const rows = (await c.db.prepare(`SELECT * FROM events WHERE ${where} ORDER BY ${scope === 'past' ? 'd DESC' : 'd ASC'}, id DESC LIMIT 60`).bind(...binds).all()).results || [];
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    return { items: rows.map((e) => item(e, today, nm)), cats: EVENT_CATS };
  });

  route('GET', '/api/evt/:id', async (c) => {
    const id = int(c.params.id, { min: 1 });
    const e = await c.db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
    const me = await c.user();
    const adm = await c.adminLevel();
    if (!e || (!['open', 'closed', 'done'].includes(e.status) && !adm && !(me && me.id === e.uid))) throw new HttpError(404, '행사를 찾을 수 없어요.');
    const today = todayKST();
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    const mine = me ? await c.db.prepare(`SELECT n, msg, status FROM event_rsvps WHERE event_id = ? AND uid = ?`).bind(id, me.id).first() : null;
    const waits = await c.db.prepare(`SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id = ? AND status = 'wait'`).bind(id).first();
    const lock = e.members_only && !me;
    return {
      event: { ...item(e, today, nm), body: lock ? '' : (e.body || ''), place: lock ? '' : (e.place || ''), locked: !!lock },
      mine: mine && mine.status !== 'canceled' ? mine : null,
      waits: waits?.n || 0,
      canEdit: !!adm,
    };
  });

  route('POST', '/api/evt', async (c) => {
    const u = await c.needUser();
    await c.limit('ep:' + u.id, 3, 86400, '행사 개설 신청은 하루에 3번까지 할 수 있어요.');
    const b = await c.body();
    const f = cleanEvent(b, {}, { admin: false });
    if (dayDiff(todayKST(), f.d) < 1) throw new HttpError(400, '행사는 내일 이후 날짜로 신청해 주세요.');
    await checkText(c.db, f.title, f.summary, f.body);
    const at = nowIso();
    const r = await c.db.prepare(
      `INSERT INTO events (uid, title, summary, body, cover, cat, d, d2, t1, t2, code, place, cap, price, mode, ext_url, members_only, adult, max_n, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?) RETURNING id`,
    ).bind(u.id, f.title, f.summary, f.body, f.cover, f.cat, f.d, f.d2, f.t1, f.t2, f.code, f.place, f.cap, f.price, f.mode, f.ext_url || null, f.members_only, f.adult, f.max_n, at, at).first();
    return { ok: true, id: r.id, status: 'pending' };
  });

  route('POST', '/api/evt/:id/rsvp', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const e = await c.db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
    if (!e || evState(e, todayKST()) !== 'open') throw new HttpError(400, '지금은 신청을 받지 않는 행사예요.');
    if (e.mode !== 'rsvp') throw new HttpError(400, '이 행사는 안내된 링크에서 신청해 주세요.');
    if (e.adult && !u.adult) throw new HttpError(403, '만 19세 이상만 참가할 수 있는 행사예요.');
    const b = await c.body();
    const n = int(b.n, { min: 1, max: e.max_n || 1, def: 1, name: '인원' });
    const msg = maskPhones(str(b.msg, { max: 200, name: '남길 말' }));
    const ex = await c.db.prepare(`SELECT status FROM event_rsvps WHERE event_id = ? AND uid = ?`).bind(id, u.id).first();
    if (ex && ['going', 'wait'].includes(ex.status)) return { ok: true, status: ex.status };
    await c.limit('er:' + u.id, 20, 86400);
    let status = 'going';
    if (e.cap) {
      const g = await c.db.prepare(`SELECT COALESCE(SUM(n), 0) AS g FROM event_rsvps WHERE event_id = ? AND status = 'going'`).bind(id).first();
      if ((g?.g || 0) + n > e.cap) status = 'wait';
    }
    const stmts = [
      c.db.prepare(`INSERT INTO event_rsvps (event_id, uid, n, msg, status, created_at) VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(event_id, uid) DO UPDATE SET n = excluded.n, msg = excluded.msg, status = excluded.status, created_at = excluded.created_at`)
        .bind(id, u.id, n, msg || null, status, nowIso()),
      notiStmt(c.db, u.id, 'event', status === 'going' ? `"${e.title}" 참가가 확정됐어요.` : `"${e.title}" 대기 명단에 올렸어요. 자리가 나면 알려 드릴게요.`, `/e/${id}`),
    ];
    if (status === 'going') stmts.push(badgeStmt(c.db, u.id, 'event_goer'));
    await c.db.batch(stmts);
    await recount(c.db, id);
    return { ok: true, status };
  });

  route('POST', '/api/evt/:id/cancel', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const e = await c.db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
    if (!e) throw new HttpError(404, '행사를 찾을 수 없어요.');
    const ex = await c.db.prepare(`SELECT status FROM event_rsvps WHERE event_id = ? AND uid = ?`).bind(id, u.id).first();
    if (!ex || !['going', 'wait'].includes(ex.status)) return { ok: true };
    await c.db.prepare(`UPDATE event_rsvps SET status = 'canceled' WHERE event_id = ? AND uid = ?`).bind(id, u.id).run();
    if (ex.status === 'going') await promote(c.db, e);
    await recount(c.db, id);
    return { ok: true };
  });

  route('GET', '/api/evt/:id/ics', async (c) => {
    const id = int(c.params.id, { min: 1 });
    const e = await c.db.prepare(`SELECT * FROM events WHERE id = ? AND status IN ${PUBLIC_STATUS}`).bind(id).first();
    if (!e) throw new HttpError(404, '행사를 찾을 수 없어요.');
    const sp = e.code ? (await loadSpaces(c.db, { all: true })).find((s) => s.code === e.code) : null;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SSOPLE//Party//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:ssople-event-${e.id}@ssople`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    ];
    if (e.t1) {
      lines.push(`DTSTART${icsDate(e.d, e.t1).v}`);
      if (e.t2) {
        const endDay = e.d2 || (e.t2 <= e.t1 ? nextDay(e.d) : e.d);
        lines.push(`DTEND${icsDate(endDay, e.t2).v}`);
      }
    } else {
      lines.push(`DTSTART${icsDate(e.d).v}`);
      lines.push(`DTEND${icsDate(nextDay(e.d2 || e.d)).v}`);
    }
    lines.push(`SUMMARY:${icsEsc(e.title)}`);
    lines.push(`LOCATION:${icsEsc(sp ? `${sp.name} (${sp.addr || ''})` : e.place || '')}`);
    lines.push(`DESCRIPTION:${icsEsc((e.summary || '') + '\n' + c.url.origin + '/e/' + e.id)}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return new Response(lines.join('\r\n'), {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `attachment; filename="ssople-event-${e.id}.ics"` },
    });
  });
}

export function registerAdmin(route) {
  route('GET', '/api/admin/evt', async (c) => {
    await c.needAdmin();
    const rows = (await c.db.prepare(
      `SELECT e.*, u.nick, (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'wait') AS waits
       FROM events e LEFT JOIN users u ON u.id = e.uid WHERE e.status != 'deleted' ORDER BY (e.status = 'pending') DESC, e.d DESC LIMIT 200`,
    ).all()).results || [];
    const today = todayKST();
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    return { items: rows.map((e) => ({ ...item(e, today, nm), body: e.body, rawStatus: e.status, ext_url: e.ext_url || '', cover_key: e.cover, waits: e.waits, by: e.nick || null })) };
  });

  route('POST', '/api/admin/evt', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const f = cleanEvent(b, { status: 'open' }, { admin: true });
    const at = nowIso();
    const r = await c.db.prepare(
      `INSERT INTO events (uid, title, summary, body, cover, cat, d, d2, t1, t2, code, place, cap, price, mode, ext_url, members_only, adult, max_n, status, created_at, updated_at)
       VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ).bind(f.title, f.summary, f.body, f.cover, f.cat, f.d, f.d2, f.t1, f.t2, f.code, f.place, f.cap, f.price, f.mode, f.ext_url || null, f.members_only, f.adult, f.max_n, f.status || 'open', at, at).first();
    return { ok: true, id: r.id };
  });

  route('PUT', '/api/admin/evt/:id', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const e = await c.db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
    if (!e) throw new HttpError(404, '행사를 찾을 수 없어요.');
    const b = await c.body();
    const f = cleanEvent(b, e, { admin: true });
    await c.db.prepare(
      `UPDATE events SET title=?, summary=?, body=?, cover=?, cat=?, d=?, d2=?, t1=?, t2=?, code=?, place=?, cap=?, price=?, mode=?, ext_url=?, members_only=?, adult=?, max_n=?, status=?, updated_at=? WHERE id=?`,
    ).bind(f.title, f.summary, f.body, f.cover, f.cat, f.d, f.d2, f.t1, f.t2, f.code, f.place, f.cap, f.price, f.mode, f.ext_url || null, f.members_only, f.adult, f.max_n, f.status || e.status, nowIso(), id).run();
    if (e.uid && e.status === 'pending' && f.status === 'open') await notiStmt(c.db, e.uid, 'event', `신청한 행사 "${f.title}"이(가) 공개됐어요.`, `/e/${id}`).run();
    if (e.uid && e.status === 'pending' && f.status === 'rejected') await notiStmt(c.db, e.uid, 'event', `신청한 행사 "${f.title}"은(는) 이번엔 열기 어렵게 됐어요.`, '/event').run();
    if (f.cap && (!e.cap || f.cap > e.cap)) await promote(c.db, { ...e, ...f, id });
    await recount(c.db, id);
    return { ok: true };
  });

  route('DELETE', '/api/admin/evt/:id', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    await c.db.prepare(`UPDATE events SET status = 'deleted', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
    return { ok: true };
  });

  route('GET', '/api/admin/evt/:id/rsvps', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const rows = (await c.db.prepare(
      `SELECT r.*, u.nick, u.email FROM event_rsvps r LEFT JOIN users u ON u.id = r.uid WHERE r.event_id = ? ORDER BY CASE r.status WHEN 'going' THEN 0 WHEN 'wait' THEN 1 ELSE 2 END, r.created_at`,
    ).bind(id).all()).results || [];
    if (c.q.get('format') === 'csv') {
      const head = '상태,닉네임,이메일,인원,남긴 말,신청 시각';
      const st = { going: '참가', wait: '대기', canceled: '취소' };
      const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const body = rows.map((r) => [st[r.status] || r.status, r.nick, r.email, r.n, r.msg, r.created_at].map(esc).join(',')).join('\n');
      return new Response('\uFEFF' + head + '\n' + body, {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="event-${id}-rsvps.csv"` },
      });
    }
    return { items: rows.map((r) => ({ uid: r.uid, nick: r.nick, email: r.email, n: r.n, msg: r.msg, status: r.status, at: r.created_at })) };
  });
}
