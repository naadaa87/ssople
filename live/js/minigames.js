// 미니게임 8종 — 캔버스 하나에 그리고, 끝나면 점수와 걸린 시간을 알려 줘요.
// 같은 씨앗(seed)이면 같은 판이 나와서, 미니게임 대결 때 모두가 같은 문제를 받아요.
import { ARCADE, rng } from '../shared/arcade-meta.js';
import { play, playNote } from './sound.js';
import { drawPet } from './pet.js';

const FONT = 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
const RED = '#E83217';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function emoji(ctx, ch, x, y, size) {
  ctx.font = `${Math.round(size)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x, y);
}
function text(ctx, s, x, y, size, color, weight = 800, align = 'center') {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function bg(ctx, W, H, top = '#FFFFFF', bottom = '#F3F4F8') {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/**
 * 게임 하나 돌리기
 * opts: { seed, pet, onScore(score), onTick(leftSec), onEnd({ score, ms }) }
 */
export class MiniGame {
  constructor(canvas, id, opts = {}) {
    this.cv = canvas; this.id = id; this.meta = ARCADE[id];
    this.opts = opts;
    this.rand = rng(opts.seed || Math.floor(Math.random() * 2 ** 30));
    this.score = 0; this.t = 0; this.done = false;
    this.fx = []; this.shake = 0;
    this.fit();
    this.g = IMPL[id](this);
    this.bind();
    this.started = performance.now();
    this.last = this.started;
    const loop = (now) => {
      if (this.done && !this.afterEnd) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.done) { this.t += dt; this.g.step(dt); this.timeCheck(); }
      else this.afterEnd -= dt * 1000;
      for (const f of this.fx) { f.age += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += (f.g ?? 300) * dt; }
      this.fx = this.fx.filter((f) => f.age < f.life);
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
      this.draw();
      if (this.done && this.afterEnd <= 0) cancelAnimationFrame(this.raf);
    };
    this.raf = requestAnimationFrame(loop);
  }

  fit() {
    const r = this.cv.getBoundingClientRect();
    this.W = Math.max(240, r.width || 360); this.H = Math.max(300, r.height || 540);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    this.k = Math.min(this.W / 380, this.H / 560);
  }

  bind() {
    const cv = this.cv;
    cv.style.touchAction = 'none';
    const pos = (ev) => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    this.onDown = (ev) => { if (this.done) return; ev.preventDefault(); this.down = true; const [x, y] = pos(ev); this.g.down && this.g.down(x, y); };
    this.onMove = (ev) => { if (this.done) return; const [x, y] = pos(ev); this.g.move && this.g.move(x, y, this.down); };
    this.onUp = () => { this.down = false; this.g.up && this.g.up(); };
    this.onKey = (ev) => {
      if (this.done) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (this.g.key && this.g.key(ev.key, ev.type === 'keydown', ev.repeat)) ev.preventDefault();
    };
    cv.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
  }

  unbind() {
    this.cv.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
  }

  timeCheck() {
    const sec = this.meta.sec;
    if (sec && this.opts.onTick) this.opts.onTick(Math.max(0, sec - this.t));
    if (sec && this.t >= sec) { this.g.timeUp ? this.g.timeUp() : this.finish(); }
  }

  add(n, x, y, label) {
    this.score = clamp(Math.round(this.score + n), 0, this.meta.max);
    if (this.opts.onScore) this.opts.onScore(this.score);
    if (x != null) this.fx.push({ kind: 'txt', text: label || (n > 0 ? '+' + n : String(n)), color: n >= 0 ? (n >= 30 ? '#E0A100' : RED) : '#5A5F6B', x, y, vx: 0, vy: -60, g: 0, age: 0, life: 0.8 });
  }
  set(n) { this.score = clamp(Math.round(n), 0, this.meta.max); if (this.opts.onScore) this.opts.onScore(this.score); }
  burst(x, y, colors, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; const sp = 60 + Math.random() * 160;
      this.fx.push({ kind: 'bit', color: colors[i % colors.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, age: 0, life: 0.7 + Math.random() * 0.4, s: 2 + Math.random() * 3 });
    }
  }

  finish(delay = 700) {
    if (this.done) return;
    this.done = true; this.afterEnd = delay;
    this.unbind();
    const ms = Math.round(this.t * 1000);
    setTimeout(() => this.opts.onEnd && this.opts.onEnd({ score: this.score, ms }), delay);
  }

  stop() { this.done = true; this.afterEnd = 0; cancelAnimationFrame(this.raf); this.unbind(); }

  draw() {
    const ctx = this.cv.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
    this.g.draw(ctx, this.W, this.H);
    for (const f of this.fx) {
      const a = 1 - f.age / f.life;
      ctx.globalAlpha = Math.max(0, a);
      if (f.kind === 'txt') text(ctx, f.text, f.x, f.y, 20 * this.k + 4, f.color, 900);
      else { ctx.fillStyle = f.color; ctx.fillRect(f.x - f.s, f.y - f.s / 2, f.s * 2, f.s); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------
const IMPL = {
  // 풍선 팡팡: 떠오르는 풍선 터뜨리기
  balloon(G) {
    const list = []; let spawn = 0.4; let combo = 0;
    const COLS = ['#E83217', '#FF8A5C', '#2F6BFF', '#22A86B', '#8E5CF7', '#F5B82E', '#FF6FA8'];
    return {
      step(dt) {
        const k = G.k;
        spawn -= dt;
        if (spawn <= 0) {
          spawn = lerp(0.62, 0.26, G.t / 30) * (0.7 + G.rand() * 0.6);
          const r0 = G.rand();
          const kind = G.t > 3 && r0 < 0.13 ? 'bomb' : r0 > 0.94 ? 'gold' : 'n';
          const r = (kind === 'gold' ? 20 : 24 + G.rand() * 8) * k;
          list.push({ x: r + G.rand() * (G.W - r * 2), y: G.H + r, r, vy: -(70 + G.rand() * 50 + G.t * 4.5) * k * (kind === 'gold' ? 1.35 : 1), kind, col: COLS[Math.floor(G.rand() * COLS.length)], ph: G.rand() * 6, pop: 0 });
        }
        for (const b of list) { b.y += b.vy * dt; b.ph += dt * 2; if (b.pop) b.pop += dt; }
        for (let i = list.length - 1; i >= 0; i--) {
          const b = list[i];
          if (b.pop > 0.2) list.splice(i, 1);
          else if (b.y < -b.r * 2) { if (b.kind !== 'bomb' && !b.pop) combo = 0; list.splice(i, 1); }
        }
      },
      down(x, y) {
        for (let i = list.length - 1; i >= 0; i--) {
          const b = list[i];
          if (b.pop) continue;
          const bx = b.x + Math.sin(b.ph) * 6 * G.k;
          if (Math.hypot(x - bx, y - b.y) < b.r * 1.15) {
            b.pop = 0.001;
            if (b.kind === 'bomb') { combo = 0; G.add(-50, bx, b.y); G.shake = 1; play('bomb'); G.burst(bx, b.y, ['#2B2B33', '#5A5F6B', '#F5B82E'], 16); }
            else { const base = b.kind === 'gold' ? 30 : 10; G.add(base + Math.min(combo, 10), bx, b.y); combo++; play('pop'); G.burst(bx, b.y, b.kind === 'gold' ? ['#F5B82E', '#FFE08A', '#FFFFFF'] : [b.col, '#FFFFFF'], 10); }
            return;
          }
        }
      },
      draw(ctx, W, H) {
        bg(ctx, W, H, '#EAF4FF', '#FFFFFF');
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (const [cx, cy, s] of [[0.2, 0.18, 1], [0.75, 0.32, 0.8], [0.4, 0.6, 0.7]]) { ctx.beginPath(); ctx.ellipse(W * cx, H * cy, 40 * s * G.k, 14 * s * G.k, 0, 0, Math.PI * 2); ctx.ellipse(W * cx + 18 * s, H * cy - 8 * s, 22 * s * G.k, 12 * s * G.k, 0, 0, Math.PI * 2); ctx.fill(); }
        for (const b of list) {
          const bx = b.x + Math.sin(b.ph) * 6 * G.k;
          const s = b.pop ? 1 + b.pop * 3 : 1;
          ctx.globalAlpha = b.pop ? Math.max(0, 1 - b.pop * 5) : 1;
          ctx.strokeStyle = 'rgba(80,80,90,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, b.y + b.r); ctx.quadraticCurveTo(bx - 6, b.y + b.r * 1.8, bx + 2, b.y + b.r * 2.6); ctx.stroke();
          if (b.kind === 'bomb') {
            ctx.fillStyle = '#2B2B33'; ctx.beginPath(); ctx.arc(bx, b.y, b.r * s, 0, Math.PI * 2); ctx.fill();
            text(ctx, '💣', bx, b.y + 1, b.r * 1.1, '#000');
          } else {
            const col = b.kind === 'gold' ? '#F5B82E' : b.col;
            const g = ctx.createRadialGradient(bx - b.r * 0.35, b.y - b.r * 0.4, 2, bx, b.y, b.r * 1.2);
            g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.25, col); g.addColorStop(1, col);
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, b.y, b.r * 0.9 * s, b.r * s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(bx - 4, b.y + b.r); ctx.lineTo(bx + 4, b.y + b.r); ctx.lineTo(bx, b.y + b.r - 5); ctx.fill();
            if (b.kind === 'gold') text(ctx, '★', bx, b.y, b.r * 0.9, '#FFFFFF');
          }
          ctx.globalAlpha = 1;
        }
        if (combo >= 3) text(ctx, `${combo} 콤보!`, W / 2, 26, 18 * G.k + 4, RED, 900);
      },
    };
  },

  // 케이크 쌓기: 움직이는 층을 내려놓아 높이 쌓기
  stack(G) {
    const LH = 24 * G.k;
    const COLS = ['#FFF1DE', '#FFC9C2', '#8B5A3C', '#FFE08A', '#CDEBDC', '#F5B5CF'];
    const baseW = G.W * 0.56;
    const layers = [{ x: (G.W - baseW) / 2, w: baseW }];
    let cur = null; let dir = 1; let combo = 0; let cam = 0; const debris = [];
    let dropping = null;
    const next = () => {
      const top = layers[layers.length - 1];
      dir = layers.length % 2 ? 1 : -1;
      const speed = Math.min(430, 130 + layers.length * 7) * G.k;
      cur = { x: dir > 0 ? -top.w : G.W, w: top.w, speed };
    };
    next();
    const yOf = (i) => G.H - 70 * G.k - (i + 1) * LH + cam;
    return {
      step(dt) {
        if (cur) {
          cur.x += cur.speed * dir * dt;
          if (cur.x > G.W - cur.w * 0.15) { cur.x = G.W - cur.w * 0.15; dir = -1; }
          if (cur.x < -cur.w * 0.85) { cur.x = -cur.w * 0.85; dir = 1; }
        }
        const want = Math.max(0, (layers.length - 9) * LH);
        cam += (want - cam) * Math.min(1, dt * 5);
        for (const d of debris) { d.vy += 900 * dt; d.y += d.vy * dt; d.rot += d.vr * dt; }
        while (debris.length && debris[0].y > G.H + 200) debris.shift();
        if (dropping) { dropping.vy += 900 * dt; dropping.y += dropping.vy * dt; }
      },
      down() {
        if (!cur || G.done) return;
        const top = layers[layers.length - 1];
        const a = Math.max(cur.x, top.x); const b = Math.min(cur.x + cur.w, top.x + top.w);
        const over = b - a;
        const y = yOf(layers.length);
        if (over <= 2) { dropping = { x: cur.x, w: cur.w, y, vy: 0, c: COLS[layers.length % COLS.length] }; cur = null; play('wrong'); G.finish(900); return; }
        const diff = Math.abs(cur.x - top.x);
        if (diff < 5 * G.k) {
          combo++;
          layers.push({ x: top.x, w: top.w, perfect: 0.5 });
          G.add(10 + Math.min(combo, 5) * 5, G.W / 2, y - 10, combo > 1 ? `딱 맞아요! +${10 + Math.min(combo, 5) * 5}` : undefined);
          playNote(523 + Math.min(combo, 8) * 60, 0.15);
        } else {
          combo = 0;
          const c = COLS[layers.length % COLS.length];
          if (cur.x < a) debris.push({ x: cur.x, w: a - cur.x, y, vy: 0, rot: 0, vr: -2, c });
          if (cur.x + cur.w > b) debris.push({ x: b, w: cur.x + cur.w - b, y, vy: 0, rot: 0, vr: 2, c });
          layers.push({ x: a, w: over });
          G.add(10, G.W / 2, y - 10);
          play('pop');
          if (over < 6) { cur = null; G.finish(900); return; }
        }
        next();
      },
      key(k, down, rep) { if (down && !rep && (k === ' ' || k === 'Enter')) { this.down(); return true; } return false; },
      draw(ctx, W, H) {
        bg(ctx, W, H, '#FFF8F1', '#FFFFFF');
        // 접시
        const py = G.H - 70 * G.k + cam;
        ctx.fillStyle = '#E3E1DE'; ctx.beginPath(); ctx.ellipse(W / 2, py + 6, baseW * 0.62, 10 * G.k, 0, 0, Math.PI * 2); ctx.fill();
        const drawLayer = (x, y, w, c, i, glow) => {
          rr(ctx, x, y, w, LH - 2, 5);
          ctx.fillStyle = c; ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(x + 3, y + 2, w - 6, 4);
          ctx.fillStyle = i % 2 ? 'rgba(232,50,23,0.55)' : 'rgba(255,255,255,0.8)';
          for (let dx = 8; dx < w - 6; dx += 14) { ctx.beginPath(); ctx.arc(x + dx, y + LH * 0.62, 2, 0, Math.PI * 2); ctx.fill(); }
          if (glow) { ctx.strokeStyle = `rgba(245,184,46,${glow * 2})`; ctx.lineWidth = 3; rr(ctx, x - 2, y - 2, w + 4, LH + 2, 6); ctx.stroke(); }
        };
        layers.forEach((L, i) => { if (L.perfect) L.perfect = Math.max(0, L.perfect - 0.016); drawLayer(L.x, yOf(i), L.w, i === 0 ? '#F4EEE6' : COLS[i % COLS.length], i, L.perfect); });
        if (cur) drawLayer(cur.x, yOf(layers.length), cur.w, COLS[layers.length % COLS.length], layers.length);
        for (const d of debris) { ctx.save(); ctx.translate(d.x + d.w / 2, d.y + LH / 2); ctx.rotate(d.rot); ctx.fillStyle = d.c; ctx.fillRect(-d.w / 2, -LH / 2, d.w, LH - 2); ctx.restore(); }
        if (dropping) { ctx.fillStyle = dropping.c; ctx.fillRect(dropping.x, dropping.y, dropping.w, LH - 2); }
        // 맨 위 촛불
        const top = layers[layers.length - 1];
        const ty = yOf(layers.length - 1);
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(top.x + top.w / 2 - 2, ty - 16, 4, 16);
        ctx.fillStyle = '#FFB020'; ctx.beginPath(); ctx.ellipse(top.x + top.w / 2, ty - 20, 3, 5 + Math.sin(G.t * 12) * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        text(ctx, `${layers.length - 1}층`, 18, 24, 16 * G.k + 4, '#2B2321', 900, 'left');
        if (!G.done && layers.length < 3) text(ctx, '화면을 눌러 내려놓아요', W / 2, H - 28 * G.k, 14 * G.k + 3, '#8A8590', 700);
      },
    };
  },

  // 리듬 파티: 세 줄 음표
  rhythm(G) {
    const notes = []; const BEAT = 0.5; const TRAVEL = 1.5;
    for (let t = 2; t < 30.2; t += BEAT) {
      const r = G.rand();
      if (r < 0.78) {
        const lane = Math.floor(G.rand() * 3);
        notes.push({ t, lane });
        if (G.rand() < 0.12) notes.push({ t, lane: (lane + 1 + Math.floor(G.rand() * 2)) % 3 });
      }
      if (t > 8 && G.rand() < 0.22) notes.push({ t: t + BEAT / 2, lane: Math.floor(G.rand() * 3) });
    }
    notes.sort((a, b) => a.t - b.t);
    let combo = 0; let judge = null; const press = [0, 0, 0];
    const FREQ = [523, 659, 784];
    const COL = ['#E83217', '#2F6BFF', '#22A86B'];
    const laneW = () => G.W / 3;
    const hitY = () => G.H - 108 * G.k;
    const hit = (lane) => {
      press[lane] = 0.12;
      const now = G.t;
      let best = null;
      for (const n of notes) { if (n.done || n.lane !== lane) continue; const d = Math.abs(n.t - now); if (d < 0.17 && (!best || d < Math.abs(best.t - now))) best = n; if (n.t > now + 0.2) break; }
      if (!best) { combo = 0; judge = { k: '빗나감', c: '#8A8590', t: 0 }; play('miss'); return; }
      best.done = true;
      const d = Math.abs(best.t - now);
      const x = laneW() * lane + laneW() / 2;
      if (d < 0.065) { G.add(30 + Math.min(combo, 20), x, hitY() - 30); judge = { k: '퍼펙트', c: '#E0A100', t: 0 }; }
      else { G.add(15 + Math.floor(Math.min(combo, 20) / 2), x, hitY() - 30); judge = { k: '좋아요', c: COL[lane], t: 0 }; }
      combo++;
      playNote(FREQ[lane], 0.18);
      G.burst(x, hitY(), [COL[lane], '#FFFFFF'], 6);
    };
    return {
      step(dt) {
        for (let i = 0; i < 3; i++) press[i] = Math.max(0, press[i] - dt);
        if (judge) judge.t += dt;
        for (const n of notes) if (!n.done && n.t < G.t - 0.17) { n.done = true; n.miss = true; combo = 0; judge = { k: '놓쳤어요', c: '#8A8590', t: 0 }; }
        if (G.t > 31.5 && notes.every((n) => n.done)) G.finish(600);
      },
      down(x, y) { hit(clamp(Math.floor(x / laneW()), 0, 2)); },
      key(k, down, rep) {
        if (!down || rep) return false;
        const map = { a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, arrowleft: 0, arrowdown: 1, arrowright: 2, 1: 0, 2: 1, 3: 2 };
        const lane = map[k.toLowerCase()];
        if (lane === undefined) return false;
        hit(lane); return true;
      },
      draw(ctx, W, H) {
        bg(ctx, W, H, '#F7F3FF', '#FFFFFF');
        const lw = laneW(); const hy = hitY();
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(142,92,247,0.05)' : 'rgba(142,92,247,0.02)'; ctx.fillRect(i * lw, 0, lw, H);
          if (press[i]) { ctx.fillStyle = `rgba(${i === 0 ? '232,50,23' : i === 1 ? '47,107,255' : '34,168,107'},${press[i] * 1.2})`; ctx.fillRect(i * lw, 0, lw, H); }
        }
        ctx.fillStyle = '#2B2321'; ctx.fillRect(0, hy - 2, W, 4);
        for (const n of notes) {
          if (n.done && !n.miss) continue;
          const y = hy - ((n.t - G.t) / TRAVEL) * (hy + 30);
          if (y < -30 || y > H + 30) continue;
          const x = n.lane * lw + lw / 2;
          ctx.globalAlpha = n.miss ? 0.25 : 1;
          rr(ctx, x - lw * 0.32, y - 11 * G.k, lw * 0.64, 22 * G.k, 11 * G.k); ctx.fillStyle = COL[n.lane]; ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - lw * 0.24, y - 6 * G.k, lw * 0.48, 3);
          ctx.globalAlpha = 1;
        }
        // 아래 버튼
        for (let i = 0; i < 3; i++) {
          const x = i * lw + 8; const y = H - 84 * G.k; const w = lw - 16; const hh = 70 * G.k;
          rr(ctx, x, y + (press[i] ? 3 : 0), w, hh, 16); ctx.fillStyle = press[i] ? COL[i] : '#FFFFFF'; ctx.fill();
          ctx.strokeStyle = COL[i]; ctx.lineWidth = 3; ctx.stroke();
          text(ctx, ['♪', '♫', '♬'][i], x + w / 2, y + hh / 2 + (press[i] ? 3 : 0), 26 * G.k + 4, press[i] ? '#FFFFFF' : COL[i], 900);
        }
        if (judge && judge.t < 0.6) text(ctx, judge.k, W / 2, hy - 70 * G.k, 22 * G.k + 4, judge.c, 900);
        if (combo >= 4) text(ctx, `${combo} 콤보`, W / 2, 28, 16 * G.k + 4, RED, 900);
        if (G.t < 2) text(ctx, '음표가 검은 선에 닿을 때 눌러요', W / 2, H * 0.4, 15 * G.k + 3, '#6A6470', 700);
      },
    };
  },

  // 짝꿍 카드
  memory(G) {
    const FACES = ['🎂', '🎈', '🎁', '🥂', '🍕', '🎤', '🐶', '⭐'];
    const deck = [...FACES, ...FACES].map((f) => ({ f, open: 0, up: false, got: false }));
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(G.rand() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    let first = null; let lock = 0; let flips = 0; let pairs = 0;
    const cell = () => { const s = Math.min(G.W / 4, (G.H - 60) / 4); return { s, ox: (G.W - s * 4) / 2, oy: 50 + (G.H - 60 - s * 4) / 2 }; };
    const scoreNow = () => clamp(Math.round(1000 - Math.max(0, flips - 16) * 14 - G.t * 6), 100, 1000);
    return {
      step(dt) {
        for (const c of deck) c.open += ((c.up || c.got ? 1 : 0) - c.open) * Math.min(1, dt * 14);
        if (lock > 0) { lock -= dt; if (lock <= 0) { for (const c of deck) if (c.up && !c.got) c.up = false; first = null; } }
      },
      timeUp() { G.set(pairs * 40); G.finish(); },
      down(x, y) {
        if (lock > 0) return;
        const { s, ox, oy } = cell();
        const cx = Math.floor((x - ox) / s); const cy = Math.floor((y - oy) / s);
        if (cx < 0 || cy < 0 || cx > 3 || cy > 3) return;
        const c = deck[cy * 4 + cx];
        if (c.up || c.got) return;
        c.up = true; flips++;
        play('click');
        if (!first) { first = c; return; }
        if (first.f === c.f) {
          first.got = c.got = true; first = null; pairs++;
          play('correct');
          G.burst(ox + cx * s + s / 2, oy + cy * s + s / 2, ['#F5B82E', RED, '#FFFFFF'], 12);
          G.set(pairs === 8 ? scoreNow() : pairs * 40);
          if (pairs === 8) G.finish(900);
        } else { lock = 0.65; }
      },
      draw(ctx, W, H) {
        bg(ctx, W, H, '#F2F6FF', '#FFFFFF');
        const { s, ox, oy } = cell();
        text(ctx, `뒤집은 횟수 ${flips}`, W / 2, 26, 14 * G.k + 3, '#5A5F6B', 700);
        deck.forEach((c, i) => {
          const x = ox + (i % 4) * s + 5; const y = oy + Math.floor(i / 4) * s + 5; const w = s - 10;
          const o = c.open; const sx = Math.abs(Math.cos(o * Math.PI));
          ctx.save(); ctx.translate(x + w / 2, y + w / 2); ctx.scale(Math.max(0.05, sx), 1);
          rr(ctx, -w / 2, -w / 2, w, w, 12);
          if (o < 0.5) { ctx.fillStyle = '#2F6BFF'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = -w; k < w; k += 10) { ctx.fillRect(k, -w / 2, 4, w); } text(ctx, 'S', 0, 2, w * 0.36, 'rgba(255,255,255,0.9)', 900); }
          else { ctx.fillStyle = c.got ? '#FFF6DA' : '#FFFFFF'; ctx.fill(); ctx.strokeStyle = c.got ? '#F5B82E' : '#D7DBE6'; ctx.lineWidth = 2; ctx.stroke(); emoji(ctx, c.f, 0, 2, w * 0.5); }
          ctx.restore();
        });
      },
    };
  },

  // 간식 받기 (내 펫이 받아요)
  catch(G) {
    const GOOD = [['🦴', 10], ['🐟', 10], ['🍖', 15], ['🧁', 30]];
    const BAD = ['🧅', '🍫'];
    const items = []; let spawn = 0.6; let hearts = 3; let px = G.W / 2; let target = px; let dir = 0; let joy = 0; const keys = new Set(); let hurt = 0;
    const petY = () => G.H - 54 * G.k;
    const pet = G.opts.pet || { kind: 'dog', color: 0, lv: 1, acc: {} };
    return {
      step(dt) {
        spawn -= dt;
        if (spawn <= 0) {
          spawn = lerp(0.85, 0.34, G.t / 40) * (0.7 + G.rand() * 0.6);
          const bad = G.t > 2 && G.rand() < lerp(0.18, 0.3, G.t / 40);
          const g = GOOD[G.rand() < 0.07 ? 3 : Math.floor(G.rand() * 3)];
          items.push({ x: 24 + G.rand() * (G.W - 48), y: -20, vy: (150 + G.rand() * 70 + G.t * 6) * G.k, ch: bad ? BAD[Math.floor(G.rand() * 2)] : g[0], pts: bad ? -30 : g[1], rot: G.rand() * 6 });
        }
        if (keys.has('l')) target = px - 30 * G.k;
        if (keys.has('r')) target = px + 30 * G.k;
        target = clamp(target, 26, G.W - 26);
        const want = target - px;
        const nx = px + Math.sign(want) * Math.min(Math.abs(want), 520 * G.k * dt, Math.abs(want) * Math.min(1, dt * 18) + 2);
        dir = nx > px + 0.5 ? 0 : nx < px - 0.5 ? 1 : dir;
        px = nx;
        joy = Math.max(0, joy - dt); hurt = Math.max(0, hurt - dt);
        const py = petY();
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          it.y += it.vy * dt; it.rot += dt * 2;
          if (it.y > py - 34 * G.k && it.y < py + 4 && Math.abs(it.x - px) < 34 * G.k) {
            items.splice(i, 1);
            if (it.pts < 0) { hearts--; hurt = 0.6; G.shake = 0.8; play('wrong'); G.add(it.pts, px, py - 50); if (hearts <= 0) G.finish(900); }
            else { G.add(it.pts, px, py - 50); joy = 0.5; play(it.pts >= 30 ? 'coin' : 'pop'); }
            continue;
          }
          if (it.y > G.H + 30) items.splice(i, 1);
        }
      },
      down(x) { target = x; },
      move(x, y, down) { if (down) target = x; },
      key(k, down) {
        const m = { arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r' }[k.toLowerCase()];
        if (!m) return false;
        if (down) keys.add(m); else keys.delete(m);
        return true;
      },
      draw(ctx, W, H) {
        bg(ctx, W, H, '#F0FAF4', '#FFFFFF');
        ctx.fillStyle = '#DDEFE2'; ctx.fillRect(0, petY() + 6, W, H);
        for (const it of items) { ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(Math.sin(it.rot) * 0.4); emoji(ctx, it.ch, 0, 0, 30 * G.k + 4); ctx.restore(); }
        ctx.save(); ctx.translate(px, petY());
        ctx.fillStyle = 'rgba(30,20,40,0.15)'; ctx.beginPath(); ctx.ellipse(0, 2, 22 * G.k, 6 * G.k, 0, 0, Math.PI * 2); ctx.fill();
        if (hurt > 0 && Math.floor(hurt * 20) % 2) ctx.globalAlpha = 0.4;
        drawPet(ctx, pet, { dir, t: G.t, walk: Math.abs(target - px) > 2, phase: G.t * 14, joy: joy > 0, scale: 1.9 * G.k });
        ctx.restore();
        text(ctx, '❤️'.repeat(Math.max(0, hearts)) + '🤍'.repeat(Math.max(0, 3 - hearts)), W - 14, 24, 16 * G.k + 3, '#000', 400, 'right');
        if (G.t < 2.5) text(ctx, '좌우로 끌어서 간식을 받아요. 🧅🍫는 피하기!', W / 2, H * 0.42, 14 * G.k + 3, '#4A5A50', 700);
      },
    };
  },

  // 반응 속도
  reaction(G) {
    let round = 0; let state = 'wait'; let goAt = 0; let waitUntil = 0; const rts = []; let msg = ''; let msgT = 0; let showT = 0;
    const arm = () => { state = 'wait'; waitUntil = G.t + 1.2 + G.rand() * 2.3; };
    arm();
    return {
      step(dt) {
        msgT = Math.max(0, msgT - dt);
        if (state === 'wait' && G.t >= waitUntil) { state = 'go'; goAt = G.t; play('tick'); }
        if (state === 'show') { showT -= dt; if (showT <= 0) { if (round >= 5) { const avg = rts.reduce((a, b) => a + b, 0) / rts.length; G.set(Math.round((600 - avg) * 2.6)); G.finish(300); state = 'end'; } else arm(); } }
      },
      down() {
        if (state === 'wait') { msg = '너무 빨랐어요! 초록색일 때 눌러요'; msgT = 1.2; play('miss'); arm(); return; }
        if (state === 'go') {
          const rt = (G.t - goAt) * 1000;
          if (rt < 100) { msg = '너무 빨랐어요!'; msgT = 1; arm(); return; }
          rts.push(Math.min(1000, rt)); round++; state = 'show'; showT = 0.9;
          msg = `${Math.round(rt)}ms`; msgT = 0.9; play('pop');
          const avg = rts.reduce((a, b) => a + b, 0) / rts.length;
          G.set(Math.round((600 - avg) * 2.6));
        }
      },
      key(k, down, rep) { if (down && !rep && (k === ' ' || k === 'Enter')) { this.down(); return true; } return false; },
      draw(ctx, W, H) {
        const col = state === 'go' ? '#22A86B' : state === 'show' ? '#FFFFFF' : '#FCEDEA';
        ctx.fillStyle = col; ctx.fillRect(0, 0, W, H);
        if (state === 'go') text(ctx, '지금!', W / 2, H / 2, 54 * G.k + 6, '#FFFFFF', 900);
        else if (state === 'wait') { text(ctx, '초록색이 되면', W / 2, H / 2 - 22, 24 * G.k + 4, RED, 900); text(ctx, '바로 눌러요', W / 2, H / 2 + 14, 24 * G.k + 4, RED, 900); }
        if (msgT > 0) text(ctx, msg, W / 2, H / 2 + (state === 'show' ? 0 : 80), (state === 'show' ? 40 : 18) * G.k + 4, state === 'show' ? '#2B2321' : '#6A6470', 900);
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(W / 2 - 48 + i * 24, H - 40 * G.k, 7, 0, Math.PI * 2); ctx.fillStyle = i < round ? RED : 'rgba(0,0,0,0.12)'; ctx.fill(); }
        if (rts.length) text(ctx, `평균 ${Math.round(rts.reduce((a, b) => a + b, 0) / rts.length)}ms`, W / 2, H - 70 * G.k, 14 * G.k + 3, '#6A6470', 700);
      },
    };
  },

  // 숫자 터치 1~25
  numbers(G) {
    const nums = Array.from({ length: 25 }, (_, i) => i + 1);
    for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(G.rand() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
    let next = 1; let penalty = 0; let wrong = { i: -1, t: 0 }; const hitAt = {};
    const cell = () => { const s = Math.min(G.W / 5, (G.H - 70) / 5); return { s, ox: (G.W - s * 5) / 2, oy: 60 + (G.H - 70 - s * 5) / 2 }; };
    return {
      step(dt) { wrong.t = Math.max(0, wrong.t - dt); },
      timeUp() { G.set((next - 1) * 10); G.finish(); },
      down(x, y) {
        const { s, ox, oy } = cell();
        const cx = Math.floor((x - ox) / s); const cy = Math.floor((y - oy) / s);
        if (cx < 0 || cy < 0 || cx > 4 || cy > 4) return;
        const i = cy * 5 + cx; const n = nums[i];
        if (n < next) return;
        if (n === next) {
          hitAt[n] = G.t; next++;
          playNote(392 + next * 18, 0.08, 'square');
          if (next > 25) { const el = G.t + penalty; G.set(Math.round(1200 - el * 30)); G.burst(G.W / 2, G.H / 2, [RED, '#F5B82E', '#2F6BFF'], 20); G.finish(700); }
          else G.set((next - 1) * 10);
        } else { penalty += 1; wrong = { i, t: 0.35 }; play('miss'); G.shake = 0.4; }
      },
      draw(ctx, W, H) {
        bg(ctx, W, H, '#EEFBFD', '#FFFFFF');
        const { s, ox, oy } = cell();
        text(ctx, next <= 25 ? `다음 숫자 ${next}` : '완료!', W / 2, 24, 18 * G.k + 4, '#06869E', 900);
        text(ctx, `${(G.t + penalty).toFixed(1)}초${penalty ? ` (+${penalty})` : ''}`, W / 2, 48, 13 * G.k + 3, '#6A6470', 700);
        nums.forEach((n, i) => {
          const x = ox + (i % 5) * s + 4; const y = oy + Math.floor(i / 5) * s + 4; const w = s - 8;
          rr(ctx, x, y, w, w, 10);
          const done = n < next;
          ctx.fillStyle = wrong.t > 0 && wrong.i === i ? '#FFD9D2' : done ? '#E4F6F9' : '#FFFFFF'; ctx.fill();
          ctx.strokeStyle = done ? '#BDE7EE' : '#06B6D4'; ctx.lineWidth = 2; ctx.stroke();
          if (!done) text(ctx, String(n), x + w / 2, y + w / 2 + 1, w * 0.42, '#0B5563', 900);
        });
      },
    };
  },

  // 깜짝 상자
  whack(G) {
    const holes = Array.from({ length: 9 }, () => null); let spawn = 0.5; let combo = 0;
    const cell = () => { const s = Math.min(G.W / 3, (G.H - 60) / 3); return { s, ox: (G.W - s * 3) / 2, oy: 50 + (G.H - 60 - s * 3) / 2 }; };
    return {
      step(dt) {
        spawn -= dt;
        if (spawn <= 0) {
          spawn = lerp(0.7, 0.32, G.t / 30) * (0.7 + G.rand() * 0.6);
          const free = holes.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
          if (free.length) {
            const i = free[Math.floor(G.rand() * free.length)];
            const r = G.rand();
            const kind = r < 0.15 ? 'cake' : r > 0.94 ? 'star' : 'pop';
            holes[i] = { kind, ch: kind === 'cake' ? '🎂' : kind === 'star' ? '⭐' : G.rand() < 0.5 ? '🎉' : '🎊', t: 0, life: lerp(1.15, 0.6, G.t / 30) * (kind === 'star' ? 0.8 : 1), hit: 0 };
          }
        }
        holes.forEach((v, i) => {
          if (!v) return;
          v.t += dt;
          if (v.hit) { v.hit += dt; if (v.hit > 0.25) holes[i] = null; return; }
          if (v.t > v.life) { if (v.kind !== 'cake') combo = 0; holes[i] = null; }
        });
      },
      down(x, y) {
        const { s, ox, oy } = cell();
        const cx = Math.floor((x - ox) / s); const cy = Math.floor((y - oy) / s);
        if (cx < 0 || cy < 0 || cx > 2 || cy > 2) return;
        const i = cy * 3 + cx; const v = holes[i];
        if (!v || v.hit) return;
        v.hit = 0.001;
        const px = ox + cx * s + s / 2; const py = oy + cy * s + s * 0.4;
        if (v.kind === 'cake') { combo = 0; G.add(-30, px, py); G.shake = 0.7; play('wrong'); }
        else { G.add((v.kind === 'star' ? 40 : 15) + Math.min(combo, 10), px, py); combo++; play(v.kind === 'star' ? 'coin' : 'pop'); G.burst(px, py, [RED, '#F5B82E', '#2F6BFF', '#22A86B'], 10); }
      },
      draw(ctx, W, H) {
        bg(ctx, W, H, '#FFF2F7', '#FFFFFF');
        const { s, ox, oy } = cell();
        if (combo >= 3) text(ctx, `${combo} 콤보!`, W / 2, 26, 18 * G.k + 4, RED, 900);
        holes.forEach((v, i) => {
          const x = ox + (i % 3) * s; const y = oy + Math.floor(i / 3) * s;
          const bw = s * 0.7; const bx = x + (s - bw) / 2; const by = y + s * 0.5;
          // 튀어나온 것 (상자 뒤)
          if (v) {
            const k = v.hit ? 1 - v.hit * 4 : Math.min(1, v.t * 7) * (v.t > v.life - 0.12 ? Math.max(0, (v.life - v.t) / 0.12) : 1);
            ctx.save(); ctx.beginPath(); ctx.rect(x, y - s, s, s * 0.5 + s + 2); ctx.clip();
            emoji(ctx, v.ch, x + s / 2, by - k * s * 0.32 + 4, s * 0.42);
            ctx.restore();
          }
          rr(ctx, bx, by, bw, s * 0.36, 8); ctx.fillStyle = ['#FF6FA8', '#2F6BFF', '#F5B82E', '#22A86B', '#8E5CF7', RED][i % 6]; ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(bx + bw / 2 - 4, by, 8, s * 0.36);
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(bx, by, bw, 5);
        });
      },
    };
  },
};

/** 결과 화면에 쓸 등급 색 */
export const GRADE_COLOR = { S: '#E0A100', A: RED, B: '#2F6BFF', C: '#8A8590' };
