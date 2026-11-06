// 호스트 등록 요금 — 첫 등록·연장 신청, 입금 확인, 노출 기간 알림
//  · 승인할 때 고른 이용 기간으로 「입금 대기」 내역이 하나 생겨요 (기간 상담은 운영팀이 따로)
//  · 호스트는 내 공간 관리에서 기간을 골라 연장을 신청하고, 운영팀이 입금을 확인하면 노출 끝 날짜가 늘어나요
//  · 하루 한 번 노출 끝 14일 전 · 3일 전 · 끝난 날에 호스트에게 알림 (같은 끝 날짜에 같은 알림은 한 번만)
import { HttpError, nowIso, int, str, oneOf, parseJSON, todayKST } from './util.js';
import { getSettings, notiStmt, notiManyStmt, hostPrices } from './db.js';
import { loadSpaces, saveSpace, hostCodes, untilAfter } from './spaces.js';

export const BILL_PLANS = [1, 3, 6, 12];
const ST = { wait: '입금 대기', paid: '입금 확인', cancel: '취소' };
const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

/** 기간별 월 요금 × 개월 수 */
export function planAmount(st, months) {
  const p = hostPrices(st).find((x) => x.t === Number(months));
  return p ? p.month * Number(months) : null;
}
/** 연장하면 늘어나는 기간 — 아직 기간이 남았으면 끝 날 다음 날부터, 지났으면 오늘부터 */
export function renewRange(until, months, today = todayKST()) {
  const start = until && until >= today ? addDays(until, 1) : today;
  return { start, until: untilAfter(start, Number(months)) };
}
function billRow(r, names) {
  return { id: r.id, code: r.code, spaceName: names ? (names[r.code] || r.code) : undefined, kind: r.kind, plan: r.plan, months: r.months, amount: r.amount, start: r.start, until: r.until, status: r.status, statusLabel: ST[r.status] || r.status, memo: r.memo || '', at: r.at, paidAt: r.paid_at || '', uid: r.uid };
}
async function staff(db) {
  return ((await db.prepare(`SELECT id FROM users WHERE role IN ('admin', 'staff') AND status = 'active' LIMIT 30`).all()).results || []).map((x) => x.id);
}
async function hostUids(db, code) {
  const rows = (await db.prepare(`SELECT id, host_codes FROM users WHERE host_codes LIKE ? AND status = 'active' LIMIT 20`).bind(`%"${code}"%`).all()).results || [];
  return rows.filter((r) => parseJSON(r.host_codes, []).includes(code)).map((r) => r.id);
}

/** 하루 한 번 — 노출 끝 14일 전 · 3일 전 · 끝난 날 알림, 끝난 지점 운영팀 요약 */
export async function hostDaily(db) {
  const today = todayKST();
  // 여러 요청이 동시에 와도 하루 한 번만 — 날짜를 바꾼 요청 하나만 계속한다
  const claim = await db.prepare(`INSERT INTO meta (k, v) VALUES ('host_daily_at', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v WHERE meta.v <> excluded.v`).bind(today).run();
  if (!claim.meta || !claim.meta.changes) return false;
  const all = await loadSpaces(db, { all: true });
  const st = await getSettings(db);
  const marks = new Set(((await db.prepare('SELECT code, until, mark FROM host_marks').all()).results || []).map((r) => `${r.code}|${r.until}|${r.mark}`));
  const stmts = [];
  const ended = [];
  for (const s of all) {
    const l = s.listing || {};
    if (l.type !== 'host' || !l.until || s.closed || l.payWait) continue;
    const left = daysBetween(today, l.until);
    const mark = left < 0 ? 'end' : left <= 3 ? 'd3' : left <= 14 ? 'd14' : '';
    if (!mark || marks.has(`${s.code}|${l.until}|${mark}`)) continue;
    const uids = await hostUids(db, s.code);
    const hide = st['host.expire_hide'] === '1';
    const grace = Number(st['host.expire_grace']) || 0;
    const text = mark === 'end'
      ? `「${s.name}」 노출 기간이 끝났어요 (${l.until}).${hide ? ` ${grace ? grace + '일 뒤 ' : ''}손님 화면에서 내려가요.` : ''} 내 공간 관리에서 연장을 신청해 주세요.`
      : `「${s.name}」 노출 기간이 ${left === 0 ? '오늘' : left + '일 뒤'} 끝나요 (${l.until}). 계속 노출하려면 내 공간 관리에서 연장을 신청해 주세요.`;
    const n = notiManyStmt(db, uids, 'host', text, '/myspace#renew');
    if (n) stmts.push(n);
    stmts.push(db.prepare('INSERT OR IGNORE INTO host_marks (code, until, mark, at) VALUES (?, ?, ?, ?)').bind(s.code, l.until, mark, nowIso()));
    if (mark === 'end') ended.push(s.name);
  }
  if (ended.length) {
    const n = notiManyStmt(db, await staff(db), 'admin', `노출 기간이 끝난 호스트 지점 ${ended.length}곳 — ${ended.slice(0, 3).join(', ')}${ended.length > 3 ? ' 외' : ''}`, '/admin#apps');
    if (n) stmts.push(n);
  }
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40));
  return true;
}

