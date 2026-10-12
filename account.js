// 회원 가입·로그인 + 마이페이지(내 정보·알림·활동·쏘플 클럽)
import {
  HttpError, str, int, nowIso, todayKST, addDays, dayDiff, isYmd, ageOn, sha256hex, safeEqual, maskPhones, parseJSON, slug,
} from './util.js';
import { hashPw, verifyPw, publicUser } from './ctx.js';
import { getSettings, notiStmt, badgeStmt, BADGES, CLUB_BENEFITS } from './db.js';
import { loadSpaces } from './spaces.js';
import { listPosts, imgUrl } from './community.js';
import { hostFindReservation } from './hostsync.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,100}\.[^\s@]{2,20}$/;
const NICK_RE = /^[가-힣a-zA-Z0-9_]{2,12}$/;
const AVATARS = ['🎉', '🎈', '🥳', '🎂', '🍰', '🍕', '🍻', '🎤', '🎲', '🎮', '🌙', '⭐', '🐶', '🐱', '🦊', '🐻', '🐰', '🌷', '🍀', '🔥'];

function cleanPw(pw) {
  const s = String(pw || '');
  if (s.length < 8 || s.length > 64) throw new HttpError(400, '비밀번호는 8~64자로 정해 주세요.');
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw new HttpError(400, '비밀번호에는 영문과 숫자를 함께 넣어 주세요.');
  return s;
}

