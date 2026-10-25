// 공간 그림: 테마별 바닥·벽·소품을 코드로 그립니다. (이미지 파일 없이 가볍게)
import { iso, HW, HH, WALL_H } from './iso.js';
import { ITEMS } from '../shared/catalog.js';

// ---------- 색 도구 ----------
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export function shade(hex, amt) { const [r, g, b] = hexRgb(hex); return amt >= 0 ? rgbHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt) : rgbHex(r * (1 + amt), g * (1 + amt), b * (1 + amt)); }
export function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
export const tone = (base) => ({ top: shade(base, 0.12), left: base, right: shade(base, -0.16) });

// 같은 결과가 나오는 난수 (그림이 매번 바뀌지 않게)
export function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- 그리기 도구 ----------
export function path(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
export function fillPoly(ctx, pts, color) { path(ctx, pts); ctx.fillStyle = color; ctx.fill(); }
export function strokePoly(ctx, pts, color, w = 1) { path(ctx, pts); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); }

// 바닥 위의 상자. x0~x1, y0~y1(타일), z0~z1(px)
export function box(ctx, x0, y0, x1, y1, z0, z1, c, line) {
  const A = iso(x0, y0, z1), B = iso(x1, y0, z1), C = iso(x1, y1, z1), D = iso(x0, y1, z1);
  const Bl = iso(x1, y0, z0), Cl = iso(x1, y1, z0), Dl = iso(x0, y1, z0);
  fillPoly(ctx, [B, C, Cl, Bl], c.right);
  fillPoly(ctx, [D, C, Cl, Dl], c.left);
  fillPoly(ctx, [A, B, C, D], c.top);
  if (line) { ctx.lineJoin = 'round'; strokePoly(ctx, [A, B, C, D], line, 0.8); }
}

