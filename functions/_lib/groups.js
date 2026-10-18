// 모임 · 파티팀 모집
import { HttpError, str, int, url, nowIso, todayKST, isYmd, dayDiff, maskPhones, likeSafe, dispNick } from './util.js';
import { notiStmt, notiManyStmt, badgeStmt } from './db.js';
import { loadSpaces } from './spaces.js';
import { checkText, imgUrl } from './community.js';

export const MEETUP_CATS = ['보드게임', '와인·술', '영화·드라마', '운동·러닝', '게임', '노래·음악', '맛집·요리', '스터디·자기계발', '동네친구', '파티·네트워킹', '공간 아카데미', '기타'];
export const REGIONS = ['서울', '경기', '인천', '대전', '전주', '부산', '기타'];

function cover(k) { return k && /^u\/[\w/.-]{4,90}$/.test(k) ? k : null; }
const who = (r, p = '') => ({ id: r[p + 'uid'] ?? r.uid, nick: dispNick(r[p + 'nick']), avatar: r[p + 'avatar'] || '' });

async function spaceName(db, code) {
  if (!code) return null;
  const s = (await loadSpaces(db, { all: true })).find((x) => x.code === code);
  return s ? { code: s.code, name: s.name, area: s.area } : null;
}
function okCode(code) { return code && /^S-\d{4}$/.test(code) ? code : null; }

/* =================================================================== 모임 */
async function getMeetup(db, id) {
  const m = await db.prepare(`SELECT m.*, u.nick, u.avatar FROM meetups m LEFT JOIN users u ON u.id = m.uid WHERE m.id = ?`).bind(id).first();
  if (!m || m.status === 'deleted') throw new HttpError(404, '모임을 찾을 수 없어요.');
  return m;
}
async function myRole(db, id, uid) {
  if (!uid) return null;
  return db.prepare('SELECT role, status FROM meetup_members WHERE meetup_id = ? AND uid = ?').bind(id, uid).first();
}
function canManage(m, mem, uid, adm) {
  return !!adm || m.uid === uid || (mem && mem.status === 'joined' && mem.role === 'staff');
}

function meetupItem(m) {
  return {
    id: m.id, title: m.title, cat: m.cat, region: m.region, intro: String(m.intro || '').slice(0, 120), cover: m.cover ? imgUrl(m.cover) : '',
    cap: m.cap, members: m.members, join_mode: m.join_mode, status: m.status, created_at: m.created_at,
    owner: who(m), next: m.next || null,
  };
}

