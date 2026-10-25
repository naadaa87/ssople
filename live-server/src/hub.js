// 서비스 전체에서 하나만 있는 관리 서버.
// 방 목록, 신고, 차단, 이용 지표, 공지, 승인된 콘텐츠를 SQLite에 보관합니다.
import { DurableObject } from 'cloudflare:workers';
import { kstDay } from './util.js';

export const CONTENT_TYPES = ['quiz', 'ox', 'balance', 'truth', 'draw'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, kind TEXT, name TEXT, theme TEXT, is_public INTEGER DEFAULT 0,
    locked INTEGER DEFAULT 0, closed INTEGER DEFAULT 0, count INTEGER DEFAULT 0, capacity INTEGER DEFAULT 8, game TEXT,
    created_at INTEGER, last_active INTEGER, seen_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, code TEXT, room TEXT, reason TEXT, memo TEXT,
    reporter TEXT, reporter_dev TEXT, target TEXT, target_dev TEXT, chat TEXT, status TEXT DEFAULT 'open', action TEXT, handled_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS days (day TEXT, k TEXT, v INTEGER, PRIMARY KEY (day, k))`,
  `CREATE TABLE IF NOT EXISTS devices (dev TEXT PRIMARY KEY, first_day TEXT, last_day TEXT)`,
  `CREATE TABLE IF NOT EXISTS bans (dev TEXT PRIMARY KEY, at INTEGER, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS hits (kind TEXT, key TEXT, at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS hits_idx ON hits (kind, key, at)`,
  `CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, item TEXT, status TEXT, source TEXT, at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS content_idx ON content (status, type)`,
];

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    for (const q of SCHEMA) this.sql.exec(q);
    // 2단계: 집들이 방 주인·지금 방장 이름 (예전 표에는 칸이 없어서 더함)
    for (const col of ['owner TEXT', 'host_nick TEXT']) { try { this.sql.exec(`ALTER TABLE rooms ADD COLUMN ${col}`); } catch { /* 이미 있음 */ } }
  }

  rows(q, ...args) { return this.sql.exec(q, ...args).toArray(); }
  one(q, ...args) { return this.rows(q, ...args)[0] || null; }

  // ---------- 방 ----------
  createRoom(code, info) {
    if (this.one('SELECT code FROM rooms WHERE code = ?', code)) return false;
    const now = Date.now();
    this.sql.exec('INSERT INTO rooms (code, kind, name, theme, is_public, capacity, created_at, last_active, seen_at) VALUES (?,?,?,?,?,?,?,?,?)',
      code, info.kind || 'party', info.name || '', info.theme || 'home', info.isPublic ? 1 : 0, info.capacity || 8, now, now, now);
    this.bump({ rooms: 1 });
    return true;
  }

  updateRoom(code, info) {
    const now = Date.now();
    this.sql.exec(`INSERT INTO rooms (code, kind, name, theme, is_public, locked, closed, count, capacity, game, created_at, last_active, seen_at, owner, host_nick)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(code) DO UPDATE SET kind=excluded.kind, name=excluded.name, theme=excluded.theme, is_public=excluded.is_public,
      locked=excluded.locked, closed=excluded.closed, count=excluded.count, capacity=excluded.capacity, game=excluded.game,
      last_active=excluded.last_active, seen_at=excluded.seen_at, owner=excluded.owner, host_nick=excluded.host_nick`,
      code, info.kind, info.name, info.theme, info.isPublic ? 1 : 0, info.locked ? 1 : 0, info.closed ? 1 : 0, info.count || 0,
      info.capacity || 8, info.game || null, info.createdAt || now, info.lastActive || now, now, info.owner || '', info.hostNick || '');
    return true;
  }

  removeRoom(code) { this.sql.exec('DELETE FROM rooms WHERE code = ?', code); return true; }

  /** 공개 파티룸·집들이 목록 (사람이 있고 자리가 남은 방). 비공개 방은 개수만 */
  listPublic() {
    const cutoff = Date.now() - 6 * 3600_000;
    const rooms = this.rows(`SELECT code, kind, name, theme, count, capacity, game, owner, host_nick AS hostNick, created_at AS createdAt, last_active AS lastActive FROM rooms
      WHERE kind IN ('party', 'home') AND is_public = 1 AND locked = 0 AND closed = 0 AND count > 0 AND count < capacity AND seen_at > ?
      ORDER BY count DESC, last_active DESC LIMIT 30`, cutoff);
    const priv = this.one(`SELECT COUNT(*) AS n, COALESCE(SUM(count), 0) AS people FROM rooms WHERE kind IN ('party', 'home') AND (is_public = 0 OR locked = 1) AND closed = 0 AND count > 0 AND seen_at > ?`, cutoff) || { n: 0, people: 0 };
    const all = this.one(`SELECT COALESCE(SUM(count), 0) AS people FROM rooms WHERE closed = 0 AND count > 0 AND seen_at > ?`, cutoff) || { people: 0 };
    return { rooms, private: priv.n, privatePeople: priv.people, people: all.people };
  }

  liveRooms() {
    const cutoff = Date.now() - 6 * 3600_000;
    return this.rows(`SELECT code, kind, name, theme, is_public, locked, closed, count, capacity, game, created_at, last_active
      FROM rooms WHERE count > 0 AND seen_at > ? ORDER BY count DESC LIMIT 200`, cutoff);
  }

  recentRooms() {
    return this.rows(`SELECT code, kind, name, theme, is_public, locked, closed, count, capacity, game, created_at, last_active
      FROM rooms WHERE kind = 'party' ORDER BY last_active DESC LIMIT 50`);
  }

  // 스퀘어는 여러 개로 나뉠 수 있음. 자리가 있는 곳을 안내
  squarePick() {
    const sq = this.rows(`SELECT code, count, capacity FROM rooms WHERE kind = 'square' ORDER BY code`);
    const byCode = Object.fromEntries(sq.map((r) => [r.code, r]));
    let total = 0;
    for (const r of sq) total += r.count || 0;
    for (let i = 1; i <= 9; i++) {
      const r = byCode['SQ' + i];
      if (!r || (r.count || 0) < (r.capacity || 40) - 4) return { square: 'SQ' + i, squareCount: total };
    }
    return { square: 'SQ1', squareCount: total };
  }

  // ---------- 신고 ----------
  addReport(r) {
    this.sql.exec(`INSERT INTO reports (at, code, room, reason, memo, reporter, reporter_dev, target, target_dev, chat, status)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'open')`,
      r.at || Date.now(), r.code || '', r.room || '', r.reason || 'other', r.memo || '', r.reporter || '', r.reporterDev || '',
      r.target || '', r.targetDev || '', JSON.stringify(r.chat || []).slice(0, 8000));
    // 너무 오래된 처리 완료 신고는 정리 (최근 3000건만 보관)
    this.sql.exec(`DELETE FROM reports WHERE status != 'open' AND id NOT IN (SELECT id FROM reports ORDER BY id DESC LIMIT 3000)`);
    // 처리한 신고는 180일 뒤 지워요 (개인정보처리방침)
    this.sql.exec(`DELETE FROM reports WHERE status != 'open' AND handled_at IS NOT NULL AND handled_at < ?`, Date.now() - 180 * 86400_000);
    return true;
  }

  listReports(status = 'open') {
    const st = status === 'done' ? 'done' : 'open';
    return this.rows(`SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT 200`, st).map((r) => ({ ...r, chat: safeParse(r.chat, []) }));
  }

  getReport(id) { const r = this.one('SELECT * FROM reports WHERE id = ?', id); return r ? { ...r, chat: safeParse(r.chat, []) } : null; }

  setReport(id, status, action) {
    this.sql.exec('UPDATE reports SET status = ?, action = ?, handled_at = ? WHERE id = ?', status, action, Date.now(), id);
    return true;
  }

  // ---------- 차단 ----------
  ban(dev, note) { if (dev) this.sql.exec('INSERT OR REPLACE INTO bans (dev, at, note) VALUES (?,?,?)', dev, Date.now(), String(note || '').slice(0, 200)); return true; }
  unban(dev) { this.sql.exec('DELETE FROM bans WHERE dev = ?', dev); return true; }
  isBanned(dev) { return !!this.one('SELECT dev FROM bans WHERE dev = ?', dev); }
  listBans() { return this.rows('SELECT * FROM bans ORDER BY at DESC LIMIT 500'); }

  // ---------- 지표 ----------
  bump(map, day = kstDay()) {
    for (const [k, v] of Object.entries(map || {})) {
      const n = Math.round(Number(v) || 0);
      if (!n || !/^[a-zA-Z_:]{1,40}$/.test(k)) continue;
      this.sql.exec('INSERT INTO days (day, k, v) VALUES (?,?,?) ON CONFLICT(day, k) DO UPDATE SET v = v + excluded.v', day, k, n);
    }
    return true;
  }

  seen(dev) {
    if (!dev) return false;
    const day = kstDay();
    const row = this.one('SELECT last_day FROM devices WHERE dev = ?', dev);
    if (!row) { this.sql.exec('INSERT INTO devices (dev, first_day, last_day) VALUES (?,?,?)', dev, day, day); this.bump({ uv: 1, newdev: 1 }, day); }
    else if (row.last_day !== day) { this.sql.exec('UPDATE devices SET last_day = ? WHERE dev = ?', day, dev); this.bump({ uv: 1 }, day); }
    return true;
  }

  summary() {
    const now = Date.now();
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(kstDay(now - i * 86400_000));
    const rows = this.rows('SELECT day, k, v FROM days WHERE day >= ? ORDER BY day', days[0]);
    const byDay = Object.fromEntries(days.map((d) => [d, {}]));
    for (const r of rows) if (byDay[r.day]) byDay[r.day][r.k] = r.v;
    const totals = {};
    for (const r of this.rows('SELECT k, SUM(v) AS v FROM days GROUP BY k')) totals[r.k] = r.v;
    const live = this.one(`SELECT COUNT(*) AS rooms, COALESCE(SUM(count), 0) AS people FROM rooms WHERE kind = 'party' AND count > 0 AND seen_at > ?`, now - 6 * 3600_000);
    const sq = this.one(`SELECT COALESCE(SUM(count), 0) AS people FROM rooms WHERE kind = 'square' AND seen_at > ?`, now - 6 * 3600_000);
    return {
      days: days.map((d) => ({ day: d, ...byDay[d] })),
      totals,
      live: { rooms: live?.rooms || 0, people: live?.people || 0, square: sq?.people || 0 },
      openReports: this.one(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`)?.n || 0,
      pendingContent: this.one(`SELECT COUNT(*) AS n FROM content WHERE status = 'pending'`)?.n || 0,
      devices: this.one('SELECT COUNT(*) AS n FROM devices')?.n || 0,
      roomsTotal: this.one(`SELECT COUNT(*) AS n FROM rooms WHERE kind = 'party'`)?.n || 0,
    };
  }

  // ---------- 요청 제한 ----------
  hit(kind, key, limit, windowMs) {
    const now = Date.now();
    const n = this.one('SELECT COUNT(*) AS n FROM hits WHERE kind = ? AND key = ? AND at > ?', kind, key, now - windowMs)?.n || 0;
    if (n >= limit) return false;
    this.sql.exec('INSERT INTO hits (kind, key, at) VALUES (?,?,?)', kind, key, now);
    if (Math.random() < 0.03) this.sql.exec('DELETE FROM hits WHERE at < ?', now - 86400_000);
    return true;
  }
  countHits(kind, key, windowMs) {
    return this.one('SELECT COUNT(*) AS n FROM hits WHERE kind = ? AND key = ? AND at > ?', kind, key, Date.now() - windowMs)?.n || 0;
  }

  // ---------- 공지·행사 ----------
  getSettings() {
    const out = { notice: '', event: null };
    for (const r of this.rows('SELECT k, v FROM kv')) {
      if (r.k === 'notice') out.notice = r.v;
      if (r.k === 'event') out.event = safeParse(r.v, null);
    }
    return out;
  }
  setSettings(s) {
    if (typeof s.notice === 'string') this.sql.exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?,?)', 'notice', s.notice.slice(0, 300));
    if (s.event === null) this.sql.exec('DELETE FROM kv WHERE k = ?', 'event');
    else if (s.event && typeof s.event === 'object') this.sql.exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?,?)', 'event', JSON.stringify(s.event));
    return this.getSettings();
  }
  publicInfo() { return { ...this.getSettings(), ...this.squarePick() }; }

  // ---------- 콘텐츠 승인 ----------
  addContent(type, items, status, source) {
    if (!CONTENT_TYPES.includes(type)) return 0;
    const existing = new Set(this.rows('SELECT item FROM content WHERE type = ? AND status != ?', type, 'rejected').map((r) => r.item));
    let n = 0;
    for (const it of items || []) {
      const s = JSON.stringify(it);
      if (existing.has(s)) continue;
      existing.add(s);
      this.sql.exec('INSERT INTO content (type, item, status, source, at) VALUES (?,?,?,?,?)', type, s, status, source, Date.now());
      n++;
    }
    return n;
  }
  listContent(status = 'pending') {
    return this.rows('SELECT * FROM content WHERE status = ? ORDER BY id DESC LIMIT 300', status).map((r) => ({ ...r, item: safeParse(r.item, null) }));
  }
  getContent(id) { const r = this.one('SELECT * FROM content WHERE id = ?', id); return r ? { ...r, item: safeParse(r.item, null) } : null; }
  setContent(id, status, item) {
    if (status === 'delete') { this.sql.exec('DELETE FROM content WHERE id = ?', id); return true; }
    if (item !== undefined) this.sql.exec('UPDATE content SET status = ?, item = ? WHERE id = ?', status, JSON.stringify(item), id);
    else this.sql.exec('UPDATE content SET status = ? WHERE id = ?', status, id);
    return true;
  }
  contentCounts() {
    const out = {};
    for (const r of this.rows('SELECT type, status, COUNT(*) AS n FROM content GROUP BY type, status')) {
      out[r.type] ||= {};
      out[r.type][r.status] = r.n;
    }
    return out;
  }
  approvedContent() {
    const out = Object.fromEntries(CONTENT_TYPES.map((t) => [t, []]));
    for (const r of this.rows(`SELECT type, item FROM content WHERE status = 'approved' ORDER BY id DESC LIMIT 2000`)) {
      const it = safeParse(r.item, null);
      if (it && out[r.type]) out[r.type].push(it);
    }
    return out;
  }

  // 방 서버가 10분마다 받아 가는 정보
  roomFeed() {
    return { extra: this.approvedContent(), bans: this.rows('SELECT dev FROM bans').map((r) => r.dev) };
  }
}

function safeParse(s, def) { try { return JSON.parse(s); } catch { return def; } }