// 원기둥 (바닥 위 중심 cx, cy / 반지름 r 타일)
export function cyl(ctx, cx, cy, r, z0, z1, c) {
  const [sx, sy0] = iso(cx, cy, z0); const [, sy1] = iso(cx, cy, z1);
  const rx = r * HW * Math.SQRT2; const ry = r * HH * Math.SQRT2;
  const g = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0);
  g.addColorStop(0, c.left); g.addColorStop(0.55, shade(c.left, 0.06)); g.addColorStop(1, c.right);
  ctx.beginPath();
  ctx.moveTo(sx - rx, sy1); ctx.lineTo(sx - rx, sy0);
  ctx.ellipse(sx, sy0, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(sx + rx, sy1);
  ctx.ellipse(sx, sy1, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx, sy1, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = c.top; ctx.fill();
}

export function shadow(ctx, cx, cy, r, a = 0.18) {
  const [sx, sy] = iso(cx, cy);
  ctx.beginPath(); ctx.ellipse(sx, sy, r * HW * 1.25, r * HH * 1.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(30,20,40,${a})`; ctx.fill();
}

// 벽 위의 사각형: 왼쪽 벽(x=0)은 y 범위, 오른쪽 벽(y=0)은 x 범위
export const wallPt = (side, a, z, off = 0) => (side === 'L' ? iso(off, a, z) : iso(a, off, z));
export function wallRect(ctx, side, a0, a1, z0, z1, color, off = 0) {
  fillPoly(ctx, [wallPt(side, a0, z0, off), wallPt(side, a1, z0, off), wallPt(side, a1, z1, off), wallPt(side, a0, z1, off)], color);
}
export function wallFrame(ctx, side, a0, a1, z0, z1, frame, inner, pad = 0.08) {
  wallRect(ctx, side, a0, a1, z0, z1, frame);
  wallRect(ctx, side, a0 + pad, a1 - pad, z0 + 4, z1 - 4, inner);
}
// 벽면을 따라 기울어진 글자
export function wallText(ctx, side, a, z, text, font, color, align = 'center') {
  const [sx, sy] = wallPt(side, a, z);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.transform(1, side === 'L' ? -0.5 : 0.5, 0, 1, 0, 0);
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
// 바닥에 눕힌 글자
export function floorText(ctx, x, y, text, font, color) {
  const [sx, sy] = iso(x, y);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.transform(1, 0.5, -1, 0.5, 0, 0);
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
export function bulbs(ctx, side, a0, a1, z, sag, colors, step = 0.45, r = 2.2) {
  ctx.beginPath();
  const n = Math.max(2, Math.round((a1 - a0) / 0.1));
  for (let i = 0; i <= n; i++) {
    const t = i / n; const a = a0 + (a1 - a0) * t; const zz = z - Math.sin(t * Math.PI) * sag;
    const [x, y] = wallPt(side, a, zz, 0.02);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(60,50,40,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
  let k = 0;
  for (let a = a0 + step / 2; a < a1; a += step) {
    const t = (a - a0) / (a1 - a0); const zz = z - Math.sin(t * Math.PI) * sag - 3;
    const [x, y] = wallPt(side, a, zz, 0.02);
    const c = colors[k++ % colors.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, rgba(c, 0.55)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- 테마 색 ----------
export const PALETTES = {
  home: {
    bg: ['#F4EFE9', '#EFE7DE'], planks: ['#E9C99F', '#E3C193', '#EDD0AA', '#E6C599'], seam: 'rgba(150,105,60,0.28)', edge: '#B98D5F',
    wallL: '#F1E2CF', wallR: '#F7ECDF', wain: '#E7D3BA', trim: '#D5B996', cap: '#FFF9F2',
    rug: '#D98B70', rug2: '#F4D9C9', sofa: '#C8664E', cushion: '#F4E3CC', wood: '#A87A52', metal: '#7C7F86',
    lights: ['#FFD27A', '#FFE7A8', '#FFC66B'], neon: '#E83217', stage: '#C79A6C', stageTop: '#D9AE7F',
  },
  rooftop: {
    bg: ['#1B2147', '#2A2459'], planks: ['#8A6B52', '#81634B', '#937359', '#7C5F48'], seam: 'rgba(40,25,15,0.35)', edge: '#5B4434',
    sky: ['#151C43', '#3A2C66', '#6A3E6E'], glass: 'rgba(170,200,255,0.10)', rail: '#C9CED8',
    rug: '#3E4A7A', rug2: '#C9CDE8', sofa: '#ECE6DA', cushion: '#34407A', wood: '#6F5440', metal: '#9AA0AE',
    lights: ['#FFD27A', '#FFE9B0', '#FFC66B'], neon: '#FF6FA8', stage: '#6F5440', stageTop: '#8A6B52',
  },
  game: {
    bg: ['#151827', '#1C1F33'], tiles: ['#262A3D', '#2A2F44'], grid: 'rgba(70,224,255,0.22)', edge: '#151826',
    wallL: '#1E2136', wallR: '#24283F', wain: '#1A1D2F', trim: '#3EE6FF', cap: '#33385A',
    rug: '#2E2459', rug2: '#FF4FA0', sofa: '#5B43D6', cushion: '#FF4FA0', wood: '#3A3F5C', metal: '#8C93AD',
    lights: ['#FF4FA0', '#3EE6FF', '#FFE65C'], neon: '#3EE6FF', stage: '#2C3150', stageTop: '#353B60',
  },
  square: {
    bg: ['#D9EEFF', '#F3F8FC'], stones: ['#ECE8E2', '#E4DFD8', '#EFECE7'], grout: 'rgba(160,150,140,0.35)', edge: '#B9B2A8',
    grass: '#9ED17E', grass2: '#86C267', hedge: '#6DB35A', wood: '#A87A52', metal: '#7C7F86',
    lights: ['#FFE7A8'], neon: '#E83217', rug: '#E83217', rug2: '#FFF',
  },
};

// ---------- 화면 배경 (방 뒤) ----------
export function paintBackdrop(ctx, w, h, theme) {
  const P = PALETTES[theme] || PALETTES.home;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (theme === 'rooftop') { g.addColorStop(0, P.sky[0]); g.addColorStop(0.6, P.sky[1]); g.addColorStop(1, P.sky[2]); }
  else { g.addColorStop(0, P.bg[0]); g.addColorStop(1, P.bg[1]); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (theme === 'rooftop') {
    const r = seeded(7);
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`; ctx.fillRect(r() * w, r() * h * 0.7, 1.2, 1.2); }
  }
  if (theme === 'square') {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const r = seeded(3);
    for (let i = 0; i < 5; i++) { const x = r() * w; const y = 30 + r() * h * 0.3; const s = 30 + r() * 40; ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.35, 0, 0, Math.PI * 2); ctx.ellipse(x + s * 0.5, y - 8, s * 0.6, s * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
  }
}

// ---------- 바닥·벽 (고정 그림) ----------
export function paintStatic(ctx, map, theme, style = {}) {
  const P = PALETTES[theme] || PALETTES.home;
  const W = map.w; const H = map.h;
  if (theme === 'square') return paintSquare(ctx, map, P);
  if (map.id === 'home') return paintHomeRoom(ctx, map, style);

  // 바닥 두께 (모형처럼 보이게)
  box(ctx, 0, 0, W, H, -12, 0, { top: P.edge, left: shade(P.edge, -0.05), right: shade(P.edge, -0.22) });
  // 바닥
  if (theme === 'game') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fillPoly(ctx, [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)], P.tiles[(x + y) % 2]);
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x++) { ctx.beginPath(); const a = iso(x, 0); const b = iso(x, H); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    for (let y = 0; y <= H; y++) { ctx.beginPath(); const a = iso(0, y); const b = iso(W, y); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    // 바닥 네온 테두리
    ctx.strokeStyle = rgba('#FF4FA0', 0.55); ctx.lineWidth = 2;
    strokePoly(ctx, [iso(0.15, 0.15), iso(W - 0.15, 0.15), iso(W - 0.15, H - 0.15), iso(0.15, H - 0.15)], rgba('#FF4FA0', 0.5), 2);
  } else {
    // 나무 판자: 집은 x 방향, 루프탑은 y 방향
    const along = theme === 'home' ? 'x' : 'y';
    const r = seeded(theme === 'home' ? 11 : 23);
    const rows = (along === 'x' ? H : W) * 2;
    for (let i = 0; i < rows; i++) {
      const a0 = i / 2; const a1 = a0 + 0.5;
      const len = along === 'x' ? W : H;
      let s = 0;
      while (s < len) {
        const e = Math.min(len, s + 1.5 + r() * 2.5);
        const col = P.planks[Math.floor(r() * P.planks.length)];
        const pts = along === 'x' ? [iso(s, a0), iso(e, a0), iso(e, a1), iso(s, a1)] : [iso(a0, s), iso(a1, s), iso(a1, e), iso(a0, e)];
        fillPoly(ctx, pts, col);
        strokePoly(ctx, pts, P.seam, 0.6);
        s = e;
      }
    }
  }

  // 벽
  if (theme === 'rooftop') paintRooftopWalls(ctx, map, P);
  else paintWalls(ctx, map, P, theme);

  // 깔개
  rug(ctx, 4.25, 4.3, 9.6, 8.4, P.rug, P.rug2, theme);            // 소파 라운지
  rug(ctx, 1.2, 5.2, 3.9, 8.8, shade(P.rug, 0.15), P.rug2, theme, 'round'); // TV 앞
  // 포토존 바닥
  const [px, py] = iso(10.9, 1.9);
  ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.5);
  ctx.beginPath(); ctx.arc(0, 0, 76, 0, Math.PI * 2); ctx.fillStyle = theme === 'game' ? rgba('#3EE6FF', 0.12) : 'rgba(255,255,255,0.35)'; ctx.fill();
  ctx.setLineDash([6, 6]); ctx.lineWidth = 2; ctx.strokeStyle = theme === 'game' ? rgba('#3EE6FF', 0.6) : rgba('#E83217', 0.45); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  floorText(ctx, 11.5, 2.9, 'PHOTO', '700 13px Pretendard, system-ui, sans-serif', theme === 'game' ? rgba('#3EE6FF', 0.75) : rgba('#E83217', 0.55));

  // 무대
  const s = map.stage;
  if (s) {
    box(ctx, s[0], s[1], s[2] + 1, s[3] + 1, 0, 10, { top: P.stageTop, left: P.stage, right: shade(P.stage, -0.18) });
    const sp = theme === 'game' ? rgba('#3EE6FF', 0.25) : 'rgba(255,255,255,0.18)';
    for (let x = s[0] + 0.5; x < s[2] + 1; x += 0.5) { const a = iso(x, s[1], 10); const b = iso(x, s[3] + 1, 10); ctx.strokeStyle = sp; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    // 무대 앞 조명
    for (let x = s[0] + 0.3; x < s[2] + 1; x += 0.55) { const [bx, by] = iso(x, s[3] + 1, 5); ctx.fillStyle = P.lights[0]; ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.fill(); }
    for (let y = s[1] + 0.3; y < s[3] + 1; y += 0.55) { const [bx, by] = iso(s[2] + 1, y, 5); ctx.fillStyle = P.lights[0]; ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.fill(); }
  }
}

function rug(ctx, x0, y0, x1, y1, c, c2, theme, kind) {
  if (kind === 'round') {
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    const [sx, sy] = iso(cx, cy);
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.5);
    const r = Math.min(x1 - x0, y1 - y0) * 0.5 * HW * 1.25;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r - 7, 0, Math.PI * 2); ctx.strokeStyle = rgba(c2, 0.55); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    return;
  }
  const pts = [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)];
  fillPoly(ctx, pts, c);
  const ins = 0.18;
  strokePoly(ctx, [iso(x0 + ins, y0 + ins), iso(x1 - ins, y0 + ins), iso(x1 - ins, y1 - ins), iso(x0 + ins, y1 - ins)], rgba(c2, theme === 'game' ? 0.8 : 0.55), theme === 'game' ? 1.6 : 1.2);
}

