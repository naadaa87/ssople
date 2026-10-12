// 파티 초대장 — 링크 하나로 초대하고 참석 응답 모으기
import { HttpError, str, int, nowIso, isYmd, slug, sha256hex, randToken, maskPhones, todayKST } from './util.js';
import { notiStmt, badgeStmt } from './db.js';
import { loadSpaces } from './spaces.js';
import { checkText, imgUrl } from './community.js';

export const THEMES = ['confetti', 'night', 'pastel', 'minimal', 'birthday', 'bridal'];
const hhmm = (v) => (v && /^\d{1,2}:\d{2}$/.test(String(v)) ? String(v).padStart(5, '0') : null);

function clean(b, prev = {}) {
  const f = { ...prev };
  f.title = maskPhones(str(b.title ?? prev.title, { max: 40, min: 2, required: true, name: '초대장 제목' }));
  f.host = maskPhones(str(b.host ?? prev.host, { max: 20, name: '보내는 사람' }));
  const d = b.d ?? prev.d;
  f.d = isYmd(d) ? d : null;
  f.t = hhmm(b.t ?? prev.t);
  const code = b.code ?? prev.code;
  f.code = code && /^S-\d{4}$/.test(code) ? code : null;
  f.place = maskPhones(str(b.place ?? prev.place, { max: 60, name: '장소' }));
  f.msg = maskPhones(str(b.msg ?? prev.msg, { max: 600, multiline: true, name: '초대 메시지' }));
  f.theme = THEMES.includes(b.theme) ? b.theme : (prev.theme || 'confetti');
  const cv = b.cover ?? prev.cover;
  f.cover = cv && /^u\/[\w/.-]{4,90}$/.test(cv) ? cv : null;
  f.show_list = (b.show_list ?? prev.show_list ?? 1) ? 1 : 0;
  const dl = b.deadline ?? prev.deadline;
  f.deadline = isYmd(dl) ? dl : null;
  return f;
}

async function load(db, id) {
  if (!/^[A-Za-z0-9]{6,12}$/.test(id || '')) throw new HttpError(404, '초대장을 찾을 수 없어요.');
  const r = await db.prepare(`SELECT i.*, u.nick, u.avatar FROM invites i LEFT JOIN users u ON u.id = i.uid WHERE i.id = ?`).bind(id).first();
  if (!r) throw new HttpError(404, '초대장을 찾을 수 없어요.');
  return r;
}

