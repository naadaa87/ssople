// 관리자 — 한눈에 보기 · 신고 · 모임/파티팀 · 제휴 · 문의 · 회원 · 방문 인증 · 설정
import { HttpError, str, int, url, nowIso, todayKST, addDays, randToken, parseJSON, likeSafe } from './util.js';
import { getSettings, saveSettings, DEFAULTS, notiStmt, badgeStmt, getMeta } from './db.js';
import { hashPw } from './ctx.js';
import { loadSpaces } from './spaces.js';
import { imgUrl } from './community.js';
import { INQUIRY_KINDS } from './misc.js';
import { tierOf } from './account.js';

export function register(route) {
  route('GET', '/api/admin/overview', async (c) => {
    await c.needAdmin();
    const today = todayKST();
    const wk = addDays(today, -7) + 'T00:00:00';
    const q = (sql, ...b) => c.db.prepare(sql).bind(...b).first();
    const [users, users7, posts7, reports, inq, evp, vis, crews, meets, clicks7, occ, diag, okAt, cronAt] = await Promise.all([
      q('SELECT COUNT(*) AS n FROM users WHERE status = ?', 'active'),
      q('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', wk),
      q('SELECT COUNT(*) AS n FROM posts WHERE created_at >= ?', wk),
      q(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`),
      q(`SELECT COUNT(*) AS n FROM inquiries WHERE status = 'new'`),
      q(`SELECT COUNT(*) AS n FROM events WHERE status = 'pending'`),
      q(`SELECT COUNT(*) AS n FROM visits WHERE status = 'pending'`),
      q(`SELECT COUNT(*) AS n FROM crews WHERE status = 'open' AND d >= ?`, today),
      q(`SELECT COUNT(*) AS n FROM meetups WHERE status = 'active'`),
      c.db.prepare(`SELECT code, COUNT(*) AS n FROM clicks WHERE at >= ? GROUP BY code ORDER BY n DESC LIMIT 10`).bind(wk).all(),
      c.db.prepare(`SELECT src, COUNT(*) AS n FROM occ WHERE d >= ? AND d <= ? GROUP BY src`).bind(today, addDays(today, 13)).all(),
      getMeta(c.db, 'host_diag'), getMeta(c.db, 'host_ok_at'), getMeta(c.db, 'cron_at'),
    ]);
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    const d = parseJSON(diag, null);
    return {
      counts: {
        users: users.n, users7: users7.n, posts7: posts7.n, reports: reports.n, inquiries: inq.n,
        eventsPending: evp.n, visitsPending: vis.n, crews: crews.n, meetups: meets.n,
      },
      clicks7: (clicks7.results || []).map((r) => ({ ...r, name: nm[r.code] || r.code })),
      occ: occ.results || [],
      sync: d ? { at: d.at, ok: d.ok, error: d.error || null, active: d.active, blocks: d.blocks, unmatched: (d.unmatched || []).length, latest: d.latest || null, okAt: okAt || null, cronAt: cronAt || null } : null,
      bound: { host: !!c.env.HOSTDB, photos: !!c.env.PHOTOS, push: !!c.env.SYNC_TOKEN },
    };
  });

  route('GET', '/api/admin/clicks', async (c) => {
    await c.needAdmin();
    const days = int(c.q.get('days'), { min: 1, max: 180, def: 30 });
    const since = addDays(todayKST(), -days) + 'T00:00:00';
    const [byCode, byDay, byKind] = await Promise.all([
      c.db.prepare(`SELECT code, kind, COUNT(*) AS n FROM clicks WHERE at >= ? GROUP BY code, kind`).bind(since).all(),
      c.db.prepare(`SELECT substr(at, 1, 10) AS d, COUNT(*) AS n FROM clicks WHERE at >= ? GROUP BY d ORDER BY d`).bind(since).all(),
      c.db.prepare(`SELECT pkg, COUNT(*) AS n FROM clicks WHERE at >= ? AND kind = 'book' GROUP BY pkg ORDER BY n DESC`).bind(since).all(),
    ]);
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    const agg = {};
    for (const r of byCode.results || []) { const a = (agg[r.code] = agg[r.code] || { code: r.code, name: nm[r.code] || r.code, book: 0, place: 0, other: 0 }); if (r.kind === 'book') a.book += r.n; else if (r.kind === 'place') a.place += r.n; else a.other += r.n; }
    return { days, spaces: Object.values(agg).sort((a, b) => b.book + b.place - (a.book + a.place)), byDay: byDay.results || [], byPkg: byKind.results || [] };
  });

  /* ---------------- 신고 · 커뮤니티 ---------------- */
  route('GET', '/api/admin/reports', async (c) => {
    await c.needAdmin();
    const st = c.q.get('status') === 'done' ? 'done' : 'open';
    const rows = (await c.db.prepare(
      `SELECT r.kind, r.target, COUNT(*) AS n, MAX(r.created_at) AS last, GROUP_CONCAT(r.reason, ' / ') AS reasons, MIN(r.id) AS id
       FROM reports r WHERE r.status = ? GROUP BY r.kind, r.target ORDER BY last DESC LIMIT 100`,
    ).bind(st).all()).results || [];
    const ids = {};
    for (const r of rows) (ids[r.kind] = ids[r.kind] || []).push(Number(r.target));
    const SQL = {
      post: 'SELECT p.id, p.title, p.body, p.hidden, p.board, u.nick FROM posts p LEFT JOIN users u ON u.id = p.uid WHERE p.id IN',
      comment: 'SELECT c.id, c.body, c.hidden, c.post_id, u.nick FROM comments c LEFT JOIN users u ON u.id = c.uid WHERE c.id IN',
      meetup: 'SELECT m.id, m.title, m.intro AS body, m.status, u.nick FROM meetups m LEFT JOIN users u ON u.id = m.uid WHERE m.id IN',
      crew: 'SELECT c.id, c.title, c.body, c.status, u.nick FROM crews c LEFT JOIN users u ON u.id = c.uid WHERE c.id IN',
      user: 'SELECT id, nick, status FROM users WHERE id IN',
    };
    const found = {};
    await Promise.all(Object.entries(ids).map(async ([k, list]) => {
      if (!SQL[k]) return;
      const safe = list.filter((x) => Number.isInteger(x)).slice(0, 100);
      if (!safe.length) return;
      const rs = (await c.db.prepare(`${SQL[k]} (${safe.join(',')})`).all()).results || [];
      for (const t of rs) found[k + ':' + t.id] = t;
    }));
    const out = rows.map((r) => {
      const t = found[r.kind + ':' + r.target];
      return { ...r, reasons: String(r.reasons || '').slice(0, 300), target: t ? { ...t, body: String(t.body || '').slice(0, 200) } : null, targetId: r.target };
    });
    return { items: out };
  });

  route('POST', '/api/admin/reports', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const kind = ['post', 'comment', 'meetup', 'crew', 'user', 'event'].includes(b.kind) ? b.kind : null;
    const id = int(b.id, { min: 1 });
    if (!kind || !id) throw new HttpError(400, '대상을 확인해 주세요.');
    const action = b.action;
    const stmts = [c.db.prepare(`UPDATE reports SET status = 'done' WHERE kind = ? AND target = ?`).bind(kind, id)];
    const tbl = { post: 'posts', comment: 'comments', meetup: 'meetups', crew: 'crews' }[kind];
    if (tbl === 'posts' || tbl === 'comments') {
      if (action === 'hide') stmts.push(c.db.prepare(`UPDATE ${tbl} SET hidden = 1 WHERE id = ?`).bind(id));
      if (action === 'restore') stmts.push(c.db.prepare(`UPDATE ${tbl} SET hidden = 0, reports = 0 WHERE id = ?`).bind(id));
    } else if (tbl) {
      if (action === 'hide') stmts.push(c.db.prepare(`UPDATE ${tbl} SET status = 'hidden' WHERE id = ?`).bind(id));
      if (action === 'restore') stmts.push(c.db.prepare(`UPDATE ${tbl} SET status = ?, reports = 0 WHERE id = ?`).bind(kind === 'meetup' ? 'active' : 'open', id));
    } else if (kind === 'user' && action === 'hide') {
      stmts.push(c.db.prepare(`UPDATE users SET status = 'banned' WHERE id = ? AND role = 'member'`).bind(id));
      stmts.push(c.db.prepare(`DELETE FROM sessions WHERE uid = ?`).bind(id));
    }
    await c.db.batch(stmts);
    return { ok: true };
  });

  route('GET', '/api/admin/posts', async (c) => {
    await c.needAdmin();
    const where = [];
    const binds = [];
    if (c.q.get('hidden') === '1') where.push('p.hidden = 1');
    const board = c.q.get('board'); if (board) { where.push('p.board = ?'); binds.push(board); }
    const q = likeSafe(str(c.q.get('q'), { max: 40 })); if (q) { where.push('(p.title LIKE ? OR p.body LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
    const rows = (await c.db.prepare(
      `SELECT p.id, p.board, p.title, p.code, p.rating, p.likes, p.cmts, p.reports, p.hidden, p.pinned, p.created_at, u.nick FROM posts p LEFT JOIN users u ON u.id = p.uid
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.id DESC LIMIT 100`,
    ).bind(...binds).all()).results || [];
    return { items: rows };
  });

  route('POST', '/api/admin/posts/:id', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const b = await c.body();
    const sets = [];
    const binds = [];
    if ('hidden' in b) { sets.push('hidden = ?'); binds.push(b.hidden ? 1 : 0); if (!b.hidden) sets.push('reports = 0'); }
    if ('pinned' in b) { sets.push('pinned = ?'); binds.push(b.pinned ? 1 : 0); }
    if (!sets.length) return { ok: true };
    await c.db.prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
    return { ok: true };
  });

  route('GET', '/api/admin/groups', async (c) => {
    await c.needAdmin();
    const [m, cr] = await Promise.all([
      c.db.prepare(`SELECT m.id, m.title, m.cat, m.region, m.members, m.cap, m.status, m.reports, m.created_at, u.nick FROM meetups m LEFT JOIN users u ON u.id = m.uid WHERE m.status != 'deleted' ORDER BY m.id DESC LIMIT 150`).all(),
      c.db.prepare(`SELECT c.id, c.title, c.d, c.region, c.need, c.accepted, c.status, c.reports, c.created_at, u.nick FROM crews c LEFT JOIN users u ON u.id = c.uid WHERE c.status != 'deleted' ORDER BY c.id DESC LIMIT 150`).all(),
    ]);
    return { meetups: m.results || [], crews: cr.results || [] };
  });
  route('POST', '/api/admin/meetups/:id', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const st = ['active', 'closed', 'hidden', 'deleted'].includes(b.status) ? b.status : null;
    if (!st) throw new HttpError(400, '상태를 확인해 주세요.');
    await c.db.prepare('UPDATE meetups SET status = ?, updated_at = ? WHERE id = ?').bind(st, nowIso(), int(c.params.id, { min: 1 })).run();
    return { ok: true };
  });
  route('POST', '/api/admin/crews/:id', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const st = ['open', 'closed', 'hidden', 'deleted'].includes(b.status) ? b.status : null;
    if (!st) throw new HttpError(400, '상태를 확인해 주세요.');
    await c.db.prepare('UPDATE crews SET status = ?, updated_at = ? WHERE id = ?').bind(st, nowIso(), int(c.params.id, { min: 1 })).run();
    return { ok: true };
  });

  /* ---------------- 제휴 ---------------- */
  const cleanPartner = (b) => ({
    name: str(b.name, { max: 40, required: true, name: '제휴처 이름' }),
    cat: str(b.cat, { max: 20, name: '분류' }) || '기타',
    benefit: str(b.benefit, { max: 80, required: true, name: '혜택' }),
    body: str(b.body, { max: 1000, multiline: true, name: '설명' }),
    url: url(b.url, { name: '링크' }),
    img: b.img && /^u\/[\w/.-]{4,90}$/.test(b.img) ? b.img : null,
    region: str(b.region, { max: 20, name: '지역' }),
    tier: ['all', 'silver', 'gold'].includes(b.tier) ? b.tier : 'all',
    code: b.code && /^S-\d{4}$/.test(b.code) ? b.code : null,
    sort: int(b.sort, { min: 0, max: 9999, def: 0 }),
    active: b.active === false || b.active === 0 ? 0 : 1,
  });
  route('GET', '/api/admin/partners', async (c) => {
    await c.needAdmin();
    const rows = (await c.db.prepare('SELECT * FROM partners ORDER BY active DESC, sort, id DESC').all()).results || [];
    return { items: rows.map((p) => ({ ...p, imgUrl: p.img ? imgUrl(p.img) : '' })) };
  });
  route('POST', '/api/admin/partners', async (c) => {
    await c.needAdmin();
    const f = cleanPartner(await c.body());
    const r = await c.db.prepare('INSERT INTO partners (name, cat, benefit, body, url, img, region, tier, code, sort, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
      .bind(f.name, f.cat, f.benefit, f.body, f.url || null, f.img, f.region, f.tier, f.code, f.sort, f.active, nowIso()).first();
    return { ok: true, id: r.id };
  });
  route('PUT', '/api/admin/partners/:id', async (c) => {
    await c.needAdmin();
    const f = cleanPartner(await c.body());
    await c.db.prepare('UPDATE partners SET name=?, cat=?, benefit=?, body=?, url=?, img=?, region=?, tier=?, code=?, sort=?, active=? WHERE id=?')
      .bind(f.name, f.cat, f.benefit, f.body, f.url || null, f.img, f.region, f.tier, f.code, f.sort, f.active, int(c.params.id, { min: 1 })).run();
    return { ok: true };
  });
  route('DELETE', '/api/admin/partners/:id', async (c) => {
    await c.needAdmin();
    await c.db.prepare('DELETE FROM partners WHERE id = ?').bind(int(c.params.id, { min: 1 })).run();
    return { ok: true };
  });

  /* ---------------- 문의함 ---------------- */
  route('GET', '/api/admin/inquiries', async (c) => {
    await c.needAdmin();
    const st = ['new', 'read', 'done', 'all'].includes(c.q.get('status')) ? c.q.get('status') : 'all';
    const rows = (await c.db.prepare(`SELECT * FROM inquiries ${st === 'all' ? '' : 'WHERE status = ?'} ORDER BY id DESC LIMIT 200`).bind(...(st === 'all' ? [] : [st])).all()).results || [];
    return { items: rows.map((r) => ({ ...r, kindLabel: INQUIRY_KINDS[r.kind] || r.kind, ih: undefined })) };
  });
  route('POST', '/api/admin/inquiries/:id', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const st = ['new', 'read', 'done'].includes(b.status) ? b.status : 'read';
    await c.db.prepare('UPDATE inquiries SET status = ?, memo = ? WHERE id = ?').bind(st, str(b.memo, { max: 1000, multiline: true }) || null, int(c.params.id, { min: 1 })).run();
    return { ok: true };
  });

  /* ---------------- 회원 ---------------- */
  route('GET', '/api/admin/users', async (c) => {
    await c.needAdmin();
    const q = likeSafe(str(c.q.get('q'), { max: 40 }));
    const page = int(c.q.get('page'), { min: 1, max: 1000, def: 1 });
    const where = [`status != 'left'`];
    const binds = [];
    if (q) { where.push('(email LIKE ? OR nick LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
    if (c.q.get('role')) { where.push('role = ?'); binds.push(c.q.get('role')); }
    const rows = (await c.db.prepare(
      `SELECT id, email, nick, birth, region, role, status, marketing, memo, host_codes, created_at, last_at,
              (SELECT COUNT(*) FROM visits v WHERE v.uid = users.id AND v.status = 'ok') AS visits,
              (SELECT COUNT(*) FROM posts p WHERE p.uid = users.id) AS posts
       FROM users WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 51 OFFSET ?`,
    ).bind(...binds, (page - 1) * 50).all()).results || [];
    const total = await c.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE status != 'left'`).first();
    return { items: rows.slice(0, 50), more: rows.length > 50, total: total.n };
  });

  route('POST', '/api/admin/users/:id', async (c) => {
    const lv = await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const u = await c.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!u) throw new HttpError(404, '회원을 찾을 수 없어요.');
    const b = await c.body();
    const stmts = [];
    let temp = null;
    if ('role' in b) {
      if (lv !== 'admin') throw new HttpError(403, '권한 변경은 대표 관리자만 할 수 있어요.');
      const role = ['member', 'host', 'staff', 'admin'].includes(b.role) ? b.role : 'member';
      stmts.push(c.db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id));
    }
    if ('hostCodes' in b) {
      if (lv !== 'admin') throw new HttpError(403, '호스트 지점 연결은 대표 관리자만 할 수 있어요.');
      const codes = (Array.isArray(b.hostCodes) ? b.hostCodes : String(b.hostCodes || '').split(',')).map((x) => String(x).trim().toUpperCase()).filter((x) => /^S-\d{4}$/.test(x)).slice(0, 30);
      stmts.push(c.db.prepare('UPDATE users SET host_codes = ? WHERE id = ?').bind(codes.length ? JSON.stringify(codes) : null, id));
    }
    if ('status' in b) {
      const st = ['active', 'banned'].includes(b.status) ? b.status : 'active';
      if (u.role !== 'member' && st === 'banned' && lv !== 'admin') throw new HttpError(403, '운영진 계정은 대표 관리자만 정지할 수 있어요.');
      stmts.push(c.db.prepare('UPDATE users SET status = ? WHERE id = ?').bind(st, id));
      if (st === 'banned') stmts.push(c.db.prepare('DELETE FROM sessions WHERE uid = ?').bind(id));
    }
    if ('memo' in b) stmts.push(c.db.prepare('UPDATE users SET memo = ? WHERE id = ?').bind(str(b.memo, { max: 300 }) || null, id));
    if (b.resetPw) {
      temp = 'sp' + randToken(6).replace(/[-_]/g, 'x') + '7';
      stmts.push(c.db.prepare('UPDATE users SET pw = ? WHERE id = ?').bind(await hashPw(temp), id));
      stmts.push(c.db.prepare('DELETE FROM sessions WHERE uid = ?').bind(id));
    }
    if (stmts.length) await c.db.batch(stmts);
    return { ok: true, temp };
  });

  /* 소식 받기에 동의한 회원 목록 (메일 도구로 옮길 때) — 대표 관리자만 */
  route('GET', '/api/admin/users/export', async (c) => {
    await c.needAdmin('admin');
    const rows = (await c.db.prepare(`SELECT email, nick, region, created_at FROM users WHERE status = 'active' AND marketing = 1 ORDER BY id`).all()).results || [];
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const body = '\ufeff이메일,닉네임,지역,가입일\n' + rows.map((r) => [r.email, r.nick, r.region, String(r.created_at || '').slice(0, 10)].map(esc).join(',')).join('\n');
    return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="ssople-marketing-${todayKST()}.csv"`, 'cache-control': 'no-store' } });
  });

  /* 전체 알림 — 사이트 알림(종 모양)으로 한 번에 보낸다. 문장 하나로 넣어 D1 요청 수를 아낀다 */
  route('POST', '/api/admin/broadcast', async (c) => {
    await c.needAdmin('admin');
    const b = await c.body();
    const text = str(b.text, { max: 200, min: 4, required: true, name: '알림 내용' });
    const link = str(b.link, { max: 200 });
    if (link && !link.startsWith('/') && !/^https:\/\//.test(link)) throw new HttpError(400, '링크는 / 또는 https:// 로 시작해야 해요.');
    const target = b.target === 'marketing' ? 'marketing' : 'all';
    await c.limit('bc', 5, 3600, '전체 알림은 한 시간에 5번까지 보낼 수 있어요.');
    const r = await c.db.prepare(
      `INSERT INTO notis (uid, kind, text, link, created_at) SELECT id, 'system', ?, ?, ? FROM users WHERE status = 'active'${target === 'marketing' ? ' AND marketing = 1' : ''}`,
    ).bind(text, link || null, nowIso()).run();
    return { ok: true, sent: r.meta?.changes ?? null };
  });

  /* ---------------- 방문 인증 ---------------- */
  route('GET', '/api/admin/visits', async (c) => {
    await c.needAdmin();
    const st = ['pending', 'ok', 'rejected'].includes(c.q.get('status')) ? c.q.get('status') : 'pending';
    const rows = (await c.db.prepare(
      `SELECT v.*, u.nick, u.email FROM visits v LEFT JOIN users u ON u.id = v.uid WHERE v.status = ? ORDER BY v.id DESC LIMIT 200`,
    ).bind(st).all()).results || [];
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    return { items: rows.map((r) => ({ ...r, spaceName: nm[r.code] || r.code, ref: undefined })) };
  });
  route('POST', '/api/admin/visits/:id', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const v = await c.db.prepare('SELECT * FROM visits WHERE id = ?').bind(id).first();
    if (!v) throw new HttpError(404, '인증 요청을 찾을 수 없어요.');
    const b = await c.body();
    const ok = b.action === 'approve';
    const at = nowIso();
    const nm = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    const stmts = [
      c.db.prepare(`UPDATE visits SET status = ?, decided_at = ?, note = COALESCE(?, note) WHERE id = ?`).bind(ok ? 'ok' : 'rejected', at, str(b.note, { max: 120 }) || null, id),
      notiStmt(c.db, v.uid, 'club', ok ? `${nm[v.code] || ''} 방문 인증이 완료됐어요.` : `${nm[v.code] || ''} 방문 인증을 확인하지 못했어요. 예약번호를 다시 확인해 주세요.`, '/membership'),
    ];
    if (ok) stmts.push(badgeStmt(c.db, v.uid, 'first_visit'));
    await c.db.batch(stmts);
    if (ok) {
      const t = await tierOf(c.db, v.uid, await getSettings(c.db));
      if (t.n >= 4) await badgeStmt(c.db, v.uid, 'regular').run();
    }
    return { ok: true };
  });

  /* ---------------- 설정 ---------------- */
  route('GET', '/api/admin/settings', async (c) => {
    await c.needAdmin();
    return { settings: await getSettings(c.db), keys: Object.keys(DEFAULTS) };
  });
  route('PUT', '/api/admin/settings', async (c) => {
    await c.needAdmin('admin');
    const b = await c.body();
    const patch = {};
    for (const [k, v] of Object.entries(b || {})) {
      if (!(k in DEFAULTS)) continue;
      let s = typeof v === 'string' ? v : JSON.stringify(v);
      if (s.length > 4000) throw new HttpError(400, `${k} 값이 너무 길어요.`);
      if (/^(link|sns)\./.test(k) || k === 'kakao.url' || k === 'site.notice_link') {
        s = s.trim();
        if (s && !/^https?:\/\//.test(s) && !s.startsWith('/')) throw new HttpError(400, '링크는 https:// 로 시작해야 해요.');
      }
      if (k === 'club.benefits') {
        const j = parseJSON(s, null);
        if (!j || typeof j !== 'object') throw new HttpError(400, '클럽 혜택 형식이 올바르지 않아요.');
      }
      patch[k] = s;
    }
    await saveSettings(c.db, patch);
    return { ok: true };
  });
}