function paintWalls(ctx, map, P, theme) {
  const W = map.w; const H = map.h; const T = 0.16;
  // 벽 윗면 두께
  fillPoly(ctx, [iso(-T, -T, WALL_H), iso(W, -T, WALL_H), iso(W, 0, WALL_H), iso(0, 0, WALL_H)], P.cap);
  fillPoly(ctx, [iso(-T, -T, WALL_H), iso(0, 0, WALL_H), iso(0, H, WALL_H), iso(-T, H, WALL_H)], shade(P.cap, -0.04));
  // 벽 끝 단면
  fillPoly(ctx, [iso(W, -T, WALL_H), iso(W, 0, WALL_H), iso(W, 0, 0), iso(W, -T, 0)], shade(P.wallR, -0.12));
  fillPoly(ctx, [iso(-T, H, WALL_H), iso(0, H, WALL_H), iso(0, H, 0), iso(-T, H, 0)], shade(P.wallL, -0.12));
  wallRect(ctx, 'L', 0, H, 0, WALL_H, P.wallL);
  wallRect(ctx, 'R', 0, W, 0, WALL_H, P.wallR);
  // 아래쪽 판넬과 걸레받이
  wallRect(ctx, 'L', 0, H, 0, 34, P.wain); wallRect(ctx, 'R', 0, W, 0, 34, shade(P.wain, 0.04));
  wallRect(ctx, 'L', 0, H, 33, 36, P.trim); wallRect(ctx, 'R', 0, W, 33, 36, P.trim);
  wallRect(ctx, 'L', 0, H, 0, 5, shade(P.trim, -0.1)); wallRect(ctx, 'R', 0, W, 0, 5, shade(P.trim, -0.1));
  // 벽지 무늬
  ctx.lineWidth = 0.7;
  for (let a = 0.5; a < Math.max(W, H); a += 0.5) {
    if (a < H) { const p0 = iso(0, a, 40); const p1 = iso(0, a, WALL_H - 4); ctx.strokeStyle = theme === 'game' ? 'rgba(255,255,255,0.03)' : 'rgba(120,90,60,0.06)'; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
    if (a < W) { const p0 = iso(a, 0, 40); const p1 = iso(a, 0, WALL_H - 4); ctx.strokeStyle = theme === 'game' ? 'rgba(255,255,255,0.03)' : 'rgba(120,90,60,0.05)'; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
  }
  if (theme === 'game') {
    // 네온 줄
    for (const [side, len] of [['L', H], ['R', W]]) {
      wallRect(ctx, side, 0, len, WALL_H - 10, WALL_H - 7, '#FF4FA0');
      wallRect(ctx, side, 0, len, 36, 38, '#3EE6FF');
    }
  }
  paintWallDecor(ctx, map, P, theme);
}

function paintRooftopWalls(ctx, map, P) {
  const W = map.w; const H = map.h;
  // 유리벽 너머 야경: 하늘
  for (const [side, len] of [['L', H], ['R', W]]) {
    const top = wallPt(side, 0, WALL_H + 30); const bot = wallPt(side, 0, 0);
    const g = ctx.createLinearGradient(0, top[1] - 40, 0, bot[1]);
    g.addColorStop(0, P.sky[0]); g.addColorStop(0.7, P.sky[1]); g.addColorStop(1, P.sky[2]);
    fillPoly(ctx, [wallPt(side, 0, 0), wallPt(side, len, 0), wallPt(side, len, WALL_H + 30), wallPt(side, 0, WALL_H + 30)], g);
    // 도시 실루엣
    const r = seeded(side === 'L' ? 5 : 9);
    let a = 0;
    while (a < len) {
      const bw = 0.5 + r() * 1.1; const bh = 30 + r() * 70; const a1 = Math.min(len, a + bw);
      const col = r() < 0.5 ? '#232A55' : '#2B3263';
      wallRect(ctx, side, a, a1, 0, bh, col, 0);
      for (let wy = 10; wy < bh - 6; wy += 9) for (let wa = a + 0.1; wa < a1 - 0.1; wa += 0.2) if (r() < 0.35) wallRect(ctx, side, wa, wa + 0.08, wy, wy + 4, r() < 0.8 ? '#FFD98A' : '#9FD3FF', 0);
      a = a1 + r() * 0.15;
    }
  }
  // 유리와 난간
  wallRect(ctx, 'L', 0, H, 0, 46, P.glass); wallRect(ctx, 'R', 0, W, 0, 46, P.glass);
  wallRect(ctx, 'L', 0, H, 44, 48, P.rail); wallRect(ctx, 'R', 0, W, 44, 48, P.rail);
  for (let a = 0; a <= H; a += 1) wallRect(ctx, 'L', a - 0.03, a + 0.03, 0, 46, rgba(P.rail, 0.7));
  for (let a = 0; a <= W; a += 1) wallRect(ctx, 'R', a - 0.03, a + 0.03, 0, 46, rgba(P.rail, 0.7));
  // 전구 줄 (난간 위로)
  bulbs(ctx, 'R', 0.2, W - 0.2, WALL_H + 8, 16, P.lights, 0.5, 2.4);
  bulbs(ctx, 'L', 0.2, H - 0.2, WALL_H + 8, 14, P.lights, 0.5, 2.4);
  paintWallDecor(ctx, map, P, 'rooftop');
}

function paintWallDecor(ctx, map, P, theme) {
  const dark = theme !== 'home';
  // DJ 네온 사인 (왼쪽 벽, DJ 부스 위)
  wallText(ctx, 'L', 1.9, 84, 'DJ', '800 26px Pretendard, system-ui, sans-serif', theme === 'game' ? '#3EE6FF' : P.neon);
  // 빔 스크린 (왼쪽 벽)
  wallFrame(ctx, 'L', 3.05, 4.95, 44, 108, dark ? '#55597A' : '#BEB3A6', dark ? '#E8EAF4' : '#FBFAF8', 0.06);
  wallText(ctx, 'L', 4.0, 76, '같이 보기', '600 9px Pretendard, system-ui, sans-serif', 'rgba(90,90,110,0.55)');
  wallText(ctx, 'L', 4.0, 64, '곧 열려요', '500 8px Pretendard, system-ui, sans-serif', 'rgba(90,90,110,0.45)');
  // TV 화면 틀 (내용은 TV 소품이 매번 그림)
  wallFrame(ctx, 'L', 6.05, 8.95, 46, 104, '#1A1B22', '#23252F', 0.06);
  // 오른쪽 벽: 무대 배경
  if (theme === 'home') {
    wallRect(ctx, 'R', 2.05, 7.95, 36, WALL_H - 4, '#EFD8C4');
    for (let a = 2.1; a < 7.95; a += 0.32) wallRect(ctx, 'R', a, a + 0.06, 36, WALL_H - 4, 'rgba(160,110,80,0.12)');
    bulbs(ctx, 'R', 2.1, 7.9, WALL_H - 10, 10, P.lights, 0.4, 2);
  } else if (theme === 'game') {
    wallFrame(ctx, 'R', 2.4, 7.6, 42, 66, '#2E3352', '#191B2C', 0.06);
    wallText(ctx, 'R', 4.2, 54, 'GAME ON', '900 15px Pretendard, system-ui, sans-serif', '#FF4FA0');
    wallText(ctx, 'R', 6.4, 54, '▲ ● ■ ✕', '700 10px system-ui, sans-serif', '#3EE6FF');
  } else {
    bulbs(ctx, 'R', 2.1, 7.9, 92, 10, P.lights, 0.4, 2.2);
  }
  // 포토월 (오른쪽 벽 x 9~13)
  if (theme === 'rooftop') {
    wallFrame(ctx, 'R', 9.2, 12.8, 30, 112, '#2B2F55', '#3A2F66', 0.06);
  } else {
    wallRect(ctx, 'R', 9.1, 12.9, 36, 114, theme === 'game' ? '#2A1F44' : '#FBE3E0');
  }
  const r = seeded(31);
  const balloon = theme === 'game' ? ['#FF4FA0', '#3EE6FF', '#FFE65C', '#9B7BFF'] : ['#E83217', '#FFB3A8', '#FFFFFF', '#F7C04A', '#FF8A7A'];
  for (let i = 0; i < 26; i++) {
    const t = i / 25; const a = 9.25 + t * 3.5; const z = 104 - Math.sin(t * Math.PI) * 30 + (r() - 0.5) * 12;
    const [x, y] = wallPt('R', a, z, 0.02);
    const rad = 5 + r() * 4; const c = balloon[i % balloon.length];
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 1, x, y, rad);
    g.addColorStop(0, shade(c, 0.45)); g.addColorStop(1, c);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  wallText(ctx, 'R', 11.0, 64, 'PARTY', '900 22px Pretendard, system-ui, sans-serif', theme === 'game' ? '#FFE65C' : '#E83217');
  wallText(ctx, 'R', 11.0, 48, 'SSOPLE', '700 9px Pretendard, system-ui, sans-serif', theme === 'game' ? '#3EE6FF' : 'rgba(232,50,23,0.7)');
  // 작은 액자들 (홈)
  if (theme === 'home') {
    wallFrame(ctx, 'L', 5.25, 5.8, 62, 84, '#B68A5E', '#9CC8D9', 0.04);
    wallFrame(ctx, 'R', 8.25, 8.8, 70, 92, '#B68A5E', '#F2C6B8', 0.04);
    wallFrame(ctx, 'R', 0.35, 1.0, 58, 82, '#B68A5E', '#CFE4B9', 0.04);
    bulbs(ctx, 'L', 0.2, 2.9, WALL_H - 10, 8, P.lights, 0.4, 2);
  }
}

function paintSquare(ctx, map, P) {
  const W = map.w; const H = map.h;
  box(ctx, 0, 0, W, H, -12, 0, { top: P.edge, left: shade('#8FBF6E', 0), right: shade('#8FBF6E', -0.2) });
  // 잔디 테두리와 돌바닥
  fillPoly(ctx, [iso(0, 0), iso(W, 0), iso(W, H), iso(0, H)], '#D9D3CB');
  const r = seeded(17);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (let k = 0; k < 4; k++) {
      const x0 = x + (k % 2) * 0.5; const y0 = y + Math.floor(k / 2) * 0.5;
      const g = 0.02;
      fillPoly(ctx, [iso(x0 + g, y0 + g), iso(x0 + 0.5 - g, y0 + g), iso(x0 + 0.5 - g, y0 + 0.5 - g), iso(x0 + g, y0 + 0.5 - g)], P.stones[Math.floor(r() * P.stones.length)]);
    }
  }
  // 화단
  for (const [x0, y0, x1, y1] of [[13.2, 0.2, 15.8, 2.4], [0.2, 8.6, 2.2, 11.8]]) {
    box(ctx, x0, y0, x1, y1, 0, 8, tone('#CFC6B8'));
    fillPoly(ctx, [iso(x0 + 0.1, y0 + 0.1, 8), iso(x1 - 0.1, y0 + 0.1, 8), iso(x1 - 0.1, y1 - 0.1, 8), iso(x0 + 0.1, y1 - 0.1, 8)], P.grass);
    const rr = seeded(Math.round(x0 * 10 + y0));
    for (let i = 0; i < 10; i++) { const [fx, fy] = iso(x0 + 0.3 + rr() * (x1 - x0 - 0.6), y0 + 0.3 + rr() * (y1 - y0 - 0.6), 10); ctx.fillStyle = ['#FF8A7A', '#FFFFFF', '#F7C04A', '#E83217'][i % 4]; ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
  // 가운데 원형 무늬
  const [cx, cy] = iso(6, 6);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.5);
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 70 + i * 26, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(200,120,100,0.25)'; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.restore();
  // 뒤쪽 산울타리
  box(ctx, -0.5, -0.5, W, 0, 0, 22, tone(P.hedge));
  box(ctx, -0.5, 0, 0, H, 0, 22, tone(shade(P.hedge, -0.05)));
  // 레드 카펫 (입구에서 포털까지)
  fillPoly(ctx, [iso(10.15, 4.1), iso(10.85, 4.1), iso(10.85, 11.9), iso(10.15, 11.9)], rgba('#E83217', 0.85));
  floorText(ctx, 6.6, 10.4, 'SSOPLE SQUARE', '800 15px Pretendard, system-ui, sans-serif', 'rgba(232,50,23,0.35)');
  // 가로등
  for (const [lx, ly] of [[8.5, 0.6], [0.6, 7.9], [15.4, 7.4], [3.6, 11.4]]) {
    cyl(ctx, lx, ly, 0.06, 0, 74, tone('#3A3D46'));
    const [x, y] = iso(lx, ly, 78);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 14); g.addColorStop(0, 'rgba(255,236,170,0.9)'); g.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF4CC'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- 내 집 (벽지·바닥을 고를 수 있음) ----------
export function paintHomeRoom(ctx, map, style = {}) {
  const W = map.w; const H = map.h;
  const wp = ITEMS[style.wall]?.cat === 'paper' ? ITEMS[style.wall] : ITEMS.w_cream;
  const fl = ITEMS[style.floor]?.cat === 'floor' ? ITEMS[style.floor] : ITEMS.f_oak;
  const fc = fl.col;
  const edge = shade(fc[0], -0.3);
  box(ctx, 0, 0, W, H, -12, 0, { top: edge, left: shade(edge, -0.05), right: shade(edge, -0.22) });
  const r = seeded(41);
  if (fl.pat === 'plank') {
    for (let i = 0; i < H * 2; i++) {
      const a0 = i / 2; const a1 = a0 + 0.5; let x = 0;
      while (x < W) { const e = Math.min(W, x + 1.5 + r() * 2.5); const pts = [iso(x, a0), iso(e, a0), iso(e, a1), iso(x, a1)]; fillPoly(ctx, pts, fc[Math.floor(r() * fc.length)]); strokePoly(ctx, pts, 'rgba(90,60,30,0.22)', 0.6); x = e; }
    }
  } else if (fl.pat === 'check' || fl.pat === 'tile') {
    const n = fl.pat === 'check' ? 1 : 2;
    for (let y = 0; y < H * n; y++) for (let x = 0; x < W * n; x++) {
      const pts = [iso(x / n, y / n), iso((x + 1) / n, y / n), iso((x + 1) / n, (y + 1) / n), iso(x / n, (y + 1) / n)];
      fillPoly(ctx, pts, fc[(x + y) % 2]);
      if (fl.pat === 'tile') strokePoly(ctx, pts, 'rgba(255,255,255,0.55)', 0.8);
    }
  } else if (fl.pat === 'carpet') {
    fillPoly(ctx, [iso(0, 0), iso(W, 0), iso(W, H), iso(0, H)], fc[0]);
    for (let i = 0; i < 260; i++) { const [x, y] = iso(r() * W, r() * H); ctx.fillStyle = r() < 0.5 ? rgba(fc[1], 0.6) : 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, 1.4, 1.4); }
  } else {
    // 대리석: 큰 판 + 결
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const pts = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)]; fillPoly(ctx, pts, fc[(x * 3 + y) % 2]); strokePoly(ctx, pts, 'rgba(150,140,130,0.25)', 0.6); }
    ctx.strokeStyle = 'rgba(160,150,140,0.35)'; ctx.lineWidth = 0.7;
    for (let i = 0; i < 9; i++) { const a = iso(r() * W, r() * H); const b = iso(r() * W, r() * H); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2 + 20, (a[1] + b[1]) / 2, b[0], b[1]); ctx.stroke(); }
  }
  // 현관 매트
  fillPoly(ctx, [iso(7.15, 6.2), iso(8.85, 6.2), iso(8.85, 7.85), iso(7.15, 7.85)], 'rgba(120,90,70,0.22)');
  strokePoly(ctx, [iso(7.3, 6.35), iso(8.7, 6.35), iso(8.7, 7.7), iso(7.3, 7.7)], 'rgba(255,255,255,0.4)', 1);
  // 벽
  const [wl, wr, wd] = wp.col;
  const T = 0.16;
  fillPoly(ctx, [iso(-T, -T, WALL_H), iso(W, -T, WALL_H), iso(W, 0, WALL_H), iso(0, 0, WALL_H)], '#FFFDF9');
  fillPoly(ctx, [iso(-T, -T, WALL_H), iso(0, 0, WALL_H), iso(0, H, WALL_H), iso(-T, H, WALL_H)], '#F6F2EC');
  fillPoly(ctx, [iso(W, -T, WALL_H), iso(W, 0, WALL_H), iso(W, 0, 0), iso(W, -T, 0)], shade(wr, -0.12));
  fillPoly(ctx, [iso(-T, H, WALL_H), iso(0, H, WALL_H), iso(0, H, 0), iso(-T, H, 0)], shade(wl, -0.12));
  wallRect(ctx, 'L', 0, H, 0, WALL_H, wl);
  wallRect(ctx, 'R', 0, W, 0, WALL_H, wr);
  if (wp.pat === 'stripe') {
    for (let a = 0.25; a < Math.max(W, H); a += 0.5) { if (a < H) wallRect(ctx, 'L', a, a + 0.22, 6, WALL_H, rgba(wd, 0.35)); if (a < W) wallRect(ctx, 'R', a, a + 0.22, 6, WALL_H, rgba(wd, 0.35)); }
  } else if (wp.pat === 'wood') {
    for (let a = 0; a < Math.max(W, H); a += 0.34) { if (a < H) wallRect(ctx, 'L', a, a + 0.02, 0, WALL_H, rgba(wd, 0.7)); if (a < W) wallRect(ctx, 'R', a, a + 0.02, 0, WALL_H, rgba(wd, 0.7)); }
  } else if (wp.pat === 'brick') {
    for (let z = 0, row = 0; z < WALL_H; z += 9, row++) {
      for (const [side, len] of [['L', H], ['R', W]]) {
        wallRect(ctx, side, 0, len, z, z + 1, 'rgba(255,240,230,0.45)');
        for (let a = (row % 2) * 0.25; a < len; a += 0.5) wallRect(ctx, side, a, a + 0.02, z, z + 9, 'rgba(255,240,230,0.45)');
      }
    }
  } else if (wp.pat === 'stars') {
    for (let i = 0; i < 70; i++) { const side = r() < 0.5 ? 'L' : 'R'; const len = side === 'L' ? H : W; const [x, y] = wallPt(side, r() * len, 10 + r() * (WALL_H - 14), 0.02); ctx.fillStyle = `rgba(255,240,180,${0.4 + r() * 0.5})`; ctx.beginPath(); ctx.arc(x, y, 0.7 + r() * 1.1, 0, Math.PI * 2); ctx.fill(); }
  }
  // 걸레받이
  wallRect(ctx, 'L', 0, H, 0, 6, shade(wd, -0.08)); wallRect(ctx, 'R', 0, W, 0, 6, shade(wd, -0.08));
  wallRect(ctx, 'L', 0, H, 6, 7.5, '#FFFFFF'); wallRect(ctx, 'R', 0, W, 6, 7.5, '#FFFFFF');
}