async function ownHostSpace(c, code) {
  const u = await c.needUser();
  code = String(code || '').toUpperCase();
  if (!hostCodes(u).includes(code)) throw new HttpError(403, '내가 관리하는 지점이 아니에요.');
  const s = (await loadSpaces(c.db, { all: true })).find((x) => x.code === code);
  if (!s) throw new HttpError(404, '지점을 찾을 수 없어요.');
  if ((s.listing || {}).type !== 'host') throw new HttpError(400, '호스트 등록 공간만 기간을 연장할 수 있어요. 위탁운영 지점은 운영팀에 문의해 주세요.');
  if (s.closed) throw new HttpError(400, '영업을 마친 지점이에요.');
  return { u, s };
}

export function register(route) {
  /* ---------- 호스트 ---------- */
  route('GET', '/api/host/bills', async (c) => {
    const u = await c.needUser();
    const codes = hostCodes(u);
    const st = await getSettings(c.db);
    const plans = hostPrices(st).map((p) => ({ months: p.t, month: p.month, amount: p.month * p.t, day: p.day }));
    if (!codes.length) return { bills: [], plans, payNote: '' };
    const rows = (await c.db.prepare(`SELECT * FROM host_bills WHERE code IN (${codes.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 60`).bind(...codes).all()).results || [];
    const names = Object.fromEntries((await loadSpaces(c.db, { all: true })).map((s) => [s.code, s.name]));
    return { bills: rows.map((r) => billRow(r, names)), plans, payNote: st['host.pay_note'] || '', liveBeforePay: st['host.live_before_pay'] !== '0', expireHide: st['host.expire_hide'] === '1', grace: Number(st['host.expire_grace']) || 0 };
  });
  route('POST', '/api/host/renew', async (c) => {
    const b = await c.body();
    const { u, s } = await ownHostSpace(c, b.code);
    await c.limit('hr:' + u.id, 10, 3600, '연장 신청을 너무 자주 했어요. 잠시 뒤에 다시 해 주세요.');
    const months = int(b.months, { min: 1, max: 12, name: '이용 기간' });
    if (!BILL_PLANS.includes(months)) throw new HttpError(400, '이용 기간은 1·3·6·12개월 중에서 골라 주세요.');
    const open = await c.db.prepare(`SELECT id FROM host_bills WHERE code = ? AND kind = 'renew' AND status = 'wait' LIMIT 1`).bind(s.code).first();
    if (open) throw new HttpError(400, '이미 입금을 기다리는 연장 신청이 있어요. 기간을 바꾸려면 그 신청을 취소하고 다시 해 주세요.');
    if ((s.listing || {}).payWait) throw new HttpError(400, '첫 등록 요금 입금이 확인된 뒤에 연장할 수 있어요.');
    const st = await getSettings(c.db);
    const { start, until } = renewRange((s.listing || {}).until, months);
    const amount = planAmount(st, months);
    const memo = str(b.memo, { max: 200, name: '메모' }) || null;
    const r = await c.db.prepare(`INSERT INTO host_bills (code, uid, kind, plan, months, amount, start, until, status, memo, at) VALUES (?, ?, 'renew', ?, ?, ?, ?, ?, 'wait', ?, ?) RETURNING *`)
      .bind(s.code, u.id, String(months), months, amount, start, until, memo, nowIso()).first();
    c.wait((async () => {
      const ids = await staff(c.db);
      const n = notiManyStmt(c.db, ids, 'admin', `노출 기간 연장 신청 — 「${s.name}」 ${months}개월 (${start} ~ ${until})`, '/admin#bills');
      if (n) await n.run();
    })().catch(() => {}));
    return { ok: true, bill: billRow(r) };
  });
  route('POST', '/api/host/bills/:id/cancel', async (c) => {
    const u = await c.needUser();
    const r = await c.db.prepare('SELECT * FROM host_bills WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!r || !hostCodes(u).includes(r.code)) throw new HttpError(404, '신청을 찾을 수 없어요.');
    if (r.kind !== 'renew' || r.status !== 'wait') throw new HttpError(400, '입금을 기다리는 연장 신청만 취소할 수 있어요.');
    await c.db.prepare(`UPDATE host_bills SET status = 'cancel', memo = ?, decided_at = ? WHERE id = ?`).bind('호스트가 취소', nowIso(), r.id).run();
    return { ok: true };
  });

  /* ---------- 관리자 ---------- */
  route('GET', '/api/admin/bills', async (c) => {
    await c.needAdmin();
    const status = oneOf(c.q.get('status') || 'wait', ['wait', 'paid', 'cancel', 'all'], 'wait');
    const rows = (await c.db.prepare(`SELECT * FROM host_bills ${status === 'all' ? '' : 'WHERE status = ?'} ORDER BY id DESC LIMIT 200`).bind(...(status === 'all' ? [] : [status])).all()).results || [];
    const all = await loadSpaces(c.db, { all: true });
    const names = Object.fromEntries(all.map((s) => [s.code, s.name]));
    const uids = [...new Set(rows.map((r) => r.uid).filter(Boolean))];
    const nick = uids.length ? Object.fromEntries(((await c.db.prepare(`SELECT id, nick FROM users WHERE id IN (${uids.map(() => '?').join(',')})`).bind(...uids).all()).results || []).map((x) => [x.id, x.nick])) : {};
    const counts = Object.fromEntries(((await c.db.prepare('SELECT status, COUNT(*) AS n FROM host_bills GROUP BY status').all()).results || []).map((x) => [x.status, x.n]));
    // 노출 기간 — 호스트 등록 공간을 끝 날짜 순으로 (끝났거나 30일 안에 끝나는 곳)
    const today = todayKST();
    const ending = all.filter((s) => (s.listing || {}).type === 'host' && s.listing.until && !s.closed && daysBetween(today, s.listing.until) <= 30)
      .map((s) => ({ code: s.code, name: s.name, until: s.listing.until, left: daysBetween(today, s.listing.until), payWait: !!s.listing.payWait }))
      .sort((a, b) => a.until.localeCompare(b.until));
    return { bills: rows.map((r) => ({ ...billRow(r, names), nick: nick[r.uid] || '' })), counts, ending };
  });
  route('POST', '/api/admin/bills/:id/paid', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const r = await c.db.prepare('SELECT * FROM host_bills WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!r) throw new HttpError(404, '내역을 찾을 수 없어요.');
    if (r.status !== 'wait') throw new HttpError(400, '입금 대기 중인 내역만 확인할 수 있어요.');
    const at = nowIso();
    const memo = str(b.memo, { max: 200, name: '메모' }) || r.memo || null;
    const s = (await loadSpaces(c.db, { all: true })).find((x) => x.code === r.code);
    const stmts = [c.db.prepare(`UPDATE host_bills SET status = 'paid', paid_at = ?, decided_at = ?, memo = ? WHERE id = ?`).bind(at, at, memo, r.id)];
    let until = s && s.listing ? s.listing.until : '';
    if (s) {
      const l = { ...(s.listing || {}) };
      if (r.kind === 'new' && l.payWait && r.months) {
        // 입금 확인 뒤에 공개하는 설정이었다면 노출 기간은 입금 확인한 날부터
        const today = todayKST();
        l.until = untilAfter(today, r.months);
        l.since = today;
        stmts.push(c.db.prepare('UPDATE host_bills SET start = ?, until = ? WHERE id = ?').bind(today, l.until, r.id));
      } else if (r.until && (!l.until || r.until > l.until)) l.until = r.until;
      if (r.months) l.plan = String(r.months);
      delete l.payWait;
      until = l.until;
      const { code: _c, visible, sort, updated_at: _u, ...data } = s;
      await saveSpace(c.db, s.code, { ...data, listing: l }, { visible, sort });
    }
    const uids = s ? await hostUids(c.db, s.code) : [];
    const n = notiManyStmt(c.db, uids.length ? uids : [r.uid].filter(Boolean), 'host', `「${s ? s.name : r.code}」 입금을 확인했어요. 노출 기간은 ${until || '-'}까지예요.`, '/myspace');
    if (n) stmts.push(n);
    await c.db.batch(stmts);
    return { ok: true, until };
  });
  route('POST', '/api/admin/bills/:id/cancel', async (c) => {
    await c.needAdmin();
    const b = await c.body();
    const r = await c.db.prepare('SELECT * FROM host_bills WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!r) throw new HttpError(404, '내역을 찾을 수 없어요.');
    if (r.status !== 'wait') throw new HttpError(400, '입금 대기 중인 내역만 취소할 수 있어요.');
    const memo = str(b.memo, { max: 200, name: '취소 사유' }) || '운영팀 취소';
    const s = (await loadSpaces(c.db, { all: true })).find((x) => x.code === r.code);
    const uids = await hostUids(c.db, r.code);
    const stmts = [c.db.prepare(`UPDATE host_bills SET status = 'cancel', memo = ?, decided_at = ? WHERE id = ?`).bind(memo, nowIso(), r.id)];
    const n = notiManyStmt(c.db, uids.length ? uids : [r.uid].filter(Boolean), 'host', `「${s ? s.name : r.code}」 ${r.kind === 'renew' ? '연장 신청' : '등록 요금 안내'}이 취소됐어요 — ${memo}`, '/myspace');
    if (n) stmts.push(n);
    await c.db.batch(stmts);
    return { ok: true };
  });
}
