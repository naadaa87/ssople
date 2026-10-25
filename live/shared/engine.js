// 방 하나의 모든 규칙을 판정하는 엔진.
// 서버(Durable Object)와 체험 모드(브라우저)가 같은 코드를 씁니다.
import { BALANCE, TRUTH, LIAR, DRAWS, QUIZ, OX, PENALTIES, MC, GAME_INFO, REACTIONS, EMOTES } from './content.js';
import { cleanNick, cleanLine, normAnswer } from './filter.js';
import { buildMap, clampPos, oxSide, LIGHTS, THEMES } from './maps.js';
import { cleanLook } from './look.js';
import { cleanPet } from './catalog.js';
import { checkLayout } from './maps.js';
import { ARCADE, ARCADE_IDS } from './arcade-meta.js';

export const ENGINE_VERSION = '1.0.0';
export const GRACE_MS = 90_000;        // 연결이 끊긴 사람을 방에 남겨 두는 시간
export const HOST_GRACE_MS = 30_000;   // 방장이 끊긴 뒤 임시 방장을 정하기까지
export const IDLE_MC_MS = 240_000;     // 대화가 이만큼 없으면 MC가 이야기 주제를 던짐
export const MAX_TV = 3;
export { LOOK_RANGES, DEFAULT_LOOK, cleanLook } from './look.js';
const REPORT_REASONS = ['abuse', 'sexual', 'spam', 'other'];
// OX퀴즈에서 탈락한 사람이 이동하는 관중석 (무대 앞)
const AUDIENCE = [[2.5, 4.5], [3.5, 4.5], [1.5, 4.5], [4.5, 4.5], [2.5, 5.5], [3.5, 5.5], [1.5, 5.5], [4.5, 5.5], [2.5, 6.5], [3.5, 6.5], [1.5, 6.5], [4.5, 6.5]];

export function makeMeta(input = {}, now = Date.now()) {
  const kind = input.kind === 'square' ? 'square' : input.kind === 'home' ? 'home' : 'party';
  const theme = kind === 'square' ? 'square' : (THEMES[input.theme] && input.theme !== 'square' ? input.theme : 'home');
  const owner = cleanNick(input.owner || '', '');
  const meta = {
    code: String(input.code || ''),
    kind,
    name: cleanLine(input.name || '', 20) || (kind === 'square' ? '쏘플 스퀘어' : kind === 'home' ? (owner ? `${owner}네 집` : '우리 집') : '우리들의 파티룸'),
    theme,
    capacity: kind === 'square' ? 40 : clampInt(input.capacity, 2, 12, 8),
    isPublic: kind === 'square' ? true : !!input.isPublic,
    banner: cleanLine(input.banner || '', 24),
    light: LIGHTS[input.light] ? input.light : 'warm',
    locked: false,
    hostDev: kind === 'square' ? null : String(input.hostDev || '').slice(0, 64),
    owner,
    createdAt: now,
  };
  if (kind === 'party') meta.deco = cleanDeco('party', input.deco);
  if (kind === 'home') meta.home = cleanHome(input.home);
  return meta;
}

/** 꾸민 소품 목록 검사 — 규칙에 안 맞으면 비운다 */
export function cleanDeco(kind, items) {
  if (!Array.isArray(items) || !items.length) return [];
  const r = checkLayout(kind, items, null);
  return r.error ? [] : r.items;
}
export function cleanHome(h) {
  const wall = /^w_[a-z]+$/.test(h?.wall || '') ? h.wall : 'w_cream';
  const floor = /^f_[a-z]+$/.test(h?.floor || '') ? h.floor : 'f_oak';
  return { wall, floor, items: cleanDeco('home', h?.items) };
}

function clampInt(v, lo, hi, def) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}
function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

// 기본 콘텐츠 + 운영자가 승인한 콘텐츠
function pool(e, base, key) {
  const x = e.h.extra?.[key];
  return Array.isArray(x) && x.length ? base.concat(x) : base;
}
// 최근에 나온 문제는 되도록 다시 내지 않음
function pickFresh(e, key, list, n, idf) {
  const s = e.s;
  s.used ||= {};
  const used = new Set(s.used[key] || []);
  let picked = shuffle(list.filter((x) => !used.has(idf(x))), e.rand).slice(0, n);
  if (picked.length < n) {
    const ids = new Set(picked.map(idf));
    picked = picked.concat(shuffle(list.filter((x) => !ids.has(idf(x))), e.rand).slice(0, n - picked.length));
    s.used[key] = [];
  }
  s.used[key] = (s.used[key] || []).concat(picked.map(idf)).slice(-300);
  return picked;
}

export class RoomEngine {
  constructor(state, hooks = {}) {
    this.s = state;
    this.h = hooks;
    this.rand = hooks.rand || Math.random;
    this.clock = hooks.now || Date.now;
    this.map = buildMap(state.meta);
    this.rate = new Map();
    this.privSent = new Map();
    this.dirty = false;      // 꼭 저장해야 하는 변화
    this.posDirty = false;   // 위치처럼 조금 늦게 저장해도 되는 변화
    state.used ||= {};
    state.ev ||= {};
    state.ev.lastTalkAt ||= state.createdAt || 0;
    state.ev.idleAt ||= 0;
    state.ev.idleN ||= 0;
  }

  static create(meta, hooks = {}, now = (hooks.now || Date.now)()) {
    const s = {
      v: 1, meta, players: {}, order: [], chat: [], game: null,
      ev: { cake: null, cheersAt: 0, photoAt: 0, mcAt: 0, lastTalkAt: now, idleAt: 0, idleN: 0 },
      bans: [], hostPid: null, hostLostAt: null, seq: 1, gseq: 0, used: {},
      createdAt: now, lastActive: now, closed: false,
    };
    const e = new RoomEngine(s, hooks);
    e.dirty = true;
    return e;
  }

  // ---------- 보내기 ----------
  send(pid, msg) { this.h.send?.(pid, msg); }
  bc(msg, except) { this.h.broadcast?.(msg, except); }
  stat(k, v = 1, extra) { this.h.onStat?.(k, v, extra); }
  pushChat(m) { this.s.chat.push(m); if (this.s.chat.length > 40) this.s.chat.splice(0, this.s.chat.length - 40); this.bc({ t: 'chat', m }); this.dirty = true; }
  sys(text, now = this.clock()) { this.pushChat({ pid: null, nick: '', text, at: now, sys: true }); }
  chatLine(pid, text, now, extra = {}) {
    const p = this.s.players[pid];
    this.pushChat({ pid, nick: p?.nick || '', text, at: now, ...extra });
    this.s.ev.lastTalkAt = now; this.s.ev.idleN = 0;
  }

  // ---------- 조회 ----------
  get g() { return this.s.game; }
  get isSquare() { return this.s.meta.kind === 'square'; }
  player(pid) { return this.s.players[pid]; }
  active() { return this.s.order.map((id) => this.s.players[id]).filter((p) => p && p.on && p.role === 'player'); }
  online() { return this.s.order.map((id) => this.s.players[id]).filter((p) => p && p.on); }
  countActive() { return this.active().length; }
  isHost(pid) { return !this.isSquare && !!pid && pid === this.s.hostPid; }
  nick(pid) { return this.s.players[pid]?.nick || this.g?.players?.find((p) => p.pid === pid)?.nick || '누군가'; }