export async function tierOf(db, uid, settings) {
  const since = addDays(todayKST(), -365);
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM visits WHERE uid = ? AND status = 'ok' AND d >= ?`).bind(uid, since).first();
  const n = r?.n || 0;
  const s = Math.max(1, Number(settings['club.silver']) || 2);
  const g = Math.max(s + 1, Number(settings['club.gold']) || 4);
  const tier = n >= g ? 'gold' : n >= s ? 'silver' : 'welcome';
  return { n, tier, silverAt: s, goldAt: g, toNext: tier === 'gold' ? 0 : tier === 'silver' ? g - n : s - n };
}

function nextOccur(md, today) {
  const y = Number(today.slice(0, 4));
  const fix = (yy) => {
    let d = `${yy}-${md}`;
    if (md === '02-29' && !isYmd(d)) d = `${yy}-02-28`;
    return d;
  };
  let d = fix(y);
  if (d < today) d = fix(y + 1);
  return d;
}

/** 기념일 30일 전 알림 — 마이 정보를 불러올 때 한 번씩 확인 */
async function annivNotis(db, uid) {
  const today = todayKST();
  const rows = (await db.prepare('SELECT * FROM annivs WHERE uid = ?').bind(uid).all()).results || [];
  const stmts = [];
  for (const a of rows) {
    const d = nextOccur(a.md, today);
    const left = dayDiff(today, d);
    const yr = Number(d.slice(0, 4));
    if (left <= 30 && a.noti_year !== yr) {
      stmts.push(notiStmt(db, uid, 'anniv', left === 0 ? `오늘은 ${a.title}! 즐거운 하루 보내세요.` : `${a.title}까지 ${left}일 남았어요. 파티룸, 미리 잡아 둘까요?`, `/rooms?date=${d}`));
      stmts.push(db.prepare('UPDATE annivs SET noti_year = ? WHERE id = ?').bind(yr, a.id));
    }
  }
  if (stmts.length) await db.batch(stmts);
}

export function register(route) {
  /* ---------------- 가입 · 로그인 ---------------- */
  route('POST', '/api/account/signup', async (c) => {
    const s = await getSettings(c.db);
    if (s['signup.open'] === '0') throw new HttpError(403, '지금은 회원 가입을 잠시 받지 않고 있어요.');
    await c.limit('su:' + (await c.ih()), 20, 3600, '가입 시도가 너무 많아요. 잠시 후 다시 해 주세요.');
    const b = await c.body();
    const email = str(b.email, { max: 120, required: true, name: '이메일' }).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, '이메일 주소를 다시 확인해 주세요.');
    const pw = cleanPw(b.pw);
    const nick = str(b.nick, { max: 12, required: true, name: '닉네임' });
    if (!NICK_RE.test(nick)) throw new HttpError(400, '닉네임은 한글·영문·숫자 2~12자로 정해 주세요.');
    if (/쏘플|운영자|관리자|admin|ssople|^탈퇴/i.test(nick)) throw new HttpError(400, '운영진으로 오해할 수 있는 닉네임은 쓸 수 없어요.');
    if (!isYmd(b.birth)) throw new HttpError(400, '생년월일을 입력해 주세요.');
    const age = ageOn(b.birth);
    if (age == null || age < 0 || age > 110) throw new HttpError(400, '생년월일을 다시 확인해 주세요.');
    if (age < 14) throw new HttpError(403, '만 14세 미만은 가입할 수 없어요.');
    if (!b.agree_terms || !b.agree_privacy) throw new HttpError(400, '이용약관과 개인정보 수집·이용에 동의해 주세요.');
    const dup = await c.db.prepare('SELECT email, nick FROM users WHERE email = ? OR nick = ?').bind(email, nick).first();
    if (dup) throw new HttpError(409, dup.email === email ? '이미 가입된 이메일이에요.' : '이미 쓰고 있는 닉네임이에요.');
    const at = nowIso();
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const r = await c.db.prepare(
      `INSERT INTO users (email, pw, nick, birth, region, avatar, role, status, marketing, created_at, last_at) VALUES (?, ?, ?, ?, ?, ?, 'member', 'active', ?, ?, ?) RETURNING id`,
    ).bind(email, await hashPw(pw), nick, b.birth, str(b.region, { max: 10 }) || null, avatar, b.marketing ? 1 : 0, at, at).first();
    await c.startSession(r.id);
    return { ok: true, user: publicUser({ id: r.id, email, nick, birth: b.birth, avatar, role: 'member', created_at: at }) };
  });

  route('POST', '/api/account/login', async (c) => {
    const ih = await c.ih();
    await c.limit('li:' + ih, 12, 600, '로그인 시도가 너무 많아요. 10분 뒤에 다시 해 주세요.');
    const b = await c.body();
    const email = str(b.email, { max: 120, required: true, name: '이메일' }).toLowerCase();
    await c.limit('le:' + (await sha256hex(email)).slice(0, 16), 10, 600, '로그인 시도가 너무 많아요. 10분 뒤에 다시 해 주세요.');
    const u = await c.db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!u || !(await verifyPw(String(b.pw || ''), u.pw))) throw new HttpError(401, '이메일 또는 비밀번호가 맞지 않아요.');
    if (u.status === 'banned') throw new HttpError(403, '이용이 제한된 계정이에요. 고객센터로 문의해 주세요.');
    if (u.status !== 'active') throw new HttpError(403, '탈퇴한 계정이에요.');
    await c.startSession(u.id);
    return { ok: true, user: publicUser(u) };
  });

  route('POST', '/api/account/logout', async (c) => {
    await c.endSession();
    return { ok: true };
  });

  route('GET', '/api/account/check', async (c) => {
    const nick = String(c.q.get('nick') || '');
    const email = String(c.q.get('email') || '').toLowerCase();
    await c.limit('ac:' + (await c.ih()), 60, 600);
    if (nick) {
      if (!NICK_RE.test(nick)) return { ok: true, available: false, reason: '한글·영문·숫자 2~12자' };
      const r = await c.db.prepare('SELECT 1 AS x FROM users WHERE nick = ?').bind(nick).first();
      return { ok: true, available: !r };
    }
    if (email) {
      const r = await c.db.prepare('SELECT 1 AS x FROM users WHERE email = ?').bind(email).first();
      return { ok: true, available: !r };
    }
    return { ok: true, available: false };
  });

  /* ---------------- 내 정보 ---------------- */
  route('GET', '/api/me', async (c) => {
    const u = await c.user();
    if (!u) return { user: null };
    c.wait(annivNotis(c.db, u.id).catch(() => {}));
    const s = await getSettings(c.db);
    const [unread, tier] = await Promise.all([
      c.db.prepare('SELECT COUNT(*) AS n FROM notis WHERE uid = ? AND read = 0').bind(u.id).first(),
      tierOf(c.db, u.id, s),
    ]);
    const admin = await c.adminLevel();
    return { user: { ...u, admin: admin || null }, unread: unread?.n || 0, tier };
  });

  route('PATCH', '/api/me', async (c) => {
    const u = await c.needUser();
    const b = await c.body();
    const f = {};
    if ('nick' in b) {
      const nick = str(b.nick, { max: 12, required: true, name: '닉네임' });
      if (!NICK_RE.test(nick)) throw new HttpError(400, '닉네임은 한글·영문·숫자 2~12자로 정해 주세요.');
      if (nick !== u.nick) {
        if (/쏘플|운영자|관리자|admin|ssople|^탈퇴/i.test(nick)) throw new HttpError(400, '운영진으로 오해할 수 있는 닉네임은 쓸 수 없어요.');
        const d = await c.db.prepare('SELECT 1 AS x FROM users WHERE nick = ? AND id != ?').bind(nick, u.id).first();
        if (d) throw new HttpError(409, '이미 쓰고 있는 닉네임이에요.');
      }
      f.nick = nick;
    }
    if ('region' in b) f.region = str(b.region, { max: 10 }) || null;
    if ('intro' in b) f.intro = maskPhones(str(b.intro, { max: 120, name: '소개' })) || null;
    if ('avatar' in b) f.avatar = AVATARS.includes(b.avatar) ? b.avatar : (/^u\/[\w/.-]{4,90}$/.test(b.avatar || '') ? b.avatar : u.avatar);
    if ('marketing' in b) f.marketing = b.marketing ? 1 : 0;
    const keys = Object.keys(f);
    if (keys.length) {
      await c.db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => f[k]), u.id).run();
    }
    return { ok: true };
  });

  route('POST', '/api/me/password', async (c) => {
    const u = await c.rawUser();
    if (!u) throw new HttpError(401, '로그인이 필요해요.');
    await c.limit('pw:' + u.id, 6, 3600);
    const b = await c.body();
    if (!(await verifyPw(String(b.old || ''), u.pw))) throw new HttpError(400, '지금 비밀번호가 맞지 않아요.');
    const pw = cleanPw(b.pw);
    await c.db.batch([
      c.db.prepare('UPDATE users SET pw = ? WHERE id = ?').bind(await hashPw(pw), u.id),
      c.db.prepare('DELETE FROM sessions WHERE uid = ? AND th != ?').bind(u.id, c._th || ''),
    ]);
    return { ok: true };
  });

  route('POST', '/api/me/leave', async (c) => {
    const u = await c.rawUser();
    if (!u) throw new HttpError(401, '로그인이 필요해요.');
    const b = await c.body();
    if (!(await verifyPw(String(b.pw || ''), u.pw))) throw new HttpError(400, '비밀번호가 맞지 않아요.');
    const gone = `left-${u.id}-${slug(6)}@deleted.local`;
    await c.db.batch([
      c.db.prepare(`UPDATE users SET status = 'left', email = ?, nick = ?, pw = '-', birth = NULL, region = NULL, intro = NULL, avatar = NULL, marketing = 0 WHERE id = ?`)
        .bind(gone, `탈퇴${u.id}`, u.id),
      c.db.prepare('DELETE FROM sessions WHERE uid = ?').bind(u.id),
      c.db.prepare('DELETE FROM annivs WHERE uid = ?').bind(u.id),
      c.db.prepare(`UPDATE meetup_members SET status = 'left' WHERE uid = ? AND role != 'owner'`).bind(u.id),
      c.db.prepare(`UPDATE crew_apps SET status = 'canceled' WHERE uid = ? AND status IN ('pending','accepted')`).bind(u.id),
      c.db.prepare(`UPDATE event_rsvps SET status = 'canceled' WHERE uid = ? AND status IN ('going','wait')`).bind(u.id),
    ]);
    await c.endSession();
    return { ok: true };
  });

  /* ---------------- 알림 ---------------- */
  route('GET', '/api/me/notis', async (c) => {
    const u = await c.needUser();
    const rows = (await c.db.prepare('SELECT id, kind, text, link, read, created_at FROM notis WHERE uid = ? ORDER BY id DESC LIMIT 60').bind(u.id).all()).results || [];
    return { items: rows };
  });
  route('POST', '/api/me/notis/read', async (c) => {
    const u = await c.needUser();
    const b = await c.body();
    if (b.id) await c.db.prepare('UPDATE notis SET read = 1 WHERE uid = ? AND id = ?').bind(u.id, int(b.id, { min: 1 })).run();
    else await c.db.prepare('UPDATE notis SET read = 1 WHERE uid = ? AND read = 0').bind(u.id).run();
    if (Math.random() < 0.05) c.wait(c.db.prepare('DELETE FROM notis WHERE uid = ? AND id < (SELECT MAX(id) - 200 FROM notis WHERE uid = ?)').bind(u.id, u.id).run());
    return { ok: true };
  });

  /* ---------------- 내 활동 ---------------- */
  route('GET', '/api/me/activity', async (c) => {
    const u = await c.needUser();
    const tab = c.q.get('tab') || 'posts';
    const today = todayKST();
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    if (tab === 'posts') return listPosts(c.db, { onlyMine: true, uid: u.id, page: 1, size: 40 });
    if (tab === 'bookmarks') return listPosts(c.db, { bookmarkedBy: u.id, page: 1, size: 40 });
    if (tab === 'comments') {
      const rows = (await c.db.prepare(
        `SELECT c.id, c.body, c.created_at, c.post_id, p.title FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.uid = ? AND c.deleted = 0 ORDER BY c.id DESC LIMIT 40`,
      ).bind(u.id).all()).results || [];
      return { items: rows };
    }
    if (tab === 'meetups') {
      const rows = (await c.db.prepare(
        `SELECT m.id, m.title, m.cat, m.region, m.members, m.cap, m.cover, m.status AS mstatus, mm.role, mm.status
         FROM meetup_members mm JOIN meetups m ON m.id = mm.meetup_id WHERE mm.uid = ? AND mm.status IN ('joined','pending') AND m.status != 'deleted' ORDER BY mm.created_at DESC LIMIT 50`,
      ).bind(u.id).all()).results || [];
      return { items: rows.map((r) => ({ ...r, cover: r.cover ? imgUrl(r.cover) : '' })) };
    }
    if (tab === 'crews') {
      const mine = (await c.db.prepare(`SELECT id, title, d, t, code, need, accepted, status FROM crews WHERE uid = ? AND status != 'deleted' ORDER BY d DESC LIMIT 30`).bind(u.id).all()).results || [];
      const applied = (await c.db.prepare(
        `SELECT c.id, c.title, c.d, c.t, c.code, c.need, c.accepted, c.status, a.status AS app FROM crew_apps a JOIN crews c ON c.id = a.crew_id
         WHERE a.uid = ? AND a.status != 'canceled' AND c.status != 'deleted' ORDER BY c.d DESC LIMIT 30`,
      ).bind(u.id).all()).results || [];
      const fix = (r) => ({ ...r, spaceName: nm[r.code] || null, done: r.d < today });
      return { mine: mine.map(fix), applied: applied.map(fix) };
    }
    if (tab === 'events') {
      const rows = (await c.db.prepare(
        `SELECT e.id, e.title, e.d, e.t1, e.code, e.place, r.status, r.n FROM event_rsvps r JOIN events e ON e.id = r.event_id
         WHERE r.uid = ? AND r.status IN ('going','wait') ORDER BY e.d DESC LIMIT 40`,
      ).bind(u.id).all()).results || [];
      const prop = (await c.db.prepare(`SELECT id, title, d, status FROM events WHERE uid = ? AND status != 'deleted' ORDER BY id DESC LIMIT 20`).bind(u.id).all()).results || [];
      return { items: rows.map((r) => ({ ...r, spaceName: nm[r.code] || null, done: r.d < today })), proposed: prop };
    }
    if (tab === 'invites') {
      const rows = (await c.db.prepare(
        `SELECT i.id, i.title, i.d, i.t, i.code, i.theme,
                (SELECT COALESCE(SUM(n), 0) FROM invite_rsvps r WHERE r.invite_id = i.id AND r.status = 'yes') AS yes,
                (SELECT COUNT(*) FROM invite_rsvps r WHERE r.invite_id = i.id) AS replies
         FROM invites i WHERE i.uid = ? ORDER BY i.created_at DESC LIMIT 40`,
      ).bind(u.id).all()).results || [];
      return { items: rows.map((r) => ({ ...r, spaceName: nm[r.code] || null })) };
    }
    throw new HttpError(400, '알 수 없는 탭이에요.');
  });

  /* ---------------- 쏘플 클럽 ---------------- */
  route('GET', '/api/me/club', async (c) => {
    const u = await c.needUser();
    const s = await getSettings(c.db);
    const [tier, visits, badges, annivs] = await Promise.all([
      tierOf(c.db, u.id, s),
      c.db.prepare('SELECT id, code, d, status, method, note, created_at FROM visits WHERE uid = ? ORDER BY d DESC LIMIT 60').bind(u.id).all(),
      c.db.prepare('SELECT badge, created_at FROM badges WHERE uid = ?').bind(u.id).all(),
      c.db.prepare('SELECT id, title, md FROM annivs WHERE uid = ? ORDER BY md').bind(u.id).all(),
    ]);
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((x) => [x.code, x.name]));
    const got = Object.fromEntries((badges.results || []).map((b) => [b.badge, b.created_at]));
    const today = todayKST();
    return {
      tier,
      benefits: parseJSON(s['club.benefits'], CLUB_BENEFITS),
      couponNote: tier.tier !== 'welcome' ? (s['club.coupon_note'] || '') : '',
      visits: (visits.results || []).map((v) => ({ ...v, spaceName: nm[v.code] || v.code })),
      badges: Object.entries(BADGES).map(([k, v]) => ({ key: k, ...v, at: got[k] || null })),
      annivs: (annivs.results || []).map((a) => { const d = nextOccur(a.md, today); return { ...a, next: d, left: dayDiff(today, d) }; }),
    };
  });

  route('POST', '/api/me/visits', async (c) => {
    const u = await c.needUser();
    const b = await c.body();
    const code = String(b.code || '');
    const sp = (await loadSpaces(c.db)).find((x) => x.code === code);
    if (!sp) throw new HttpError(400, '방문한 지점을 골라 주세요.');
    if (!isYmd(b.d)) throw new HttpError(400, '이용한 날짜를 골라 주세요.');
    const today = todayKST();
    if (b.d > today) throw new HttpError(400, '이용한 뒤에 인증할 수 있어요.');
    if (dayDiff(b.d, today) > 365) throw new HttpError(400, '1년 안에 이용한 예약만 인증할 수 있어요.');
    const resno = str(b.resno, { max: 40, required: true, name: '예약번호' }).replace(/\s/g, '');
    await c.limit('vv:' + u.id, 10, 86400, '방문 인증은 하루에 10번까지 시도할 수 있어요.');
    const ref = (await sha256hex('visit|' + resno.toUpperCase())).slice(0, 24);
    const dup = await c.db.prepare(`SELECT uid, status FROM visits WHERE ref = ? AND status != 'rejected'`).bind(ref).first();
    if (dup) throw new HttpError(409, dup.uid === u.id ? '이미 인증했거나 확인 중인 예약이에요.' : '이미 다른 계정에서 인증한 예약번호예요.');
    const sameDay = await c.db.prepare(`SELECT 1 AS x FROM visits WHERE uid = ? AND code = ? AND d = ? AND status != 'rejected'`).bind(u.id, code, b.d).first();
    if (sameDay) throw new HttpError(409, '같은 날 같은 지점은 한 번만 인증할 수 있어요.');
    const found = await hostFindReservation(c.env, { code, d: b.d, resno });
    const ok = found.ok;
    const at = nowIso();
    const stmts = [
      c.db.prepare(`INSERT INTO visits (uid, code, d, ref, method, status, note, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(u.id, code, b.d, ref, ok ? 'host' : 'admin', ok ? 'ok' : 'pending', `예약번호 ${resno}`, at, ok ? at : null),
    ];
    if (ok) {
      stmts.push(badgeStmt(c.db, u.id, 'first_visit'));
      stmts.push(notiStmt(c.db, u.id, 'club', `${sp.name} 방문 인증이 완료됐어요.`, '/membership'));
    }
    await c.db.batch(stmts);
    if (ok) {
      const s = await getSettings(c.db);
      const t = await tierOf(c.db, u.id, s);
      if (t.n >= 4) await badgeStmt(c.db, u.id, 'regular').run();
    }
    return { ok: true, status: ok ? 'ok' : 'pending' };
  });

  route('POST', '/api/me/annivs', async (c) => {
    const u = await c.needUser();
    const b = await c.body();
    const title = maskPhones(str(b.title, { max: 20, required: true, name: '기념일 이름' }));
    const md = String(b.md || '');
    if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(md) || !isYmd('2024-' + md)) throw new HttpError(400, '날짜를 다시 골라 주세요.');
    const n = await c.db.prepare('SELECT COUNT(*) AS n FROM annivs WHERE uid = ?').bind(u.id).first();
    if (n.n >= 10) throw new HttpError(400, '기념일은 10개까지 등록할 수 있어요.');
    await c.db.prepare('INSERT INTO annivs (uid, title, md, created_at) VALUES (?, ?, ?, ?)').bind(u.id, title, md, nowIso()).run();
    return { ok: true };
  });
  route('DELETE', '/api/me/annivs/:id', async (c) => {
    const u = await c.needUser();
    await c.db.prepare('DELETE FROM annivs WHERE id = ? AND uid = ?').bind(int(c.params.id, { min: 1 }), u.id).run();
    return { ok: true };
  });
}