// ---------- 소품 ----------
// 고정 부분은 미리 그려 두고(spritePart), 바뀌는 부분은 매번 그림(livePart)
export function propBounds(p) { return { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h, top: p.kind === 'item' ? (ITEMS[p.item]?.tall ?? 40) : PROP_HEIGHT[p.kind] || 60 }; }
const PROP_HEIGHT = { dj: 70, tv: 30, karaoke: 90, sofa: 40, bar: 70, cake: 70, guestbook: 50, plant: 80, notice: 110, board: 110, portal: 130, fountain: 70, bench: 30, tree: 120, stage: 12, photo: 10, screen: 10 };

export function drawProp(ctx, p, theme) {
  const P = PALETTES[theme] || PALETTES.home;
  const f = PROPS[p.kind];
  if (f) f(ctx, p, P, theme);
}

const PROPS = {
  dj(ctx, p, P, theme) {
    shadow(ctx, 1, 2, 1.1, 0.16);
    const body = theme === 'game' ? '#2B2F4A' : theme === 'rooftop' ? '#3A3348' : '#3C3434';
    box(ctx, 0.15, 1.1, 1.85, 2.85, 0, 30, tone(body));
    // 앞판 조명 줄
    for (let i = 0; i < 4; i++) wallRect(ctx, 'R', 0.3 + i * 0.38, 0.55 + i * 0.38, 10, 22, theme === 'game' ? '#3EE6FF' : '#E83217', 2.86);
    // 턴테이블
    for (const cy of [1.55, 2.4]) {
      const [x, y] = iso(1.0, cy, 31);
      ctx.fillStyle = '#16161C'; ctx.beginPath(); ctx.ellipse(x, y, 13, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#E83217'; ctx.beginPath(); ctx.ellipse(x, y, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 스피커
    box(ctx, 0.1, 0.25, 0.6, 0.85, 0, 46, tone('#2A2A33'));
    const [sx, sy] = iso(0.6, 0.55, 30);
    ctx.fillStyle = '#4A4A58'; ctx.beginPath(); ctx.ellipse(sx + 1, sy, 4, 6, -0.5, 0, Math.PI * 2); ctx.fill();
  },
  tv(ctx, p, P, theme) {
    shadow(ctx, 0.5, 7.5, 1.0, 0.12);
    const c = theme === 'game' ? '#3A3F5C' : theme === 'rooftop' ? '#5B4A3E' : '#B58C63';
    box(ctx, 0.05, 6.15, 0.75, 8.85, 0, 18, tone(c));
    // 서랍 선
    for (const yy of [6.9, 7.6, 8.3]) { const a = iso(0.75, yy, 4); const b = iso(0.75, yy, 16); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  },
  karaoke(ctx, p, P, theme) {
    shadow(ctx, 1.5, 10.5, 1.8, 0.14);
    const wall = theme === 'game' ? '#2C2450' : theme === 'rooftop' ? '#3A3060' : '#5A3E66';
    const H = 58;
    box(ctx, 0.05, 9.1, 2.9, 11.95, 0, H, tone(wall));
    // 유리창과 문 (오른쪽 면)
    const win = [iso(2.9, 9.35, 22), iso(2.9, 10.55, 22), iso(2.9, 10.55, 50), iso(2.9, 9.35, 50)];
    fillPoly(ctx, win, '#1B1530');
    const g = ctx.createLinearGradient(win[0][0], win[0][1], win[2][0], win[2][1]);
    g.addColorStop(0, 'rgba(255,79,160,0.5)'); g.addColorStop(1, 'rgba(62,230,255,0.4)');
    fillPoly(ctx, win, g);
    fillPoly(ctx, [iso(2.9, 10.85, 0), iso(2.9, 11.7, 0), iso(2.9, 11.7, 48), iso(2.9, 10.85, 48)], shade(wall, -0.3));
    // 지붕 위 간판 (앞쪽에 세움)
    box(ctx, 0.3, 11.75, 2.7, 11.9, H, H + 20, tone('#1E1830'));
    const [tx, ty] = iso(1.5, 11.9, H + 10);
    ctx.save(); ctx.translate(tx, ty); ctx.transform(1, 0.5, 0, 1, 0, 0);
    ctx.font = '800 12px Pretendard, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#FF4FA0'; ctx.shadowBlur = 8; ctx.fillStyle = '#FFD1E8'; ctx.fillText('노래방', 0, 0);
    ctx.restore();
    strokePoly(ctx, [iso(0.05, 9.1, H), iso(2.9, 9.1, H), iso(2.9, 11.95, H), iso(0.05, 11.95, H)], 'rgba(255,255,255,0.18)', 1);
  },
  sofa(ctx, p, P, theme) {
    shadow(ctx, 7, 6.2, 2.4, 0.14);
    const base = tone(P.sofa); const back = tone(shade(P.sofa, -0.08));
    // 뒤쪽 줄 (y 5)
    box(ctx, 5.05, 5.05, 8.95, 5.95, 0, 14, base);
    box(ctx, 5.05, 5.05, 8.95, 5.35, 14, 34, back);
    // 왼쪽 줄 (x 5)
    box(ctx, 5.05, 5.95, 5.95, 7.95, 0, 14, base);
    box(ctx, 5.05, 5.35, 5.35, 7.95, 14, 34, back);
    // 팔걸이
    box(ctx, 8.7, 5.05, 8.98, 5.95, 14, 24, tone(shade(P.sofa, -0.04)));
    box(ctx, 5.05, 7.72, 5.95, 7.98, 14, 24, tone(shade(P.sofa, -0.04)));
    // 쿠션
    const cu = tone(P.cushion);
    for (const x of [6.0, 7.4]) box(ctx, x, 5.38, x + 0.45, 5.5, 14, 30, cu);
    box(ctx, 5.38, 6.6, 5.5, 7.05, 14, 30, cu);
    // 커피 테이블 (7,7)
    shadow(ctx, 7.5, 7.5, 0.55, 0.12);
    box(ctx, 7.1, 7.1, 7.9, 7.9, 12, 16, tone(P.wood));
    for (const [lx, ly] of [[7.15, 7.15], [7.8, 7.15], [7.15, 7.8], [7.8, 7.8]]) box(ctx, lx, ly, lx + 0.05, ly + 0.05, 0, 12, tone(shade(P.wood, -0.2)));
    cyl(ctx, 7.45, 7.45, 0.18, 16, 21, { top: '#F6E7C8', left: '#F2F2F2', right: '#D9D9D9' });
    const [bx, by] = iso(7.45, 7.45, 21);
    ctx.fillStyle = '#F2B544'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(bx - 5 + i * 2.5, by - 1 + (i % 2), 1.6, 0, Math.PI * 2); ctx.fill(); }
  },
  bar(ctx, p, P, theme) {
    shadow(ctx, 11, 6, 1.3, 0.16);
    const front = theme === 'game' ? '#2B2F4A' : theme === 'rooftop' ? '#4E3C30' : '#8E6747';
    box(ctx, 10.1, 5.1, 11.9, 6.9, 0, 34, tone(front));
    box(ctx, 10.0, 5.0, 12.0, 7.0, 34, 38, tone(theme === 'game' ? '#3A3F5C' : '#E9E2D6'));
    // 앞판 글자
    const [tx, ty] = iso(12.0, 6.0, 20);
    ctx.save(); ctx.translate(tx, ty); ctx.transform(1, -0.5, 0, 1, 0, 0);
    ctx.font = '800 11px Pretendard, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = theme === 'game' ? '#3EE6FF' : 'rgba(255,255,255,0.85)'; ctx.fillText('BAR', 0, 0);
    ctx.restore();
    // 병과 잔
    const bottles = [['#2E7D4F', 10.35, 5.35], ['#7A2E3A', 10.65, 5.3], ['#C79A2B', 10.95, 5.35], ['#3A6EA5', 10.35, 5.75]];
    for (const [c, x, y] of bottles) { cyl(ctx, x, y, 0.07, 38, 54, { top: shade(c, 0.2), left: c, right: shade(c, -0.25) }); cyl(ctx, x, y, 0.03, 54, 60, { top: c, left: shade(c, -0.1), right: shade(c, -0.3) }); }
    for (const [x, y] of [[11.5, 6.4], [11.2, 6.6], [11.6, 5.9]]) cyl(ctx, x, y, 0.06, 38, 46, { top: 'rgba(255,240,200,0.8)', left: 'rgba(230,240,255,0.7)', right: 'rgba(200,215,235,0.7)' });
  },
  cake(ctx, p, P, theme) {
    shadow(ctx, 7, 10, 1.0, 0.16);
    cyl(ctx, 7, 10, 0.12, 0, 22, tone(theme === 'game' ? '#3A3F5C' : P.wood));
    cyl(ctx, 7, 10, 0.85, 22, 27, { top: theme === 'game' ? '#2E2F4A' : '#FFFFFF', left: theme === 'game' ? '#24253A' : '#F1ECE6', right: theme === 'game' ? '#1C1D2E' : '#DCD5CC' });
  },
  guestbook(ctx, p, P, theme) {
    shadow(ctx, 13.5, 8.5, 0.45, 0.14);
    box(ctx, 13.2, 8.2, 13.8, 8.8, 0, 30, tone(theme === 'game' ? '#3A3F5C' : P.wood));
    fillPoly(ctx, [iso(13.25, 8.3, 31), iso(13.75, 8.3, 31), iso(13.75, 8.7, 33), iso(13.25, 8.7, 33)], '#FFFDF6');
    const a = iso(13.5, 8.3, 31); const b = iso(13.5, 8.7, 33); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    const [px, py] = iso(13.65, 8.5, 34); ctx.strokeStyle = '#E83217'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 6, py - 6); ctx.stroke();
  },
  plant(ctx, p, P, theme) {
    const cx = p.x + 0.5; const cy = p.y + 0.5;
    shadow(ctx, cx, cy, 0.45, 0.16);
    cyl(ctx, cx, cy, 0.28, 0, 20, tone(theme === 'game' ? '#3A3F5C' : '#C9785A'));
    const [x, y] = iso(cx, cy, 20);
    const leaf = theme === 'game' ? ['#2BB673', '#33D18A'] : ['#5A9E4B', '#6DB35A', '#4B8A3E'];
    const r = seeded(p.x * 31 + p.y);
    for (let i = 0; i < 14; i++) {
      const ang = r() * Math.PI * 2; const d = r() * 12;
      ctx.fillStyle = leaf[i % leaf.length];
      ctx.beginPath(); ctx.ellipse(x + Math.cos(ang) * d, y - 18 - r() * 26 + Math.sin(ang) * d * 0.4, 6 + r() * 4, 9 + r() * 5, ang, 0, Math.PI * 2); ctx.fill();
    }
  },
  // ----- 스퀘어 -----
  notice(ctx, p) {
    shadow(ctx, 5, 0.5, 0.9, 0.1);
    for (const x of [3.3, 6.7]) box(ctx, x, 0.2, x + 0.12, 0.32, 0, 70, tone('#8E6747'));
    box(ctx, 3.1, 0.15, 6.9, 0.3, 40, 104, tone('#F7F3EC'));
    box(ctx, 3.1, 0.15, 6.9, 0.3, 98, 106, tone('#E83217'));
    const [tx, ty] = iso(5, 0.3, 86);
    ctx.save(); ctx.translate(tx, ty); ctx.transform(1, 0.5, 0, 1, 0, 0);
    ctx.textBaseline = 'middle';
    ctx.font = '800 12px Pretendard, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#E83217'; ctx.fillText('공지', 0, 0);
    ctx.font = '600 8px Pretendard, system-ui, sans-serif'; ctx.fillStyle = '#555'; ctx.fillText('이번 주 공개 파티', 0, 16); ctx.fillText('가까이 와서 확인하세요', 0, 28);
    ctx.restore();
  },
  board(ctx, p) {
    shadow(ctx, 0.5, 5, 0.9, 0.1);
    for (const y of [3.3, 6.7]) box(ctx, 0.2, y, 0.32, y + 0.12, 0, 70, tone('#8E6747'));
    box(ctx, 0.15, 3.1, 0.3, 6.9, 40, 104, tone('#FFF6E8'));
    box(ctx, 0.15, 3.1, 0.3, 6.9, 98, 106, tone('#2F6BFF'));
    const [tx, ty] = iso(0.3, 5, 86);
    ctx.save(); ctx.translate(tx, ty); ctx.transform(1, -0.5, 0, 1, 0, 0);
    ctx.textBaseline = 'middle';
    ctx.font = '800 12px Pretendard, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#2F6BFF'; ctx.fillText('공개 파티', 0, 0);
    const notes = ['#FFE08A', '#FFC0B8', '#BDE6C8', '#C9D8FF'];
    for (let i = 0; i < 6; i++) { ctx.fillStyle = notes[i % 4]; ctx.fillRect(-40 + (i % 3) * 28, 8 + Math.floor(i / 3) * 22, 22, 18); }
    ctx.restore();
  },
  portal(ctx, p) {
    const along = p.w >= p.h ? 'x' : 'y';
    const c = tone('#E83217');
    if (along === 'x') {
      shadow(ctx, p.x + 1.5, p.y + 0.5, 1.3, 0.12);
      box(ctx, p.x + 0.1, p.y + 0.2, p.x + 0.6, p.y + 0.7, 0, 96, c);
      box(ctx, p.x + 2.4, p.y + 0.2, p.x + 2.9, p.y + 0.7, 0, 96, c);
      box(ctx, p.x + 0.05, p.y + 0.15, p.x + 2.95, p.y + 0.75, 96, 112, tone('#C42A12'));
      const [tx, ty] = iso(p.x + 1.5, p.y + 0.75, 104);
      ctx.save(); ctx.translate(tx, ty); ctx.transform(1, 0.5, 0, 1, 0, 0);
      ctx.font = '800 10px Pretendard, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFF'; ctx.fillText(p.label, 0, 0); ctx.restore();
      const g = ctx.createLinearGradient(...iso(p.x + 0.6, p.y + 0.45, 90), ...iso(p.x + 2.4, p.y + 0.45, 0));
      g.addColorStop(0, 'rgba(255,214,200,0.55)'); g.addColorStop(1, 'rgba(255,120,90,0.15)');
      fillPoly(ctx, [iso(p.x + 0.6, p.y + 0.45, 92), iso(p.x + 2.4, p.y + 0.45, 92), iso(p.x + 2.4, p.y + 0.45, 0), iso(p.x + 0.6, p.y + 0.45, 0)], g);
    } else {
      shadow(ctx, p.x + 0.5, p.y + 1.5, 1.3, 0.12);
      box(ctx, p.x + 0.2, p.y + 0.1, p.x + 0.7, p.y + 0.6, 0, 96, c);
      box(ctx, p.x + 0.2, p.y + 2.4, p.x + 0.7, p.y + 2.9, 0, 96, c);
      box(ctx, p.x + 0.15, p.y + 0.05, p.x + 0.75, p.y + 2.95, 96, 112, tone('#C42A12'));
      const [tx, ty] = iso(p.x + 0.75, p.y + 1.5, 104);
      ctx.save(); ctx.translate(tx, ty); ctx.transform(1, -0.5, 0, 1, 0, 0);
      ctx.font = '800 10px Pretendard, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFF'; ctx.fillText(p.label, 0, 0); ctx.restore();
      const g = ctx.createLinearGradient(...iso(p.x + 0.45, p.y + 0.6, 90), ...iso(p.x + 0.45, p.y + 2.4, 0));
      g.addColorStop(0, 'rgba(255,214,200,0.55)'); g.addColorStop(1, 'rgba(255,120,90,0.15)');
      fillPoly(ctx, [iso(p.x + 0.45, p.y + 0.6, 92), iso(p.x + 0.45, p.y + 2.4, 92), iso(p.x + 0.45, p.y + 2.4, 0), iso(p.x + 0.45, p.y + 0.6, 0)], g);
    }
  },
  fountain(ctx, p) {
    shadow(ctx, 6, 6, 1.2, 0.12);
    cyl(ctx, 6, 6, 0.98, 0, 14, tone('#D8D2C8'));
    cyl(ctx, 6, 6, 0.82, 12, 13, { top: '#7CC6F5', left: '#7CC6F5', right: '#5FB0E6' });
    cyl(ctx, 6, 6, 0.16, 13, 40, tone('#E6E1D8'));
    cyl(ctx, 6, 6, 0.42, 38, 44, tone('#D8D2C8'));
  },
  bench(ctx, p) {
    const c = tone('#B9875C');
    if (p.w >= p.h) { box(ctx, p.x + 0.1, p.y + 0.3, p.x + p.w - 0.1, p.y + 0.7, 10, 15, c); box(ctx, p.x + 0.1, p.y + 0.25, p.x + p.w - 0.1, p.y + 0.35, 15, 28, c); }
    else { box(ctx, p.x + 0.3, p.y + 0.1, p.x + 0.7, p.y + p.h - 0.1, 10, 15, c); box(ctx, p.x + 0.25, p.y + 0.1, p.x + 0.35, p.y + p.h - 0.1, 15, 28, c); }
  },
  tree(ctx, p) {
    const cx = p.x + 0.5; const cy = p.y + 0.5;
    shadow(ctx, cx, cy, 0.6, 0.16);
    cyl(ctx, cx, cy, 0.1, 0, 40, tone('#8B5E3C'));
    const [x, y] = iso(cx, cy, 40);
    const r = seeded(p.x * 7 + p.y * 13);
    const cols = ['#5FAF4E', '#6CC05A', '#4E9A41'];
    for (let i = 0; i < 9; i++) { ctx.fillStyle = cols[i % 3]; ctx.beginPath(); ctx.arc(x + (r() - 0.5) * 30, y - 20 - r() * 40, 12 + r() * 8, 0, Math.PI * 2); ctx.fill(); }
  },
};

// ---------- 매번 바뀌는 그림 ----------
export function drawPropLive(ctx, p, theme, live, t) {
  if (p.kind === 'tv') {
    // 벽걸이 TV 화면 내용
    const pts = [iso(0, 6.15, 50), iso(0, 8.85, 50), iso(0, 8.85, 100), iso(0, 6.15, 100)];
    const g = ctx.createLinearGradient(pts[0][0], pts[2][1], pts[1][0], pts[0][1]);
    if (live.game) { g.addColorStop(0, '#E83217'); g.addColorStop(1, '#FF8A5B'); }
    else { g.addColorStop(0, '#2A2F45'); g.addColorStop(1, '#3B4466'); }
    fillPoly(ctx, pts, g);
    const [tx, ty] = iso(0, 7.5, 77);
    ctx.save(); ctx.translate(tx, ty); ctx.transform(1, -0.5, 0, 1, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 13px Pretendard, system-ui, sans-serif';
    ctx.fillText(live.game ? live.gameName : 'PARTY TV', 0, -4);
    ctx.font = '600 8px Pretendard, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(live.game ? '게임 진행 중' : '가까이 와서 게임 고르기', 0, 10);
    ctx.restore();
    return;
  }
  if (p.kind === 'cake') {
    const cake = live.cake;
    if (!cake || !cake.on) {
      // 꽃병
      cyl(ctx, 7, 10, 0.12, 27, 40, { top: '#BFE3F5', left: 'rgba(190,225,245,0.8)', right: 'rgba(160,200,230,0.8)' });
      const [x, y] = iso(7, 10, 40);
      for (const [dx, dy, c] of [[-4, -6, '#FF8A7A'], [3, -9, '#F7C04A'], [0, -12, '#E83217'], [5, -4, '#FFB3A8']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + dx, y + dy, 3.2, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    cyl(ctx, 7, 10, 0.55, 27, 41, { top: '#FFF4F0', left: '#FFE3DA', right: '#F5CABE' });
    cyl(ctx, 7, 10, 0.36, 41, 53, { top: '#FFFFFF', left: '#FFEDE6', right: '#F7D6CB' });
    const [cx, cy] = iso(7, 10, 47);
    ctx.fillStyle = '#E83217'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(cx - 15 + i * 5, cy + Math.sin(i) * 1.2, 1.4, 0, Math.PI * 2); ctx.fill(); }
    const [x, y] = iso(7, 10, 53);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2; const px = x + Math.cos(a) * 9; const py = y + Math.sin(a) * 4.5;
      ctx.fillStyle = ['#FFB3A8', '#9BD3FF', '#FFE08A', '#C7F0B8', '#E0C3FF'][i];
      ctx.fillRect(px - 1, py - 10, 2, 10);
      if (cake.lit) {
        const fl = 1 + Math.sin(t * 18 + i * 1.7) * 0.18;
        const g = ctx.createRadialGradient(px, py - 13, 0, px, py - 13, 9);
        g.addColorStop(0, 'rgba(255,210,120,0.7)'); g.addColorStop(1, 'rgba(255,210,120,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py - 13, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFB020'; ctx.beginPath(); ctx.ellipse(px, py - 13, 1.8 * fl, 3.4 * fl, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFF4C2'; ctx.beginPath(); ctx.ellipse(px, py - 12.4, 0.8, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(180,180,190,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, py - 11); ctx.quadraticCurveTo(px + 3, py - 16 - (t * 10 % 6), px - 1, py - 22); ctx.stroke();
      }
    }
    return;
  }
  if (p.kind === 'dj' && live.party) {
    const [x, y] = iso(1.0, 1.55, 31);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke(); ctx.restore();
  }
}

// ---------- OX 구역 표시 ----------
export function drawOxZones(ctx, map, phase, answer, t) {
  if (!map.oxO) return;
  const zone = (r, label, color, on) => {
    const pts = [iso(r[0] + 0.08, r[1] + 0.08, 10.5), iso(r[2] + 0.92, r[1] + 0.08, 10.5), iso(r[2] + 0.92, r[3] + 0.92, 10.5), iso(r[0] + 0.08, r[3] + 0.92, 10.5)];
    const pulse = phase === 'answer' ? 0.18 + Math.sin(t * 5) * 0.06 : 0.16;
    fillPoly(ctx, pts, rgba(color, on === false ? 0.06 : on ? 0.42 : pulse));
    strokePoly(ctx, pts, rgba(color, on === false ? 0.25 : 0.9), 2.2);
    const cx = (r[0] + r[2] + 1) / 2; const cy = (r[1] + r[3] + 1) / 2;
    const [sx, sy] = iso(cx, cy, 10.5);
    ctx.save(); ctx.translate(sx, sy); ctx.transform(1, 0.5, -1, 0.5, 0, 0);
    ctx.font = '900 58px Pretendard, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(color, on === false ? 0.25 : 0.85); ctx.fillText(label, 0, 2);
    ctx.restore();
  };
  const show = phase === 'reveal' ? answer : null;
  zone(map.oxO, 'O', '#2F6BFF', show ? show === 'O' : undefined);
  zone(map.oxX, 'X', '#E83217', show ? show === 'X' : undefined);
}

// ---------- 조명 ----------
export function paintLight(ctx, w, h, light, theme, t, low) {
  if (theme === 'square') return;
  const col = { warm: '#FFB75E', pink: '#FF6FA8', blue: '#5B8CFF', party: '#B45CFF' }[light] || '#FFB75E';
  ctx.save();
  if (theme === 'rooftop') { ctx.fillStyle = 'rgba(16,20,56,0.14)'; ctx.fillRect(0, 0, w, h); }
  const g = ctx.createRadialGradient(w * 0.5, h * 0.25, 0, w * 0.5, h * 0.3, Math.max(w, h) * 0.75);
  g.addColorStop(0, rgba(col, theme === 'game' ? 0.10 : 0.12)); g.addColorStop(1, rgba(col, 0.02));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (light === 'party' && !low) {
    ctx.globalCompositeOperation = 'lighter';
    const spots = [['#FF4FA0', 0], ['#3EE6FF', 2.1], ['#FFE65C', 4.2]];
    for (const [c, ph] of spots) {
      const x = w * (0.5 + Math.sin(t * 0.7 + ph) * 0.32); const y = h * (0.55 + Math.cos(t * 0.9 + ph) * 0.22);
      const r = Math.min(w, h) * 0.22;
      const sg = ctx.createRadialGradient(x, y, 0, x, y, r);
      sg.addColorStop(0, rgba(c, 0.16)); sg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// 현수막: 무대 뒤 벽에 거는 글자 (방장이 바꿀 수 있음)
export function paintBanner(ctx, theme, text) {
  if (!text) return;
  const P = PALETTES[theme] || PALETTES.home;
  // 깃발 줄
  const flags = theme === 'game' ? ['#FF4FA0', '#3EE6FF', '#FFE65C'] : ['#E83217', '#F7C04A', '#FFFFFF', '#2F6BFF'];
  for (let i = 0; i < 14; i++) {
    const a = 2.3 + i * 0.4; const tz = WALL_H - 6 - Math.sin((i / 13) * Math.PI) * 8;
    const p1 = iso(a, 0.03, tz); const p2 = iso(a + 0.3, 0.03, tz - 1); const p3 = iso(a + 0.15, 0.03, tz - 13);
    fillPoly(ctx, [p1, p2, p3], flags[i % flags.length]);
  }
  wallRect(ctx, 'R', 2.6, 7.4, 70, 92, theme === 'game' ? '#2A1F44' : '#FFFFFF', 0.03);
  wallRect(ctx, 'R', 2.6, 7.4, 70, 72, theme === 'game' ? '#3EE6FF' : P.neon, 0.03);
  wallText(ctx, 'R', 5.0, 81, text, '800 13px Pretendard, system-ui, sans-serif', theme === 'game' ? '#FFFFFF' : '#2A1E1A');
}