  pubPlayer(p) {
    return { pid: p.pid, nick: p.nick, look: p.look, pet: p.pet || null, role: p.role, x: p.x, y: p.y, tx: p.tx, ty: p.ty, on: p.on, sit: !!p.sit, muted: (p.muteUntil || 0) > this.clock() };
  }
  pubMeta() {
    const m = this.s.meta;
    const out = { code: m.code, kind: m.kind, name: m.name, theme: m.theme, capacity: m.capacity, isPublic: m.isPublic, banner: m.banner, light: m.light, locked: m.locked, closed: this.s.closed, owner: m.owner || '' };
    if (m.kind === 'party') out.deco = m.deco || [];
    if (m.kind === 'home') out.home = m.home || cleanHome(null);
    return out;
  }
  info() {
    const g = this.g;
    const host = this.s.players[this.s.hostPid];
    const m = this.s.meta;
    return {
      code: m.code, kind: m.kind, name: m.name, theme: m.theme, capacity: m.capacity, isPublic: m.isPublic, banner: m.banner, light: m.light, locked: m.locked, closed: this.s.closed,
      owner: m.owner || '', hostNick: host && host.on ? host.nick : '', count: this.countActive(), game: g ? g.id : null, lastActive: this.s.lastActive, createdAt: this.s.createdAt,
    };
  }

  welcome(pid, now = this.clock()) {
    const g = this.g;
    return {
      t: 'welcome', you: pid, now, v: ENGINE_VERSION,
      room: this.pubMeta(), host: this.s.hostPid,
      players: this.s.order.map((id) => this.s.players[id]).filter((p) => p && p.on).map((p) => this.pubPlayer(p)),
      chat: this.s.chat.slice(-30), game: this.gamePub(now), gpriv: this.gamePriv(pid),
      strokes: g && g.id === 'draw' && g.d.cur ? g.d.cur.strokes : null,
      cake: this.s.ev.cake,
    };
  }

  // ---------- 입장 / 퇴장 ----------
  join(dev, info = {}, now = this.clock()) {
    const s = this.s;
    const role = info.role === 'tv' && !this.isSquare ? 'tv' : 'player';
    dev = String(dev || '').slice(0, 64);
    if (!dev) return { err: 'nodev' };
    if (s.closed) return { err: 'closed' };
    if (s.bans.includes(dev)) return { err: 'banned' };
    let p = s.order.map((id) => s.players[id]).find((q) => q && q.dev === dev && q.role === role);
    if (!p) {
      if (role === 'player') {
        if (this.countActive() >= s.meta.capacity) return { err: 'full' };
        if (s.meta.locked && dev !== s.meta.hostDev) return { err: 'locked' };
      } else if (this.online().filter((q) => q.role === 'tv').length >= MAX_TV) return { err: 'full' };
    }
    const look = cleanLook(info.look);
    const pet = role === 'tv' ? null : cleanPet(info.pet);
    const nick = role === 'tv' ? 'TV' : cleanNick(info.nick);
    if (!p) {
      const pid = 'p' + (s.seq++).toString(36);
      const [x, y] = role === 'tv' ? [0, 0] : this.spawnPoint();
      p = { pid, dev, nick, look, pet, role, x, y, tx: x, ty: y, on: true, joinedAt: now, sessAt: now, leftAt: null, sit: false, muteUntil: 0, rep: [] };
      s.players[pid] = p;
      s.order.push(pid);
    } else {
      if (!p.on) p.sessAt = now;
      p.on = true; p.leftAt = null; p.nick = nick; p.look = look; p.pet = pet;
    }
    this.bc({ t: 'join', p: this.pubPlayer(p) }, p.pid);
    if (role === 'player' && !this.isSquare) {
      if (dev === s.meta.hostDev || !s.hostPid || !s.players[s.hostPid]) {
        if (s.hostPid !== p.pid) { s.hostPid = p.pid; this.bc({ t: 'host', pid: p.pid }, p.pid); }
      }
      if (s.hostPid === p.pid) s.hostLostAt = null;
      const g = this.g;
      if (g && !g.players.some((q) => q.pid === p.pid)) GAMES[g.id].onJoin?.(this, p.pid, now);
    }
    s.lastActive = now;
    this.dirty = true;
    this.stat(role === 'tv' ? 'tv' : 'join', 1, { dev });
    return { pid: p.pid };
  }

  spawnPoint() {
    const taken = new Set(this.online().map((p) => Math.floor(p.x) + ',' + Math.floor(p.y)));
    for (const [x, y] of this.map.spawn) if (!taken.has(x + ',' + y)) return [x + 0.5, y + 0.5];
    const [x, y] = this.map.spawn[Math.floor(this.rand() * this.map.spawn.length)];
    return [x + 0.2 + this.rand() * 0.6, y + 0.2 + this.rand() * 0.6];
  }

  leave(pid, now = this.clock()) {
    const p = this.s.players[pid];
    if (!p || !p.on) return;
    p.on = false; p.leftAt = now; p.sit = false;
    if (p.sessAt && p.role === 'player') this.stat('session', now - p.sessAt);
    this.bc({ t: 'leave', pid });
    if (pid === this.s.hostPid) this.s.hostLostAt = now;
    const g = this.g;
    if (g && g.players.some((q) => q.pid === pid)) GAMES[g.id].onLeave?.(this, pid, now);
    this.dirty = true;
  }

  remove(pid) {
    const s = this.s;
    if (!s.players[pid]) return;
    delete s.players[pid];
    s.order = s.order.filter((id) => id !== pid);
    this.privSent.delete(pid);
    this.rate.delete(pid);
    this.bc({ t: 'gone', pid });
    this.dirty = true;
  }

  // 서버가 다시 깨어났을 때 실제 연결 목록과 맞추기
  reconcile(onlinePids, now = this.clock()) {
    for (const pid of this.s.order.slice()) {
      const p = this.s.players[pid];
      if (p && p.on && !onlinePids.has(pid)) this.leave(pid, now);
    }
  }

  close() {
    this.s.closed = true;
    this.s.game = null;
    this.bc({ t: 'closed' });
    this.dirty = true;
  }

  moveTo(pid, [x, y]) {
    const p = this.s.players[pid];
    if (!p) return;
    p.x = p.tx = x; p.y = p.ty = y; p.sit = false;
    this.bc({ t: 'pos', pid, x, y, tx: x, ty: y, sit: false, force: true });
  }

  // ---------- 타이머 ----------
  nextWake(now = this.clock()) {
    const s = this.s;
    let t = Infinity;
    for (const id of s.order) { const p = s.players[id]; if (p && !p.on && p.leftAt) t = Math.min(t, p.leftAt + GRACE_MS); }
    if (s.hostLostAt && !this.isSquare) t = Math.min(t, s.hostLostAt + HOST_GRACE_MS);
    const g = this.g;
    if (g?.deadline) t = Math.min(t, g.deadline);
    if (g?.id === 'draw' && g.phase === 'draw' && g.d.cur && !g.d.cur.hinted) t = Math.min(t, g.d.cur.hintAt);
    if (this.idleReady()) t = Math.min(t, Math.max(s.ev.lastTalkAt, s.ev.idleAt) + IDLE_MC_MS);
    return Number.isFinite(t) ? Math.max(t, now + 50) : null;
  }

  idleReady() {
    return !this.isSquare && !this.g && !this.s.closed && this.countActive() >= 2 && this.s.ev.idleN < 3;
  }

  tick(now = this.clock()) {
    const s = this.s;
    for (const pid of s.order.slice()) {
      const p = s.players[pid];
      if (p && !p.on && p.leftAt && now - p.leftAt >= GRACE_MS) this.remove(pid);
    }
    if (!this.isSquare && s.hostLostAt && now - s.hostLostAt >= HOST_GRACE_MS) {
      s.hostLostAt = null;
      const host = s.players[s.hostPid];
      if (!host || !host.on) {
        const next = this.active()[0] || null;
        s.hostPid = next ? next.pid : null;
        this.bc({ t: 'host', pid: s.hostPid });
        if (next) this.sys(`${next.nick}님이 임시 방장이 되었어요.`, now);
      }
      this.dirty = true;
    }
    const g = this.g;
    if (g && this.countActive() === 0) {
      // 아무도 없으면 게임을 정리
      s.game = null; this.privSent.clear(); this.dirty = true;
    } else if (g) {
      if (g.id === 'draw' && g.phase === 'draw' && g.d.cur && !g.d.cur.hinted && now >= g.d.cur.hintAt) {
        g.d.cur.hinted = true;
        g.d.cur.hint = Array.from(g.d.cur.word).map((c, i) => (i === 0 ? c : '○')).join('');
        this.pushGame(now);
      }
      if (g.deadline && now >= g.deadline) { g.deadline = null; GAMES[g.id].timeout?.(this, now); this.dirty = true; }
    }
    if (this.idleReady() && now - Math.max(s.ev.lastTalkAt, s.ev.idleAt) >= IDLE_MC_MS) {
      s.ev.idleAt = now; s.ev.idleN += 1;
      const pick = (arr) => arr[Math.floor(this.rand() * arr.length)];
      const text = this.rand() < 0.5 ? pick(MC.idle) : fill(pick(MC.topic), { c: pick(pool(this, TRUTH, 'truth')) });
      this.mcSay(text, now);
    }
  }

