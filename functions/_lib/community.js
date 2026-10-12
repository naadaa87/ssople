// 커뮤니티 — 게시글·댓글·좋아요·저장·신고
import { HttpError, str, int, nowIso, maskPhones, parseJSON, likeSafe, dispNick } from './util.js';
import { getSettings, notiStmt, badgeStmt } from './db.js';
import { loadSpaces } from './spaces.js';

export const BOARDS = {
  review: '이용후기', tip: '파티 꿀팁', qna: '질문', free: '자유', notice: '공지', mb: '모임 게시판',
};
const PUBLIC_BOARDS = ['review', 'tip', 'qna', 'free', 'notice'];

export function imgUrl(k) { return k ? (/^https?:\/\//.test(k) ? k : '/api/img/' + k) : ''; }
export function cleanImgs(v, max = 6) {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new HttpError(400, '사진 형식이 올바르지 않아요.');
  if (v.length > max) throw new HttpError(400, `사진은 ${max}장까지 올릴 수 있어요.`);
  return v.map((k) => {
    if (typeof k !== 'string' || !/^u\/[\w/.-]{4,90}$/.test(k)) throw new HttpError(400, '사진 주소가 올바르지 않아요.');
    return k;
  });
}

export async function checkText(db, ...texts) {
  const s = await getSettings(db);
  const words = String(s['community.banned'] || '').split(',').map((w) => w.trim()).filter(Boolean);
  const all = texts.join(' ');
  for (const w of words) {
    if (all.includes(w)) throw new HttpError(400, '운영 정책상 쓸 수 없는 표현이 들어 있어요. 내용을 다시 확인해 주세요.');
  }
  if (/(https?:\/\/[^\s]+){4,}/.test(all)) throw new HttpError(400, '링크가 너무 많아요. 광고성 글은 올릴 수 없어요.');
}

export async function isMeetupMember(db, meetupId, uid) {
  if (!uid) return false;
  const r = await db.prepare(`SELECT status FROM meetup_members WHERE meetup_id = ? AND uid = ?`).bind(meetupId, uid).first();
  return !!r && r.status === 'joined';
}

function author(r) {
  const nick = dispNick(r.nick);
  return nick !== '탈퇴한 회원' ? { id: r.uid, nick, avatar: r.avatar || '' } : { id: r.uid, nick, avatar: '' };
}
function listItem(r, spaceName) {
  const imgs = parseJSON(r.imgs, []);
  return {
    id: r.id, board: r.board, scope: r.scope, title: r.title || '', excerpt: String(r.body || '').slice(0, 140),
    img: imgs[0] ? imgUrl(imgs[0]) : '', imgCount: imgs.length, code: r.code || null, spaceName: spaceName || null,
    rating: r.rating, verified: !!r.verified, likes: r.likes, cmts: r.cmts, views: r.views, pinned: !!r.pinned,
    hidden: !!r.hidden, created_at: r.created_at, author: author(r),
  };
}

export async function listPosts(db, { board, scope = 0, code, q, sort = 'new', page = 1, size = 20, uid, onlyMine, bookmarkedBy }) {
  const where = [];
  const binds = [];
  let join = '';
  if (bookmarkedBy) {
    join = `JOIN reactions rx ON rx.kind = 'bm' AND rx.target = p.id AND rx.uid = ?`;
    binds.push(bookmarkedBy);
    where.push('p.hidden = 0');
  } else if (onlyMine) {
    where.push('p.uid = ?');
    binds.push(uid);
  } else {
    where.push('p.hidden = 0');
    if (board === 'all') where.push(`p.board IN ('review','tip','qna','free')`);
    else if (board) { where.push('p.board = ?'); binds.push(board); }
    if (board === 'mb') { where.push('p.scope = ?'); binds.push(scope); }
    if (code) { where.push('p.code = ?'); binds.push(code); }
    if (q) { where.push('(p.title LIKE ? OR p.body LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
  }
  let order = 'p.pinned DESC, p.id DESC';
  if (sort === 'hot') order = `p.pinned DESC, (p.likes * 3 + p.cmts * 2 + p.views / 20.0) / (1 + (julianday('now') - julianday(p.created_at)) / 7.0) DESC, p.id DESC`;
  if (sort === 'top') order = 'p.rating DESC, p.likes DESC, p.id DESC';
  const off = (page - 1) * size;
  const rows = (await db.prepare(
    `SELECT p.*, u.nick, u.avatar FROM posts p ${join} LEFT JOIN users u ON u.id = p.uid
     WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,
  ).bind(...binds, size + 1, off).all()).results || [];
  const spaces = await loadSpaces(db, { all: true });
  const nm = Object.fromEntries(spaces.map((s) => [s.code, s.name]));
  return { items: rows.slice(0, size).map((r) => listItem(r, nm[r.code])), more: rows.length > size };
}

export function register(route) {
  route('GET', '/api/posts', async (c) => {
    const board = c.q.get('board') || 'all';
    if (board !== 'all' && !BOARDS[board]) throw new HttpError(400, '없는 게시판이에요.');
    const scope = int(c.q.get('scope'), { min: 0, def: 0 });
    if (board === 'mb') {
      const u = await c.needUser();
      if (!(await isMeetupMember(c.db, scope, u.id)) && !(await c.adminLevel())) throw new HttpError(403, '모임 멤버만 볼 수 있어요.');
    }
    const code = /^S-\d{4}$/.test(c.q.get('code') || '') ? c.q.get('code') : null;
    const q = likeSafe(str(c.q.get('q'), { max: 40 }));
    const sort = ['new', 'hot', 'top'].includes(c.q.get('sort')) ? c.q.get('sort') : 'new';
    const page = int(c.q.get('page'), { min: 1, max: 500, def: 1 });
    const size = int(c.q.get('size'), { min: 1, max: 40, def: 20 });
    return listPosts(c.db, { board, scope, code, q, sort, page, size });
  });

  route('GET', '/api/posts/:id', async (c) => {
    const id = int(c.params.id, { min: 1 });
    const r = await c.db.prepare(`SELECT p.*, u.nick, u.avatar FROM posts p LEFT JOIN users u ON u.id = p.uid WHERE p.id = ?`).bind(id).first();
    if (!r) throw new HttpError(404, '글을 찾을 수 없어요.');
    const me = await c.user();
    const adm = await c.adminLevel();
    const mine = me && me.id === r.uid;
    if (r.hidden && !mine && !adm) throw new HttpError(404, '신고가 접수되어 잠시 가려진 글이에요.');
    if (r.board === 'mb' && !(me && (await isMeetupMember(c.db, r.scope, me.id))) && !adm) throw new HttpError(403, '모임 멤버만 볼 수 있어요.');
    let liked = false, saved = false;
    if (me) {
      const rx = (await c.db.prepare(`SELECT kind FROM reactions WHERE target = ? AND uid = ? AND kind IN ('like','bm')`).bind(id, me.id).all()).results || [];
      liked = rx.some((x) => x.kind === 'like'); saved = rx.some((x) => x.kind === 'bm');
    }
    if (!mine) c.wait(c.db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').bind(id).run());
    let space = null;
    if (r.code) {
      const sp = (await loadSpaces(c.db, { all: true })).find((s) => s.code === r.code);
      if (sp) space = { code: sp.code, name: sp.name, area: sp.area };
    }
    return {
      post: {
        id: r.id, board: r.board, scope: r.scope, title: r.title || '', body: r.body, imgs: parseJSON(r.imgs, []).map(imgUrl), imgKeys: parseJSON(r.imgs, []),
        code: r.code, space, rating: r.rating, verified: !!r.verified, likes: r.likes, cmts: r.cmts, views: r.views + (mine ? 0 : 1),
        pinned: !!r.pinned, hidden: !!r.hidden, created_at: r.created_at, updated_at: r.updated_at, author: author(r),
      },
      liked, saved, mine: !!mine, canEdit: !!(mine || adm),
    };
  });

  route('POST', '/api/posts', async (c) => {
    const u = await c.needUser();
    const b = await c.body();
    const board = String(b.board || '');
    if (!BOARDS[board]) throw new HttpError(400, '게시판을 골라 주세요.');
    if (board === 'notice' && !(await c.adminLevel())) throw new HttpError(403, '공지는 운영진만 쓸 수 있어요.');
    let scope = 0;
    if (board === 'mb') {
      scope = int(b.scope, { min: 1, name: '모임' });
      if (!(await isMeetupMember(c.db, scope, u.id))) throw new HttpError(403, '모임 멤버만 쓸 수 있어요.');
    }
    await c.limit('po:' + u.id, 10, 3600, '글은 1시간에 10개까지 쓸 수 있어요.');
    const title = maskPhones(str(b.title, { max: 80, required: true, name: '제목' }));
    const body = maskPhones(str(b.body, { max: 5000, min: 5, required: true, multiline: true, name: '본문' }));
    const imgs = cleanImgs(b.imgs, 6);
    let code = null, rating = null, verified = 0;
    if (board === 'review') {
      code = String(b.code || '');
      const sp = (await loadSpaces(c.db)).find((s) => s.code === code);
      if (!sp) throw new HttpError(400, '후기를 남길 지점을 골라 주세요.');
      rating = int(b.rating, { min: 1, max: 5, name: '별점' });
      if (!rating) throw new HttpError(400, '별점을 골라 주세요.');
      const v = await c.db.prepare(`SELECT id FROM visits WHERE uid = ? AND code = ? AND status = 'ok' LIMIT 1`).bind(u.id, code).first();
      verified = v ? 1 : 0;
    } else if (b.code && /^S-\d{4}$/.test(b.code)) {
      code = b.code;
    }
    await checkText(c.db, title, body);
    const at = nowIso();
    const r = await c.db.prepare(
      `INSERT INTO posts (board, scope, uid, title, body, imgs, code, rating, verified, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ).bind(board, scope, u.id, title, body, JSON.stringify(imgs), code, rating, verified, at, at).first();
    const stmts = [badgeStmt(c.db, u.id, 'writer')];
    if (board === 'review') stmts.push(badgeStmt(c.db, u.id, 'reviewer'));
    await c.db.batch(stmts);
    return { ok: true, id: r.id };
  });

  route('PATCH', '/api/posts/:id', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const p = await c.db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
    if (!p) throw new HttpError(404, '글을 찾을 수 없어요.');
    const adm = await c.adminLevel();
    if (p.uid !== u.id && !adm) throw new HttpError(403, '내가 쓴 글만 고칠 수 있어요.');
    const b = await c.body();
    const title = 'title' in b ? maskPhones(str(b.title, { max: 80, required: true, name: '제목' })) : p.title;
    const body = 'body' in b ? maskPhones(str(b.body, { max: 5000, min: 5, required: true, multiline: true, name: '본문' })) : p.body;
    const imgs = 'imgs' in b ? JSON.stringify(cleanImgs(b.imgs, 6)) : p.imgs;
    const rating = p.board === 'review' && 'rating' in b ? int(b.rating, { min: 1, max: 5, name: '별점' }) : p.rating;
    await checkText(c.db, title, body);
    await c.db.prepare('UPDATE posts SET title = ?, body = ?, imgs = ?, rating = ?, updated_at = ? WHERE id = ?')
      .bind(title, body, imgs, rating, nowIso(), id).run();
    return { ok: true };
  });

  route('DELETE', '/api/posts/:id', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const p = await c.db.prepare('SELECT uid FROM posts WHERE id = ?').bind(id).first();
    if (!p) throw new HttpError(404, '글을 찾을 수 없어요.');
    if (p.uid !== u.id && !(await c.adminLevel())) throw new HttpError(403, '내가 쓴 글만 지울 수 있어요.');
    await c.db.batch([
      c.db.prepare('DELETE FROM posts WHERE id = ?').bind(id),
      c.db.prepare('DELETE FROM comments WHERE post_id = ?').bind(id),
      c.db.prepare(`DELETE FROM reactions WHERE target = ? AND kind IN ('like','bm')`).bind(id),
    ]);
    return { ok: true };
  });

  for (const [path, kind, col] of [['like', 'like', 'likes'], ['bookmark', 'bm', null]]) {
    route('POST', `/api/posts/:id/${path}`, async (c) => {
      const u = await c.needUser();
      const id = int(c.params.id, { min: 1 });
      const p = await c.db.prepare('SELECT id, uid, title FROM posts WHERE id = ? AND hidden = 0').bind(id).first();
      if (!p) throw new HttpError(404, '글을 찾을 수 없어요.');
      const ex = await c.db.prepare('SELECT 1 AS x FROM reactions WHERE kind = ? AND target = ? AND uid = ?').bind(kind, id, u.id).first();
      const stmts = [];
      if (ex) {
        stmts.push(c.db.prepare('DELETE FROM reactions WHERE kind = ? AND target = ? AND uid = ?').bind(kind, id, u.id));
        if (col) stmts.push(c.db.prepare(`UPDATE posts SET ${col} = MAX(0, ${col} - 1) WHERE id = ?`).bind(id));
      } else {
        await c.limit('rx:' + u.id, 200, 3600);
        stmts.push(c.db.prepare('INSERT OR IGNORE INTO reactions (kind, target, uid, created_at) VALUES (?, ?, ?, ?)').bind(kind, id, u.id, nowIso()));
        if (col) stmts.push(c.db.prepare(`UPDATE posts SET ${col} = ${col} + 1 WHERE id = ?`).bind(id));
      }
      await c.db.batch(stmts);
      const now = await c.db.prepare('SELECT likes FROM posts WHERE id = ?').bind(id).first();
      return { ok: true, on: !ex, likes: now?.likes ?? 0 };
    });
  }

  /* ---------- 댓글 ---------- */
  route('GET', '/api/posts/:id/comments', async (c) => {
    const id = int(c.params.id, { min: 1 });
    const p = await c.db.prepare('SELECT board, scope, hidden, uid FROM posts WHERE id = ?').bind(id).first();
    if (!p) throw new HttpError(404, '글을 찾을 수 없어요.');
    const me = await c.user();
    if (p.board === 'mb' && !(me && (await isMeetupMember(c.db, p.scope, me.id))) && !(await c.adminLevel())) throw new HttpError(403, '모임 멤버만 볼 수 있어요.');
    const rows = (await c.db.prepare(
      `SELECT c.*, u.nick, u.avatar FROM comments c LEFT JOIN users u ON u.id = c.uid WHERE c.post_id = ? ORDER BY c.id LIMIT 500`,
    ).bind(id).all()).results || [];
    const hasChild = new Set(rows.filter((r) => r.parent_id).map((r) => r.parent_id));
    const items = rows
      .filter((r) => !(r.deleted && !hasChild.has(r.id)))
      .map((r) => ({
        id: r.id, parent_id: r.parent_id, created_at: r.created_at,
        body: r.deleted ? '' : r.hidden ? '' : r.body,
        state: r.deleted ? 'deleted' : r.hidden ? 'hidden' : 'ok',
        author: r.deleted ? null : author(r), mine: !!(me && me.id === r.uid), isWriter: r.uid === p.uid,
      }));
    return { items };
  });

  route('POST', '/api/posts/:id/comments', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const p = await c.db.prepare('SELECT id, uid, title, board, scope, hidden FROM posts WHERE id = ?').bind(id).first();
    if (!p || p.hidden) throw new HttpError(404, '글을 찾을 수 없어요.');
    if (p.board === 'mb' && !(await isMeetupMember(c.db, p.scope, u.id))) throw new HttpError(403, '모임 멤버만 댓글을 쓸 수 있어요.');
    await c.limit('co:' + u.id, 40, 3600, '댓글은 1시간에 40개까지 쓸 수 있어요.');
    const b = await c.body();
    const body = maskPhones(str(b.body, { max: 1000, required: true, multiline: true, name: '댓글' }));
    await checkText(c.db, body);
    let parent = null;
    if (b.parent_id) {
      parent = await c.db.prepare('SELECT id, uid, parent_id FROM comments WHERE id = ? AND post_id = ?').bind(int(b.parent_id, { min: 1 }), id).first();
      if (!parent) throw new HttpError(400, '답글을 달 댓글을 찾을 수 없어요.');
      if (parent.parent_id) parent = await c.db.prepare('SELECT id, uid, parent_id FROM comments WHERE id = ?').bind(parent.parent_id).first();
    }
    const at = nowIso();
    const link = p.board === 'mb' ? `/c/${id}` : `/c/${id}`;
    const stmts = [
      c.db.prepare('INSERT INTO comments (post_id, uid, parent_id, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, u.id, parent ? parent.id : null, body, at),
      c.db.prepare('UPDATE posts SET cmts = cmts + 1 WHERE id = ?').bind(id),
    ];
    const ttl = String(p.title || '').slice(0, 24);
    if (p.uid !== u.id) stmts.push(notiStmt(c.db, p.uid, 'comment', `${u.nick}님이 "${ttl}"에 댓글을 남겼어요.`, link));
    if (parent && parent.uid !== u.id && parent.uid !== p.uid) stmts.push(notiStmt(c.db, parent.uid, 'reply', `${u.nick}님이 내 댓글에 답글을 남겼어요.`, link));
    await c.db.batch(stmts);
    return { ok: true };
  });

  route('DELETE', '/api/comments/:id', async (c) => {
    const u = await c.needUser();
    const id = int(c.params.id, { min: 1 });
    const cm = await c.db.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first();
    if (!cm || cm.deleted) throw new HttpError(404, '댓글을 찾을 수 없어요.');
    if (cm.uid !== u.id && !(await c.adminLevel())) throw new HttpError(403, '내가 쓴 댓글만 지울 수 있어요.');
    await c.db.batch([
      c.db.prepare(`UPDATE comments SET deleted = 1, body = '' WHERE id = ?`).bind(id),
      c.db.prepare('UPDATE posts SET cmts = MAX(0, cmts - 1) WHERE id = ?').bind(cm.post_id),
    ]);
    return { ok: true };
  });

  /* ---------- 신고 ---------- */
  route('POST', '/api/report', async (c) => {
    const u = await c.needUser();
    const b = await c.body();
    const kind = ['post', 'comment', 'meetup', 'crew', 'user', 'event'].includes(b.kind) ? b.kind : null;
    const id = int(b.id, { min: 1, name: '대상' });
    if (!kind || !id) throw new HttpError(400, '신고할 대상을 확인해 주세요.');
    const reason = str(b.reason, { max: 200, required: true, name: '신고 사유' });
    await c.limit('rp:' + u.id, 30, 86400, '오늘은 더 이상 신고할 수 없어요.');
    const r = await c.db.prepare('INSERT OR IGNORE INTO reports (kind, target, uid, reason, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(kind, id, u.id, reason, nowIso()).first();
    if (!r) return { ok: true, already: true };
    const s = await getSettings(c.db);
    const th = Math.max(2, Number(s['community.hide_at']) || 3);
    const tbl = { post: 'posts', comment: 'comments', meetup: 'meetups', crew: 'crews' }[kind];
    if (tbl) {
      await c.db.prepare(`UPDATE ${tbl} SET reports = reports + 1 WHERE id = ?`).bind(id).run();
      const t = await c.db.prepare(`SELECT reports FROM ${tbl} WHERE id = ?`).bind(id).first();
      if (t && t.reports >= th) {
        if (tbl === 'posts' || tbl === 'comments') await c.db.prepare(`UPDATE ${tbl} SET hidden = 1 WHERE id = ?`).bind(id).run();
        else await c.db.prepare(`UPDATE ${tbl} SET status = 'hidden' WHERE id = ? AND status != 'hidden'`).bind(id).run();
      }
    }
    return { ok: true };
  });
}

export { PUBLIC_BOARDS };