export function registerMeetups(route) {
  route('GET', '/api/meetups', async (c) => {
    const where = [`m.status = 'active'`];
    const binds = [todayKST()];
    const cat = c.q.get('cat'); if (cat && MEETUP_CATS.includes(cat)) { where.push('m.cat = ?'); binds.push(cat); }
    const region = c.q.get('region'); if (region && REGIONS.includes(region)) { where.push('m.region = ?'); binds.push(region); }
    const q = likeSafe(str(c.q.get('q'), { max: 40 })); if (q) { where.push('(m.title LIKE ? OR m.intro LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
    const page = int(c.q.get('page'), { min: 1, max: 200, def: 1 });
    const size = 18;
    const rows = (await c.db.prepare(
      `SELECT m.*, u.nick, u.avatar, (SELECT MIN(d) FROM meetup_plans p WHERE p.meetup_id = m.id AND p.d >= ?) AS next
       FROM meetups m LEFT JOIN users u ON u.id = m.uid WHERE ${where.join(' AND ')}
       ORDER BY (next IS NULL), next, m.members DESC, m.id DESC LIMIT ? OFFSET ?`,
    ).bind(...binds, size + 1, (page - 1) * size).all()).results || [];
    return { items: rows.slice(0, size).map(meetupItem), more: rows.length > size, cats: MEETUP_CATS, regions: REGIONS };
  });

  route('POST', '/api/meetups', async (c) => {
    const u = await c.needAdult();
    await c.limit('mc:' + u.id, 3, 86400, '모임은 하루에 3개까지 만들 수 있어요.');
    const b = await c.body();
    const title = maskPhones(str(b.title, { max: 40, min: 2, required: true, name: '모임 이름' }));
    const intro = maskPhones(str(b.intro, { max: 2000, min: 10, required: true, multiline: true, name: '모임 소개' }));
    const rules = maskPhones(str(b.rules, { max: 800, multiline: true, name: '모임 규칙' }));
    const cat = MEETUP_CATS.includes(b.cat) ? b.cat : '기타';
    const region = REGIONS.includes(b.region) ? b.region : '서울';
    const cap = int(b.cap, { min: 2, max: 300, def: 30, name: '정원' });
    const join_mode = b.join_mode === 'open' ? 'open' : 'approve';
    const chat_url = url(b.chat_url, { name: '오픈채팅 주소' });
    await checkText(c.db, title, intro, rules);
    const at = nowIso();
    const r = await c.db.prepare(
      `INSERT INTO meetups (uid, title, cat, region, intro, cover, cap, join_mode, chat_url, rules, members, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?) RETURNING id`,
    ).bind(u.id, title, cat, region, intro, cover(b.cover), cap, join_mode, chat_url || null, rules || null, at, at).first();
    await c.db.batch([
      c.db.prepare(`INSERT INTO meetup_members (meetup_id, uid, role, status, created_at) VALUES (?, ?, 'owner', 'joined', ?)`).bind(r.id, u.id, at),
      badgeStmt(c.db, u.id, 'meetup_host'),
    ]);
    return { ok: true, id: r.id };
  });

  route('GET', '/api/meetups/:id', async (c) => {
    const id = int(c.params.id, { min: 1 });
    const m = await getMeetup(c.db, id);
    const me = await c.user();
    const adm = await c.adminLevel();
    if (m.status === 'hidden' && !adm && !(me && me.id === m.uid)) throw new HttpError(404, '신고가 접수되어 잠시 가려진 모임이에요.');
    const mem = await myRole(c.db, id, me?.id);
    const joined = !!(mem && mem.status === 'joined');
    const manage = me ? canManage(m, mem, me.id, adm) : !!adm;
    const members = (await c.db.prepare(
      `SELECT mm.uid, mm.role, mm.status, mm.msg, mm.created_at, u.nick, u.avatar, u.intro FROM meetup_members mm LEFT JOIN users u ON u.id = mm.uid
       WHERE mm.meetup_id = ? AND mm.status IN ('joined', 'pending') ORDER BY CASE mm.role WHEN 'owner' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, mm.created_at`,
    ).bind(id).all()).results || [];
    const today = todayKST();
    const plans = (await c.db.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM plan_rsvps r WHERE r.plan_id = p.id AND r.status = 'yes') AS yes,
              (SELECT status FROM plan_rsvps r WHERE r.plan_id = p.id AND r.uid = ?) AS mine
       FROM meetup_plans p WHERE p.meetup_id = ? AND p.d >= ? ORDER BY p.d, p.t LIMIT 20`,
    ).bind(me?.id ?? 0, id, addDaysSafe(today, -30)).all()).results || [];
    const spaces = await loadSpaces(c.db, { all: true });
    const nm = Object.fromEntries(spaces.map((s) => [s.code, s.name]));
    return {
      meetup: {
        ...meetupItem(m), intro: m.intro, rules: m.rules || '', chat_url: joined || manage ? (m.chat_url || '') : '',
        hasChat: !!m.chat_url, reports: undefined,
      },
      me: { status: mem?.status || null, role: mem?.role || null, joined, manage, owner: !!(me && me.id === m.uid) },
      members: members.filter((x) => x.status === 'joined').map((x) => ({ ...who(x), role: x.role })),
      pending: manage ? members.filter((x) => x.status === 'pending').map((x) => ({ ...who(x), msg: x.msg || '', intro: x.intro || '', at: x.created_at })) : [],
      pendingCount: members.filter((x) => x.status === 'pending').length,
      plans: plans.map((p) => ({
        id: p.id, title: p.title, d: p.d, t: p.t, code: p.code, spaceName: nm[p.code] || null, place: p.place, cap: p.cap,
        memo: joined || manage ? p.memo : '', yes: p.yes, mine: p.mine || null, past: p.d < today,
      })),
    };
  });

  route('PATCH', '/api/meetups/:id', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const m = await getMeetup(c.db, id);
    const adm = await c.adminLevel();
    if (m.uid !== u.id && !adm) throw new HttpError(403, '모임장만 고칠 수 있어요.');
    const b = await c.body();
    const f = {
      title: 'title' in b ? maskPhones(str(b.title, { max: 40, min: 2, required: true, name: '모임 이름' })) : m.title,
      intro: 'intro' in b ? maskPhones(str(b.intro, { max: 2000, min: 10, required: true, multiline: true, name: '모임 소개' })) : m.intro,
      rules: 'rules' in b ? maskPhones(str(b.rules, { max: 800, multiline: true, name: '모임 규칙' })) : m.rules,
      cat: 'cat' in b && MEETUP_CATS.includes(b.cat) ? b.cat : m.cat,
      region: 'region' in b && REGIONS.includes(b.region) ? b.region : m.region,
      cap: 'cap' in b ? int(b.cap, { min: Math.max(2, m.members), max: 300, name: '정원' }) : m.cap,
      join_mode: 'join_mode' in b ? (b.join_mode === 'open' ? 'open' : 'approve') : m.join_mode,
      chat_url: 'chat_url' in b ? (url(b.chat_url, { name: '오픈채팅 주소' }) || null) : m.chat_url,
      cover: 'cover' in b ? cover(b.cover) : m.cover,
      status: 'status' in b && ['active', 'closed'].includes(b.status) ? b.status : m.status,
    };
    await checkText(c.db, f.title, f.intro, f.rules || '');
    await c.db.prepare(`UPDATE meetups SET title=?, intro=?, rules=?, cat=?, region=?, cap=?, join_mode=?, chat_url=?, cover=?, status=?, updated_at=? WHERE id=?`)
      .bind(f.title, f.intro, f.rules, f.cat, f.region, f.cap, f.join_mode, f.chat_url, f.cover, f.status, nowIso(), id).run();
    return { ok: true };
  });

  route('POST', '/api/meetups/:id/join', async (c) => {
    const u = await c.needAdult();
    const id = int(c.params.id, { min: 1 });
    const m = await getMeetup(c.db, id);
    if (m.status !== 'active') throw new HttpError(400, '지금은 가입을 받지 않는 모임이에요.');
    const mem = await myRole(c.db, id, u.id);
    if (mem && mem.status === 'joined') return { ok: true, status: 'joined' };
    if (mem && mem.status === 'pending') return { ok: true, status: 'pending' };
    if (mem && mem.status === 'kicked') throw new HttpError(403, '이 모임에는 다시 가입할 수 없어요.');
    if (m.members >= m.cap) throw new HttpError(400, '정원이 다 찼어요.');
    await c.limit('mj:' + u.id, 20, 86400);
    const b = await c.body();
    const msg = maskPhones(str(b.msg, { max: 200, name: '가입 인사' }));
    const at = nowIso();
    const status = m.join_mode === 'open' ? 'joined' : 'pending';
    const stmts = [
      c.db.prepare(`INSERT INTO meetup_members (meetup_id, uid, role, status, msg, created_at) VALUES (?, ?, 'member', ?, ?, ?)
                    ON CONFLICT(meetup_id, uid) DO UPDATE SET status = excluded.status, role = 'member', msg = excluded.msg, created_at = excluded.created_at`)
        .bind(id, u.id, status, msg || null, at),
    ];
    if (status === 'joined') {
      stmts.push(c.db.prepare('UPDATE meetups SET members = members + 1 WHERE id = ?').bind(id));
      stmts.push(notiStmt(c.db, m.uid, 'meetup', `${u.nick}님이 "${m.title}" 모임에 들어왔어요.`, `/m/${id}`));
    } else {
      stmts.push(notiStmt(c.db, m.uid, 'meetup', `${u.nick}님이 "${m.title}" 모임에 가입을 신청했어요.`, `/m/${id}`));
    }
    await c.db.batch(stmts);
    return { ok: true, status };
  });

  route('POST', '/api/meetups/:id/leave', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const m = await getMeetup(c.db, id);
    if (m.uid === u.id) throw new HttpError(400, '모임장은 나갈 수 없어요. 모임을 닫거나 운영진에게 넘겨 주세요.');
    const mem = await myRole(c.db, id, u.id);
    if (!mem || !['joined', 'pending'].includes(mem.status)) return { ok: true };
    const stmts = [c.db.prepare(`UPDATE meetup_members SET status = 'left' WHERE meetup_id = ? AND uid = ?`).bind(id, u.id)];
    if (mem.status === 'joined') stmts.push(c.db.prepare('UPDATE meetups SET members = MAX(1, members - 1) WHERE id = ?').bind(id));
    await c.db.batch(stmts);
    return { ok: true };
  });

  route('POST', '/api/meetups/:id/members/:uid', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const target = int(c.params.uid, { min: 1 });
    const m = await getMeetup(c.db, id);
    const adm = await c.adminLevel();
    const mine = await myRole(c.db, id, u.id);
    if (!canManage(m, mine, u.id, adm)) throw new HttpError(403, '모임장이나 운영진만 할 수 있어요.');
    const b = await c.body();
    const action = String(b.action || '');
    const t = await myRole(c.db, id, target);
    if (!t) throw new HttpError(404, '해당 회원을 찾을 수 없어요.');
    if (target === m.uid) throw new HttpError(400, '모임장은 바꿀 수 없어요.');
    const ownerOnly = ['kick', 'staff', 'unstaff'];
    if (ownerOnly.includes(action) && m.uid !== u.id && !adm) throw new HttpError(403, '모임장만 할 수 있어요.');
    const stmts = [];
    if (action === 'approve') {
      if (t.status !== 'pending') return { ok: true };
      if (m.members >= m.cap) throw new HttpError(400, '정원이 다 찼어요. 정원을 늘린 뒤 승인해 주세요.');
      stmts.push(c.db.prepare(`UPDATE meetup_members SET status = 'joined' WHERE meetup_id = ? AND uid = ?`).bind(id, target));
      stmts.push(c.db.prepare('UPDATE meetups SET members = members + 1 WHERE id = ?').bind(id));
      stmts.push(notiStmt(c.db, target, 'meetup', `"${m.title}" 모임 가입이 승인됐어요.`, `/m/${id}`));
    } else if (action === 'reject') {
      if (t.status !== 'pending') return { ok: true };
      stmts.push(c.db.prepare(`UPDATE meetup_members SET status = 'rejected' WHERE meetup_id = ? AND uid = ?`).bind(id, target));
      stmts.push(notiStmt(c.db, target, 'meetup', `"${m.title}" 모임 가입이 이번엔 어렵게 됐어요.`, `/meetups`));
    } else if (action === 'kick') {
      if (t.status === 'joined') stmts.push(c.db.prepare('UPDATE meetups SET members = MAX(1, members - 1) WHERE id = ?').bind(id));
      stmts.push(c.db.prepare(`UPDATE meetup_members SET status = 'kicked' WHERE meetup_id = ? AND uid = ?`).bind(id, target));
    } else if (action === 'staff' || action === 'unstaff') {
      if (t.status !== 'joined') throw new HttpError(400, '멤버만 운영진으로 지정할 수 있어요.');
      stmts.push(c.db.prepare(`UPDATE meetup_members SET role = ? WHERE meetup_id = ? AND uid = ?`).bind(action === 'staff' ? 'staff' : 'member', id, target));
    } else throw new HttpError(400, '알 수 없는 요청이에요.');
    await c.db.batch(stmts);
    return { ok: true };
  });

  /* ---------- 정모 일정 ---------- */
  route('POST', '/api/meetups/:id/plans', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const m = await getMeetup(c.db, id);
    const mine = await myRole(c.db, id, u.id);
    if (!canManage(m, mine, u.id, await c.adminLevel())) throw new HttpError(403, '모임장이나 운영진만 일정을 만들 수 있어요.');
    const b = await c.body();
    const title = maskPhones(str(b.title, { max: 40, required: true, name: '일정 이름' }));
    if (!isYmd(b.d) || dayDiff(todayKST(), b.d) < 0) throw new HttpError(400, '오늘 이후 날짜를 골라 주세요.');
    const t = str(b.t, { max: 20, name: '시간' });
    const code = okCode(b.code);
    const place = maskPhones(str(b.place, { max: 60, name: '장소' }));
    const cap = int(b.cap, { min: 1, max: 300, def: null, name: '정원' });
    const memo = maskPhones(str(b.memo, { max: 500, multiline: true, name: '메모' }));
    const r = await c.db.prepare(`INSERT INTO meetup_plans (meetup_id, uid, title, d, t, code, place, cap, memo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`)
      .bind(id, u.id, title, b.d, t || null, code, place || null, cap, memo || null, nowIso()).first();
    // 멤버에게 알림 (최대 200명)
    const ms = (await c.db.prepare(`SELECT uid FROM meetup_members WHERE meetup_id = ? AND status = 'joined' AND uid != ? LIMIT 200`).bind(id, u.id).all()).results || [];
    const st = notiManyStmt(c.db, ms.map((x) => x.uid), 'plan', `"${m.title}" 새 일정: ${title} (${b.d.slice(5).replace('-', '/')})`, `/m/${id}`);
    if (st) await st.run();
    return { ok: true, id: r.id };
  });

  route('DELETE', '/api/plans/:id', async (c) => {
    const u = await c.needUser();
    const pid = int(c.params.id, { min: 1 });
    const p = await c.db.prepare('SELECT * FROM meetup_plans WHERE id = ?').bind(pid).first();
    if (!p) throw new HttpError(404, '일정을 찾을 수 없어요.');
    const m = await getMeetup(c.db, p.meetup_id);
    const mine = await myRole(c.db, m.id, u.id);
    if (!canManage(m, mine, u.id, await c.adminLevel())) throw new HttpError(403, '모임장이나 운영진만 지울 수 있어요.');
    await c.db.batch([
      c.db.prepare('DELETE FROM meetup_plans WHERE id = ?').bind(pid),
      c.db.prepare('DELETE FROM plan_rsvps WHERE plan_id = ?').bind(pid),
    ]);
    return { ok: true };
  });

  route('POST', '/api/plans/:id/rsvp', async (c) => {
    const u = await c.needUser();
    const pid = int(c.params.id, { min: 1 });
    const p = await c.db.prepare('SELECT * FROM meetup_plans WHERE id = ?').bind(pid).first();
    if (!p) throw new HttpError(404, '일정을 찾을 수 없어요.');
    const mem = await myRole(c.db, p.meetup_id, u.id);
    if (!mem || mem.status !== 'joined') throw new HttpError(403, '모임 멤버만 참석 여부를 남길 수 있어요.');
    if (p.d < todayKST()) throw new HttpError(400, '지난 일정이에요.');
    const b = await c.body();
    const status = ['yes', 'no', 'maybe'].includes(b.status) ? b.status : 'yes';
    if (status === 'yes' && p.cap) {
      const n = await c.db.prepare(`SELECT COUNT(*) AS n FROM plan_rsvps WHERE plan_id = ? AND status = 'yes' AND uid != ?`).bind(pid, u.id).first();
      if (n.n >= p.cap) throw new HttpError(400, '참석 인원이 다 찼어요.');
    }
    await c.db.prepare(`INSERT INTO plan_rsvps (plan_id, uid, status, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(plan_id, uid) DO UPDATE SET status = excluded.status`)
      .bind(pid, u.id, status, nowIso()).run();
    return { ok: true };
  });
}

function addDaysSafe(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/* =================================================================== 파티팀 */
function crewState(r, today) {
  if (r.status === 'hidden' || r.status === 'deleted') return r.status;
  if (r.d < today) return 'done';
  return r.status; // open | closed
}
function crewItem(r, today, nm) {
  return {
    id: r.id, title: r.title, d: r.d, t: r.t, code: r.code, spaceName: nm[r.code] || null, region: r.region,
    need: r.need, accepted: r.accepted, cost: r.cost, status: crewState(r, today), created_at: r.created_at,
    excerpt: String(r.body || '').slice(0, 100), owner: who(r), apps: r.apps ?? undefined,
  };
}

export function registerCrews(route) {
  route('GET', '/api/crews', async (c) => {
    const today = todayKST();
    const where = [`c.status != 'hidden'`, `c.status != 'deleted'`];
    const binds = [];
    const st = c.q.get('status') || 'open';
    if (st === 'open') { where.push(`c.status = 'open' AND c.d >= ?`); binds.push(today); }
    const region = c.q.get('region'); if (region && REGIONS.includes(region)) { where.push('c.region = ?'); binds.push(region); }
    const q = likeSafe(str(c.q.get('q'), { max: 40 })); if (q) { where.push('(c.title LIKE ? OR c.body LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
    const page = int(c.q.get('page'), { min: 1, max: 200, def: 1 });
    const size = 18;
    const rows = (await c.db.prepare(
      `SELECT c.*, u.nick, u.avatar FROM crews c LEFT JOIN users u ON u.id = c.uid WHERE ${where.join(' AND ')}
       ORDER BY ${st === 'open' ? 'c.d ASC, c.id DESC' : 'c.id DESC'} LIMIT ? OFFSET ?`,
    ).bind(...binds, size + 1, (page - 1) * size).all()).results || [];
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    return { items: rows.slice(0, size).map((r) => crewItem(r, today, nm)), more: rows.length > size, regions: REGIONS };
  });

  route('POST', '/api/crews', async (c) => {
    const u = await c.needAdult();
    await c.limit('cc:' + u.id, 5, 86400, '파티팀 모집글은 하루에 5개까지 쓸 수 있어요.');
    const b = await c.body();
    const title = maskPhones(str(b.title, { max: 50, min: 4, required: true, name: '제목' }));
    const body = maskPhones(str(b.body, { max: 2000, min: 10, required: true, multiline: true, name: '내용' }));
    if (!isYmd(b.d) || dayDiff(todayKST(), b.d) < 0 || dayDiff(todayKST(), b.d) > 120) throw new HttpError(400, '파티 날짜는 오늘부터 120일 안으로 골라 주세요.');
    const t = str(b.t, { max: 20, name: '시간' });
    const code = okCode(b.code);
    const region = REGIONS.includes(b.region) ? b.region : '서울';
    const need = int(b.need, { min: 1, max: 30, def: 4, name: '모집 인원' });
    const cost = maskPhones(str(b.cost, { max: 60, name: '예상 비용' }));
    const cond = maskPhones(str(b.cond, { max: 200, name: '참여 조건' }));
    const chat_url = url(b.chat_url, { name: '오픈채팅 주소' });
    await checkText(c.db, title, body, cost, cond);
    const at = nowIso();
    const r = await c.db.prepare(
      `INSERT INTO crews (uid, title, body, d, t, code, region, need, cost, cond, chat_url, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'open', ?, ?) RETURNING id`,
    ).bind(u.id, title, body, b.d, t || null, code, region, need, cost || null, cond || null, chat_url || null, at, at).first();
    await badgeStmt(c.db, u.id, 'crew_host').run();
    return { ok: true, id: r.id };
  });

  async function getCrew(db, id) {
    const r = await db.prepare(`SELECT c.*, u.nick, u.avatar FROM crews c LEFT JOIN users u ON u.id = c.uid WHERE c.id = ?`).bind(id).first();
    if (!r || r.status === 'deleted') throw new HttpError(404, '모집글을 찾을 수 없어요.');
    return r;
  }

  route('GET', '/api/crews/:id', async (c) => {
    const id = int(c.params.id, { min: 1 });
    const r = await getCrew(c.db, id);
    const me = await c.user();
    const adm = await c.adminLevel();
    const owner = !!(me && me.id === r.uid);
    if (r.status === 'hidden' && !owner && !adm) throw new HttpError(404, '신고가 접수되어 잠시 가려진 글이에요.');
    const today = todayKST();
    const apps = (await c.db.prepare(
      `SELECT a.*, u.nick, u.avatar, u.birth, u.intro FROM crew_apps a LEFT JOIN users u ON u.id = a.uid WHERE a.crew_id = ? AND a.status != 'canceled' ORDER BY a.created_at`,
    ).bind(id).all()).results || [];
    const mine = me ? apps.find((a) => a.uid === me.id) : null;
    const accepted = !!(mine && mine.status === 'accepted');
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    return {
      crew: { ...crewItem(r, today, nm), body: r.body, cond: r.cond || '', chat_url: owner || accepted || adm ? (r.chat_url || '') : '', hasChat: !!r.chat_url },
      me: { owner, app: mine ? { status: mine.status, msg: mine.msg } : null, accepted },
      apps: owner || adm
        ? apps.map((a) => ({ ...who(a), msg: a.msg || '', intro: a.intro || '', status: a.status, at: a.created_at }))
        : apps.filter((a) => a.status === 'accepted').map((a) => ({ ...who(a), status: 'accepted' })),
      pendingCount: apps.filter((a) => a.status === 'pending').length,
    };
  });

  route('PATCH', '/api/crews/:id', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const r = await getCrew(c.db, id);
    if (r.uid !== u.id && !(await c.adminLevel())) throw new HttpError(403, '글쓴이만 고칠 수 있어요.');
    const b = await c.body();
    const f = {
      title: 'title' in b ? maskPhones(str(b.title, { max: 50, min: 4, required: true, name: '제목' })) : r.title,
      body: 'body' in b ? maskPhones(str(b.body, { max: 2000, min: 10, required: true, multiline: true, name: '내용' })) : r.body,
      t: 't' in b ? str(b.t, { max: 20 }) : r.t,
      code: 'code' in b ? okCode(b.code) : r.code,
      region: 'region' in b && REGIONS.includes(b.region) ? b.region : r.region,
      need: 'need' in b ? int(b.need, { min: Math.max(1, r.accepted), max: 30, name: '모집 인원' }) : r.need,
      cost: 'cost' in b ? maskPhones(str(b.cost, { max: 60 })) : r.cost,
      cond: 'cond' in b ? maskPhones(str(b.cond, { max: 200 })) : r.cond,
      chat_url: 'chat_url' in b ? (url(b.chat_url, { name: '오픈채팅 주소' }) || null) : r.chat_url,
      status: 'status' in b && ['open', 'closed'].includes(b.status) ? b.status : r.status,
      d: r.d,
    };
    if ('d' in b) {
      if (!isYmd(b.d) || dayDiff(todayKST(), b.d) < 0) throw new HttpError(400, '오늘 이후 날짜를 골라 주세요.');
      f.d = b.d;
    }
    await checkText(c.db, f.title, f.body, f.cost || '', f.cond || '');
    await c.db.prepare(`UPDATE crews SET title=?, body=?, d=?, t=?, code=?, region=?, need=?, cost=?, cond=?, chat_url=?, status=?, updated_at=? WHERE id=?`)
      .bind(f.title, f.body, f.d, f.t, f.code, f.region, f.need, f.cost, f.cond, f.chat_url, f.status, nowIso(), id).run();
    return { ok: true };
  });

  route('DELETE', '/api/crews/:id', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const r = await getCrew(c.db, id);
    if (r.uid !== u.id && !(await c.adminLevel())) throw new HttpError(403, '글쓴이만 지울 수 있어요.');
    const apps = (await c.db.prepare(`SELECT uid FROM crew_apps WHERE crew_id = ? AND status IN ('pending','accepted')`).bind(id).all()).results || [];
    const stmts = [c.db.prepare(`UPDATE crews SET status = 'deleted', updated_at = ? WHERE id = ?`).bind(nowIso(), id)];
    const ns = notiManyStmt(c.db, apps.map((a) => a.uid), 'crew', `신청했던 파티팀 "${r.title}" 모집이 취소됐어요.`, '/crew');
    if (ns) stmts.push(ns);
    await c.db.batch(stmts);
    return { ok: true };
  });

  route('POST', '/api/crews/:id/apply', async (c) => {
    const u = await c.needAdult();
    const id = int(c.params.id, { min: 1 });
    const r = await getCrew(c.db, id);
    if (r.uid === u.id) throw new HttpError(400, '내가 쓴 모집글이에요.');
    if (crewState(r, todayKST()) !== 'open') throw new HttpError(400, '모집이 끝났어요.');
    await c.limit('ca:' + u.id, 20, 86400);
    const b = await c.body();
    const msg = maskPhones(str(b.msg, { max: 200, required: true, name: '한 줄 소개' }));
    const ex = await c.db.prepare('SELECT status FROM crew_apps WHERE crew_id = ? AND uid = ?').bind(id, u.id).first();
    if (ex && ex.status === 'rejected') throw new HttpError(400, '이번 모집에는 다시 신청할 수 없어요.');
    if (ex && ['pending', 'accepted'].includes(ex.status)) return { ok: true, status: ex.status };
    await c.db.batch([
      c.db.prepare(`INSERT INTO crew_apps (crew_id, uid, msg, status, created_at) VALUES (?, ?, ?, 'pending', ?)
                    ON CONFLICT(crew_id, uid) DO UPDATE SET status = 'pending', msg = excluded.msg, created_at = excluded.created_at`).bind(id, u.id, msg, nowIso()),
      notiStmt(c.db, r.uid, 'crew', `${u.nick}님이 "${r.title}"에 함께하고 싶대요.`, `/t/${id}`),
    ]);
    return { ok: true, status: 'pending' };
  });

  route('POST', '/api/crews/:id/cancel', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const r = await getCrew(c.db, id);
    const ex = await c.db.prepare('SELECT status FROM crew_apps WHERE crew_id = ? AND uid = ?').bind(id, u.id).first();
    if (!ex || !['pending', 'accepted'].includes(ex.status)) return { ok: true };
    const stmts = [c.db.prepare(`UPDATE crew_apps SET status = 'canceled' WHERE crew_id = ? AND uid = ?`).bind(id, u.id)];
    if (ex.status === 'accepted') {
      stmts.push(c.db.prepare(`UPDATE crews SET accepted = MAX(0, accepted - 1), status = CASE WHEN status = 'closed' AND d >= ? THEN 'open' ELSE status END WHERE id = ?`).bind(todayKST(), id));
      stmts.push(notiStmt(c.db, r.uid, 'crew', `${u.nick}님이 "${r.title}" 참여를 취소했어요.`, `/t/${id}`));
    }
    await c.db.batch(stmts);
    return { ok: true };
  });

  route('POST', '/api/crews/:id/apps/:uid', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const target = int(c.params.uid, { min: 1 });
    const r = await getCrew(c.db, id);
    if (r.uid !== u.id && !(await c.adminLevel())) throw new HttpError(403, '글쓴이만 할 수 있어요.');
    const b = await c.body();
    const a = await c.db.prepare('SELECT status FROM crew_apps WHERE crew_id = ? AND uid = ?').bind(id, target).first();
    if (!a) throw new HttpError(404, '신청을 찾을 수 없어요.');
    const stmts = [];
    if (b.action === 'accept') {
      if (a.status === 'accepted') return { ok: true };
      if (r.accepted >= r.need) throw new HttpError(400, '모집 인원이 다 찼어요. 인원을 늘린 뒤 수락해 주세요.');
      stmts.push(c.db.prepare(`UPDATE crew_apps SET status = 'accepted' WHERE crew_id = ? AND uid = ?`).bind(id, target));
      stmts.push(c.db.prepare(`UPDATE crews SET accepted = accepted + 1, status = CASE WHEN accepted + 1 >= need THEN 'closed' ELSE status END, updated_at = ? WHERE id = ?`).bind(nowIso(), id));
      stmts.push(notiStmt(c.db, target, 'crew', `"${r.title}" 파티팀에 함께하게 됐어요! 오픈채팅 주소를 확인해 보세요.`, `/t/${id}`));
    } else if (b.action === 'reject') {
      if (a.status === 'accepted') stmts.push(c.db.prepare(`UPDATE crews SET accepted = MAX(0, accepted - 1), status = CASE WHEN status = 'closed' THEN 'open' ELSE status END WHERE id = ?`).bind(id));
      stmts.push(c.db.prepare(`UPDATE crew_apps SET status = 'rejected' WHERE crew_id = ? AND uid = ?`).bind(id, target));
      stmts.push(notiStmt(c.db, target, 'crew', `"${r.title}" 파티팀은 이번엔 함께하기 어렵게 됐어요.`, '/crew'));
    } else throw new HttpError(400, '알 수 없는 요청이에요.');
    await c.db.batch(stmts);
    return { ok: true };
  });
}

export { spaceName };