  // ---------- 요청 제한 ----------
  allow(pid, kind, max, win, now) {
    let r = this.rate.get(pid);
    if (!r) { r = {}; this.rate.set(pid, r); }
    const arr = (r[kind] ||= []);
    while (arr.length && now - arr[0] > win) arr.shift();
    if (arr.length >= max) return false;
    arr.push(now);
    return true;
  }

  // ---------- 메시지 처리 ----------
  handle(pid, m, now = this.clock()) {
    const s = this.s;
    const p = s.players[pid];
    if (!p || !p.on || !m || typeof m.t !== 'string' || s.closed) return;
    if (p.role === 'tv' && m.t !== 'ping') return;
    if (m.t !== 'ping') s.lastActive = now;
    const host = this.isHost(pid);
    switch (m.t) {
      case 'ping': this.send(pid, { t: 'pong', c: m.c, now }); return;
      case 'hello': {
        if (!this.allow(pid, 'hello', 5, 10_000, now)) return;
        p.nick = cleanNick(m.nick, p.nick);
        p.look = cleanLook(m.look);
        if (m.pet !== undefined) p.pet = cleanPet(m.pet);
        this.bc({ t: 'player', p: this.pubPlayer(p) });
        break;
      }
      case 'pos': {
        if (!this.allow(pid, 'pos', 25, 1000, now)) return;
        const [x, y] = clampPos(this.map, m.x, m.y);
        const [tx, ty] = clampPos(this.map, m.tx ?? x, m.ty ?? y);
        p.x = +x.toFixed(2); p.y = +y.toFixed(2); p.tx = +tx.toFixed(2); p.ty = +ty.toFixed(2);
        if (p.sit && (Math.abs(p.tx - p.x) > 0.05 || Math.abs(p.ty - p.y) > 0.05 || !m.sit)) p.sit = false;
        this.bc({ t: 'pos', pid, x: p.x, y: p.y, tx: p.tx, ty: p.ty, sit: p.sit }, pid);
        this.posDirty = true;
        return;
      }
      case 'chat': {
        if (!this.allow(pid, 'chat', 6, 6000, now)) { this.send(pid, { t: 'notice', text: '메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요.' }); return; }
        if ((p.muteUntil || 0) > now) { this.send(pid, { t: 'notice', text: '신고가 쌓여서 잠시 채팅을 쓸 수 없어요.' }); return; }
        const text = cleanLine(m.text, 120);
        if (!text) return;
        const g = this.g;
        if (g && g.id === 'draw' && g.phase === 'draw' && g.d.cur) {
          const cur = g.d.cur;
          if (normAnswer(text).includes(normAnswer(cur.word))) {
            if (pid !== cur.drawer && this.inGame(pid)) GAMES.draw.correct(this, pid, now);
            else this.send(pid, { t: 'notice', text: pid === cur.drawer ? '그리는 사람은 정답을 채팅에 쓸 수 없어요.' : '정답 단어는 채팅에 쓸 수 없어요.' });
            return;
          }
          if (pid !== cur.drawer && this.inGame(pid)) GAMES.draw.feed(this, pid, text, now);
        }
        this.chatLine(pid, text, now);
        if (g && g.id === 'liar' && g.phase === 'talk') GAMES.liar.spoke(this, pid, now);
        this.stat('chat');
        break;
      }
      case 'emote': {
        if (!EMOTES[m.e] || !this.allow(pid, 'emote', 6, 5000, now)) return;
        if (m.e === 'sit') {
          const seat = this.nearestSeat(p);
          const [x, y] = seat || [p.x, p.y];
          p.x = x; p.y = y; p.tx = x; p.ty = y; p.sit = true;
          this.bc({ t: 'pos', pid, x, y, tx: x, ty: y, sit: true, force: !!seat });
          this.posDirty = true;
          return;
        }
        this.bc({ t: 'emote', pid, e: m.e });
        return;
      }
      case 'react': {
        if (!REACTIONS.includes(m.e) || !this.allow(pid, 'react', 8, 5000, now)) return;
        this.bc({ t: 'react', pid, e: m.e });
        return;
      }
      case 'room.set': {
        if (!host) return;
        const meta = s.meta;
        if (typeof m.name === 'string') meta.name = cleanLine(m.name, 20) || meta.name;
        if (typeof m.banner === 'string') meta.banner = cleanLine(m.banner, 24);
        if (m.theme && THEMES[m.theme] && m.theme !== 'square') meta.theme = m.theme;
        if (m.light && LIGHTS[m.light]) meta.light = m.light;
        if (typeof m.locked === 'boolean') meta.locked = m.locked;
        if (typeof m.isPublic === 'boolean') meta.isPublic = m.isPublic;
        if (m.capacity !== undefined) meta.capacity = clampInt(m.capacity, Math.max(2, this.countActive()), 12, meta.capacity);
        let remap = false;
        if (meta.kind === 'party' && Array.isArray(m.deco)) { const r = checkLayout('party', m.deco, null); if (r.error) { this.send(pid, { t: 'notice', text: r.error }); } else { meta.deco = r.items; remap = true; } }
        if (meta.kind === 'home' && m.home && typeof m.home === 'object') { const r = checkLayout('home', m.home.items || [], null); if (r.error) { this.send(pid, { t: 'notice', text: r.error }); } else { meta.home = { ...cleanHome(m.home), items: r.items }; remap = true; } }
        if (remap) {
          this.map = buildMap(meta);
          // 새 소품 자리에 서 있던 사람은 가까운 빈 칸으로
          for (const q of this.online()) {
            if (q.role !== 'player') continue;
            const [x, y] = clampPos(this.map, q.x, q.y);
            if (Math.abs(x - q.x) > 0.01 || Math.abs(y - q.y) > 0.01) this.moveTo(q.pid, [x, y]);
          }
        }
        this.bc({ t: 'room', room: this.pubMeta() });
        break;
      }
      case 'kick': {
        if (!host || m.pid === pid) return;
        const t = s.players[m.pid];
        if (!t) return;
        this.ban(t, now, `${t.nick}님이 방장에 의해 내보내졌어요.`);
        break;
      }
      case 'host.give': {
        if (!host) return;
        const t = s.players[m.pid];
        if (!t || !t.on || t.role !== 'player' || t.pid === pid) return;
        s.meta.hostDev = t.dev; s.hostPid = t.pid; s.hostLostAt = null;
        this.bc({ t: 'host', pid: t.pid });
        this.sys(`${t.nick}님이 새 방장이 되었어요.`, now);
        break;
      }
      case 'report': {
        const t = s.players[m.pid];
        if (!t || t.pid === pid || t.role !== 'player') return;
        if (!this.allow(pid, 'report', 3, 60_000, now)) { this.send(pid, { t: 'notice', text: '신고는 1분에 3번까지 할 수 있어요.' }); return; }
        const reason = REPORT_REASONS.includes(m.reason) ? m.reason : 'other';
        if (!t.rep.includes(p.dev)) t.rep.push(p.dev);
        this.h.onReport?.({
          code: s.meta.code, room: s.meta.name, at: now, reason, memo: cleanLine(m.memo || '', 100),
          reporter: p.nick, reporterDev: p.dev, target: t.nick, targetDev: t.dev,
          chat: s.chat.slice(-20).map((c) => `${c.sys ? '[알림]' : c.mc ? '[MC]' : c.nick}: ${c.text}`),
        });
        this.stat('report');
        this.send(pid, { t: 'notice', text: '신고가 접수됐어요. 운영자가 확인할게요.' });
        if (t.rep.length >= 5) this.ban(t, now, `신고가 쌓여서 ${t.nick}님이 방에서 나가게 됐어요.`);
        else if (t.rep.length >= 3 && (t.muteUntil || 0) < now) {
          t.muteUntil = now + 10 * 60_000;
          this.sys(`신고가 쌓여서 ${t.nick}님의 채팅이 10분 동안 제한돼요.`, now);
          this.bc({ t: 'player', p: this.pubPlayer(t) });
        }
        break;
      }
      case 'g.start': {
        if (!host || this.isSquare) return;
        this.startGame(pid, m.id, m.opts || {}, now);
        break;
      }
      case 'g.in': {
        const g = this.g;
        if (!g) return;
        if (m.gid !== undefined && m.gid !== g.gid) return;
        if (m.gs !== undefined && m.gs !== g.seq && g.id !== 'roulette') return;
        GAMES[g.id].input?.(this, pid, m, now);
        break;
      }
      case 'g.next': { const g = this.g; if (host && g) GAMES[g.id].next?.(this, now); break; }
      case 'g.more': { const g = this.g; if (host && g) GAMES[g.id].more?.(this, now); break; }
      case 'g.end': {
        const g = this.g;
        if (!host || !g) return;
        if (g.phase === 'end' || g.id === 'roulette') this.closeGame(now); else this.finish(now);
        break;
      }
      case 'g.close': { if (host && this.g) this.closeGame(now); break; }
      case 'g.again': { const g = this.g; if (host && g) this.startGame(pid, g.id, g.opts || {}, now); break; }
      case 'ev.cheers': {
        if (now - s.ev.cheersAt < 8000) return;
        s.ev.cheersAt = now;
        this.bc({ t: 'ev', k: 'cheers', by: pid, text: MC.cheers[Math.floor(this.rand() * MC.cheers.length)] });
        this.stat('cheers');
        return;
      }
      case 'ev.cake': {
        if (!host) return;
        if (m.on === false) s.ev.cake = null;
        else {
          const hero = s.players[m.hero] && s.players[m.hero].role === 'player' ? m.hero : null;
          s.ev.cake = { on: true, hero, lit: true, blown: [], at: now };
        }
        this.bc({ t: 'ev', k: 'cake', cake: s.ev.cake, need: this.cakeNeed(), text: s.ev.cake ? MC.cake[0] : null });
        break;
      }
      case 'ev.blow': {
        const c = s.ev.cake;
        if (!c || !c.lit || c.blown.includes(pid)) return;
        c.blown.push(pid);
        if (c.blown.length >= this.cakeNeed()) {
          c.lit = false;
          this.bc({ t: 'ev', k: 'cakeout', cake: c, text: c.hero ? `${this.nick(c.hero)}님, 생일 축하해요! 🎉` : MC.cakeout[0] });
          this.stat('cake');
        } else this.bc({ t: 'ev', k: 'cake', cake: c, need: this.cakeNeed() });
        break;
      }
      case 'ev.photo': {
        if (this.isSquare) return;
        if (now - s.ev.photoAt < 15_000) { this.send(pid, { t: 'notice', text: '조금 뒤에 다시 찍을 수 있어요.' }); return; }
        s.ev.photoAt = now;
        this.bc({ t: 'ev', k: 'photo', by: pid, at: now + 3500, now, text: MC.photo[0] });
        this.stat('photo');
        return;
      }
      case 'mc.ask': {
        if (!host || now - s.ev.mcAt < 12_000) return;
        s.ev.mcAt = now;
        const g = this.g;
        const ctx = {
          room: s.meta.name, banner: s.meta.banner || null,
          game: g ? GAME_INFO[g.id].name : null, phase: g?.phase || null,
          players: this.active().map((q) => q.nick).slice(0, 12),
          question: g?.d?.q ? (g.d.q.t || (Array.isArray(g.d.q) ? `${g.d.q[0]} vs ${g.d.q[1]}` : null)) : (g?.d?.card || null),
          ranking: g ? this.ranking().slice(0, 3).map((r) => `${r.nick} ${r.pts}`) : [],
          recent: s.chat.filter((c) => !c.sys && !c.mc).slice(-6).map((c) => `${c.nick}: ${c.text}`),
        };
        const fallback = this.fallbackMc(g);
        if (this.h.onMc) this.h.onMc(ctx, fallback); else this.mcSay(fallback, now);
        return;
      }
      default: return;
    }
    this.dirty = true;
  }

