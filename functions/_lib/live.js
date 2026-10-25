// 온라인 파티룸 — 내 정보(코인·미션·펫·집)와 미니게임 랭킹, 개선 요청 게시판, 관리자 화면
// 규칙은 live/shared/progress.js 하나를 화면과 함께 써요. 코인은 게임 안에서만 쓰고 돈으로 바꿀 수 없어요.
import { HttpError, str, int, nowIso, todayKST, parseJSON, sha256hex, dispNick, likeSafe } from './util.js';
import { getSettings, notiStmt } from './db.js';
import { checkText } from './community.js';
import { apply, normalize, newProfile, ctxOf, sanitizeImport, LiveError, view } from '../../live/shared/progress.js';
import { ARCADE } from '../../live/shared/arcade-meta.js';
import { lvOf } from '../../live/shared/missions.js';
import { cleanNick } from '../../live/shared/filter.js';

export const REQ_CATS = { feature: '새 기능', game: '게임', deco: '꾸미기·아이템', pet: '펫', bug: '오류 신고', etc: '기타' };
export const REQ_STATUS = { new: '접수', review: '검토 중', planned: '반영 예정', doing: '만드는 중', done: '반영 완료', hold: '보류' };

const social = (st) => !!String(st['live.server'] || '').trim();
const ctxNow = (st) => ctxOf(Date.now(), social(st));

// ---------- 내 정보 ----------
async function loadProfile(c, u, st) {
  const row = await c.db.prepare('SELECT data, rev FROM live_profiles WHERE uid = ?').bind(u.id).first();
  if (row) return { p: normalize(parseJSON(row.data, null), ctxNow(st)), rev: row.rev, fresh: false };
  const p = normalize(newProfile(), ctxNow(st));
  p.nick = cleanNick(dispNick(u.nick), '');
  const at = nowIso();
  await c.db.prepare('INSERT OR IGNORE INTO live_profiles (uid, nick, data, rev, coins, xp, lv, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, 1, ?, ?)')
    .bind(u.id, p.nick || null, JSON.stringify(p), p.coins, p.xp, at, at).run();
  const again = await c.db.prepare('SELECT data, rev FROM live_profiles WHERE uid = ?').bind(u.id).first();
  return { p: normalize(parseJSON(again?.data, p), ctxNow(st)), rev: again?.rev ?? 0, fresh: true };
}

async function saveProfile(c, uid, p, rev) {
  const r = await c.db.prepare('UPDATE live_profiles SET data = ?, nick = ?, coins = ?, xp = ?, lv = ?, rev = rev + 1, updated_at = ? WHERE uid = ? AND rev = ?')
    .bind(JSON.stringify(p), p.nick || null, Math.floor(p.coins), Math.floor(p.xp), lvOf(p.xp), nowIso(), uid, rev).run();
  return (r.meta?.changes ?? 0) > 0;
}

const KST_WEEK = (ctx) => ctx.week;