/* ---------------- 관리자 로그인 ---------------- */
export function registerAdminAuth(route) {
  route('POST', '/api/admin/login', async (c) => {
    if (!c.env.ADMIN_PASSWORD) {
      throw new HttpError(503, '관리자 비밀번호(ADMIN_PASSWORD)가 아직 등록되지 않았어요. 배포 안내서의 "관리자 비밀번호 등록" 단계를 진행해 주세요.');
    }
    await c.limit('al:' + (await c.ih()), 6, 600, '시도가 너무 많아요. 10분 뒤에 다시 해 주세요.');
    const b = await c.body();
    if (!safeEqual(String(b.password || ''), String(c.env.ADMIN_PASSWORD))) throw new HttpError(401, '관리자 비밀번호가 맞지 않아요.');
    await c.startAdminSession();
    return { ok: true };
  });
  route('POST', '/api/admin/logout', async (c) => {
    await c.endAdminSession();
    return { ok: true };
  });
  route('GET', '/api/admin/me', async (c) => {
    const level = await c.adminLevel();
    return {
      level, hasPassword: !!c.env.ADMIN_PASSWORD,
      bound: { db: !!c.env.DB, host: !!c.env.HOSTDB, photos: !!c.env.PHOTOS, push: !!c.env.SYNC_TOKEN },
    };
  });
}

export { AVATARS };