  ban(t, now, text) {
    const s = this.s;
    if (!s.bans.includes(t.dev)) s.bans.push(t.dev);
    this.send(t.pid, { t: 'kicked' });
    this.h.onKick?.(t.pid);
    if (t.on) this.leave(t.pid, now);
    this.remove(t.pid);
    if (s.hostPid === t.pid) { s.hostPid = null; s.hostLostAt = null; const next = this.active()[0]; if (next) { s.hostPid = next.pid; this.bc({ t: 'host', pid: next.pid }); } }
    this.sys(text, now);
    this.dirty = true;
  }

  cakeNeed() { return Math.max(1, Math.ceil(this.countActive() * 0.6)); }

  nearestSeat(p) {
    let best = null, bd = 2.6;
    const taken = new Set(this.online().filter((q) => q.sit && q.pid !== p.pid).map((q) => q.x.toFixed(1) + ',' + q.y.toFixed(1)));
    for (const [sx, sy] of this.map.seats || []) {
      if (taken.has(sx.toFixed(1) + ',' + sy.toFixed(1))) continue;
      const d = Math.hypot(sx - p.x, sy - p.y);
      if (d < bd) { bd = d; best = [sx, sy]; }
    }
    return best;
  }

  fallbackMc(g) {
    const pickOne = (arr) => arr[Math.floor(this.rand() * arr.length)];
    if (!g) return pickOne(MC.idle);
    if (g.phase === 'end') { const top = g.result?.rank?.[0] || this.ranking()[0]; return fill(pickOne(MC.end), { n: top?.nick || '모두' }); }
    const names = this.active().map((p) => p.nick);
    return `${pickOne(names) || '여러분'}님, ${pickOne(['오늘 컨디션 최고인데요?', '지금 표정 다 보여요!', '다음 판은 역전 가능!', '분위기 메이커 인정!'])}`;
  }

  mcSay(text, now = this.clock()) {
    const t = cleanLine(text, 120);
    if (!t) return;
    if (this.g) this.g.mc = t;
    this.pushChat({ pid: null, nick: 'MC', text: t, at: now, mc: true });
    this.bc({ t: 'mc', text: t, at: now });
  }

  // ---------- 게임 공통 ----------
  startGame(pid, id, opts, now) {
    const def = GAMES[id];
    if (!def || !GAME_INFO[id]) return;
    if (def.spatial && !this.map.oxO) return;
    const players = this.active();
    if (players.length < GAME_INFO[id].min) {
      this.send(pid, { t: 'notice', text: `${GAME_INFO[id].name}은(는) ${GAME_INFO[id].min}명부터 할 수 있어요.` });
      return;
    }
    this.s.gseq += 1;
    this.s.game = {
      id, gid: this.s.gseq, phase: 'start', round: 0, total: 0, deadline: null, seq: 0,
      players: players.map((p) => ({ pid: p.pid, nick: p.nick })), scores: {}, ans: {}, d: {}, opts: { rounds: opts.rounds }, mc: '', startedAt: now, result: null,
    };
    this.privSent.clear();
    this.s.ev.idleN = 0;
    def.start(this, opts, now);
    this.stat('gameStart', 1, { id });
    this.pushGame(now);
  }