export function register(route) {
  route('GET', '/api/live/config', async (c) => {
    const st = await getSettings(c.db);
    return {
      server: String(st['live.server'] || '').trim().replace(/\/+$/, ''),
      notice: st['live.notice'] || '',
      boardNotice: st['live.board_notice'] || '',
      bookingUrl: '/rooms',
    };
  });

  route('GET', '/api/live/me', async (c) => {
    const u = await c.user();
    if (!u) return { user: null };
    const st = await getSettings(c.db);
    const { p, fresh } = await loadProfile(c, u, st);
    return { user: { nick: dispNick(u.nick) }, profile: p, fresh };
  });

  route('POST', '/api/live/do', async (c) => {
    const u = await c.needUser();
    const b = await c.body();
    const op = String(b.op || '');
    await c.limit('live:' + u.id, op === 'events' ? 60 : 90, 60, '너무 빠르게 누르고 있어요. 잠시 후 다시 해 주세요.');
    const st = await getSettings(c.db);
    for (let i = 0; i < 4; i++) {
      const { p, rev } = await loadProfile(c, u, st);
      const ctx = ctxNow(st);
      let out;
      try { out = apply(p, op, b.args || {}, ctx); } catch (e) {
        if (e instanceof LiveError) throw new HttpError(400, e.message);
        throw e;
      }
      if (!(await saveProfile(c, u.id, out.profile, rev))) continue;
      if (op === 'score' && out.gains) {
        const game = String(b.args?.game || '');
        const score = Math.floor(Number(b.args?.score) || 0);
        c.wait(c.db.prepare(`INSERT INTO live_scores (uid, game, d, w, score, at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(uid, game, d) DO UPDATE SET score = MAX(score, excluded.score), at = CASE WHEN excluded.score > score THEN excluded.at ELSE at END`)
          .bind(u.id, game, ctx.today, KST_WEEK(ctx), score, nowIso()).run().catch(() => {}));
      }
      return { profile: out.profile, gains: out.gains };
    }
    throw new HttpError(409, '다른 화면에서 동시에 바뀌었어요. 다시 시도해 주세요.');
  });

  // 손님으로 놀던 기록을 계정으로 (계정당 한 번, 계정 쪽 기록이 거의 없을 때만)
  route('POST', '/api/live/import', async (c) => {
    const u = await c.needUser();
    await c.limit('live-import:' + u.id, 3, 3600);
    const st = await getSettings(c.db);
    const { p, rev } = await loadProfile(c, u, st);
    if (p.imported || (p.earned || 0) > 100 || (p.pets || []).length) return { profile: p, imported: false };
    const b = await c.body();
    const ctx = ctxNow(st);
    const q = sanitizeImport(b.guest, ctx);
    q.nick = p.nick || q.nick;
    q.imported = true;
    q.created = p.created;
    await saveProfile(c, u.id, q, rev);
    return { profile: q, imported: true };
  });

  route('GET', '/api/live/rank', async (c) => {
    const game = String(c.q.get('game') || '');
    if (!ARCADE[game]) throw new HttpError(400, '모르는 미니게임이에요.');
    const period = c.q.get('period') === 'week' ? 'week' : 'day';
    const ctx = ctxOf(Date.now());
    const col = period === 'week' ? 'w' : 'd';
    const key = period === 'week' ? ctx.week : ctx.today;
    const rows = (await c.db.prepare(
      `SELECT s.uid, MAX(s.score) AS score, p.nick, p.lv FROM live_scores s JOIN live_profiles p ON p.uid = s.uid
       WHERE s.game = ? AND s.${col} = ? GROUP BY s.uid ORDER BY score DESC, MIN(s.at) ASC LIMIT 20`,
    ).bind(game, key).all()).results || [];
    const u = await c.user();
    let me = null;
    if (u) {
      const mine = await c.db.prepare(`SELECT MAX(score) AS score FROM live_scores WHERE uid = ? AND game = ? AND ${col} = ?`).bind(u.id, game, key).first();
      if (mine && mine.score != null) {
        const above = await c.db.prepare(`SELECT COUNT(*) AS n FROM (SELECT uid, MAX(score) AS b FROM live_scores WHERE game = ? AND ${col} = ? GROUP BY uid) WHERE b > ?`).bind(game, key, mine.score).first();
        me = { rank: (above?.n || 0) + 1, score: mine.score };
      }
    }
    return { game, period, list: rows.map((r) => ({ nick: r.nick || '손님', lv: r.lv || 1, score: r.score, me: !!(u && u.id === r.uid) })), me };
  });

  // ---------- 개선 요청 게시판 ----------
  route('GET', '/api/live/requests', async (c) => {
    const sort = c.q.get('sort') === 'top' ? 'top' : 'new';
    const status = REQ_STATUS[c.q.get('status')] ? c.q.get('status') : '';
    const cat = REQ_CATS[c.q.get('cat')] ? c.q.get('cat') : '';
    const q = likeSafe(String(c.q.get('q') || '').trim().slice(0, 30));
    const page = int(c.q.get('page'), { min: 1, max: 200, def: 1 });
    const where = ['hidden = 0']; const bind = [];
    if (status) { where.push('status = ?'); bind.push(status); }
    if (cat) { where.push('cat = ?'); bind.push(cat); }
    if (q) { where.push('(title LIKE ? OR body LIKE ?)'); bind.push(`%${q}%`, `%${q}%`); }
    const W = where.join(' AND ');
    const order = sort === 'top' ? 'pinned DESC, votes DESC, id DESC' : 'pinned DESC, id DESC';
    const [rows, total, counts] = await Promise.all([
      c.db.prepare(`SELECT id, cat, title, body, nick, status, votes, cmts, reply, pinned, created_at FROM live_requests WHERE ${W} ORDER BY ${order} LIMIT 20 OFFSET ?`).bind(...bind, (page - 1) * 20).all(),
      c.db.prepare(`SELECT COUNT(*) AS n FROM live_requests WHERE ${W}`).bind(...bind).first(),
      c.db.prepare('SELECT status, COUNT(*) AS n FROM live_requests WHERE hidden = 0 GROUP BY status').all(),
    ]);
    const st = await getSettings(c.db);
    const voted = await votedSet(c, (rows.results || []).map((r) => r.id));
    return {
      list: (rows.results || []).map((r) => reqItem(r, voted)),
      total: total?.n || 0, page, pages: Math.max(1, Math.ceil((total?.n || 0) / 20)),
      counts: Object.fromEntries((counts.results || []).map((r) => [r.status, r.n])),
      cats: REQ_CATS, statuses: REQ_STATUS, notice: st['live.board_notice'] || '',
      me: await meInfo(c),
    };
  });

  route('GET', '/api/live/requests/:id', async (c) => {
    const id = int(c.params.id, { min: 1 });
    const r = await c.db.prepare('SELECT * FROM live_requests WHERE id = ?').bind(id).first();
    if (!r || r.hidden) throw new HttpError(404, '없거나 숨겨진 글이에요.');
    const cmts = (await c.db.prepare('SELECT id, nick, body, admin, created_at, uid FROM live_req_cmts WHERE req_id = ? AND hidden = 0 ORDER BY id LIMIT 200').bind(id).all()).results || [];
    const voted = await votedSet(c, [id]);
    const u = await c.user();
    return { item: { ...reqItem(r, voted), body: r.body, replyAt: r.reply_at, mine: !!(u && r.uid === u.id) }, cmts: cmts.map((x) => ({ id: x.id, nick: x.admin ? '쏘플 운영팀' : x.nick, body: x.body, admin: !!x.admin, at: x.created_at, mine: !!(u && x.uid === u.id) })) };
  });

  route('POST', '/api/live/requests', async (c) => {
    const b = await c.body();
    const u = await c.user();
    const ih = await c.ih();
    await c.limit('lreq:' + (u ? 'u' + u.id : ih), u ? 6 : 3, 3600, '요청은 한 시간에 몇 개까지만 올릴 수 있어요. 잠시 후 다시 올려 주세요.');
    const cat = REQ_CATS[b.cat] ? b.cat : 'etc';
    const title = str(b.title, { max: 60, min: 4, name: '제목', required: true });
    const body = str(b.body, { max: 2000, min: 10, name: '내용', required: true, multiline: true });
    const nick = u ? dispNick(u.nick) : cleanNick(str(b.nick, { max: 10, name: '이름', required: true }), '');
    if (!nick) throw new HttpError(400, '다른 이름으로 적어 주세요.');
    await checkText(c.db, title, body, nick);
    const at = nowIso();
    const r = await c.db.prepare('INSERT INTO live_requests (uid, nick, ih, cat, title, body, status, votes, cmts, hidden, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, \'new\', 0, 0, 0, 0, ?, ?)')
      .bind(u ? u.id : null, nick, ih, cat, title, body, at, at).run();
    return { id: r.meta?.last_row_id };
  });

  route('POST', '/api/live/requests/:id/vote', async (c) => {
    const id = int(c.params.id, { min: 1 });
    const r = await c.db.prepare('SELECT id, hidden FROM live_requests WHERE id = ?').bind(id).first();
    if (!r || r.hidden) throw new HttpError(404, '없는 글이에요.');
    const key = await voterKey(c);
    await c.limit('lvote:' + key, 60, 3600);
    const had = await c.db.prepare('SELECT 1 AS x FROM live_req_votes WHERE req_id = ? AND vk = ?').bind(id, key).first();
    if (had) await c.db.batch([c.db.prepare('DELETE FROM live_req_votes WHERE req_id = ? AND vk = ?').bind(id, key), c.db.prepare('UPDATE live_requests SET votes = MAX(0, votes - 1) WHERE id = ?').bind(id)]);
    else await c.db.batch([c.db.prepare('INSERT OR IGNORE INTO live_req_votes (req_id, vk, created_at) VALUES (?, ?, ?)').bind(id, key, nowIso()), c.db.prepare('UPDATE live_requests SET votes = votes + 1 WHERE id = ?').bind(id)]);
    const n = await c.db.prepare('SELECT votes FROM live_requests WHERE id = ?').bind(id).first();
    return { votes: n?.votes || 0, voted: !had };
  });

  route('POST', '/api/live/requests/:id/comments', async (c) => {
    const id = int(c.params.id, { min: 1 });
    const r = await c.db.prepare('SELECT id, uid, title, hidden FROM live_requests WHERE id = ?').bind(id).first();
    if (!r || r.hidden) throw new HttpError(404, '없는 글이에요.');
    const b = await c.body();
    const u = await c.user();
    const ih = await c.ih();
    await c.limit('lcmt:' + (u ? 'u' + u.id : ih), u ? 20 : 8, 3600, '댓글을 너무 많이 달았어요. 잠시 후 다시 달아 주세요.');
    const body = str(b.body, { max: 500, min: 2, name: '댓글', required: true, multiline: true });
    const nick = u ? dispNick(u.nick) : cleanNick(str(b.nick, { max: 10, name: '이름', required: true }), '');
    if (!nick) throw new HttpError(400, '다른 이름으로 적어 주세요.');
    await checkText(c.db, body, nick);
    const stmts = [
      c.db.prepare('INSERT INTO live_req_cmts (req_id, uid, nick, ih, body, admin, hidden, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)').bind(id, u ? u.id : null, nick, ih, body, nowIso()),
      c.db.prepare('UPDATE live_requests SET cmts = cmts + 1 WHERE id = ?').bind(id),
    ];
    if (r.uid && (!u || u.id !== r.uid)) stmts.push(notiStmt(c.db, r.uid, 'live', `내 개선 요청 「${r.title}」에 댓글이 달렸어요.`, `/live/requests?id=${id}`));
    await c.db.batch(stmts);
    return {};
  });

  route('POST', '/api/live/requests/:id/delete', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const r = await c.db.prepare('SELECT uid FROM live_requests WHERE id = ?').bind(id).first();
    if (!r || r.uid !== u.id) throw new HttpError(403, '내가 쓴 글만 지울 수 있어요.');
    await c.db.prepare('UPDATE live_requests SET hidden = 2, updated_at = ? WHERE id = ?').bind(nowIso(), id).run();
    return {};
  });
}

