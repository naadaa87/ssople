// 방 하나를 맡는 실시간 서버 (Durable Object).
// 방마다 하나씩 따로 떠 있고, 접속한 사람들의 WebSocket과 게임 상태를 쥡니다.
import { DurableObject } from 'cloudflare:workers';
import { RoomEngine, makeMeta } from '../../live/shared/engine.js';
import { mcLine } from './ai.js';
import { SQUARE_CODE_RE, cleanDev } from './util.js';

const SAVE_MS = 2500;            // 중요한 변화는 2.5초 안에 저장
const POS_SAVE_MS = 30_000;      // 위치 변화는 30초 안에 저장
const STAT_MS = 60_000;          // 이용 지표는 1분마다 모아서 보냄
const FEED_MS = 10 * 60_000;     // 승인 콘텐츠·차단 목록은 10분마다 갱신
const KEEP_MS = 30 * 86400_000;  // 30일 동안 아무도 쓰지 않은 방은 정리
const MAX_MSG = 8192;
export const CLOSE = { full: 4001, locked: 4002, banned: 4003, closed: 4004, notfound: 4005, nodev: 4006, replaced: 4009, kicked: 4010, admin: 4011 };

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.engine = null;
    this.code = null;
    this.att = new WeakMap();
    this.hooks = {
      send: (pid, msg) => this.sendTo(pid, msg),
      broadcast: (msg, except) => this.broadcast(msg, except),
      onStat: (k, v, x) => this.addStat(k, v, x),
      onReport: (r) => { this.hub().addReport(r).catch(() => {}); },
      onKick: (pid) => this.closePid(pid, CLOSE.kicked, 'kicked'),
      onMc: (c, fallback) => { this.aiSay('mc', c, fallback); },
      onFinish: (c) => { this.aiSay('finish', c, null); },
      extra: null,
    };
    this.bans = new Set();
    this.feedAt = 0;
    this.stats = {};
    this.statAt = Date.now();
    this.syncKey = '';
    this.syncAt = 0;
    this.saveTimer = null;
    this.saveDue = 0;
    this.alarmAt = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      const s = await ctx.storage.get('state');
      if (s) {
        this.engine = new RoomEngine(s, this.hooks);
        this.code = s.meta.code;
        this.linkStats();
        const online = new Set();
        for (const ws of ctx.getWebSockets()) { const a = this.attOf(ws); if (a?.pid && !a.gone) online.add(a.pid); }
        this.engine.reconcile(online);
      }
      this.alarmAt = await ctx.storage.getAlarm();
    });
  }

  hub() { return this.env.HUB.getByName('hub'); }

  // ---------- 연결 ----------
  attOf(ws) {
    if (this.att.has(ws)) return this.att.get(ws);
    let a = null;
    try { a = ws.deserializeAttachment(); } catch { a = null; }
    this.att.set(ws, a);
    return a;
  }
  setAtt(ws, a) { this.att.set(ws, a); try { ws.serializeAttachment(a); } catch {} }
  sockets(pid) {
    return this.ctx.getWebSockets().filter((ws) => { const a = this.attOf(ws); return a && a.pid && !a.gone && (!pid || a.pid === pid); });
  }
  safeSend(ws, data) { try { ws.send(data); } catch {} }
  sendTo(pid, msg) { const data = JSON.stringify(msg); for (const ws of this.sockets(pid)) this.safeSend(ws, data); }
  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.attOf(ws);
      if (!a || !a.pid || a.gone || a.pid === except) continue;
      this.safeSend(ws, data);
    }
  }
  closePid(pid, code, reason) {
    for (const ws of this.sockets(pid)) {
      this.setAtt(ws, { ...this.attOf(ws), gone: true });
      try { ws.close(code, reason); } catch {}
    }
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket only', { status: 426 });
    const code = url.searchParams.get('code') || '';
    // 들어올 수 없는 경우: 이유를 알려 주고 바로 닫음 (이 연결은 서버에 남기지 않음)
    const deny = (reason) => {
      const [c, s] = Object.values(new WebSocketPair());
      s.accept();
      s.send(JSON.stringify({ t: 'denied', reason }));
      s.close(CLOSE[reason] || 4000, reason);
      return new Response(null, { status: 101, webSocket: c });
    };
    if (!this.engine) {
      if (!SQUARE_CODE_RE.test(code)) return deny('notfound');
      this.engine = RoomEngine.create(makeMeta({ code, kind: 'square', name: '쏘플 스퀘어' }), this.hooks);
      this.code = code;
      this.linkStats();
    }
    const now = Date.now();
    if (now - this.feedAt > FEED_MS) await this.loadFeed(now);
    const dev = cleanDev(url.searchParams.get('dev'));
    if (!dev) return deny('nodev');
    if (this.bans.has(dev)) return deny('banned');
    let look = null;
    try { look = JSON.parse(url.searchParams.get('look') || 'null'); } catch { look = null; }
    let pet = null;
    try { pet = JSON.parse(url.searchParams.get('pet') || 'null'); } catch { pet = null; }
    const r = this.engine.join(dev, { nick: url.searchParams.get('nick'), look, pet, role: url.searchParams.get('role') }, now);
    if (r.err) { this.after(now); return deny(r.err); }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    // 같은 사람이 다른 창에서 들어오면 예전 연결을 정리
    for (const ws of this.sockets(r.pid)) {
      this.setAtt(ws, { ...this.attOf(ws), gone: true });
      this.safeSend(ws, JSON.stringify({ t: 'replaced' }));
      try { ws.close(CLOSE.replaced, 'replaced'); } catch {}
    }
    this.setAtt(server, { pid: r.pid, dev, at: now });
    this.safeSend(server, JSON.stringify(this.engine.welcome(r.pid, now)));
    this.after(now, true);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG || !this.engine) return;
    const a = this.attOf(ws);
    if (!a?.pid || a.gone) return;
    let m;
    try { m = JSON.parse(data); } catch { return; }
    const now = Date.now();
    this.engine.handle(a.pid, m, now);
    this.after(now);
  }

  async webSocketClose(ws, code) {
    this.gone(ws);
    try { ws.close(1000, 'bye'); } catch {}
  }

  async webSocketError(ws) { this.gone(ws); }

  gone(ws) {
    const a = this.attOf(ws);
    if (!a?.pid || a.gone || !this.engine) return;
    this.setAtt(ws, { ...a, gone: true });
    if (this.sockets(a.pid).some((w) => w !== ws)) return;
    const now = Date.now();
    this.engine.leave(a.pid, now);
    if (!this.sockets().length) this.flushStats(now);
    this.after(now, true);
  }

  // ---------- 저장·타이머·동기화 ----------
  after(now, forceSync) {
    const e = this.engine;
    if (!e) return;
    if (e.dirty) this.scheduleSave(SAVE_MS);
    else if (e.posDirty) this.scheduleSave(POS_SAVE_MS);
    this.scheduleAlarm(now);
    this.sync(now, forceSync);
    if (now - this.statAt > STAT_MS) this.flushStats(now);
  }

  scheduleSave(delay) {
    const due = Date.now() + delay;
    if (this.saveTimer && this.saveDue <= due) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveDue = due;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, delay);
  }

  save() {
    const e = this.engine;
    if (!e) return;
    e.dirty = false;
    e.posDirty = false;
    this.ctx.storage.put('state', e.s).catch((err) => console.error('save failed', err));
  }

  scheduleAlarm(now) {
    const e = this.engine;
    let t = e.nextWake(now);
    if (t == null && !this.sockets().length) t = (e.s.lastActive || now) + KEEP_MS;
    if (t == null) {
      if (this.alarmAt != null) { this.alarmAt = null; this.ctx.storage.deleteAlarm().catch(() => {}); }
      return;
    }
    if (this.alarmAt != null && Math.abs(this.alarmAt - t) < 500) return;
    this.alarmAt = t;
    this.ctx.storage.setAlarm(t).catch(() => {});
  }

  async alarm() {
    this.alarmAt = null;
    const e = this.engine;
    if (!e) return;
    const now = Date.now();
    if (!this.sockets().length && now - (e.s.lastActive || 0) >= KEEP_MS) { await this.destroy(); return; }
    e.tick(now);
    this.after(now);
  }

  sync(now, force) {
    const info = this.engine.info();
    const key = JSON.stringify([info.name, info.theme, info.isPublic, info.locked, info.closed, info.count, info.capacity, info.game, info.hostNick]);
    // 바뀐 것이 없으면 5분에 한 번만 살아 있다고 알림
    if (key === this.syncKey && now - this.syncAt < 300_000) return;
    this.syncKey = key;
    this.syncAt = now;
    this.hub().updateRoom(this.code, info).catch(() => {});
  }

  // 지표는 방 상태와 함께 저장해 두었다가 1분마다 모아서 보냄 (서버가 잠들어도 잃지 않게)
  linkStats() {
    const e = this.engine;
    if (!e) return;
    const pending = this.stats && Object.keys(this.stats).length ? this.stats : null;
    e.s.pstats ||= {};
    if (pending && pending !== e.s.pstats) for (const [k, v] of Object.entries(pending)) e.s.pstats[k] = (e.s.pstats[k] || 0) + v;
    this.stats = e.s.pstats;
  }

  addStat(k, v, x) {
    if (this.engine && this.stats !== this.engine.s.pstats) this.linkStats();
    if (this.engine) this.engine.posDirty = true;
    const s = this.stats;
    if (k === 'session') { s.session_ms = (s.session_ms || 0) + v; s.sessions = (s.sessions || 0) + 1; return; }
    if (k === 'gameStart' || k === 'gameFinish') { const key = `${k}:${x?.id}`; s[key] = (s[key] || 0) + 1; }
    s[k] = (s[k] || 0) + (Number(v) || 0);
  }

  flushStats(now) {
    this.statAt = now;
    const s = this.stats;
    if (!s || !Object.keys(s).length) return;
    const copy = { ...s };
    for (const k of Object.keys(s)) delete s[k];
    if (this.engine) this.engine.dirty = true;
    this.hub().bump(copy).catch(() => {});
  }

  async loadFeed(now) {
    this.feedAt = now;
    try {
      const f = await this.hub().roomFeed();
      this.hooks.extra = f.extra;
      this.bans = new Set(f.bans || []);
    } catch { /* 다음에 다시 시도 */ }
  }

  async aiSay(kind, c, fallback) {
    if (!this.engine) return;
    if (!this.env.ANTHROPIC_API_KEY) {
      if (fallback) { this.engine.mcSay(fallback); this.after(Date.now()); }
      return;
    }
    if (kind === 'mc') this.broadcast({ t: 'mcwait' });
    let text = null;
    try { text = await mcLine(this.env, kind, c); } catch (err) { console.error('AI MC 실패', String(err)); }
    if (!this.engine) return;
    text = text || fallback;
    if (!text) return;
    this.engine.mcSay(text);
    this.addStat('ai_mc', 1);
    this.after(Date.now());
  }

  async destroy() {
    for (const ws of this.ctx.getWebSockets()) try { ws.close(CLOSE.closed, 'expired'); } catch {}
    const code = this.code;
    this.engine = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    if (code) await this.hub().removeRoom(code).catch(() => {});
  }

  // ---------- Worker가 부르는 기능 ----------
  async init(meta) {
    if (this.engine) return false;
    this.engine = RoomEngine.create(meta, this.hooks);
    this.code = meta.code;
    this.linkStats();
    this.engine.dirty = false;
    await this.ctx.storage.put('state', this.engine.s);
    this.scheduleAlarm(Date.now());
    return true;
  }

  peek() { return this.engine ? this.engine.info() : null; }

  adminView() {
    const e = this.engine;
    if (!e) return null;
    return {
      room: e.info(),
      players: e.online().map((p) => ({ nick: p.nick, role: p.role, host: p.pid === e.s.hostPid, muted: (p.muteUntil || 0) > Date.now(), reports: p.rep.length })),
      chat: e.s.chat.slice(-30).map((c) => ({ at: c.at, nick: c.sys ? '알림' : c.mc ? 'MC' : c.nick, text: c.text })),
    };
  }

  async adminClose() {
    const e = this.engine;
    if (!e) return false;
    e.close();
    for (const ws of this.ctx.getWebSockets()) try { ws.close(CLOSE.admin, 'closed'); } catch {}
    this.save();
    this.sync(Date.now(), true);
    return true;
  }

  adminKick(dev) {
    const e = this.engine;
    if (!e || !dev) return false;
    this.bans.add(dev);
    const t = e.s.order.map((id) => e.s.players[id]).find((p) => p && p.dev === dev);
    if (!t) return false;
    const now = Date.now();
    e.ban(t, now, `운영 정책에 따라 ${t.nick}님이 방에서 나가게 됐어요.`);
    this.after(now, true);
    return true;
  }
}