  phase(name, ms, now) {
    const g = this.g;
    g.phase = name; g.deadline = ms ? now + ms : null; g.ans = {}; g.seq += 1; g.phaseAt = now;
  }

  inGame(pid) { return !!this.g?.players.some((p) => p.pid === pid); }
  need() { return this.g.players.filter((p) => this.s.players[p.pid]?.on); }
  allAnswered() { const n = this.need(); return n.length > 0 && n.every((p) => this.g.ans[p.pid] !== undefined); }
  addScore(pid, n) { const g = this.g; g.scores[pid] = (g.scores[pid] || 0) + n; }
  ranking() {
    const g = this.g;
    if (!g) return [];
    return g.players.map((p) => ({ pid: p.pid, nick: this.s.players[p.pid]?.nick || p.nick, pts: g.scores[p.pid] || 0 })).sort((a, b) => b.pts - a.pts);
  }
  setMc(key, vars = {}) {
    const g = this.g;
    let arr = MC;
    for (const k of key.split('.')) arr = arr?.[k];
    if (!Array.isArray(arr) || !arr.length) return;
    g.mc = fill(arr[Math.floor(this.rand() * arr.length)], vars);
  }

  finish(now, mc) {
    const g = this.g;
    if (!g) return;
    const def = GAMES[g.id];
    const rank = def.rank ? def.rank(this, g) : this.ranking();
    // 같은 점수는 같은 등수
    let place = 0; let prev = null;
    rank.forEach((r, i) => { const key = `${r.tag || ''}|${r.pts}`; if (key !== prev) { place = i + 1; prev = key; } r.place = place; });
    g.result = { rank, unit: def.unit || '점', label: def.label || '최종 순위' };
    this.phase('end', 0, now);
    const tops = rank.filter((r) => r.place === 1);
    if (mc) g.mc = mc;
    else if (!rank.length || rank[0].pts === 0) g.mc = '모두 수고했어요! 한 판 더 할까요?';
    else if (tops.length > 1) g.mc = `공동 1등 ${tops.map((r) => r.nick).join(', ')}님! 다들 수고했어요.`;
    else this.setMc('end', { n: rank[0].nick });
    this.stat('gameFinish', 1, { id: g.id });
    this.h.onFinish?.({ room: this.s.meta.name, game: GAME_INFO[g.id].name, ranking: rank.slice(0, 3).map((r) => `${r.place}등 ${r.nick} ${r.pts}${def.unit || '점'}`), players: rank.length });
    this.pushGame(now);
  }

  closeGame(now) {
    this.s.game = null;
    this.privSent.clear();
    this.bc({ t: 'game', g: null, now });
    this.dirty = true;
  }

  gamePub(now = this.clock()) {
    const g = this.g;
    if (!g) return null;
    const def = GAMES[g.id];
    return {
      id: g.id, gid: g.gid, name: GAME_INFO[g.id].name, phase: g.phase, round: g.round, total: g.total,
      deadline: g.deadline, phaseAt: g.phaseAt, now, seq: g.seq, players: g.players, scores: g.scores, mc: g.mc, result: g.result,
      ...(def.pub ? def.pub(this, g) : {}),
    };
  }

  gamePriv(pid) {
    const g = this.g;
    if (!g) return null;
    const def = GAMES[g.id];
    const base = { gid: g.gid, my: g.ans[pid]?.v ?? null };
    return def.priv ? { ...base, ...def.priv(this, g, pid) } : base;
  }

  pushGame(now = this.clock()) {
    const g = this.g;
    if (!g) return;
    this.bc({ t: 'game', g: this.gamePub(now) });
    for (const p of this.online()) {
      const d = this.gamePriv(p.pid);
      const key = JSON.stringify(d);
      if (this.privSent.get(p.pid) !== key) { this.privSent.set(p.pid, key); this.send(p.pid, { t: 'gpriv', d }); }
    }
    this.dirty = true;
  }
}

// ---------- 게임 규칙 ----------
const lateJoin = (e, pid, now) => { e.g.players.push({ pid, nick: e.nick(pid) }); e.pushGame(now); };