async function meInfo(c) { const u = await c.user(); return u ? { nick: dispNick(u.nick) } : null; }
async function voterKey(c) { const u = await c.user(); return u ? 'u' + u.id : 'i' + (await c.ih()); }
async function votedSet(c, ids) {
  if (!ids.length) return new Set();
  const key = await voterKey(c);
  const rows = (await c.db.prepare(`SELECT req_id FROM live_req_votes WHERE vk = ? AND req_id IN (${ids.map(() => '?').join(',')})`).bind(key, ...ids).all()).results || [];
  return new Set(rows.map((r) => r.req_id));
}
function reqItem(r, voted) {
  return {
    id: r.id, cat: r.cat, catLabel: REQ_CATS[r.cat] || '기타', title: r.title, excerpt: String(r.body || '').slice(0, 120), nick: r.nick,
    status: r.status, statusLabel: REQ_STATUS[r.status] || '접수', votes: r.votes, cmts: r.cmts, reply: r.reply || '', pinned: !!r.pinned, at: r.created_at, voted: voted.has(r.id),
  };
}

// ---------- 관리자 ----------
export function registerAdmin(route) {
  route('GET', '/api/admin/live', async (c) => {
    await c.needAdmin();
    const today = todayKST();
    const ctx = ctxOf(Date.now());
    const q = (sql, ...b) => c.db.prepare(sql).bind(...b).first();
    const [prof, active, newReq, plays, top, st, byStatus] = await Promise.all([
      q('SELECT COUNT(*) AS n FROM live_profiles'),
      q('SELECT COUNT(*) AS n FROM live_profiles WHERE updated_at >= ?', today + 'T00:00:00'),
      q(`SELECT COUNT(*) AS n FROM live_requests WHERE status = 'new' AND hidden = 0`),
      q('SELECT COUNT(*) AS n FROM live_scores WHERE d = ?', ctx.today),
      c.db.prepare('SELECT nick, lv, coins, updated_at FROM live_profiles ORDER BY xp DESC LIMIT 10').all(),
      getSettings(c.db),
      c.db.prepare('SELECT status, COUNT(*) AS n FROM live_requests WHERE hidden = 0 GROUP BY status').all(),
    ]);
    return {
      settings: { 'live.server': st['live.server'] || '', 'live.notice': st['live.notice'] || '', 'live.board_notice': st['live.board_notice'] || '' },
      counts: { profiles: prof?.n || 0, activeToday: active?.n || 0, newRequests: newReq?.n || 0, playsToday: plays?.n || 0 },
      byStatus: Object.fromEntries((byStatus.results || []).map((r) => [r.status, r.n])),
      top: top.results || [],
      statuses: REQ_STATUS, cats: REQ_CATS,
    };
  });

  route('GET', '/api/admin/live/requests', async (c) => {
    await c.needAdmin();
    const status = REQ_STATUS[c.q.get('status')] ? c.q.get('status') : '';
    const hidden = c.q.get('hidden') === '1';
    const where = [hidden ? 'hidden > 0' : 'hidden = 0']; const bind = [];
    if (status) { where.push('status = ?'); bind.push(status); }
    const rows = (await c.db.prepare(`SELECT * FROM live_requests WHERE ${where.join(' AND ')} ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, pinned DESC, id DESC LIMIT 200`).bind(...bind).all()).results || [];
    return { items: rows.map((r) => ({ id: r.id, cat: r.cat, catLabel: REQ_CATS[r.cat] || '기타', title: r.title, body: r.body, nick: r.nick, member: !!r.uid, status: r.status, statusLabel: REQ_STATUS[r.status], votes: r.votes, cmts: r.cmts, reply: r.reply || '', hidden: r.hidden, pinned: !!r.pinned, at: r.created_at })) };
  });

  route('POST', '/api/admin/live/requests/:id', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const r = await c.db.prepare('SELECT * FROM live_requests WHERE id = ?').bind(id).first();
    if (!r) throw new HttpError(404, '없는 글이에요.');
    const b = await c.body();
    const status = REQ_STATUS[b.status] ? b.status : r.status;
    const reply = b.reply !== undefined ? str(b.reply, { max: 1500, multiline: true, name: '답변' }) : (r.reply || '');
    const hidden = b.hidden !== undefined ? (b.hidden ? 1 : 0) : r.hidden;
    const pinned = b.pinned !== undefined ? (b.pinned ? 1 : 0) : r.pinned;
    const at = nowIso();
    const stmts = [c.db.prepare('UPDATE live_requests SET status = ?, reply = ?, reply_at = ?, hidden = ?, pinned = ?, updated_at = ? WHERE id = ?')
      .bind(status, reply || null, reply && reply !== r.reply ? at : r.reply_at, hidden, pinned, at, id)];
    if (r.uid && (status !== r.status || (reply && reply !== r.reply))) {
      const what = status !== r.status ? `「${REQ_STATUS[status]}」으로 바뀌었어요` : '에 운영팀 답변이 달렸어요';
      stmts.push(notiStmt(c.db, r.uid, 'live', `개선 요청 「${r.title}」${status !== r.status ? '이 ' : ''}${what}.`, `/live/requests?id=${id}`));
    }
    await c.db.batch(stmts);
    return {};
  });

  route('POST', '/api/admin/live/comments/:id/hide', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const x = await c.db.prepare('SELECT req_id, hidden FROM live_req_cmts WHERE id = ?').bind(id).first();
    if (!x) throw new HttpError(404, '없는 댓글이에요.');
    if (!x.hidden) await c.db.batch([c.db.prepare('UPDATE live_req_cmts SET hidden = 1 WHERE id = ?').bind(id), c.db.prepare('UPDATE live_requests SET cmts = MAX(0, cmts - 1) WHERE id = ?').bind(x.req_id)]);
    return {};
  });

  route('POST', '/api/admin/live/requests/:id/comment', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const r = await c.db.prepare('SELECT uid, title FROM live_requests WHERE id = ?').bind(id).first();
    if (!r) throw new HttpError(404, '없는 글이에요.');
    const b = await c.body();
    const body = str(b.body, { max: 800, min: 2, name: '댓글', required: true, multiline: true });
    const stmts = [
      c.db.prepare('INSERT INTO live_req_cmts (req_id, uid, nick, ih, body, admin, hidden, created_at) VALUES (?, NULL, ?, NULL, ?, 1, 0, ?)').bind(id, '쏘플 운영팀', body, nowIso()),
      c.db.prepare('UPDATE live_requests SET cmts = cmts + 1 WHERE id = ?').bind(id),
    ];
    if (r.uid) stmts.push(notiStmt(c.db, r.uid, 'live', `개선 요청 「${r.title}」에 운영팀 댓글이 달렸어요.`, `/live/requests?id=${id}`));
    await c.db.batch(stmts);
    return {};
  });

  route('GET', '/api/admin/live/requests/:id/comments', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const rows = (await c.db.prepare('SELECT id, nick, body, admin, hidden, created_at FROM live_req_cmts WHERE req_id = ? ORDER BY id').bind(id).all()).results || [];
    return { items: rows };
  });

  // 회원 한 명의 온라인 파티룸 정보 (문의 대응용 — 코인을 직접 고치지는 않아요)
  route('GET', '/api/admin/live/profile', async (c) => {
    await c.needAdmin();
    const nick = String(c.q.get('nick') || '').trim();
    if (!nick) throw new HttpError(400, '닉네임을 넣어 주세요.');
    const row = await c.db.prepare('SELECT p.uid, p.data, p.updated_at, u.nick AS unick, u.email FROM live_profiles p JOIN users u ON u.id = p.uid WHERE u.nick = ? OR p.nick = ? LIMIT 1').bind(nick, nick).first();
    if (!row) return { found: false };
    const v = view(parseJSON(row.data, null), ctxOf(Date.now()));
    return { found: true, nick: row.unick, updated: row.updated_at, lv: v.lv, coins: v.coins, earned: v.earned, pets: v.pets.map((x) => ({ name: x.name, kind: x.kind, lv: x.lv })), badges: v.badges.length, att: v.att, homeItems: v.home.items.length };
  });
}

export async function liveHash(s) { return (await sha256hex(String(s))).slice(0, 16); }