export function register(route) {
  route('POST', '/api/invites', async (c) => {
    const u = await c.needUser();
    await c.limit('ic:' + u.id, 10, 86400, '초대장은 하루에 10장까지 만들 수 있어요.');
    const b = await c.body();
    const f = clean(b);
    await checkText(c.db, f.title, f.msg, f.place);
    let id = slug(8);
    for (let i = 0; i < 3; i++) {
      const ex = await c.db.prepare('SELECT 1 AS x FROM invites WHERE id = ?').bind(id).first();
      if (!ex) break;
      id = slug(8);
    }
    const at = nowIso();
    await c.db.prepare(
      `INSERT INTO invites (id, uid, title, host, d, t, code, place, msg, theme, cover, show_list, deadline, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, u.id, f.title, f.host || u.nick, f.d, f.t, f.code, f.place, f.msg, f.theme, f.cover, f.show_list, f.deadline, at, at).run();
    return { ok: true, id };
  });

  route('GET', '/api/invites/:id', async (c) => {
    const r = await load(c.db, c.params.id);
    const me = await c.user();
    const owner = !!(me && me.id === r.uid);
    const rs = (await c.db.prepare('SELECT id, name, status, n, msg, th, created_at FROM invite_rsvps WHERE invite_id = ? ORDER BY created_at').bind(r.id).all()).results || [];
    const tok = c.q.get('token');
    const th = tok ? await sha256hex('inv|' + tok) : null;
    const mine = th ? rs.find((x) => x.th === th) : null;
    const counts = { yes: 0, maybe: 0, no: 0, people: 0 };
    for (const x of rs) { counts[x.status] = (counts[x.status] || 0) + 1; if (x.status === 'yes') counts.people += x.n; }
    let space = null;
    if (r.code) {
      const sp = (await loadSpaces(c.db, { all: true })).find((s) => s.code === r.code);
      if (sp) space = { code: sp.code, name: sp.name, addr: sp.addr, area: sp.area, place: sp.place };
    }
    const closed = !!(r.deadline && r.deadline < todayKST());
    return {
      invite: {
        id: r.id, title: r.title, host: r.host || r.nick, d: r.d, t: r.t, code: r.code, space, place: r.place, msg: r.msg, theme: r.theme,
        cover: r.cover ? imgUrl(r.cover) : '', coverKey: r.cover, show_list: !!r.show_list, deadline: r.deadline, closed, created_at: r.created_at,
      },
      owner,
      counts,
      list: owner || r.show_list ? rs.map((x) => ({ id: x.id, name: x.name, status: x.status, n: x.n, msg: owner ? x.msg : undefined, mine: !!(th && x.th === th) })) : [],
      mine: mine ? { name: mine.name, status: mine.status, n: mine.n, msg: mine.msg } : null,
    };
  });

  route('POST', '/api/invites/:id/rsvp', async (c) => {
    const r = await load(c.db, c.params.id);
    if (r.deadline && r.deadline < todayKST()) throw new HttpError(400, '응답 마감일이 지났어요.');
    const b = await c.body();
    const name = maskPhones(str(b.name, { max: 20, required: true, name: '이름' }));
    const status = ['yes', 'maybe', 'no'].includes(b.status) ? b.status : 'yes';
    const n = int(b.n, { min: 1, max: 10, def: 1, name: '인원' });
    const msg = maskPhones(str(b.msg, { max: 120, name: '한마디' }));
    await checkText(c.db, name, msg);
    let token = typeof b.token === 'string' && b.token.length < 80 ? b.token : null;
    const at = nowIso();
    if (token) {
      const th = await sha256hex('inv|' + token);
      const ex = await c.db.prepare('SELECT id FROM invite_rsvps WHERE invite_id = ? AND th = ?').bind(r.id, th).first();
      if (ex) {
        await c.db.prepare('UPDATE invite_rsvps SET name = ?, status = ?, n = ?, msg = ?, updated_at = ? WHERE id = ?').bind(name, status, n, msg || null, at, ex.id).run();
        return { ok: true, token, updated: true };
      }
    }
    await c.limit('ir:' + (await c.ih()), 30, 3600, '응답이 너무 많아요. 잠시 후 다시 해 주세요.');
    const cnt = await c.db.prepare('SELECT COUNT(*) AS n FROM invite_rsvps WHERE invite_id = ?').bind(r.id).first();
    if (cnt.n >= 300) throw new HttpError(400, '이 초대장은 응답을 더 받을 수 없어요.');
    token = randToken(18);
    const stmts = [
      c.db.prepare('INSERT INTO invite_rsvps (invite_id, name, status, n, msg, th, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind(r.id, name, status, n, msg || null, await sha256hex('inv|' + token), at, at),
    ];
    if (status === 'yes') stmts.push(notiStmt(c.db, r.uid, 'invite', `${name}님이 "${r.title}"에 온대요!`, `/i/${r.id}`));
    await c.db.batch(stmts);
    const yes = await c.db.prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM invite_rsvps WHERE invite_id = ? AND status = 'yes'`).bind(r.id).first();
    if ((yes?.n || 0) >= 5) await badgeStmt(c.db, r.uid, 'inviter').run();
    return { ok: true, token };
  });

  route('PATCH', '/api/invites/:id', async (c) => {
    const u = await c.needUser();
    const r = await load(c.db, c.params.id);
    if (r.uid !== u.id) throw new HttpError(403, '초대장을 만든 사람만 고칠 수 있어요.');
    const f = clean(await c.body(), r);
    await checkText(c.db, f.title, f.msg, f.place);
    await c.db.prepare('UPDATE invites SET title=?, host=?, d=?, t=?, code=?, place=?, msg=?, theme=?, cover=?, show_list=?, deadline=?, updated_at=? WHERE id=?')
      .bind(f.title, f.host, f.d, f.t, f.code, f.place, f.msg, f.theme, f.cover, f.show_list, f.deadline, nowIso(), r.id).run();
    return { ok: true };
  });

  route('DELETE', '/api/invites/:id', async (c) => {
    const u = await c.needUser();
    const r = await load(c.db, c.params.id);
    if (r.uid !== u.id && !(await c.adminLevel())) throw new HttpError(403, '초대장을 만든 사람만 지울 수 있어요.');
    await c.db.batch([
      c.db.prepare('DELETE FROM invites WHERE id = ?').bind(r.id),
      c.db.prepare('DELETE FROM invite_rsvps WHERE invite_id = ?').bind(r.id),
    ]);
    return { ok: true };
  });

  route('DELETE', '/api/invites/:id/rsvps/:rid', async (c) => {
    const u = await c.needUser();
    const r = await load(c.db, c.params.id);
    if (r.uid !== u.id) throw new HttpError(403, '초대장을 만든 사람만 지울 수 있어요.');
    await c.db.prepare('DELETE FROM invite_rsvps WHERE id = ? AND invite_id = ?').bind(int(c.params.rid, { min: 1 }), r.id).run();
    return { ok: true };
  });
}
