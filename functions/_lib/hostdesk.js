// 호스트센터 — 예약 장부 · 고객 관리 (구독형: 호스트가 직접 운영하는 공간)
//  · 네이버 예약·스페이스클라우드·전화 등 어디서 받은 예약이든 한곳에 적고, 달력으로 본다
//  · 확정·대기 예약은 손님 화면 날짜 달력에 「마감」으로 자동 표시 (occ 표, src = 'hbook')
//  · 손님(이름·연락처·메모)은 그 지점 호스트와 쏘플 대표 관리자만 본다. 관리자가 볼 때마다 pii_log 에 열람 기록을 남긴다 (2년 보관)
//  · 보관 기간: 이용일로부터 1년이 지나면 예약의 이름·연락처를 지우고, 1년 넘게 오지 않은 손님 기록은 지운다. 예약 기록은 3년 보관
import { HttpError, nowIso, int, str, oneOf, todayKST, isYmd, addDays, dayDiff, weekdayOf } from './util.js';
import { loadSpaces, hostCodes } from './spaces.js';
import { pkgsOf, clearAvailCache } from './avail.js';

export const SRC = {
  naver: '네이버 예약', spacecloud: '스페이스클라우드', yeogi: '여기어때', ourplace: '아워플레이스', partyroom: '다른 예약 사이트',
  phone: '전화', kakao: '카카오톡', insta: '인스타그램', ssople: '쏘플 홈페이지', walkin: '직접·지인', etc: '기타',
};
export const STATUS = { ok: '확정', wait: '대기', done: '이용 완료', cancel: '취소', noshow: '노쇼' };
const ACTIVE = ['ok', 'wait', 'done'];                 // 시간을 차지하는 예약 (겹침 확인 · 마감 표시)
const PAID = { paid: '결제 완료', onsite: '현장 결제', unpaid: '미결제', part: '일부 결제' };
const DEP = { none: '없음', held: '받음', returned: '돌려줌', deducted: '일부 차감' };
const PURPOSE = ['생일', '모임', '회식', '브라이덜 샤워', '촬영', '스터디·회의', '기념일', '기타'];
const TAGS = ['단골', 'VIP', '주의'];
const MAX_LIST = 600;

const absMin = (d, m) => dayDiff('2020-01-01', d) * 1440 + m;
const phoneKey = (p) => { const d = String(p || '').replace(/\D/g, ''); return /\*/.test(p || '') || d.length < 9 ? '' : d; };
function cleanGuestPhone(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^[\d\s+()*.-]{4,20}$/.test(s)) throw new HttpError(400, '연락처는 숫자와 -만 넣어 주세요. 예) 010-1234-5678');
  const d = s.replace(/\D/g, '');
  if (!/\*/.test(s) && /^01\d{8,9}$/.test(d)) return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return s.replace(/\s+/g, '');
}
const hm = (m) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

/* ---------- 권한 — 호스트가 직접 운영하는 지점(구독형)만 ---------- */
async function myHostSpaces(c) {
  const u = await c.needUser();
  const codes = hostCodes(u);
  const all = codes.length ? await loadSpaces(c.db, { all: true }) : [];
  const mine = all.filter((s) => codes.includes(s.code) && s.listing && s.listing.type === 'host' && !s.closed);
  return { u, mine, codes: mine.map((s) => s.code) };
}
async function ownSpace(c, code) {
  const r = await myHostSpaces(c);
  code = String(code || '').toUpperCase();
  const s = r.mine.find((x) => x.code === code);
  if (!s) throw new HttpError(403, '내가 직접 운영하는 공간만 예약을 관리할 수 있어요. 위탁형 지점의 예약은 쏘플이 관리해요.');
  return { ...r, s };
}
function pickCodes(r, q) {
  if (!q) return r.codes;
  const want = String(q).split(',').map((x) => x.trim().toUpperCase());
  return r.codes.filter((x) => want.includes(x));
}

/* ---------- 입력 정리 ---------- */
function cleanBook(b, s, prev = {}) {
  const pick = (k) => (k in b ? b[k] : prev[k]);
  const d = pick('d');
  if (!isYmd(d)) throw new HttpError(400, '이용 날짜를 골라 주세요.');
  if (dayDiff(todayKST(), d) > 400 || dayDiff(d, todayKST()) > 1100) throw new HttpError(400, '이용 날짜는 3년 전부터 1년 뒤까지만 넣을 수 있어요.');
  const sMin = int(pick('s'), { min: 0, max: 1439, name: '시작 시간' });
  const eMin = int(pick('e'), { min: 1, max: 2880, name: '끝 시간' });
  if (sMin == null || eMin == null) throw new HttpError(400, '이용 시간을 골라 주세요.');
  if (eMin <= sMin || eMin - sMin > 1440) throw new HttpError(400, '끝 시간은 시작 시간보다 늦고, 24시간 안이어야 해요. 다음 날 아침까지면 끝 시간에서 「다음 날」을 골라 주세요.');
  const slot = str(pick('slot'), { max: 12 }) || 'custom';
  const pk = pkgsOf(s).find((p) => p.k === slot);
  const amount = pick('amount') === '' || pick('amount') == null ? null : int(String(pick('amount')).replace(/[,원\s]/g, ''), { min: 0, max: 50000000, name: '금액' });
  const deposit = pick('deposit') === '' || pick('deposit') == null ? null : int(String(pick('deposit')).replace(/[,원\s]/g, ''), { min: 0, max: 5000000, name: '보증금' });
  return {
    d, s: sMin, e: eMin, slot, slot_label: str(pick('slot_label'), { max: 30 }) || (pk ? '' : '직접 입력'),
    src: oneOf(pick('src'), Object.keys(SRC), 'etc'),
    ext_no: str(pick('ext_no'), { max: 40, name: '예약 번호' }) || null,
    status: oneOf(pick('status'), Object.keys(STATUS), 'ok'),
    name: str(pick('name'), { max: 30, name: '예약자 이름' }) || null,
    phone: cleanGuestPhone(pick('phone')) || null,
    people: pick('people') === '' || pick('people') == null ? null : int(pick('people'), { min: 1, max: 300, name: '인원' }),
    purpose: str(pick('purpose'), { max: 20, name: '이용 목적' }) || null,
    amount, paid: oneOf(pick('paid'), Object.keys(PAID), amount ? 'paid' : 'unpaid'),
    deposit, dep_st: oneOf(pick('dep_st'), Object.keys(DEP), deposit ? 'held' : 'none'),
    memo: str(pick('memo'), { max: 500, multiline: true, name: '메모' }) || null,
    block: pick('block') === false || pick('block') === 0 || pick('block') === '0' ? 0 : 1,
  };
}
function bookRow(r) {
  return {
    id: r.id, code: r.code, d: r.d, s: r.s, e: r.e, time: `${hm(r.s)}~${r.e > 1440 ? '다음 날 ' : ''}${hm(r.e)}`, slot: r.slot, slotLabel: r.slot_label || '',
    src: r.src, srcLabel: SRC[r.src] || r.src, extNo: r.ext_no || '', status: r.status, statusLabel: STATUS[r.status] || r.status,
    guestId: r.guest_id || null, name: r.name || '', phone: r.phone || '', people: r.people, purpose: r.purpose || '',
    amount: r.amount, paid: r.paid, paidLabel: PAID[r.paid] || '', deposit: r.deposit, depSt: r.dep_st || 'none', depLabel: DEP[r.dep_st] || '',
    memo: r.memo || '', block: !!r.block, at: r.at, updatedAt: r.updated_at || r.at, wiped: !!r.wiped,
  };
}

