// 2.5D 공간: 화면 그리기, 이동, 카메라, 말풍선, 효과
import { iso, unIso, HW, HH, WALL_H, findPath, facing, freeAt, screenDirToWorld, isoSort } from './iso.js';
import { paintStatic, paintBackdrop, drawProp, drawPropLive, drawOxZones, paintLight, paintBanner, propBounds } from './art.js';
import { drawAvatar } from './avatar.js';
import { mapFor, buildMap, propAt } from '../shared/maps.js';
import { ITEMS, footprint } from '../shared/catalog.js';
import { drawItem, drawHangItem, paintStaticItems, isLiveItem } from './deco.js';
import { drawPet } from './pet.js';

const SPEED = 3.3;            // 초당 타일
const EMOTE_MS = { dance: 3600, clap: 2400, cheers: 2600, heart: 2400, hand: 2600, wave: 2200, nap: 5000 };
const EMOTE_ICON = { clap: '👏', heart: '❤️', dance: '🎵', wave: '👋', hand: '✋', cheers: '🥂', nap: '💤' };
const FONT = 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class World {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.mode = opts.mode || 'play';          // play | tv | spectate
    this.low = !!opts.low;
    this.ents = new Map();
    this.me = null;
    this.map = mapFor('party');
    this.theme = 'home'; this.light = 'warm'; this.banner = ''; this.style = {};
    this.edit = null;
    this.live = { game: false, gameName: '', cake: null, party: false, ox: null };
    this.fx = []; this.pops = []; this.marks = []; this.texts = [];
    this.flash = 0;
    this.cam = { x: 0, y: 140, zoom: 1, user: 1 };
    this.keys = new Set();
    this.joy = null;
    this.zone = null;
    this.t = 0; this.last = 0;
    this.sendAt = 0; this.lastSent = '';
    this.running = false;
    this.blocked = new Set();
    this.staticImg = null; this.sprites = new Map(); this.builtFor = '';
    this.resize();
    if (this.mode === 'play') this.bindInput();
  }

  // ---------- 방·사람 ----------
  setRoom(meta) {
    const kind = meta.kind === 'square' ? 'square' : meta.kind === 'home' ? 'home' : 'party';
    this.kind = kind;
    this.meta = meta;
    this.map = buildMap(meta);
    this.style = kind === 'home' ? { wall: meta.home?.wall, floor: meta.home?.floor } : {};
    this.theme = kind === 'square' ? 'square' : kind === 'home' ? 'home' : (meta.theme || 'home');
    this.light = meta.light || 'warm';
    this.banner = meta.banner || '';
    this.live.party = this.light === 'party';
    this.invalidate();
  }
  invalidate() { this.builtFor = ''; }

  setPlayers(list, me) {
    this.ents.clear();
    this.me = me;
    for (const p of list) this.upsert(p, true);
  }

  upsert(p, instant) {
    if (p.role === 'tv') return;
    let e = this.ents.get(p.pid);
    if (!e) {
      e = { pid: p.pid, x: p.x, y: p.y, path: [], dir: 1, walking: false, phase: 0, alpha: instant ? 1 : 0, seed: Math.random() * 10, bubble: null, emote: null };
      this.ents.set(p.pid, e);
      if (p.tx !== undefined && (Math.abs(p.tx - p.x) > 0.05 || Math.abs(p.ty - p.y) > 0.05)) e.path = findPath(this.map, [p.x, p.y], [p.tx, p.ty]);
    }
    e.nick = p.nick; e.look = p.look; e.sit = !!p.sit; e.muted = !!p.muted; e.gone = false;
    this.setPet(e, p.pet);
    if (e.sit) this.seatFace(e);
    return e;
  }

  setPet(e, pet) {
    if (!pet) { e.pet = null; e.pp = null; return; }
    e.pet = pet;
    if (!e.pp) e.pp = { x: e.x - 0.5, y: e.y + 0.35, dir: 0, walking: false, phase: 0, path: [], sleep: false, joy: 0, idle: 0 };
  }
  petFor(pid, pet) { const e = this.ents.get(pid); if (e) this.setPet(e, pet); }
  petJoy(pid, sec = 1.8) { const e = this.ents.get(pid); if (e && e.pp) { e.pp.joy = this.t + sec; e.pp.sleep = false; e.pp.idle = 0; } }

  remove(pid) { const e = this.ents.get(pid); if (e) { e.gone = true; e.bubble = null; } }
  hardRemove(pid) { this.ents.delete(pid); }
  setHost(pid) { this.host = pid; }
  setBlocked(set) { this.blocked = set; }

  seatFace(e) {
    for (const s of this.map.seats || []) if (Math.abs(s[0] - e.x) < 0.25 && Math.abs(s[1] - e.y) < 0.25) { e.dir = s[2] ?? 1; return; }
  }
  seatAt(e) {
    if (!e.sit) return null;
    for (const s of this.map.seats || []) if (Math.abs(s[0] - e.x) < 0.3 && Math.abs(s[1] - e.y) < 0.3) return s;
    return null;
  }

  moveRemote(pid, x, y, tx, ty, sit, force) {
    const e = this.ents.get(pid);
    if (!e) return;
    if (pid === this.me && !force) { if (sit && !e.sit) { e.sit = true; e.path = []; } return; }
    if (force && pid === this.me) {
      e.path = findPath(this.map, [e.x, e.y], [x, y]);
      if (!e.path.length || Math.hypot(e.x - x, e.y - y) > 6) { e.x = x; e.y = y; e.path = []; }
      e.sit = !!sit;
      if (sit) { e.x = x; e.y = y; e.path = []; this.seatFace(e); }
      this.manual = false;
      return;
    }
    if (Math.hypot(e.x - x, e.y - y) > 2.5) { e.x = x; e.y = y; }
    e.sit = !!sit;
    if (sit) { e.x = x; e.y = y; e.path = []; this.seatFace(e); return; }
    if (Math.hypot(e.x - tx, e.y - ty) < 0.05) { e.path = Math.hypot(e.x - x, e.y - y) > 0.05 ? [[x, y]] : []; return; }
    e.path = findPath(this.map, [e.x, e.y], [tx, ty]);
  }

  say(pid, text) {
    const e = this.ents.get(pid);
    if (!e || this.blocked.has(pid)) return;
    e.bubble = { text, at: this.t, until: this.t + Math.min(8, 3.5 + text.length * 0.08) };
  }

  emote(pid, k) {
    const e = this.ents.get(pid);
    if (!e) return;
    e.emote = { k, t0: this.t, until: this.t + (EMOTE_MS[k] || 2400) / 1000 };
    const icon = EMOTE_ICON[k];
    if (icon) this.popAt(e, icon, k === 'heart' ? 3 : 1);
    if (k === 'heart') this.burst(e.x, e.y, 'heart', 8);
    if (e.pp && (k === 'dance' || k === 'clap' || k === 'heart' || k === 'cheers')) e.pp.joy = this.t + 1.6;
  }

  react(pid, emoji) {
    const e = this.ents.get(pid);
    if (!e || this.blocked.has(pid)) return;
    this.popAt(e, emoji, 1);
    if (emoji === '🎉') this.burst(e.x, e.y, 'confetti', this.low ? 12 : 26);
  }

  popAt(e, emoji, n = 1) {
    for (let i = 0; i < n; i++) this.pops.push({ x: e.x, y: e.y, emoji, t0: this.t + i * 0.18, dx: (Math.random() - 0.5) * 18 });
  }

  cheersAll(byPid) {
    for (const e of this.ents.values()) if (!e.gone) e.emote = { k: 'cheers', t0: this.t + Math.random() * 0.2, until: this.t + 2.6 };
    const e = this.ents.get(byPid);
    if (e) this.texts.push({ x: e.x, y: e.y, text: '짠!', t0: this.t });
  }

  burst(x, y, kind = 'confetti', n = 30, z = 60) {
    const colors = ['#E83217', '#F7C04A', '#2F6BFF', '#22A86B', '#FF7AA8', '#FFFFFF', '#8E5CF7'];
    const [sx, sy] = iso(x, y, z);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; const sp = 40 + Math.random() * 110;
      this.fx.push({
        kind, x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - (kind === 'heart' ? 60 : 120),
        g: kind === 'heart' ? -20 : 260, life: kind === 'heart' ? 1.6 : 1.8 + Math.random(), age: 0,
        c: colors[i % colors.length], r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10, s: 2 + Math.random() * 3,
      });
    }
  }

  celebrate() {
    // 방 전체에 축하 효과
    const cx = this.map.w / 2; const cy = this.map.h / 2;
    for (let i = 0; i < 4; i++) this.burst(cx + (Math.random() - 0.5) * 6, cy + (Math.random() - 0.5) * 6, 'confetti', this.low ? 14 : 34, 90);
  }

  cameraFlash() { this.flash = 1; }

  setLive(patch) { Object.assign(this.live, patch); }

  // ---------- 내 이동 ----------
  mePos() { const e = this.ents.get(this.me); return e ? [e.x, e.y] : null; }

  walkTo(x, y, then) {
    const e = this.ents.get(this.me);
    if (!e || this.mode !== 'play') return;
    const path = findPath(this.map, [e.x, e.y], [x, y]);
    if (!path.length) return;
    e.path = path; e.sit = false; this.manual = false;
    this.arrive = then || null;
    const end = path[path.length - 1];
    this.marks.push({ x: end[0], y: end[1], t0: this.t });
    this.sendPos(true);
  }

  sendPos(force) {
    const e = this.ents.get(this.me);
    if (!e || !this.opts.onPos) return;
    let tx = e.x; let ty = e.y;
    if (e.path.length) [tx, ty] = e.path[e.path.length - 1];
    else if (this.manual && this.vel) { tx = e.x + this.vel[0] * 0.35; ty = e.y + this.vel[1] * 0.35; }
    const key = [e.x, e.y, tx, ty, e.sit].map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join(',');
    if (!force && key === this.lastSent) return;
    this.lastSent = key;
    this.sendAt = this.t;
    this.opts.onPos(+e.x.toFixed(2), +e.y.toFixed(2), +tx.toFixed(2), +ty.toFixed(2), e.sit);
  }

  // ---------- 입력 ----------
  bindInput() {
    const cv = this.cv;
    cv.style.touchAction = 'none';
    let down = null;
    const pts = new Map();
    let pinch = null;
    cv.addEventListener('pointerdown', (ev) => {
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.cam.user }; down = null; return; }
      down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    });
    cv.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this.setUserZoom(pinch.z * (d / pinch.d));
      }
    });
    const up = (ev) => {
      pts.delete(ev.pointerId);
      if (pts.size < 2) pinch = null;
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved < 10 && dt < 600) this.tap(ev.clientX, ev.clientY);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (ev) => { pts.delete(ev.pointerId); down = null; pinch = null; });
    cv.addEventListener('wheel', (ev) => { ev.preventDefault(); this.setUserZoom(this.cam.user * (ev.deltaY > 0 ? 0.9 : 1.1)); }, { passive: false });
    this.onKey = (ev) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = ev.key.toLowerCase();
      const map = { arrowup: 'u', w: 'u', arrowdown: 'd', s: 'd', arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r' };
      if (!map[k]) return;
      ev.preventDefault();
      if (ev.type === 'keydown') this.keys.add(map[k]); else this.keys.delete(map[k]);
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.onBlur = () => this.keys.clear();
    window.addEventListener('blur', this.onBlur);
  }

  setUserZoom(z) {
    this.cam.user = clamp(z, 0.7, 1.9);
    clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => this.invalidate(), 250);
  }

  // 화면 좌표(px) → 바닥 좌표
  screenToWorld(cx, cy) {
    const r = this.cv.getBoundingClientRect();
    const z = this.cam.zoom;
    const ix = (cx - r.left - this.vw / 2) / z + this.cam.x;
    const iy = (cy - r.top - this.vh / 2) / z + this.cam.y;
    return unIso(ix, iy);
  }
  worldToScreen(x, y, zz = 0) {
    const [ix, iy] = iso(x, y, zz);
    return [(ix - this.cam.x) * this.cam.zoom + this.vw / 2, (iy - this.cam.y) * this.cam.zoom + this.vh / 2];
  }

  tap(cx, cy) {
    const r = this.cv.getBoundingClientRect();
    const sx = cx - r.left; const sy = cy - r.top;
    if (this.edit) { const [x, y] = this.screenToWorld(cx, cy); if (this.opts.onEditTap) this.opts.onEditTap(x, y); return; }
    // 사람을 눌렀는지 (앞에 있는 사람부터)
    const z = this.cam.zoom;
    const hits = [...this.ents.values()].filter((e) => !e.gone).sort((a, b) => (b.x + b.y) - (a.x + a.y));
    for (const e of hits) {
      if (!e.pp) continue;
      const [px, py] = this.worldToScreen(e.pp.x, e.pp.y);
      if (sx > px - 13 * z && sx < px + 13 * z && sy > py - 28 * z && sy < py + 5 * z) {
        this.petJoy(e.pid);
        this.pops.push({ x: e.pp.x, y: e.pp.y, emoji: '💕', t0: this.t, dx: 0, z: 34 });
        if (this.opts.onTapPet) this.opts.onTapPet(e.pid, e);
        return;
      }
    }
    for (const e of hits) {
      const [px, py] = this.worldToScreen(e.x, e.y, this.elev(e));
      if (sx > px - 17 * z && sx < px + 17 * z && sy > py - 66 * z && sy < py + 4 * z) {
        if (this.opts.onTapAvatar) this.opts.onTapAvatar(e.pid, e);
        if (e.pid !== this.me || this.mode !== 'play') return;
      }
    }
    if (this.mode !== 'play') return;
    const [x, y] = this.screenToWorld(cx, cy);
    if (x < -0.5 || y < -0.5 || x > this.map.w + 0.5 || y > this.map.h + 0.5) return;
    // 소파를 누르면 가서 앉기
    const seat = (this.map.seats || []).find((s) => Math.abs(s[0] - x) < 0.6 && Math.abs(s[1] - y) < 0.6);
    if (seat) { this.walkTo(seat[0] + (seat[2] === 1 ? 0 : 0.95), seat[1] + (seat[2] === 1 ? 0.95 : 0), () => this.opts.onSit && this.opts.onSit()); return; }
    this.walkTo(clamp(x, 0.3, this.map.w - 0.3), clamp(y, 0.3, this.map.h - 0.3));
  }

  setJoystick(dx, dy) { this.joy = dx || dy ? [dx, dy] : null; }

  // ---------- 크기 ----------
  resize() {
    const r = this.cv.getBoundingClientRect();
    this.vw = Math.max(50, r.width || this.cv.clientWidth || 300);
    this.vh = Math.max(50, r.height || this.cv.clientHeight || 200);
    this.dpr = this.low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(this.vw * this.dpr);
    this.cv.height = Math.round(this.vh * this.dpr);
    this.invalidate();
  }

  setLow(v) { this.low = !!v; this.resize(); }

  baseZoom() {
    const roomW = (this.map.w + this.map.h) * HW + 40;
    const roomH = (this.map.w + this.map.h) * HH + WALL_H + 70;
    const ow = (this.opts.offsetX || 0) * 2; const oh = (this.opts.offsetY || 0) * 2;
    if (this.mode !== 'play' || this.edit) return Math.min((this.vw - ow) / roomW, (this.vh - oh) / roomH) * (this.edit ? 0.94 : this.opts.fit || 0.98);
    return clamp(Math.min(this.vw / 440, this.vh / 470), 0.6, 1.3);
  }

  roomBox() {
    return { x0: -this.map.h * HW - 20, x1: this.map.w * HW + 20, y0: -WALL_H - 50, y1: (this.map.w + this.map.h) * HH + 30 };
  }

  updateCamera(dt, snap) {
    const z = this.mode === 'play' && !this.edit ? this.baseZoom() * this.cam.user : this.baseZoom();
    if (Math.abs(z - this.cam.zoom) > 0.001) this.cam.zoom = snap ? z : lerp(this.cam.zoom, z, Math.min(1, dt * 8));
    const b = this.roomBox();
    let tx = (b.x0 + b.x1) / 2; let ty = (b.y0 + b.y1) / 2;
    const me = this.ents.get(this.me);
    if (this.mode === 'play' && me && !this.edit) { const [ix, iy] = iso(me.x, me.y, 30); tx = ix; ty = iy; }
    // 게임 창이 가리는 부분을 빼고, 보이는 곳 가운데에 오도록
    const ox = (this.opts.offsetX || 0) / this.cam.zoom; const oy = (this.opts.offsetY || 0) / this.cam.zoom;
    const visW = this.vw / this.cam.zoom - ox * 2; const visH = this.vh / this.cam.zoom - oy * 2;
    tx = b.x1 - b.x0 <= visW ? (b.x0 + b.x1) / 2 : clamp(tx, b.x0 + visW / 2, b.x1 - visW / 2);
    ty = b.y1 - b.y0 <= visH ? (b.y0 + b.y1) / 2 : clamp(ty, b.y0 + visH / 2, b.y1 - visH / 2);
    tx += ox; ty += oy;
    if (snap) { this.cam.x = tx; this.cam.y = ty; } else { this.cam.x = lerp(this.cam.x, tx, Math.min(1, dt * 6)); this.cam.y = lerp(this.cam.y, ty, Math.min(1, dt * 6)); }
  }

  // ---------- 고정 그림 캐시 ----------
  ensureStatic() {
    const key = [this.theme, this.light, this.banner, this.map.key || this.map.id, this.style.wall, this.style.floor, this.dpr, Math.round(this.cam.zoom * 100)].join('|');
    if (this.builtFor === key) return;
    this.builtFor = key;
    const S = this.cam.zoom * this.dpr;
    const b = this.roomBox();
    const c = document.createElement('canvas');
    c.width = Math.ceil((b.x1 - b.x0) * S); c.height = Math.ceil((b.y1 - b.y0) * S);
    const g = c.getContext('2d');
    g.setTransform(S, 0, 0, S, -b.x0 * S, -b.y0 * S);
    paintStatic(g, this.map, this.theme, this.style);
    if (this.map.id === 'party') paintBanner(g, this.theme, this.banner);
    paintStaticItems(g, this.map, this.t);
    this.staticImg = { c, x: b.x0, y: b.y0, S };
    this.sprites.clear();
    for (const p of this.map.props) {
      if (['stage', 'photo', 'screen'].includes(p.kind)) continue;
      if (p.kind === 'item' && (p.place !== 'floor' || isLiveItem(p.item))) continue;
      const pb = propBounds(p);
      const pad = 24;
      const x0 = iso(pb.x0, pb.y1)[0] - pad; const x1 = iso(pb.x1, pb.y0)[0] + pad;
      const y0 = iso(pb.x0, pb.y0, pb.top + 40)[1] - pad; const y1 = iso(pb.x1, pb.y1)[1] + pad;
      const sc = document.createElement('canvas');
      sc.width = Math.max(2, Math.ceil((x1 - x0) * S)); sc.height = Math.max(2, Math.ceil((y1 - y0) * S));
      const sg = sc.getContext('2d');
      sg.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
      if (p.kind === 'item') drawItem(sg, p, null, this.theme, 0); else drawProp(sg, p, this.theme);
      this.sprites.set(p.id, { c: sc, x: x0, y: y0, S, p, b: pb });
    }
  }

  elev(e) {
    const s = this.map.stage;
    return s && e.x >= s[0] && e.x < s[2] + 1 && e.y >= s[1] && e.y < s[3] + 1 ? 10 : 0;
  }

  // ---------- 매 프레임 ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (this.low && now - this.last < 30) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  destroy() {
    this.stop();
    if (this.onKey) { window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKey); }
    if (this.onBlur) window.removeEventListener('blur', this.onBlur);
  }

  step(dt) {
    this.t += dt;
    const me = this.ents.get(this.me);
    // 키보드·조이스틱 이동
    if (me && this.mode === 'play') {
      let dx = 0; let dy = 0;
      if (this.keys.has('u')) dy -= 1; if (this.keys.has('d')) dy += 1; if (this.keys.has('l')) dx -= 1; if (this.keys.has('r')) dx += 1;
      if (this.joy) { dx = this.joy[0]; dy = this.joy[1]; }
      if (dx || dy) {
        const [wx, wy] = screenDirToWorld(dx, dy);
        const mag = this.joy ? Math.min(1, Math.hypot(dx, dy)) : 1;
        const sp = SPEED * mag * dt;
        let nx = me.x + wx * sp; let ny = me.y + wy * sp;
        if (!freeAt(this.map, nx, me.y)) nx = me.x;
        if (!freeAt(this.map, nx, ny)) ny = me.y;
        if (me.sit) me.sit = false;
        me.path = [];
        if (nx !== me.x || ny !== me.y) { me.dir = facing(nx - me.x, ny - me.y, me.dir); me.walking = true; me.phase += dt * 11; }
        me.x = nx; me.y = ny;
        this.manual = true; this.vel = [wx * mag, wy * mag];
        if (this.t - this.sendAt > 0.12) this.sendPos();
      } else if (this.manual) {
        this.manual = false; this.vel = null; me.walking = false;
        this.sendPos(true);
      }
    }
    // 경로 따라 걷기
    for (const e of this.ents.values()) {
      if (e.gone) { e.alpha -= dt * 2.5; if (e.alpha <= 0) this.ents.delete(e.pid); continue; }
      if (e.alpha < 1) e.alpha = Math.min(1, e.alpha + dt * 3);
      if (e === me && this.manual) continue;
      if (e.path.length) {
        const [tx, ty] = e.path[0];
        const ddx = tx - e.x; const ddy = ty - e.y; const d = Math.hypot(ddx, ddy);
        const sp = SPEED * dt * (e === me ? 1 : (e.path.length > 2 ? 1.25 : 1.05));
        if (d <= sp) { e.x = tx; e.y = ty; e.path.shift(); }
        else { e.x += (ddx / d) * sp; e.y += (ddy / d) * sp; }
        if (d > 0.001) e.dir = facing(ddx, ddy, e.dir);
        e.walking = true; e.phase += dt * 11;
        if (e === me) {
          if (!e.path.length) { e.walking = false; this.sendPos(true); const cb = this.arrive; this.arrive = null; if (cb) cb(); }
          else if (this.t - this.sendAt > 0.3) this.sendPos(true);
        }
      } else e.walking = false;
      if (e.emote && this.t > e.emote.until) e.emote = null;
      if (e.bubble && this.t > e.bubble.until) e.bubble = null;
      if (e.pp) this.stepPet(e, dt);
    }
    // 소품 근처 확인
    if (me && this.mode === 'play') {
      const p = propAt(this.map, me.x, me.y);
      const id = p ? p.id : null;
      if (id !== (this.zone && this.zone.id)) { this.zone = p; if (this.opts.onZone) this.opts.onZone(p); }
    }
    // 효과
    for (const f of this.fx) { f.age += dt; f.vy += f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.985; f.r += f.vr * dt; }
    this.fx = this.fx.filter((f) => f.age < f.life);
    this.pops = this.pops.filter((p) => this.t - p.t0 < 1.8);
    this.marks = this.marks.filter((m) => this.t - m.t0 < 0.8);
    this.texts = this.texts.filter((m) => this.t - m.t0 < 1.6);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    this.updateCamera(dt, !this.camReady);
    this.camReady = true;
  }

  // 펫: 주인 뒤를 졸졸 따라다니고, 오래 가만히 있으면 쿠션에 가서 자요
  stepPet(e, dt) {
    const pp = e.pp;
    const moving = e.walking || (e.path && e.path.length);
    pp.idle = moving ? 0 : pp.idle + dt;
    let goal = null; let near = 0.75;
    if (pp.idle > 25 && this.kind === 'home') {
      const bed = this.map.props.find((p) => p.kind === 'item' && ITEMS[p.item]?.act === 'pet');
      if (bed) { goal = [bed.x + bed.w / 2, bed.y + bed.h / 2 + (ITEMS[bed.item].block ? 0.9 : 0)]; near = 0.08; }
    }
    if (!goal) goal = [e.x, e.y];
    const dx = goal[0] - pp.x; const dy = goal[1] - pp.y; const d = Math.hypot(dx, dy);
    if (pp.idle > 40 && d < near + 0.2) pp.sleep = true;
    if (moving) pp.sleep = false;
    if (d > 4.5) { pp.x = goal[0] - 0.5; pp.y = goal[1] + 0.3; pp.path = []; return; }
    if (d > near) {
      if (!pp.path.length && d > 1.6 && !freeAt(this.map, pp.x + dx / d * 0.5, pp.y + dy / d * 0.5, 0.12)) pp.path = findPath(this.map, [pp.x, pp.y], goal).slice(0, -1);
      let tx = goal[0]; let ty = goal[1];
      if (pp.path.length) { [tx, ty] = pp.path[0]; if (Math.hypot(tx - pp.x, ty - pp.y) < 0.15) { pp.path.shift(); } }
      const mx = tx - pp.x; const my = ty - pp.y; const md = Math.hypot(mx, my) || 1;
      const sp = SPEED * dt * (d > 1.4 ? 1.35 : 0.95);
      const step = Math.min(sp, Math.max(0, (pp.path.length ? md : d - near + 0.02)));
      let nx = pp.x + (mx / md) * step; let ny = pp.y + (my / md) * step;
      if (!freeAt(this.map, nx, pp.y, 0.12)) nx = pp.x;
      if (!freeAt(this.map, nx, ny, 0.12)) ny = pp.y;
      if (nx === pp.x && ny === pp.y && step > 0.01 && near < 0.5) { pp.x += (mx / md) * step; pp.y += (my / md) * step; }
      else { pp.x = nx; pp.y = ny; }
      if (step > 0.002) { pp.dir = facing(mx, my, pp.dir); pp.walking = true; pp.phase += dt * 13; } else pp.walking = false;
    } else {
      pp.walking = false; pp.path = [];
      if (!pp.sleep) { const fx = e.x - pp.x; const fy = e.y - pp.y; if (Math.hypot(fx, fy) > 0.1) pp.dir = facing(fx, fy, pp.dir); }
    }
  }

  // ---------- 꾸미기 편집 ----------
  /** items: [{i,x,y,r}], ghost: {i,x,y,r,ok} | null, sel: 인덱스 */
  setEdit(edit) {
    if (!edit) { this.edit = null; if (this.meta) this.setRoom(this.meta); return; }
    this.edit = edit;
    const meta = this.kind === 'home' ? { kind: 'home', home: { items: edit.items } } : { kind: 'party', deco: edit.items };
    this.map = buildMap(meta);
    if (this.kind === 'home') this.style = { wall: edit.wall || this.style.wall, floor: edit.floor || this.style.floor };
    this.invalidate();
  }

  drawEditMarks(ctx) {
    const ed = this.edit;
    const tile = (x, y, fill, line) => { const pts = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)]; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.strokeStyle = line; ctx.lineWidth = 1.2; ctx.stroke(); } };
    // 바닥 격자
    ctx.save();
    for (let y = 0; y < this.map.h; y++) for (let x = 0; x < this.map.w; x++) tile(x, y, 'rgba(255,255,255,0.0)', 'rgba(60,40,70,0.10)');
    for (const [x, y] of this.map.entry || []) tile(x, y, 'rgba(232,50,23,0.07)');
    if (ed.sel != null && ed.items[ed.sel]) {
      const it = ed.items[ed.sel]; const fp = footprint(it.i, it.r);
      if (fp) for (let y = it.y; y < it.y + fp.h; y++) for (let x = it.x; x < it.x + fp.w; x++) tile(x, y, 'rgba(47,107,255,0.18)', 'rgba(47,107,255,0.8)');
    }
    const g = ed.ghost;
    if (g) {
      const fp = footprint(g.i, g.r);
      const def = ITEMS[g.i];
      const fill = g.ok ? 'rgba(34,168,107,0.25)' : 'rgba(232,50,23,0.28)';
      const line = g.ok ? 'rgba(34,168,107,0.95)' : 'rgba(232,50,23,0.95)';
      if (fp && def?.place !== 'wall') for (let y = g.y; y < g.y + fp.h; y++) for (let x = g.x; x < g.x + fp.w; x++) tile(x, y, fill, line);
      ctx.globalAlpha = 0.78;
      const p = { id: 'ghost', kind: 'item', item: g.i, x: g.x, y: g.y, w: fp?.w || 1, h: fp?.h || 1, r: g.r ? 1 : 0, place: def?.place };
      if (def?.place === 'floor') drawItem(ctx, p, null, this.theme, this.t);
      else if (def?.place === 'hang') drawHangItem(ctx, p, this.t);
      else paintStaticItems(ctx, { props: [p] }, this.t);
      if (def?.place === 'wall') { const [wx, wy] = g.y === 0 ? iso(g.x + 0.5, 0, 76) : iso(0, g.y + 0.5, 76); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(wx, wy, 19, 0, Math.PI * 2); ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.stroke(); }
    }
    ctx.restore();
  }

  render() {
    this.ensureStatic();
    this.renderTo(this.ctx, this.vw, this.vh, this.cam, this.dpr, { tags: true, bubbles: true, sprites: true });
  }

  renderTo(ctx, W, H, cam, dpr, o) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBackdrop(ctx, W, H, this.theme);
    const z = cam.zoom;
    const wt = () => ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));
    wt();
    if (o.sprites && this.staticImg) {
      const s = this.staticImg;
      ctx.drawImage(s.c, s.x, s.y, s.c.width / s.S, s.c.height / s.S);
    } else {
      paintStatic(ctx, this.map, this.theme, {});
      if (this.map.id === 'party') paintBanner(ctx, this.theme, this.banner);
    }
    // 바닥 표시: OX 구역, 내가 서 있는 소품 구역, 걸어갈 곳
    if (this.live.ox) drawOxZones(ctx, this.map, this.live.ox.phase, this.live.ox.answer, this.t);
    if (this.zone && this.zone.area && this.mode === 'play' && o.tags && !o.clean) {
      const a = this.zone.area;
      const pts = [iso(a[0], a[1]), iso(a[2] + 1, a[1]), iso(a[2] + 1, a[3] + 1), iso(a[0], a[3] + 1)];
      ctx.save(); ctx.setLineDash([5, 5]); ctx.lineDashOffset = -this.t * 12;
      ctx.strokeStyle = `rgba(232,50,23,${0.35 + Math.sin(this.t * 4) * 0.12})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    for (const m of o.clean ? [] : this.marks) {
      const k = (this.t - m.t0) / 0.8;
      const [mx, my] = iso(m.x, m.y);
      ctx.beginPath(); ctx.ellipse(mx, my, 6 + k * 14, (6 + k * 14) / 2, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(232,50,23,${1 - k})`; ctx.lineWidth = 2; ctx.stroke();
    }
    // 소품과 사람을 앞뒤 순서대로
    const items = [];
    for (const p of this.map.props) {
      if (['stage', 'photo', 'screen'].includes(p.kind)) continue;
      if (p.kind === 'item' && p.place !== 'floor') continue;
      const b = propBounds(p);
      items.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, prop: p });
    }
    // 소파에 앉은 사람은 소파를 그린 바로 다음에 그림 (소파 등받이에 가려지지 않게)
    const seated = [];
    const seatOf = (e) => this.seatAt(e);
    for (const e of this.ents.values()) {
      if (e.alpha <= 0) continue;
      if (e.pp && e.pet) items.push({ x0: e.pp.x - 0.14, y0: e.pp.y - 0.14, x1: e.pp.x + 0.14, y1: e.pp.y + 0.14, pet: e });
      if (seatOf(e)) { seated.push(e); continue; }
      items.push({ x0: e.x - 0.22, y0: e.y - 0.22, x1: e.x + 0.22, y1: e.y + 0.22, ent: e });
    }
    seated.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const cake = this.live.cake;
    const drawEnt = (e) => {
      const zz = this.elev(e) + (seatOf(e) ? 9 : 0);
      const [sx, sy] = iso(e.x, e.y, zz);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, e.alpha));
      ctx.translate(sx, sy);
      // 그림자와 내 표시
      if (!e.sit) { ctx.beginPath(); ctx.ellipse(0, 0, 12, 4.5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(30,20,40,0.2)'; ctx.fill(); }
      if (e.pid === this.me && this.mode === 'play' && !e.sit) { ctx.beginPath(); ctx.ellipse(0, 0, 15, 6.2, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(232,50,23,0.75)'; ctx.lineWidth = 1.8; ctx.stroke(); }
      const em = e.emote && this.t >= e.emote.t0 ? e.emote : null;
      drawAvatar(ctx, e.look, {
        dir: e.dir, t: this.t, walk: e.walking, phase: e.phase, sit: e.sit, seed: e.seed, low: this.low,
        emote: em ? em.k : null, emoteT: em ? this.t - em.t0 : 0,
        crown: !!(cake && cake.on && cake.hero === e.pid),
      });
      ctx.restore();
    };
    const drawPetOf = (e) => {
      const pp = e.pp;
      const [sx, sy] = iso(pp.x, pp.y, 0);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, e.alpha));
      ctx.translate(sx, sy);
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(30,20,40,0.18)'; ctx.fill();
      drawPet(ctx, e.pet, { dir: pp.dir, t: this.t + e.seed, walk: pp.walking, phase: pp.phase, joy: pp.joy > this.t, sleep: pp.sleep, low: this.low });
      if (pp.sleep) { ctx.font = `700 9px ${FONT}`; ctx.fillStyle = 'rgba(80,90,140,0.8)'; ctx.textAlign = 'center'; ctx.fillText('z', 8 + Math.sin(this.t * 2) * 2, -24 - ((this.t * 6) % 8)); }
      ctx.restore();
    };
    for (const it of isoSort(items)) {
      if (it.prop) {
        const sp = o.sprites ? this.sprites.get(it.prop.id) : null;
        if (sp) ctx.drawImage(sp.c, sp.x, sp.y, sp.c.width / sp.S, sp.c.height / sp.S);
        else if (it.prop.kind === 'item') drawItem(ctx, it.prop, null, this.theme, this.t);
        else drawProp(ctx, it.prop, this.theme);
        if (it.prop.kind !== 'item') drawPropLive(ctx, it.prop, this.theme, this.live, this.t);
        for (const e of seated) { const st = this.seatAt(e); if (st && (st[3] || 'sofa') === it.prop.id) drawEnt(e); }
        continue;
      }
      if (it.pet) { drawPetOf(it.pet); continue; }
      drawEnt(it.ent);
    }
    for (const p of this.map.props) if (p.kind === 'item' && p.place === 'hang') drawHangItem(ctx, p, this.t);
    if (this.edit && !o.clean) this.drawEditMarks(ctx);
    // 효과 (그림 좌표)
    for (const f of this.fx) {
      const a = 1 - f.age / f.life;
      ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(f.x, f.y); ctx.rotate(f.r);
      if (f.kind === 'heart') { ctx.font = `${10 + f.s * 2}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#FF5C8A'; ctx.fillText('❤', 0, 0); }
      else { ctx.fillStyle = f.c; ctx.fillRect(-f.s, -f.s * 0.5, f.s * 2, f.s); }
      ctx.restore();
    }
    // 조명 (화면 좌표)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintLight(ctx, W, H, this.light, this.theme, this.t, this.low);
    // 이름표·말풍선·이모지 (화면 좌표, 항상 맨 위)
    const toS = (x, y, zz) => { const [ix, iy] = iso(x, y, zz); return [(ix - cam.x) * z + W / 2, (iy - cam.y) * z + H / 2]; };
    if (o.tags) {
      const list = [...this.ents.values()].filter((e) => e.alpha > 0.05).sort((a, b) => (a.x + a.y) - (b.x + b.y));
      for (const e of list) {
        const seatZ = this.seatAt(e) ? 9 : 0;
        const [px, py] = toS(e.x, e.y, this.elev(e) + seatZ);
        const headY = py - (e.sit ? 58 : 66) * z;
        this.nameTag(ctx, e, px, headY - 4, o.small);
        if (o.bubbles && e.bubble) this.bubble(ctx, e, px, headY - (o.small ? 20 : 24));
      }
    }
    for (const p of this.pops) {
      const k = (this.t - p.t0) / 1.8;
      if (k < 0) continue;
      const [px, py] = toS(p.x, p.y, p.z ?? 70);
      const s = k < 0.15 ? k / 0.15 : 1;
      ctx.save(); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `${Math.round(22 * s)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, px + p.dx * k, py - 30 - k * 46);
      ctx.restore();
    }
    for (const m of this.texts) {
      const k = (this.t - m.t0) / 1.6;
      const [px, py] = toS(m.x, m.y, 90);
      ctx.save(); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `900 ${Math.round(26 + Math.min(1, k * 6) * 8)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = '#FFFFFF'; ctx.strokeText(m.text, px, py - k * 30);
      ctx.fillStyle = '#E83217'; ctx.fillText(m.text, px, py - k * 30);
      ctx.restore();
    }
    if (this.flash > 0 && !o.clean) { ctx.fillStyle = `rgba(255,255,255,${this.flash})`; ctx.fillRect(0, 0, W, H); }
  }

  nameTag(ctx, e, x, y, small) {
    const me = e.pid === this.me;
    const host = e.pid === this.host;
    const text = (host ? '👑 ' : '') + (e.nick || '') + (e.muted ? ' 🔇' : '');
    const fs = small ? 10 : 12;
    ctx.font = `700 ${fs}px ${FONT}`;
    const w = ctx.measureText(text).width + 12;
    const h = fs + 7;
    ctx.globalAlpha = Math.min(1, e.alpha);
    ctx.fillStyle = me ? '#E83217' : 'rgba(255,255,255,0.92)';
    roundRect(ctx, x - w / 2, y - h, w, h, h / 2); ctx.fill();
    if (!me) { ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.fillStyle = me ? '#FFFFFF' : '#2A2230';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2 + 0.5);
    ctx.globalAlpha = 1;
  }

  bubble(ctx, e, x, yBottom) {
    const b = e.bubble;
    const age = this.t - b.at; const left = b.until - this.t;
    const a = Math.min(1, age * 6, left * 2);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = `500 13px ${FONT}`;
    const lines = wrap(ctx, b.text, 168, 3);
    const lh = 17;
    const w = Math.min(184, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18);
    const h = lines.length * lh + 12;
    const top = yBottom - h - 6 - (1 - Math.min(1, age * 6)) * 6;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(30,20,40,0.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    roundRect(ctx, x - w / 2, top, w, h, 10); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.moveTo(x - 6, top + h - 1); ctx.lineTo(x, top + h + 6); ctx.lineTo(x + 6, top + h - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#231B26'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x, top + 6 + i * lh + 1));
    ctx.restore();
  }

  // ---------- 단체 사진 ----------
  capture(w = 1080, h = 810) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    // 사람들이 모인 곳을 화면에 담기
    const ents = [...this.ents.values()].filter((e) => !e.gone);
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    const add = (ix, iy) => { x0 = Math.min(x0, ix); x1 = Math.max(x1, ix); y0 = Math.min(y0, iy); y1 = Math.max(y1, iy); };
    for (const e of ents) { const [ix, iy] = iso(e.x, e.y); add(ix - 30, iy - 95); add(ix + 30, iy + 15); }
    const photo = this.map.props.find((p) => p.kind === 'photo');
    if (photo) { add(...iso(photo.area[0], photo.area[1], 120)); add(...iso(photo.area[2] + 1, photo.area[3] + 1)); }
    if (!Number.isFinite(x0)) { const b = this.roomBox(); x0 = b.x0; x1 = b.x1; y0 = b.y0; y1 = b.y1; }
    const pad = 40;
    const zoom = Math.min(w / (x1 - x0 + pad * 2), h / (y1 - y0 + pad * 2), 2.6);
    const cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom };
    this.renderTo(ctx, w, h, cam, 1, { tags: true, bubbles: false, sprites: false, small: false, clean: true });
    return c;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrap(ctx, text, maxW, maxLines) {
  const out = [];
  let line = '';
  for (const ch of Array.from(String(text))) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = ch === ' ' ? '' : ch;
      if (out.length === maxLines) break;
    } else line = test;
  }
  if (out.length < maxLines && line) out.push(line);
  if (out.length === maxLines && Array.from(String(text)).length > out.join('').length) out[maxLines - 1] = out[maxLines - 1].slice(0, -1) + '…';
  return out;
}