export const GAMES = {
  // 미니게임 대결: 모두 같은 미니게임(같은 판)을 동시에 하고 점수를 겨뤄요. 게임은 각자 화면에서 돌아가요.
  arcade: {
    unit: '점', label: '미니게임 대결 점수',
    start(e, o, now) {
      const g = e.g;
      g.d.game = ARCADE[o.game] ? o.game : ARCADE_IDS[Math.floor(e.rand() * ARCADE_IDS.length)];
      g.d.seed = 1 + Math.floor(e.rand() * 2 ** 30);
      g.opts.game = g.d.game;
      g.total = 1; g.round = 1;
      e.phase('ready', 6000, now);
      g.mc = `${ARCADE[g.d.game].name} 대결! 잠시 뒤 다 같이 시작해요.`;
      e.pushGame(now);
    },
    go(e, now) {
      const g = e.g;
      const sec = ARCADE[g.d.game].sec || 60;
      e.phase('play', (sec + 10) * 1000, now);
      g.mc = '시작! 끝나면 점수가 자동으로 올라가요.';
      e.pushGame(now);
    },
    timeout(e, now) { if (e.g.phase === 'ready') this.go(e, now); else if (e.g.phase === 'play') e.finish(now); },
    next(e, now) { if (e.g.phase === 'ready') this.go(e, now); else if (e.g.phase === 'play') e.finish(now); },
    input(e, pid, m, now) {
      const g = e.g;
      if (g.phase !== 'play' || !e.inGame(pid) || g.ans[pid] !== undefined) return;
      const score = Math.floor(Number(m.score));
      if (!Number.isFinite(score) || score < 0) return;
      const v = Math.min(score, ARCADE[g.d.game].max);
      g.ans[pid] = { v };
      g.scores[pid] = v;
      if (e.allAnswered()) e.finish(now); else e.pushGame(now);
    },
    onJoin(e, pid, now) { if (e.g.phase === 'ready') lateJoin(e, pid, now); },
    pub(e, g) { return { game: g.d.game, seed: g.d.seed, done: Object.keys(g.ans) }; },
  },
  balance: {
    unit: '회', label: '청개구리 랭킹 · 소수파였던 횟수',
    start(e, o, now) {
      const g = e.g;
      g.d.qs = pickFresh(e, 'balance', pool(e, BALANCE, 'balance'), clampInt(o.rounds, 3, 20, 10), (q) => q[0] + '|' + q[1]);
      g.total = g.d.qs.length;
      this.ask(e, now);
    },
    ask(e, now) {
      const g = e.g;
      g.round += 1; g.d.q = g.d.qs[g.round - 1]; g.d.counts = null; g.d.picks = null; g.d.minority = null;
      e.phase('answer', 20_000, now);
      e.setMc('balance.answer', { r: g.round });
      e.pushGame(now);
    },
    input(e, pid, m, now) {
      const g = e.g;
      if (g.phase !== 'answer' || !e.inGame(pid) || g.ans[pid] !== undefined || (m.v !== 'a' && m.v !== 'b')) return;
      g.ans[pid] = { v: m.v, t: now };
      if (e.allAnswered()) this.reveal(e, now); else e.pushGame(now);
    },
    reveal(e, now) {
      const g = e.g;
      const picks = {}; let a = 0, b = 0;
      for (const [pid, x] of Object.entries(g.ans)) { picks[pid] = x.v; if (x.v === 'a') a++; else b++; }
      const minority = a > 0 && b > 0 && a !== b ? (a < b ? 'a' : 'b') : null;
      const minors = minority ? Object.keys(picks).filter((pid) => picks[pid] === minority) : [];
      for (const pid of minors) e.addScore(pid, 1);
      e.phase('reveal', 15_000, now);
      g.d.counts = { a, b }; g.d.picks = picks; g.d.minority = minority;
      if (a + b === 0) g.mc = '아무도 고르지 않았어요. 다음 질문으로 갈게요!';
      else if (minority) g.mc = fill(MC.balance.reveal[0], { n: minors.map((pid) => e.nick(pid)).join(', ') });
      else g.mc = a === b ? MC.balance.reveal[1] : MC.balance.reveal[2];
      e.pushGame(now);
    },
    timeout(e, now) { const g = e.g; if (g.phase === 'answer') this.reveal(e, now); else if (g.phase === 'reveal') this.next(e, now); },
    next(e, now) {
      const g = e.g;
      if (g.phase === 'answer') return this.reveal(e, now);
      if (g.phase !== 'reveal') return;
      if (g.round >= g.total) e.finish(now); else this.ask(e, now);
    },
    onJoin: lateJoin,
    onLeave(e, pid, now) { if (e.g.phase === 'answer' && e.allAnswered()) this.reveal(e, now); else e.pushGame(now); },
    pub(e, g) { return { q: g.d.q, answered: Object.keys(g.ans), counts: g.d.counts, picks: g.d.picks, minority: g.d.minority }; },
  },

  liar: {
    unit: '점', label: '라이어게임 점수',
    start(e, o, now) { e.g.total = 0; this.deal(e, now); },
    deal(e, now) {
      const g = e.g;
      const live = e.need();
      if (live.length < 3) return e.finish(now, '라이어게임은 3명 이상일 때 이어갈 수 있어요.');
      const cats = Object.keys(LIAR);
      const cat = cats[Math.floor(e.rand() * cats.length)];
      const words = shuffle(LIAR[cat], e.rand);
      g.round += 1;
      g.d = {
        cat, word: words[0], decoys: words.slice(1, 4), liar: live[Math.floor(e.rand() * live.length)].pid,
        order: shuffle(live.map((p) => p.pid), e.rand), turn: 0, lap: 0, confirmed: [],
        votes: null, top: null, win: null, guess: null, options: null, scored: false,
      };
      e.phase('card', 30_000, now);
      e.setMc('liar.card');
      e.pushGame(now);
    },
    input(e, pid, m, now) {
      const g = e.g; const d = g.d;
      if (!d.order?.includes(pid)) return;
      if (g.phase === 'card' && m.k === 'ok') {
        if (!d.confirmed.includes(pid)) d.confirmed.push(pid);
        if (this.allConfirmed(e)) this.talk(e, now); else e.pushGame(now);
      } else if (g.phase === 'vote' && m.k === 'vote') {
        if (g.ans[pid] !== undefined || m.v === pid || !d.order.includes(m.v)) return;
        g.ans[pid] = { v: m.v, t: now };
        if (this.allVoted(e)) this.tally(e, now); else e.pushGame(now);
      } else if (g.phase === 'guess' && m.k === 'guess' && pid === d.liar) {
        if (!d.options.includes(m.v)) return;
        d.guess = m.v;
        this.result(e, d.guess === d.word ? 'liar' : 'citizen', now);
      }
    },
    live(e) { return e.g.d.order.filter((pid) => e.s.players[pid]?.on); },
    allConfirmed(e) { const d = e.g.d; const l = this.live(e); return l.length > 0 && l.every((pid) => d.confirmed.includes(pid)); },
    allVoted(e) { const g = e.g; const l = this.live(e); return l.length > 0 && l.every((pid) => g.ans[pid] !== undefined); },
    curTurn(e) {
      const d = e.g.d; const n = d.order.length;
      for (let k = 0; k < n; k++) { const pid = d.order[(d.turn + k) % n]; if (e.s.players[pid]?.on) { d.turn += k; return pid; } }
      return null;
    },
    talk(e, now) { e.phase('talk', 180_000, now); e.g.d.turn = 0; e.g.d.lap = 0; e.setMc('liar.talk'); e.pushGame(now); },
    spoke(e, pid, now) {
      const g = e.g; const d = g.d;
      if (this.curTurn(e) !== pid) return;
      d.turn += 1;
      const lap = Math.floor(d.turn / d.order.length);
      if (lap > d.lap) {
        d.lap = lap;
        if (lap === 1 && g.deadline && g.deadline - now > 45_000) { g.deadline = now + 45_000; g.mc = '한 바퀴 돌았어요! 45초 뒤에 투표를 시작해요.'; }
      }
      e.pushGame(now);
    },
    tally(e, now) {
      const g = e.g; const d = g.d;
      const votes = {}; const cnt = {};
      for (const [pid, x] of Object.entries(g.ans)) { votes[pid] = x.v; cnt[x.v] = (cnt[x.v] || 0) + 1; }
      let top = null, max = 0, tie = false;
      for (const [k, n] of Object.entries(cnt)) { if (n > max) { top = k; max = n; tie = false; } else if (n === max) tie = true; }
      d.votes = votes;
      if (!top || tie) { d.top = null; g.mc = `표가 갈렸어요. 라이어 ${e.nick(d.liar)}님의 승리!`; return this.result(e, 'liar', now, true); }
      d.top = top;
      if (top === d.liar) {
        d.options = shuffle([d.word, ...d.decoys], e.rand);
        e.phase('guess', 20_000, now);
        e.setMc('liar.guess');
        return e.pushGame(now);
      }
      g.mc = `${e.nick(top)}님은 라이어가 아니었어요. 라이어 ${e.nick(d.liar)}님의 승리!`;
      this.result(e, 'liar', now, true);
    },
    result(e, win, now, keepMc) {
      const g = e.g; const d = g.d;
      d.win = win;
      if (!d.scored) {
        d.scored = true;
        if (win === 'liar') e.addScore(d.liar, 3);
        else if (win === 'citizen') for (const pid of d.order) if (pid !== d.liar) e.addScore(pid, 1);
      }
      e.phase('result', 0, now);
      if (!keepMc) g.mc = win === 'liar' ? `라이어가 제시어 「${d.word}」를 맞혔어요! 라이어 역전승.` : win === 'citizen' ? `제시어는 「${d.word}」였어요. 시민 승리!` : '이번 판은 무효예요.';
      e.pushGame(now);
    },
    timeout(e, now) {
      const g = e.g;
      if (g.phase === 'card') this.talk(e, now);
      else if (g.phase === 'talk') this.next(e, now);
      else if (g.phase === 'vote') this.tally(e, now);
      else if (g.phase === 'guess') this.result(e, 'citizen', now);
    },
    next(e, now) {
      const g = e.g;
      if (g.phase === 'card') this.talk(e, now);
      else if (g.phase === 'talk') { e.phase('vote', 45_000, now); e.setMc('liar.vote'); e.pushGame(now); }
      else if (g.phase === 'vote') this.tally(e, now);
      else if (g.phase === 'result') this.deal(e, now);
    },
    more(e, now) { const g = e.g; if (g.phase === 'talk' && g.deadline) { g.deadline += 60_000; e.pushGame(now); } },
    onLeave(e, pid, now) {
      const g = e.g;
      if (g.phase === 'end' || g.phase === 'result' || !g.d.order?.includes(pid)) return;
      if (pid === g.d.liar) { g.mc = '라이어가 나가서 이번 판은 무효예요. 다음 판으로 갈게요.'; this.result(e, 'none', now, true); return; }
      if (g.phase === 'card' && this.allConfirmed(e)) this.talk(e, now);
      else if (g.phase === 'vote' && this.allVoted(e)) this.tally(e, now);
      else e.pushGame(now);
    },
    pub(e, g) {
      const d = g.d; const done = g.phase === 'result' || g.phase === 'end';
      return {
        cat: d.cat, order: d.order, confirmed: d.confirmed, voted: g.phase === 'vote' ? Object.keys(g.ans) : [],
        turn: g.phase === 'talk' && d.order ? this.curTurn(e) : null, lap: d.lap || 0,
        votes: done ? d.votes : null, top: d.top, liar: done || g.phase === 'guess' ? d.liar : null,
        word: done ? d.word : null, guess: done ? d.guess : null, win: done ? d.win : null,
      };
    },
    priv(e, g, pid) {
      const d = g.d;
      if (!d.liar || !d.order?.includes(pid)) return { role: null };
      const isLiar = pid === d.liar;
      return { role: isLiar ? 'liar' : 'citizen', word: isLiar ? null : d.word, cat: d.cat, options: g.phase === 'guess' && isLiar ? d.options : null, confirmed: d.confirmed.includes(pid) };
    },
  },

  draw: {
    unit: '점', label: '그림 맞히기 점수',
    start(e, o, now) {
      const g = e.g;
      const order = shuffle(e.need().map((p) => p.pid), e.rand).slice(0, 8);
      g.total = order.length;
      g.d = { order, words: pickFresh(e, 'draw', pool(e, DRAWS, 'draw'), order.length, (w) => w), cur: null };
      this.round(e, now);
    },
    round(e, now) {
      const g = e.g; const d = g.d;
      while (g.round < g.total) {
        g.round += 1;
        const drawer = d.order[g.round - 1];
        if (!e.s.players[drawer]?.on) continue;
        const word = d.words[(g.round - 1) % d.words.length];
        d.cur = { drawer, word, hint: Array.from(word).map(() => '○').join(''), hintAt: now + 40_000, hinted: false, feed: [], winner: null, strokes: [] };
        e.phase('draw', 80_000, now);
        e.setMc('draw.draw', { n: e.nick(drawer) });
        e.bc({ t: 'gclear' });
        return e.pushGame(now);
      }
      e.finish(now);
    },
    input(e, pid, m, now) {
      const g = e.g; const cur = g.d.cur;
      if (!cur || g.phase !== 'draw' || pid !== cur.drawer) return;
      if (m.k === 'stroke') {
        if (!Array.isArray(m.s) || m.s.length > 60 || cur.strokes.length > 2400) return;
        const segs = [];
        for (const s of m.s) {
          if (!Array.isArray(s) || s.length !== 6) continue;
          const [x1, y1, x2, y2, c, w] = s.map((v) => Math.round(Number(v)));
          if (![x1, y1, x2, y2].every((v) => v >= 0 && v <= 1000) || !(c >= 0 && c <= 8) || !(w >= 1 && w <= 4)) continue;
          segs.push([x1, y1, x2, y2, c, w]);
        }
        if (!segs.length) return;
        cur.strokes.push(...segs);
        e.bc({ t: 'gdraw', s: segs }, pid);
        e.dirty = true;
      } else if (m.k === 'clear') { cur.strokes = []; e.bc({ t: 'gclear' }); e.dirty = true; }
    },
    correct(e, pid, now) {
      const g = e.g; const cur = g.d.cur;
      if (!cur || g.phase !== 'draw' || cur.winner) return;
      cur.winner = pid;
      e.addScore(pid, 3); e.addScore(cur.drawer, 2);
      e.sys(`🎨 ${e.nick(pid)}님이 정답 「${cur.word}」을(를) 맞혔어요!`, now);
      this.reveal(e, now);
    },
    feed(e, pid, text, now) {
      const cur = e.g.d.cur;
      cur.feed.push({ pid, nick: e.nick(pid), text: Array.from(text).slice(0, 30).join('') });
      if (cur.feed.length > 6) cur.feed.shift();
      e.pushGame(now);
    },
    reveal(e, now) {
      const g = e.g; const cur = g.d.cur;
      e.phase('reveal', 7_000, now);
      g.mc = cur.winner ? `${e.nick(cur.winner)}님 정답! 「${cur.word}」였어요. 그린 ${e.nick(cur.drawer)}님도 +2점.` : `정답은 「${cur.word}」였어요.`;
      e.pushGame(now);
    },
    timeout(e, now) { const g = e.g; if (g.phase === 'draw') this.reveal(e, now); else if (g.phase === 'reveal') this.round(e, now); },
    next(e, now) { this.timeout(e, now); },
    onLeave(e, pid, now) { const g = e.g; if (g.phase === 'draw' && g.d.cur?.drawer === pid) this.reveal(e, now); },
    pub(e, g) {
      const cur = g.d.cur || {};
      return { drawer: cur.drawer || null, hint: cur.hint || '', feed: cur.feed || [], winner: cur.winner || null, word: g.phase === 'reveal' || g.phase === 'end' ? cur.word : null };
    },
    priv(e, g, pid) { const cur = g.d.cur; return { word: cur && pid === cur.drawer && g.phase === 'draw' ? cur.word : null }; },
  },

  truth: {
    unit: '회', label: '진실카드 · 솔직하게 답한 횟수',
    start(e, o, now) {
      const g = e.g;
      const order = shuffle(e.need().map((p) => p.pid), e.rand);
      g.total = Math.min(order.length * 2, 16);
      g.d = { order, cards: pickFresh(e, 'truth', pool(e, TRUTH, 'truth'), g.total, (c) => c), passes: {}, cur: null, card: null, answer: null };
      this.turn(e, now);
    },
    turn(e, now) {
      const g = e.g; const d = g.d;
      while (g.round < g.total) {
        g.round += 1;
        const cur = d.order[(g.round - 1) % d.order.length];
        if (!e.s.players[cur]?.on) continue;
        d.cur = cur; d.card = d.cards[(g.round - 1) % d.cards.length]; d.answer = null;
        e.phase('turn', 90_000, now);
        e.setMc('truth.turn', { n: e.nick(cur) });
        return e.pushGame(now);
      }
      e.finish(now);
    },
    input(e, pid, m, now) {
      const g = e.g; const d = g.d;
      if (pid !== d.cur) return;
      if (g.phase === 'turn' && m.k === 'answer') {
        const p = e.s.players[pid];
        if ((p?.muteUntil || 0) > now) { e.send(pid, { t: 'notice', text: '신고가 쌓여서 잠시 글을 쓸 수 없어요.' }); return; }
        const text = cleanLine(m.text, 100);
        if (!text) return;
        d.answer = text;
        e.addScore(pid, 1);
        e.chatLine(pid, `🃏 ${text}`, now, { truth: true });
        e.phase('answered', 12_000, now);
        g.mc = `${e.nick(pid)}님의 대답, 다들 어떻게 생각해요?`;
        e.pushGame(now);
      } else if (g.phase === 'turn' && m.k === 'pass') {
        if ((d.passes[pid] || 0) >= 1) { e.send(pid, { t: 'notice', text: '통과권은 한 번만 쓸 수 있어요.' }); return; }
        d.passes[pid] = 1;
        e.sys(`${e.nick(pid)}님이 통과권을 썼어요.`, now);
        this.turn(e, now);
      } else if (g.phase === 'answered' && m.k === 'done') this.turn(e, now);
    },
    timeout(e, now) { if (e.g.phase === 'turn' || e.g.phase === 'answered') this.turn(e, now); },
    next(e, now) { this.timeout(e, now); },
    onLeave(e, pid, now) { if (e.g.d.cur === pid && e.g.phase === 'turn') this.turn(e, now); },
    pub(e, g) { return { cur: g.d.cur, card: g.d.card, passes: g.d.passes, answer: g.d.answer }; },
  },

  roulette: {
    unit: '', label: '',
    start(e, o, now) {
      const g = e.g;
      g.d = { mode: 'penalty', items: PENALTIES.slice(0, 8), spin: null, order: null, teams: null };
      e.phase('idle', 0, now);
      g.mc = '벌칙이 필요할 때 돌리세요. 항목은 방장이 바꿀 수 있어요.';
    },
    input(e, pid, m, now) {
      const g = e.g; const d = g.d;
      if (!e.isHost(pid)) return;
      if (m.k === 'mode' && ['penalty', 'order', 'team'].includes(m.v)) { d.mode = m.v; d.spin = null; d.order = null; d.teams = null; }
      else if (m.k === 'items' && Array.isArray(m.v)) {
        const items = m.v.slice(0, 12).map((x) => cleanLine(x, 14)).filter(Boolean).slice(0, 10);
        if (items.length < 2) return;
        d.items = items; d.spin = null;
      } else if (m.k === 'spin') {
        const live = e.active().map((p) => p.pid);
        if (d.mode === 'penalty') { d.spin = { id: (d.spin?.id || 0) + 1, idx: Math.floor(e.rand() * d.items.length), at: now }; g.mc = '두구두구두구…'; }
        else if (d.mode === 'order') { d.order = shuffle(live, e.rand); g.mc = '순서가 정해졌어요!'; }
        else { const sh = shuffle(live, e.rand); const half = Math.ceil(sh.length / 2); d.teams = [sh.slice(0, half), sh.slice(half)]; g.mc = '팀이 나뉘었어요!'; }
      } else return;
      g.seq += 1;
      e.pushGame(now);
    },
    pub(e, g) { return { mode: g.d.mode, items: g.d.items, spin: g.d.spin, order: g.d.order, teams: g.d.teams, names: Object.fromEntries(e.active().map((p) => [p.pid, p.nick])) }; },
  },

  quiz: {
    unit: '점', label: '퀴즈 배틀 점수',
    start(e, o, now) {
      const g = e.g;
      g.d.qs = pickFresh(e, 'quiz', pool(e, QUIZ, 'quiz'), 10, (q) => q.t);
      g.total = g.d.qs.length;
      this.ask(e, now);
    },
    ask(e, now) {
      const g = e.g;
      g.round += 1; g.d.q = g.d.qs[g.round - 1]; g.d.picks = null; g.d.gains = null; g.d.reveal = false;
      e.phase('answer', 15_000, now);
      e.setMc('quiz.answer', { r: g.round });
      e.pushGame(now);
    },
    input(e, pid, m, now) {
      const g = e.g;
      const v = Number(m.v);
      if (g.phase !== 'answer' || !e.inGame(pid) || g.ans[pid] !== undefined || !Number.isInteger(v) || v < 0 || v > 3) return;
      g.ans[pid] = { v, t: now };
      if (e.allAnswered()) this.reveal(e, now); else e.pushGame(now);
    },
    reveal(e, now) {
      const g = e.g; const q = g.d.q;
      const picks = {}; const gains = {};
      const started = g.phaseAt || now;
      for (const [pid, x] of Object.entries(g.ans)) {
        picks[pid] = x.v;
        if (x.v === q.a) {
          const ratio = Math.min(1, Math.max(0, (x.t - started) / 15_000));
          gains[pid] = 100 + Math.round(50 * (1 - ratio));
          e.addScore(pid, gains[pid]);
        }
      }
      e.phase('reveal', 8_000, now);
      g.d.picks = picks; g.d.gains = gains; g.d.reveal = true;
      const right = Object.keys(gains).map((pid) => e.nick(pid));
      g.mc = right.length ? `정답은 「${q.o[q.a]}」! ${right.join(', ')}님 정답.` : `정답은 「${q.o[q.a]}」. 아무도 못 맞혔어요.`;
      e.pushGame(now);
    },
    timeout(e, now) { const g = e.g; if (g.phase === 'answer') this.reveal(e, now); else if (g.phase === 'reveal') this.next(e, now); },
    next(e, now) {
      const g = e.g;
      if (g.phase === 'answer') return this.reveal(e, now);
      if (g.phase !== 'reveal') return;
      if (g.round >= g.total) e.finish(now); else this.ask(e, now);
    },
    onJoin: lateJoin,
    onLeave(e, pid, now) { if (e.g.phase === 'answer' && e.allAnswered()) this.reveal(e, now); else e.pushGame(now); },
    pub(e, g) { const q = g.d.q || { t: '', o: [] }; return { q: { t: q.t, o: q.o }, answered: Object.keys(g.ans), picks: g.d.picks, gains: g.d.gains, a: g.d.reveal ? q.a : null }; },
  },

  ox: {
    unit: '개', label: 'OX퀴즈 · 맞힌 개수', spatial: true,
    start(e, o, now) {
      const g = e.g;
      g.d.qs = pickFresh(e, 'ox', pool(e, OX, 'ox'), 8, (q) => q.t);
      g.total = g.d.qs.length;
      g.d.res = null; g.d.q = null;
      g.d.alive = e.need().map((p) => p.pid);
      g.d.survival = g.d.alive.length >= 2;
      g.d.out = [];
      e.phase('gather', 10_000, now);
      e.setMc('ox.gather');
    },
    ask(e, now) {
      const g = e.g;
      g.round += 1; g.d.q = g.d.qs[g.round - 1]; g.d.res = null;
      e.phase('answer', 12_000, now);
      e.setMc('ox.answer');
      e.pushGame(now);
    },
    judge(e, now) {
      const g = e.g; const d = g.d; const q = d.q;
      const results = {}; const right = [];
      const alive = d.alive.filter((pid) => e.s.players[pid]?.on);
      for (const p of e.need()) {
        const pl = e.s.players[p.pid];
        const side = oxSide(e.map, pl.x, pl.y);
        results[p.pid] = side;
        // 서바이벌 모드에서는 살아 있는 사람만 점수를 받음 (탈락자는 재미로만 참여)
        if (side === q.a && (!d.survival || alive.includes(p.pid))) { e.addScore(p.pid, 1); right.push(p.pid); }
      }
      const revived = d.survival && alive.length >= 2 && right.length === 0;
      const out = d.survival && right.length > 0 ? alive.filter((pid) => !right.includes(pid)) : [];
      d.alive = alive.filter((pid) => !out.includes(pid));
      d.out = d.out.concat(out);
      d.res = { results, a: q.a, w: q.w, out, revived };
      e.phase('reveal', 7_000, now);
      const total = Object.keys(results).length;
      let tail;
      if (d.survival) tail = revived ? '모두 틀려서 전원 부활!' : out.length ? `${out.map((pid) => e.nick(pid)).join(', ')}님 탈락, 관중석으로!` : '모두 정답!';
      else tail = right.length === 0 ? '아쉽게도 오답!' : right.length === total ? '정답!' : `${right.length}명 정답.`;
      g.mc = `정답은 ${q.a}! ${tail}`;
      out.forEach((pid, i) => e.moveTo(pid, AUDIENCE[i % AUDIENCE.length]));
      e.pushGame(now);
    },
    timeout(e, now) {
      const g = e.g;
      if (g.phase === 'gather') this.ask(e, now);
      else if (g.phase === 'answer') this.judge(e, now);
      else if (g.phase === 'reveal') {
        if (g.round >= g.total || (g.d.survival && g.d.alive.length <= 1)) e.finish(now);
        else this.ask(e, now);
      }
    },
    next(e, now) { this.timeout(e, now); },
    onJoin(e, pid, now) {
      const g = e.g;
      g.players.push({ pid, nick: e.nick(pid) });
      if (g.phase === 'gather') { g.d.alive.push(pid); g.d.survival = g.d.alive.length >= 2; }
      e.pushGame(now);
    },
    rank(e, g) {
      const alive = new Set(g.d.alive);
      return e.ranking().map((r) => ({ ...r, tag: g.d.survival && alive.has(r.pid) ? '생존' : null }))
        .sort((a, b) => (b.tag ? 1 : 0) - (a.tag ? 1 : 0) || b.pts - a.pts);
    },
    pub(e, g) { const q = g.d.q; return { q: q ? { t: q.t } : null, res: g.d.res, alive: g.d.alive, survival: g.d.survival }; },
  },
};