/* ---------- 손님 찾기·만들기 — 연락처가 같으면 같은 손님 ---------- */
async function linkGuest(db, codes, code, { guestId, name, phone }) {
  if (!name && !phone && !guestId) return null;
  const inList = codes.map(() => '?').join(',');
  if (guestId) {
    const g = await db.prepare(`SELECT * FROM host_guests WHERE id = ? AND code IN (${inList})`).bind(guestId, ...codes).first();
    if (g) {
      const upd = {};
      if (name && !g.name) upd.name = name;
      if (phone && !g.phone) { upd.phone = phone; upd.phone_key = phoneKey(phone); }
      if (Object.keys(upd).length) await db.prepare(`UPDATE host_guests SET ${Object.keys(upd).map((k) => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`).bind(...Object.values(upd), nowIso(), g.id).run();
      return g.id;
    }
  }
  const key = phoneKey(phone);
  if (key) {
    const g = await db.prepare(`SELECT id, name FROM host_guests WHERE phone_key = ? AND code IN (${inList}) ORDER BY id LIMIT 1`).bind(key, ...codes).first();
    if (g) {
      if (name && !g.name) await db.prepare('UPDATE host_guests SET name = ?, updated_at = ? WHERE id = ?').bind(name, nowIso(), g.id).run();
      return g.id;
    }
  }
  if (!name && !key) return null;
  const r = await db.prepare('INSERT INTO host_guests (code, name, phone, phone_key, at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(code, name || null, phone || null, key || null, nowIso(), nowIso()).first();
  return r.id;
}

/* ---------- 손님 화면 달력 — 확정·대기·이용 완료 예약을 마감으로 ---------- */
function occStmts(db, row) {
  const out = [db.prepare(`DELETE FROM occ WHERE src = 'hbook' AND ref = ?`).bind('hb:' + row.id)];
  if (row.block && ['ok', 'wait'].includes(row.status)) {
    out.push(db.prepare(`INSERT INTO occ (code, d, slot, s, e, src, kind, ref, note, created_at) VALUES (?, ?, 'custom', ?, ?, 'hbook', 'block', ?, '호스트 예약', ?)`)
      .bind(row.code, row.d, row.s, row.e, 'hb:' + row.id, nowIso()));
  }
  return out;
}

/** 같은 지점에서 시간이 겹치는 예약 */
async function overlaps(db, code, row, exceptId = 0) {
  const rows = (await db.prepare(`SELECT id, d, s, e, name, src, status FROM host_books WHERE code = ? AND d >= ? AND d <= ? AND status IN ('ok', 'wait', 'done') AND id != ?`)
    .bind(code, addDays(row.d, -1), addDays(row.d, 1), exceptId || 0).all()).results || [];
  const S = absMin(row.d, row.s), E = absMin(row.d, row.e);
  return rows.filter((x) => absMin(x.d, x.s) < E && S < absMin(x.d, x.e)).map((x) => ({ id: x.id, d: x.d, time: `${hm(x.s)}~${hm(x.e)}`, name: x.name || '', src: SRC[x.src] || x.src }));
}

/** CSV 한 칸 */
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export function register(route) {
  /* 대시보드 — 오늘·내일 일정, 이번 달 숫자, 확인할 일 */
  route('GET', '/api/host/desk', async (c) => {
    const r = await myHostSpaces(c);
    const spaces = r.mine.map((s) => ({ code: s.code, name: s.name, pkgs: pkgsOf(s).map((p) => ({ k: p.k, s: p.s, e: p.e, fam: p.fam, p: p.p })), labels: Object.fromEntries((s.pkgs || []).map((p) => [p.k, p.label])), hourly: s.hourly || null, base: s.base, max: s.max }));
    const meta = { sources: SRC, statuses: STATUS, paid: PAID, dep: DEP, purposes: PURPOSE, tags: TAGS };
    if (!r.codes.length) return { spaces, meta, empty: true };
    const codes = pickCodes(r, c.q.get('code'));
    if (!codes.length) return { spaces, meta, empty: true };
    const IN = codes.map(() => '?').join(',');
    const today = todayKST();
    const month = today.slice(0, 7);
    const wk = addDays(today, 6);
    const [soon, monthRows, todo, guests] = await Promise.all([
      c.db.prepare(`SELECT * FROM host_books WHERE code IN (${IN}) AND d >= ? AND d <= ? AND status IN ('ok', 'wait', 'done') ORDER BY d, s LIMIT 120`).bind(...codes, addDays(today, -1), wk).all(),
      c.db.prepare(`SELECT src, status, amount, people, guest_id, d FROM host_books WHERE code IN (${IN}) AND d >= ? AND d <= ?`).bind(...codes, month + '-01', month + '-31').all(),
      c.db.prepare(`SELECT
          SUM(CASE WHEN status IN ('ok', 'done') AND paid IN ('unpaid', 'part') AND d <= ? THEN 1 ELSE 0 END) AS unpaid,
          SUM(CASE WHEN dep_st = 'held' AND d < ? AND status != 'cancel' THEN 1 ELSE 0 END) AS deposit,
          SUM(CASE WHEN status = 'wait' AND d >= ? THEN 1 ELSE 0 END) AS waiting,
          SUM(CASE WHEN status = 'ok' AND d < ? THEN 1 ELSE 0 END) AS pastOk
        FROM host_books WHERE code IN (${IN})`).bind(addDays(today, 7), today, today, today, ...codes).first(),
      c.db.prepare(`SELECT COUNT(*) AS n FROM host_guests WHERE code IN (${IN})`).bind(...codes).first(),
    ]);
    const mrows = monthRows.results || [];
    const live = mrows.filter((x) => x.status !== 'cancel');
    const bySrc = {};
    live.forEach((x) => { bySrc[x.src] = (bySrc[x.src] || 0) + 1; });
    // 다시 온 손님 — 이번 달 손님 중 지금까지 두 번 이상 예약한 사람 (취소·노쇼 제외)
    const gids = [...new Set(live.map((x) => x.guest_id).filter(Boolean))];
    let repeat = 0;
    if (gids.length) {
      const g90 = gids.slice(0, 90);
      const rr = await c.db.prepare(`SELECT COUNT(*) AS n FROM (SELECT guest_id FROM host_books WHERE guest_id IN (${g90.map(() => '?').join(',')}) AND status IN ('ok', 'done') GROUP BY guest_id HAVING COUNT(*) >= 2)`).bind(...g90).first();
      repeat = rr ? rr.n : 0;
    }
    return {
      spaces, meta, today,
      soon: (soon.results || []).map(bookRow),
      month: {
        ym: month,
        count: live.length,
        done: mrows.filter((x) => x.status === 'done').length,
        cancel: mrows.filter((x) => x.status === 'cancel' || x.status === 'noshow').length,
        sales: live.filter((x) => x.status !== 'noshow').reduce((a, x) => a + (x.amount || 0), 0),
        people: live.reduce((a, x) => a + (x.people || 0), 0),
        bySrc: Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, label: SRC[k] || k, n })),
        guests: gids.length, repeat,
      },
      todo: { unpaid: todo?.unpaid || 0, deposit: todo?.deposit || 0, waiting: todo?.waiting || 0, pastOk: todo?.pastOk || 0 },
      guests: guests ? guests.n : 0,
    };
  });

  /* 예약 목록 — 기간·지점·상태·경로·검색 */
  route('GET', '/api/host/books', async (c) => {
    const r = await myHostSpaces(c);
    const codes = pickCodes(r, c.q.get('code'));
    if (!codes.length) return { items: [] };
    const today = todayKST();
    const from = isYmd(c.q.get('from')) ? c.q.get('from') : addDays(today, -31);
    const to = isYmd(c.q.get('to')) ? c.q.get('to') : addDays(today, 62);
    if (dayDiff(from, to) > 400 || dayDiff(from, to) < 0) throw new HttpError(400, '기간은 400일 안으로 골라 주세요.');
    const where = [`code IN (${codes.map(() => '?').join(',')})`, 'd >= ?', 'd <= ?'];
    const binds = [...codes, from, to];
    const st = c.q.get('status');
    if (st && STATUS[st]) { where.push('status = ?'); binds.push(st); } else if (st === 'active') where.push(`status IN ('ok', 'wait', 'done')`);
    const src = c.q.get('src');
    if (src && SRC[src]) { where.push('src = ?'); binds.push(src); }
    const q = str(c.q.get('q'), { max: 30 });
    if (q) {
      const dq = q.replace(/\D/g, '');
      where.push(`(name LIKE ? OR ext_no LIKE ? OR memo LIKE ?${dq.length >= 3 ? ' OR REPLACE(phone, \'-\', \'\') LIKE ?' : ''})`);
      binds.push(`%${q}%`, `%${q}%`, `%${q}%`, ...(dq.length >= 3 ? [`%${dq}%`] : []));
    }
    const rows = (await c.db.prepare(`SELECT * FROM host_books WHERE ${where.join(' AND ')} ORDER BY d, s LIMIT ${MAX_LIST + 1}`).bind(...binds).all()).results || [];
    return { items: rows.slice(0, MAX_LIST).map(bookRow), more: rows.length > MAX_LIST, from, to };
  });

  /* 예약 입력 — 겹치는 예약이 있으면 먼저 알려 주고, 그래도 저장하면 저장 */
  route('POST', '/api/host/books', async (c) => {
    const b = await c.body();
    const { u, s, codes } = await ownSpace(c, b.code);
    await c.limit('hb:' + u.id, 400, 3600, '예약을 너무 많이 넣었어요. 잠시 뒤에 다시 해 주세요.');
    const row = cleanBook(b, s);
    const clash = ACTIVE.includes(row.status) ? await overlaps(c.db, s.code, row) : [];
    if (clash.length && !b.force) throw new HttpError(409, '같은 시간에 이미 예약이 있어요.', { clash });
    const gid = await linkGuest(c.db, codes, s.code, { guestId: int(b.guestId, { min: 1, def: null }), name: row.name, phone: row.phone });
    const at = nowIso();
    const ins = await c.db.prepare(`INSERT INTO host_books (code, d, s, e, slot, slot_label, src, ext_no, status, guest_id, name, phone, people, purpose, amount, paid, deposit, dep_st, memo, block, uid, at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
      .bind(s.code, row.d, row.s, row.e, row.slot, row.slot_label, row.src, row.ext_no, row.status, gid, row.name, row.phone, row.people, row.purpose, row.amount, row.paid, row.deposit, row.dep_st, row.memo, row.block, u.id, at, at).first();
    const stmts = occStmts(c.db, ins);
    if (gid) stmts.push(c.db.prepare('UPDATE host_guests SET last_d = MAX(COALESCE(last_d, \'\'), ?), updated_at = ? WHERE id = ?').bind(row.d, at, gid));
    await c.db.batch(stmts);
    clearAvailCache();
    return { book: bookRow(ins), clash };
  });

  route('PUT', '/api/host/books/:id', async (c) => {
    const b = await c.body();
    const r = await myHostSpaces(c);
    const prev = await c.db.prepare('SELECT * FROM host_books WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!prev || !r.codes.includes(prev.code)) throw new HttpError(404, '예약을 찾을 수 없어요.');
    const s = r.mine.find((x) => x.code === prev.code);
    const row = cleanBook(b, s, prev);
    const clash = ACTIVE.includes(row.status) ? await overlaps(c.db, prev.code, row, prev.id) : [];
    if (clash.length && !b.force) throw new HttpError(409, '같은 시간에 이미 예약이 있어요.', { clash });
    let gid = prev.guest_id;
    if ('name' in b || 'phone' in b || 'guestId' in b) {
      gid = await linkGuest(c.db, r.codes, prev.code, { guestId: int(b.guestId, { min: 1, def: null }) || (b.guestId === null ? null : prev.guest_id), name: row.name, phone: row.phone });
    }
    const at = nowIso();
    const upd = await c.db.prepare(`UPDATE host_books SET d = ?, s = ?, e = ?, slot = ?, slot_label = ?, src = ?, ext_no = ?, status = ?, guest_id = ?, name = ?, phone = ?, people = ?, purpose = ?, amount = ?, paid = ?, deposit = ?, dep_st = ?, memo = ?, block = ?, updated_at = ? WHERE id = ? RETURNING *`)
      .bind(row.d, row.s, row.e, row.slot, row.slot_label, row.src, row.ext_no, row.status, gid, row.name, row.phone, row.people, row.purpose, row.amount, row.paid, row.deposit, row.dep_st, row.memo, row.block, at, prev.id).first();
    const stmts = occStmts(c.db, upd);
    if (gid) stmts.push(c.db.prepare('UPDATE host_guests SET last_d = MAX(COALESCE(last_d, \'\'), ?), updated_at = ? WHERE id = ?').bind(row.d, at, gid));
    await c.db.batch(stmts);
    clearAvailCache();
    return { book: bookRow(upd), clash };
  });

  /* 빠른 상태 바꾸기 — 이용 완료 · 노쇼 · 취소 · 결제 완료 · 보증금 돌려줌 */
  route('POST', '/api/host/books/:id/quick', async (c) => {
    const b = await c.body();
    const r = await myHostSpaces(c);
    const prev = await c.db.prepare('SELECT * FROM host_books WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!prev || !r.codes.includes(prev.code)) throw new HttpError(404, '예약을 찾을 수 없어요.');
    const set = {};
    if (b.status && STATUS[b.status]) set.status = b.status;
    if (b.paid && PAID[b.paid]) set.paid = b.paid;
    if (b.dep_st && DEP[b.dep_st]) set.dep_st = b.dep_st;
    if (!Object.keys(set).length) throw new HttpError(400, '바꿀 내용이 없어요.');
    const upd = await c.db.prepare(`UPDATE host_books SET ${Object.keys(set).map((k) => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ? RETURNING *`).bind(...Object.values(set), nowIso(), prev.id).first();
    await c.db.batch(occStmts(c.db, upd));
    clearAvailCache();
    return { book: bookRow(upd) };
  });

  route('DELETE', '/api/host/books/:id', async (c) => {
    const r = await myHostSpaces(c);
    const prev = await c.db.prepare('SELECT id, code FROM host_books WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!prev || !r.codes.includes(prev.code)) throw new HttpError(404, '예약을 찾을 수 없어요.');
    await c.db.batch([c.db.prepare('DELETE FROM host_books WHERE id = ?').bind(prev.id), c.db.prepare(`DELETE FROM occ WHERE src = 'hbook' AND ref = ?`).bind('hb:' + prev.id)]);
    clearAvailCache();
    return { ok: true };
  });

  /* 여러 건 가져오기 — 엑셀에서 복사한 표나 CSV를 화면에서 칸별로 나눠 보내요 (한 번에 300건) */
  route('POST', '/api/host/books/import', async (c) => {
    const b = await c.body();
    const { u, s, codes } = await ownSpace(c, b.code);
    await c.limit('hbi:' + u.id, 20, 3600, '가져오기를 너무 자주 했어요. 잠시 뒤에 다시 해 주세요.');
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 300) : [];
    if (!rows.length) throw new HttpError(400, '가져올 예약이 없어요.');
    const at = nowIso();
    const ok = [], errors = [];
    let skipped = 0;
    // 1) 칸 정리 (DB 없이)
    const clean = [];
    rows.forEach((x, i) => { try { clean.push({ i, row: cleanBook({ ...x, block: b.block === false ? 0 : 1 }, s) }); } catch (e) { errors.push({ i, error: e.message }); } });
    // 2) 같은 예약 번호가 이미 있으면 건너뛰어요 (같은 파일을 두 번 올려도 겹치지 않게)
    const have = new Set();
    const exts = [...new Set(clean.map((x) => x.row.ext_no).filter(Boolean))];
    for (let i = 0; i < exts.length; i += 80) {
      const part = exts.slice(i, i + 80);
      ((await c.db.prepare(`SELECT ext_no FROM host_books WHERE code = ? AND ext_no IN (${part.map(() => '?').join(',')})`).bind(s.code, ...part).all()).results || []).forEach((x) => have.add(x.ext_no));
    }
    for (const x of clean) {
      if (x.row.ext_no && have.has(x.row.ext_no)) { skipped++; continue; }
      if (x.row.ext_no) have.add(x.row.ext_no);
      ok.push(x.row);
    }
    // 3) 손님 — 연락처가 같으면 같은 손님, 연락처 없이 이름만 있으면 이번에 올린 것끼리만 묶어요
    const IN = codes.map(() => '?').join(',');
    const keys = [...new Set(ok.map((r0) => phoneKey(r0.phone)).filter(Boolean))];
    const gmap = new Map();
    for (let i = 0; i < keys.length; i += 80) {
      const part = keys.slice(i, i + 80);
      ((await c.db.prepare(`SELECT id, phone_key FROM host_guests WHERE code IN (${IN}) AND phone_key IN (${part.map(() => '?').join(',')}) ORDER BY id DESC`).bind(...codes, ...part).all()).results || []).forEach((g) => gmap.set(g.phone_key, g.id));
    }
    const fresh = new Map();
    ok.forEach((r0) => {
      const k = phoneKey(r0.phone) || (r0.name ? 'n:' + r0.name : '');
      if (k && !gmap.has(k) && !fresh.has(k)) fresh.set(k, r0);
    });
    if (fresh.size) {
      const list = [...fresh.entries()];
      const res = await c.db.batch(list.map(([, r0]) => c.db.prepare('INSERT INTO host_guests (code, name, phone, phone_key, at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
        .bind(s.code, r0.name || null, r0.phone || null, phoneKey(r0.phone) || null, at, at)));
      res.forEach((x, j) => { const id = (x.results || [])[0]?.id; if (id) gmap.set(list[j][0], id); });
    }
    ok.forEach((r0) => { const k = phoneKey(r0.phone) || (r0.name ? 'n:' + r0.name : ''); r0.gid = (k && gmap.get(k)) || null; });
    // 4) 예약 넣기 → 손님 화면 마감 → 손님 마지막 이용일
    if (ok.length) {
      const ins = await c.db.batch(ok.map((row) => c.db.prepare(`INSERT INTO host_books (code, d, s, e, slot, slot_label, src, ext_no, status, guest_id, name, phone, people, purpose, amount, paid, deposit, dep_st, memo, block, uid, at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
        .bind(s.code, row.d, row.s, row.e, row.slot, row.slot_label, row.src, row.ext_no, row.status, row.gid, row.name, row.phone, row.people, row.purpose, row.amount, row.paid, row.deposit, row.dep_st, row.memo, row.block, u.id, at, at)));
      const occ = [];
      ins.forEach((res) => { const r0 = (res.results || [])[0]; if (r0) occ.push(...occStmts(c.db, r0)); });
      const gids = [...new Set(ok.map((x) => x.gid).filter(Boolean))];
      gids.forEach((g) => occ.push(c.db.prepare('UPDATE host_guests SET last_d = (SELECT MAX(d) FROM host_books WHERE guest_id = ?), updated_at = ? WHERE id = ?').bind(g, at, g)));
      if (occ.length) await c.db.batch(occ);
    }
    clearAvailCache();
    return { added: ok.length, skipped, errors };
  });

  /* 내보내기 — 엑셀에서 바로 열리는 CSV */
  route('GET', '/api/host/books/export', async (c) => {
    const r = await myHostSpaces(c);
    const codes = pickCodes(r, c.q.get('code'));
    const today = todayKST();
    const from = isYmd(c.q.get('from')) ? c.q.get('from') : addDays(today, -365);
    const to = isYmd(c.q.get('to')) ? c.q.get('to') : addDays(today, 365);
    const rows = codes.length ? (await c.db.prepare(`SELECT * FROM host_books WHERE code IN (${codes.map(() => '?').join(',')}) AND d >= ? AND d <= ? ORDER BY d, s LIMIT 5000`).bind(...codes, from, to).all()).results || [] : [];
    const names = Object.fromEntries(r.mine.map((s) => [s.code, s.name]));
    const head = ['지점', '이용일', '요일', '시작', '끝', '패키지', '상태', '예약 경로', '예약 번호', '예약자', '연락처', '인원', '목적', '금액', '결제', '보증금', '보증금 상태', '메모'];
    const W = ['일', '월', '화', '수', '목', '금', '토'];
    const lines = [head.join(',')].concat(rows.map((x) => [names[x.code] || x.code, x.d, W[weekdayOf(x.d)], hm(x.s), (x.e > 1440 ? '다음 날 ' : '') + hm(x.e), x.slot_label || '', STATUS[x.status] || x.status, SRC[x.src] || x.src, x.ext_no || '', x.name || '', x.phone || '', x.people ?? '', x.purpose || '', x.amount ?? '', PAID[x.paid] || '', x.deposit ?? '', DEP[x.dep_st] || '', x.memo || ''].map(csvCell).join(',')));
    return new Response('﻿' + lines.join('\r\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`쏘플_예약장부_${from}_${to}.csv`)}`, 'cache-control': 'no-store' },
    });
  });

  /* ---------- 고객 ---------- */
  route('GET', '/api/host/guests', async (c) => {
    const r = await myHostSpaces(c);
    const codes = pickCodes(r, c.q.get('code'));
    if (!codes.length) return { items: [] };
    const IN = codes.map(() => '?').join(',');
    const where = [`g.code IN (${IN})`];
    const binds = [...codes];
    const q = str(c.q.get('q'), { max: 30 });
    if (q) {
      const dq = q.replace(/\D/g, '');
      where.push(`(g.name LIKE ? OR g.memo LIKE ?${dq.length >= 3 ? ' OR g.phone_key LIKE ?' : ''})`);
      binds.push(`%${q}%`, `%${q}%`, ...(dq.length >= 3 ? [`%${dq}%`] : []));
    }
    const tag = c.q.get('tag');
    if (tag && TAGS.includes(tag)) { where.push('g.tags LIKE ?'); binds.push(`%${tag}%`); }
    const rows = (await c.db.prepare(`SELECT g.*, COUNT(b.id) AS n,
        SUM(CASE WHEN b.status IN ('ok', 'done') THEN 1 ELSE 0 END) AS visits,
        SUM(CASE WHEN b.status = 'noshow' THEN 1 ELSE 0 END) AS noshow,
        SUM(CASE WHEN b.status IN ('ok', 'done') THEN COALESCE(b.amount, 0) ELSE 0 END) AS total,
        MAX(CASE WHEN b.status IN ('ok', 'done') THEN b.d END) AS lastVisit,
        MIN(CASE WHEN b.status IN ('ok', 'wait') AND b.d >= ? THEN b.d END) AS nextVisit
      FROM host_guests g LEFT JOIN host_books b ON b.guest_id = g.id
      WHERE ${where.join(' AND ')} GROUP BY g.id ORDER BY COALESCE(g.last_d, '') DESC, g.id DESC LIMIT 1000`).bind(todayKST(), ...binds).all()).results || [];
    let items = rows.map((g) => ({ id: g.id, code: g.code, name: g.name || '', phone: g.phone || '', memo: g.memo || '', tags: String(g.tags || '').split(',').filter(Boolean), visits: g.visits || 0, noshow: g.noshow || 0, total: g.total || 0, lastVisit: g.lastVisit || '', nextVisit: g.nextVisit || '', at: g.at }));
    if (c.q.get('repeat') === '1') items = items.filter((x) => x.visits >= 2);
    return { items, tags: TAGS };
  });
  route('GET', '/api/host/guests/find', async (c) => {
    const r = await myHostSpaces(c);
    const q = str(c.q.get('q'), { max: 30 });
    if (!q || !r.codes.length) return { items: [] };
    const dq = q.replace(/\D/g, '');
    const IN = r.codes.map(() => '?').join(',');
    const rows = (await c.db.prepare(`SELECT id, name, phone, tags, memo, last_d FROM host_guests WHERE code IN (${IN}) AND (name LIKE ?${dq.length >= 3 ? ' OR phone_key LIKE ?' : ''}) ORDER BY COALESCE(last_d, '') DESC LIMIT 8`)
      .bind(...r.codes, q + '%', ...(dq.length >= 3 ? [`%${dq}%`] : [])).all()).results || [];
    return { items: rows.map((g) => ({ id: g.id, name: g.name || '', phone: g.phone || '', tags: String(g.tags || '').split(',').filter(Boolean), memo: g.memo || '', lastVisit: g.last_d || '' })) };
  });
  route('GET', '/api/host/guests/:id', async (c) => {
    const r = await myHostSpaces(c);
    const g = await c.db.prepare('SELECT * FROM host_guests WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!g || !r.codes.includes(g.code)) throw new HttpError(404, '손님을 찾을 수 없어요.');
    const books = (await c.db.prepare('SELECT * FROM host_books WHERE guest_id = ? ORDER BY d DESC, s DESC LIMIT 100').bind(g.id).all()).results || [];
    return { guest: { id: g.id, code: g.code, name: g.name || '', phone: g.phone || '', memo: g.memo || '', tags: String(g.tags || '').split(',').filter(Boolean), at: g.at }, books: books.map(bookRow), tags: TAGS };
  });
  route('PUT', '/api/host/guests/:id', async (c) => {
    const b = await c.body();
    const r = await myHostSpaces(c);
    const g = await c.db.prepare('SELECT * FROM host_guests WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!g || !r.codes.includes(g.code)) throw new HttpError(404, '손님을 찾을 수 없어요.');
    const name = 'name' in b ? str(b.name, { max: 30, name: '이름' }) || null : g.name;
    const phone = 'phone' in b ? cleanGuestPhone(b.phone) || null : g.phone;
    if (!name && !phone) throw new HttpError(400, '이름이나 연락처 중 하나는 있어야 해요.');
    const memo = 'memo' in b ? str(b.memo, { max: 500, multiline: true, name: '메모' }) || null : g.memo;
    const tags = 'tags' in b ? (Array.isArray(b.tags) ? b.tags : []).filter((t) => TAGS.includes(t)).join(',') || null : g.tags;
    await c.db.prepare('UPDATE host_guests SET name = ?, phone = ?, phone_key = ?, memo = ?, tags = ?, updated_at = ? WHERE id = ?').bind(name, phone, phoneKey(phone) || null, memo, tags, nowIso(), g.id).run();
    return { ok: true };
  });
  /** 손님 정보 지우기 — 손님이 요청했거나 더는 필요 없을 때. 예약 기록은 남기고 이름·연락처만 지워요 */
  route('DELETE', '/api/host/guests/:id', async (c) => {
    const r = await myHostSpaces(c);
    const g = await c.db.prepare('SELECT id, code FROM host_guests WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!g || !r.codes.includes(g.code)) throw new HttpError(404, '손님을 찾을 수 없어요.');
    await c.db.batch([
      c.db.prepare('UPDATE host_books SET guest_id = NULL, name = NULL, phone = NULL, wiped = 1, updated_at = ? WHERE guest_id = ?').bind(nowIso(), g.id),
      c.db.prepare('DELETE FROM host_guests WHERE id = ?').bind(g.id),
    ]);
    return { ok: true };
  });

  /* ================= 쏘플 관리자 — 호스트 예약 장부·손님 보기 =================
     대표 관리자만 볼 수 있어요. 예약·손님 목록과 손님 상세를 열 때마다 열람 기록(pii_log)을 남겨요.
     손님 문의 대응, 분쟁 확인, 손님의 삭제 요청 처리에 쓰는 화면이라 고치기는 없고 「손님 정보 지우기」만 있어요. */
  async function piiAdmin(c) {
    await c.needAdmin('admin');
    let u = null;
    try { u = await c.rawUser(); } catch { u = null; }
    const member = u && u.role === 'admin';
    return { uid: member ? u.id : null, who: member ? `${u.nick} (회원 #${u.id})` : '관리자 비밀번호 접속' };
  }
  const maskQ = (q) => String(q || '').replace(/\d[\d\s-]{5,}\d/g, (m) => { const d = m.replace(/\D/g, ''); return d.length >= 7 ? '*'.repeat(d.length - 4) + d.slice(-4) : m; });
  const piiLog = (c, a, act, { code = null, target = null, n = null, q = null } = {}) =>
    c.db.prepare('INSERT INTO pii_log (at, uid, who, act, code, target, n, q) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(nowIso(), a.uid, a.who, act, code, target, n, q ? String(q).slice(0, 200) : null).run();
  async function spaceIndex(c) {
    const all = await loadSpaces(c.db, { all: true });
    const by = new Map(all.map((s) => [s.code, s]));
    return { all, by, nameOf: (code) => (by.get(code) || {}).name || code };
  }

  /** 지점별 요약 — 숫자만 (손님 이름·연락처 없음) */
  route('GET', '/api/admin/hostdesk', async (c) => {
    await c.needAdmin('admin');
    const today = todayKST();
    const month = today.slice(0, 7);
    const [m, soon, guests, tot] = await c.db.batch([
      c.db.prepare(`SELECT code, COUNT(*) AS n, SUM(CASE WHEN status != 'noshow' THEN COALESCE(amount, 0) ELSE 0 END) AS sales FROM host_books WHERE d >= ? AND d <= ? AND status != 'cancel' GROUP BY code`).bind(month + '-01', month + '-31'),
      c.db.prepare(`SELECT code, COUNT(*) AS n FROM host_books WHERE d >= ? AND d <= ? AND status IN ('ok', 'wait') GROUP BY code`).bind(today, addDays(today, 6)),
      c.db.prepare('SELECT code, COUNT(*) AS n FROM host_guests GROUP BY code'),
      c.db.prepare('SELECT code, COUNT(*) AS n, MAX(COALESCE(updated_at, at)) AS last FROM host_books GROUP BY code'),
    ]);
    const map = (r) => new Map((r.results || []).map((x) => [x.code, x]));
    const M = map(m), S = map(soon), G = map(guests), T = map(tot);
    const sp = await spaceIndex(c);
    const codes = new Set([...sp.all.filter((s) => s.listing && s.listing.type === 'host').map((s) => s.code), ...T.keys()]);
    const rows = [...codes].map((code) => {
      const s = sp.by.get(code) || {};
      return {
        code, name: s.name || code, hostName: (s.listing && s.listing.hostName) || '', type: (s.listing && s.listing.type) || '', closed: !!s.closed,
        month: (M.get(code) || {}).n || 0, sales: (M.get(code) || {}).sales || 0, soon: (S.get(code) || {}).n || 0,
        guests: (G.get(code) || {}).n || 0, total: (T.get(code) || {}).n || 0, last: (T.get(code) || {}).last || '',
      };
    }).sort((a, b) => (b.last || '').localeCompare(a.last || '') || a.code.localeCompare(b.code));
    return { ym: month, today, spaces: rows, sources: SRC, statuses: STATUS };
  });

  /** 예약 목록 — 검색어가 있으면 모든 기간에서 찾아요 (손님이 쏘플로 문의했을 때 연락처로 찾기) */
  route('GET', '/api/admin/hostdesk/books', async (c) => {
    const a = await piiAdmin(c);
    const today = todayKST();
    const q = str(c.q.get('q'), { max: 30 });
    const where = [];
    const binds = [];
    let from = isYmd(c.q.get('from')) ? c.q.get('from') : today.slice(0, 7) + '-01';
    let to = isYmd(c.q.get('to')) ? c.q.get('to') : addDays(from, 30);
    if (!q) {
      if (dayDiff(from, to) > 400 || dayDiff(from, to) < 0) throw new HttpError(400, '기간은 400일 안으로 골라 주세요.');
      where.push('d >= ?', 'd <= ?'); binds.push(from, to);
    }
    const code = String(c.q.get('code') || '').toUpperCase();
    if (/^S-\d{4}$/.test(code)) { where.push('code = ?'); binds.push(code); }
    const st = c.q.get('status');
    if (st && STATUS[st]) { where.push('status = ?'); binds.push(st); }
    const src = c.q.get('src');
    if (src && SRC[src]) { where.push('src = ?'); binds.push(src); }
    if (q) {
      const dq = q.replace(/\D/g, '');
      where.push(`(name LIKE ? OR ext_no LIKE ? OR memo LIKE ?${dq.length >= 3 ? ` OR REPLACE(phone, '-', '') LIKE ?` : ''})`);
      binds.push(`%${q}%`, `%${q}%`, `%${q}%`, ...(dq.length >= 3 ? [`%${dq}%`] : []));
    }
    const rows = (await c.db.prepare(`SELECT * FROM host_books ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d ${q ? 'DESC' : 'ASC'}, s LIMIT 501`).bind(...binds).all()).results || [];
    const more = rows.length > 500;
    const sp = await spaceIndex(c);
    const items = rows.slice(0, 500).map((r) => ({ ...bookRow(r), spaceName: sp.nameOf(r.code) }));
    await piiLog(c, a, 'books', { code: /^S-\d{4}$/.test(code) ? code : null, n: items.length, q: q ? `검색 「${maskQ(q)}」 · 모든 기간` : `${from} ~ ${to}` });
    return { items, more, from: q ? null : from, to: q ? null : to };
  });

  /** 손님 목록 */
  route('GET', '/api/admin/hostdesk/guests', async (c) => {
    const a = await piiAdmin(c);
    const where = ['1 = 1'];
    const binds = [];
    const code = String(c.q.get('code') || '').toUpperCase();
    if (/^S-\d{4}$/.test(code)) { where.push('g.code = ?'); binds.push(code); }
    const q = str(c.q.get('q'), { max: 30 });
    if (q) {
      const dq = q.replace(/\D/g, '');
      where.push(`(g.name LIKE ? OR g.memo LIKE ?${dq.length >= 3 ? ' OR g.phone_key LIKE ?' : ''})`);
      binds.push(`%${q}%`, `%${q}%`, ...(dq.length >= 3 ? [`%${dq}%`] : []));
    }
    const rows = (await c.db.prepare(`SELECT g.*,
        SUM(CASE WHEN b.status IN ('ok', 'done') THEN 1 ELSE 0 END) AS visits,
        SUM(CASE WHEN b.status = 'noshow' THEN 1 ELSE 0 END) AS noshow,
        SUM(CASE WHEN b.status IN ('ok', 'done') THEN COALESCE(b.amount, 0) ELSE 0 END) AS total,
        MAX(CASE WHEN b.status IN ('ok', 'done') THEN b.d END) AS lastVisit,
        MIN(CASE WHEN b.status IN ('ok', 'wait') AND b.d >= ? THEN b.d END) AS nextVisit
      FROM host_guests g LEFT JOIN host_books b ON b.guest_id = g.id
      WHERE ${where.join(' AND ')} GROUP BY g.id ORDER BY COALESCE(g.last_d, '') DESC, g.id DESC LIMIT 501`).bind(todayKST(), ...binds).all()).results || [];
    const more = rows.length > 500;
    const sp = await spaceIndex(c);
    const items = rows.slice(0, 500).map((g) => ({ id: g.id, code: g.code, spaceName: sp.nameOf(g.code), name: g.name || '', phone: g.phone || '', memo: g.memo || '', tags: String(g.tags || '').split(',').filter(Boolean), visits: g.visits || 0, noshow: g.noshow || 0, total: g.total || 0, lastVisit: g.lastVisit || '', nextVisit: g.nextVisit || '', at: g.at }));
    await piiLog(c, a, 'guests', { code: /^S-\d{4}$/.test(code) ? code : null, n: items.length, q: q ? `검색 「${maskQ(q)}」` : null });
    return { items, more };
  });

  route('GET', '/api/admin/hostdesk/guests/:id', async (c) => {
    const a = await piiAdmin(c);
    const g = await c.db.prepare('SELECT * FROM host_guests WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!g) throw new HttpError(404, '손님을 찾을 수 없어요. 이미 지워졌을 수 있어요.');
    const books = (await c.db.prepare('SELECT * FROM host_books WHERE guest_id = ? ORDER BY d DESC, s DESC LIMIT 100').bind(g.id).all()).results || [];
    const sp = await spaceIndex(c);
    await piiLog(c, a, 'guest', { code: g.code, target: 'g:' + g.id, n: books.length });
    return { guest: { id: g.id, code: g.code, spaceName: sp.nameOf(g.code), name: g.name || '', phone: g.phone || '', memo: g.memo || '', tags: String(g.tags || '').split(',').filter(Boolean), at: g.at, lastD: g.last_d || '' }, books: books.map(bookRow) };
  });

  /** 손님 정보 지우기 — 손님이 쏘플에 직접 삭제를 요청했을 때. 호스트 화면과 같은 방식(예약 기록은 남기고 이름·연락처만) */
  route('DELETE', '/api/admin/hostdesk/guests/:id', async (c) => {
    const a = await piiAdmin(c);
    const g = await c.db.prepare('SELECT id, code FROM host_guests WHERE id = ?').bind(int(c.params.id, { min: 1 })).first();
    if (!g) throw new HttpError(404, '손님을 찾을 수 없어요. 이미 지워졌을 수 있어요.');
    await c.db.batch([
      c.db.prepare('UPDATE host_books SET guest_id = NULL, name = NULL, phone = NULL, wiped = 1, updated_at = ? WHERE guest_id = ?').bind(nowIso(), g.id),
      c.db.prepare('DELETE FROM host_guests WHERE id = ?').bind(g.id),
    ]);
    await piiLog(c, a, 'guest_del', { code: g.code, target: 'g:' + g.id });
    return { ok: true };
  });

  /** 열람 기록 */
  route('GET', '/api/admin/hostdesk/log', async (c) => {
    await c.needAdmin('admin');
    const rows = (await c.db.prepare('SELECT * FROM pii_log ORDER BY id DESC LIMIT 300').all()).results || [];
    const sp = await spaceIndex(c);
    const ACT = { books: '예약 목록', guests: '손님 목록', guest: '손님 상세', guest_del: '손님 정보 지우기' };
    return { items: rows.map((r) => ({ id: r.id, at: r.at, who: r.who || '', act: r.act, actLabel: ACT[r.act] || r.act, code: r.code || '', spaceName: r.code ? sp.nameOf(r.code) : '', target: r.target || '', n: r.n, q: r.q || '' })) };
  });
}
