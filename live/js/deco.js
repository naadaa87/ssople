// 꾸미기 소품 그림: 가구·파티 소품·벽 장식을 코드로 그려요.
// 소품 p = { item, x, y, w, h, r } (r=0: 앞이 왼쪽 아래(+y), r=1: 앞이 오른쪽 아래(+x))
import { iso, WALL_H, HW, HH } from './iso.js';
import { box, cyl, shadow, fillPoly, strokePoly, shade, tone, rgba, wallPt, seeded } from './art.js';
import { ITEMS, footprint } from '../shared/catalog.js';

const FONT = 'Pretendard, system-ui, sans-serif';
const dot = (ctx, x, y, r, c) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
const WOOD = '#B5875D'; const WOOD_D = '#8E6342';

/** 소품 자리(가로 a, 세로 b)를 앞뒤 기준으로: 뒤쪽 끝(back)과 앞쪽 끝(front) */
function frame(p) {
  const x0 = p.x, y0 = p.y, x1 = p.x + p.w, y1 = p.y + p.h;
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: p.r ? 1 : 0 };
}
/** 등받이처럼 뒤쪽에 붙는 판: 두께 d (타일) */
function backPanel(f, d) { return f.r ? [f.x0, f.y0, f.x0 + d, f.y1] : [f.x0, f.y0, f.x1, f.y0 + d]; }

// ---------- 바닥에 세우는 소품 ----------
const STAND = {
  bed_single(ctx, p) { bed(ctx, p, '#9CC8E8', 1); },
  bed_double(ctx, p) { bed(ctx, p, '#F2B8B0', 2); },
  sofa_two(ctx, p) { sofa(ctx, p, '#D46A52'); },
  armchair(ctx, p) { sofa(ctx, p, '#6C8FD6'); },
  beanbag(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.42, 0.18);
    const [x, y] = iso(f.cx, f.cy, 0);
    const c = '#F2A94A';
    ctx.beginPath(); ctx.ellipse(x, y - 9, 15, 10, 0, 0, Math.PI * 2); ctx.fillStyle = shade(c, -0.12); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - 2, y - 12, 12, 8, -0.2, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - 4, y - 15, 5, 3, -0.3, 0, Math.PI * 2); ctx.fillStyle = shade(c, 0.25); ctx.fill();
  },
  chair(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.35, 0.12);
    const c = tone(WOOD);
    for (const [lx, ly] of [[0.25, 0.25], [0.7, 0.25], [0.25, 0.7], [0.7, 0.7]]) box(ctx, f.x0 + lx, f.y0 + ly, f.x0 + lx + 0.06, f.y0 + ly + 0.06, 0, 16, tone(WOOD_D));
    box(ctx, f.x0 + 0.2, f.y0 + 0.2, f.x0 + 0.8, f.y0 + 0.8, 16, 19, c);
    const b = f.r ? [f.x0 + 0.2, f.y0 + 0.2, f.x0 + 0.27, f.y0 + 0.8] : [f.x0 + 0.2, f.y0 + 0.2, f.x0 + 0.8, f.y0 + 0.27];
    box(ctx, b[0], b[1], b[2], b[3], 19, 40, c);
  },
  table_round(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.42, 0.14);
    cyl(ctx, f.cx, f.cy, 0.08, 0, 22, tone(WOOD_D));
    cyl(ctx, f.cx, f.cy, 0.42, 22, 26, tone('#E9D2B4'));
    cyl(ctx, f.cx + 0.12, f.cy - 0.05, 0.07, 26, 31, { top: '#FFFFFF', left: '#F0EDE8', right: '#D8D2CA' });
    const [mx, my] = iso(f.cx - 0.12, f.cy + 0.08, 27); ctx.fillStyle = '#E87C5A'; ctx.beginPath(); ctx.ellipse(mx, my, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  },
  table_long(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.9, 0.12);
    for (const [lx, ly] of [[f.x0 + 0.1, f.y0 + 0.1], [f.x1 - 0.16, f.y0 + 0.1], [f.x0 + 0.1, f.y1 - 0.16], [f.x1 - 0.16, f.y1 - 0.16]]) box(ctx, lx, ly, lx + 0.06, ly + 0.06, 0, 24, tone(WOOD_D));
    box(ctx, f.x0 + 0.05, f.y0 + 0.05, f.x1 - 0.05, f.y1 - 0.05, 24, 28, tone('#C99A6A'));
    for (let i = 0; i < 3; i++) { const t = (i + 0.5) / 3; const px = f.r ? f.cx : f.x0 + t * (f.x1 - f.x0); const py = f.r ? f.y0 + t * (f.y1 - f.y0) : f.cy; const [x, y] = iso(px, py, 28.5); ctx.beginPath(); ctx.ellipse(x, y, 5.5, 2.8, 0, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill(); dot(ctx, x, y - 0.5, 1.6, ['#E85A4F', '#7BC86C', '#F4B740'][i]); }
  },
  desk(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.85, 0.12);
    const c = tone('#E8DCCB');
    const d = f.r ? [f.x0 + 0.05, f.y1 - 0.55, f.x1 - 0.05, f.y1 - 0.05] : [f.x1 - 0.55, f.y0 + 0.05, f.x1 - 0.05, f.y1 - 0.05];
    box(ctx, d[0], d[1], d[2], d[3], 0, 26, tone('#D9C9B2'));
    for (const [lx, ly] of [[f.x0 + 0.08, f.y0 + 0.08], [f.x0 + 0.08, f.y1 - 0.14], [f.x1 - 0.14, f.y0 + 0.08]]) box(ctx, lx, ly, lx + 0.06, ly + 0.06, 0, 26, tone('#9C9A98'));
    box(ctx, f.x0 + 0.04, f.y0 + 0.04, f.x1 - 0.04, f.y1 - 0.04, 26, 30, c);
    // 노트북
    const lx = f.cx - 0.25; const ly = f.cy - 0.18;
    box(ctx, lx, ly, lx + 0.5, ly + 0.36, 30, 31, tone('#5A5F6B'));
    const sc = f.r ? [iso(lx, ly, 31), iso(lx, ly + 0.36, 31), iso(lx, ly + 0.36, 44), iso(lx, ly, 44)] : [iso(lx, ly, 31), iso(lx + 0.5, ly, 31), iso(lx + 0.5, ly, 44), iso(lx, ly, 44)];
    fillPoly(ctx, sc, '#2E3442');
  },
  bookshelf(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.45, 0.14);
    const b = backPanel(f, 0.45);
    box(ctx, b[0], b[1], b[2], b[3], 0, 78, tone('#9C7350'));
    const front = f.r ? b[2] : b[3];
    const r = seeded(p.x * 13 + p.y * 7);
    const cols = ['#E85A4F', '#4F7BE8', '#F4B740', '#5DBB7A', '#8E5CF7', '#F2F2F2'];
    for (let k = 0; k < 4; k++) {
      const z0 = 6 + k * 18;
      let a = 0.1;
      while (a < 0.9) {
        const w = 0.06 + r() * 0.06; const hgt = 10 + r() * 5; const c = cols[Math.floor(r() * cols.length)];
        const pts = f.r ? [iso(front, f.y0 + a, z0), iso(front, f.y0 + a + w, z0), iso(front, f.y0 + a + w, z0 + hgt), iso(front, f.y0 + a, z0 + hgt)]
          : [iso(f.x0 + a, front, z0), iso(f.x0 + a + w, front, z0), iso(f.x0 + a + w, front, z0 + hgt), iso(f.x0 + a, front, z0 + hgt)];
        fillPoly(ctx, pts, c);
        a += w + 0.01;
      }
      const sh = f.r ? [iso(front, f.y0, z0 - 1), iso(front, f.y1, z0 - 1), iso(front, f.y1, z0), iso(front, f.y0, z0)] : [iso(f.x0, front, z0 - 1), iso(f.x1, front, z0 - 1), iso(f.x1, front, z0), iso(f.x0, front, z0)];
      fillPoly(ctx, sh, '#6E4E34');
    }
  },
  wardrobe(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.9, 0.14);
    const b = backPanel(f, 0.55);
    box(ctx, b[0], b[1], b[2], b[3], 0, 82, tone('#E9E1D6'));
    const front = f.r ? b[2] : b[3];
    const mid = f.r ? (f.y0 + f.y1) / 2 : (f.x0 + f.x1) / 2;
    const line = f.r ? [iso(front, mid, 4), iso(front, mid, 80)] : [iso(mid, front, 4), iso(mid, front, 80)];
    ctx.strokeStyle = 'rgba(120,100,80,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(line[0][0], line[0][1]); ctx.lineTo(line[1][0], line[1][1]); ctx.stroke();
    for (const d of [-0.08, 0.08]) { const [hx, hy] = f.r ? iso(front, mid + d, 44) : iso(mid + d, front, 44); ctx.fillStyle = '#B79A72'; ctx.fillRect(hx - 0.8, hy - 5, 1.6, 10); }
  },
  tv_set(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.85, 0.12);
    const b = backPanel(f, 0.6);
    box(ctx, b[0] + 0.02, b[1] + 0.02, b[2] - 0.02, b[3] - 0.02, 0, 16, tone('#7A5A40'));
    const s = f.r ? [f.x0 + 0.15, f.y0 + 0.15, f.x0 + 0.24, f.y1 - 0.15] : [f.x0 + 0.15, f.y0 + 0.15, f.x1 - 0.15, f.y0 + 0.24];
    box(ctx, s[0], s[1], s[2], s[3], 18, 56, tone('#24262E'));
    const face = f.r ? [iso(s[2] + 0.001, s[1] + 0.05, 21), iso(s[2] + 0.001, s[3] - 0.05, 21), iso(s[2] + 0.001, s[3] - 0.05, 53), iso(s[2] + 0.001, s[1] + 0.05, 53)]
      : [iso(s[0] + 0.05, s[3] + 0.001, 21), iso(s[2] - 0.05, s[3] + 0.001, 21), iso(s[2] - 0.05, s[3] + 0.001, 53), iso(s[0] + 0.05, s[3] + 0.001, 53)];
    const g = ctx.createLinearGradient(face[0][0], face[2][1], face[1][0], face[0][1]);
    g.addColorStop(0, '#3B4466'); g.addColorStop(1, '#5A6A9A');
    fillPoly(ctx, face, g);
  },
  fridge(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.42, 0.14);
    box(ctx, f.x0 + 0.1, f.y0 + 0.1, f.x1 - 0.1, f.y1 - 0.1, 0, 84, tone('#EEF1F4'));
    const front = f.r ? f.x1 - 0.1 : f.y1 - 0.1;
    const seam = f.r ? [iso(front, f.y0 + 0.1, 56), iso(front, f.y1 - 0.1, 56)] : [iso(f.x0 + 0.1, front, 56), iso(f.x1 - 0.1, front, 56)];
    ctx.strokeStyle = 'rgba(80,90,100,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(seam[0][0], seam[0][1]); ctx.lineTo(seam[1][0], seam[1][1]); ctx.stroke();
    for (const z of [66, 40]) { const [hx, hy] = f.r ? iso(front, f.y0 + 0.25, z) : iso(f.x0 + 0.25, front, z); ctx.fillStyle = '#9AA3AE'; ctx.fillRect(hx - 0.8, hy - 6, 1.6, 12); }
    const [mx, my] = f.r ? iso(front, f.cy, 70) : iso(f.cx, front, 70); dot(ctx, mx, my, 2, '#E83217'); dot(ctx, mx + 4, my + 3, 1.6, '#F4B740');
  },
  kitchen(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.9, 0.12);
    const b = backPanel(f, 0.62);
    box(ctx, b[0], b[1], b[2], b[3], 0, 36, tone('#F4EFE8'));
    box(ctx, b[0] - 0.02, b[1] - 0.02, b[2] + 0.02, b[3] + 0.02, 36, 40, tone('#5B5E66'));
    // 개수대와 화구
    const a = f.r ? [f.x0 + 0.31, f.y0 + 0.5] : [f.x0 + 0.5, f.y0 + 0.31];
    const [sx, sy] = iso(a[0], a[1], 40.5); ctx.fillStyle = '#9FB4C7'; ctx.beginPath(); ctx.ellipse(sx, sy, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    const c = f.r ? [f.x0 + 0.31, f.y1 - 0.5] : [f.x1 - 0.5, f.y0 + 0.31];
    for (const d of [-0.15, 0.15]) { const [bx, by] = f.r ? iso(c[0], c[1] + d, 40.5) : iso(c[0] + d, c[1], 40.5); ctx.strokeStyle = '#1F1F24'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(bx, by, 4, 2, 0, 0, Math.PI * 2); ctx.stroke(); }
  },
  lamp(ctx, p, P, theme, t) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.25, 0.14);
    cyl(ctx, f.cx, f.cy, 0.16, 0, 3, tone('#5A5550'));
    cyl(ctx, f.cx, f.cy, 0.025, 3, 52, tone('#6E6862'));
    const [x, y] = iso(f.cx, f.cy, 52);
    const g = ctx.createRadialGradient(x, y + 6, 0, x, y + 6, 26); g.addColorStop(0, 'rgba(255,220,150,0.45)'); g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + 6, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 9, y + 6); ctx.lineTo(x - 5, y - 10); ctx.lineTo(x + 5, y - 10); ctx.lineTo(x + 9, y + 6); ctx.closePath(); ctx.fillStyle = '#FFF3D9'; ctx.fill(); ctx.strokeStyle = 'rgba(150,120,80,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  },
  plant_big(ctx, p) { plant(ctx, p, 0.26, 18, 16, 30, 18); },
  plant_small(ctx, p) { plant(ctx, p, 0.16, 10, 9, 14, 9); },
  piano(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.9, 0.14);
    const b = backPanel(f, 0.45);
    box(ctx, b[0], b[1], b[2], b[3], 0, 50, tone('#26242B'));
    const k = f.r ? [b[2], f.y0 + 0.1, b[2] + 0.25, f.y1 - 0.1] : [f.x0 + 0.1, b[3], f.x1 - 0.1, b[3] + 0.25];
    box(ctx, k[0], k[1], k[2], k[3], 22, 26, tone('#26242B'));
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a0 = i / n; const a1 = (i + 0.9) / n;
      const pts = f.r ? [iso(k[0], k[1] + a0 * (k[3] - k[1]), 26.2), iso(k[0], k[1] + a1 * (k[3] - k[1]), 26.2), iso(k[2], k[1] + a1 * (k[3] - k[1]), 26.2), iso(k[2], k[1] + a0 * (k[3] - k[1]), 26.2)]
        : [iso(k[0] + a0 * (k[2] - k[0]), k[1], 26.2), iso(k[0] + a1 * (k[2] - k[0]), k[1], 26.2), iso(k[0] + a1 * (k[2] - k[0]), k[3], 26.2), iso(k[0] + a0 * (k[2] - k[0]), k[3], 26.2)];
      fillPoly(ctx, pts, '#FAFAF7');
    }
  },
  aquarium(ctx, p, P, theme, t) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.9, 0.12);
    const b = backPanel(f, 0.55);
    box(ctx, b[0], b[1], b[2], b[3], 0, 20, tone('#3F4A5E'));
    box(ctx, b[0] + 0.03, b[1] + 0.03, b[2] - 0.03, b[3] - 0.03, 20, 50, { top: 'rgba(150,210,240,0.55)', left: 'rgba(110,190,235,0.55)', right: 'rgba(90,170,220,0.55)' });
    const r = seeded(p.x * 5 + p.y);
    for (let i = 0; i < 4; i++) {
      const u = (i + 1) / 5; const sw = Math.sin((t || 0) * 1.6 + i * 2) * 0.12;
      const px = f.r ? (b[0] + b[2]) / 2 : b[0] + u * (b[2] - b[0]) + sw; const py = f.r ? b[1] + u * (b[3] - b[1]) + sw : (b[1] + b[3]) / 2;
      const [x, y] = iso(px, py, 28 + r() * 14);
      ctx.fillStyle = ['#FF8A3D', '#F7C04A', '#FF5C8A', '#5DD3B6'][i]; ctx.beginPath(); ctx.ellipse(x, y, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 3; i++) { const [x, y] = iso(b[0] + 0.2 + i * 0.4, b[1] + 0.2, 21); ctx.fillStyle = '#4FA35B'; ctx.fillRect(x, y - 12, 2, 12); }
  },
  arcade(ctx, p, P, theme, t) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.42, 0.16);
    box(ctx, f.x0 + 0.12, f.y0 + 0.12, f.x1 - 0.12, f.y1 - 0.12, 0, 76, tone('#3A2E7A'));
    // 화면과 버튼 (앞면)
    const fr = f.r ? f.x1 - 0.12 : f.y1 - 0.12;
    const scr = f.r ? [iso(fr + 0.002, f.y0 + 0.2, 44), iso(fr + 0.002, f.y1 - 0.2, 44), iso(fr + 0.002, f.y1 - 0.2, 66), iso(fr + 0.002, f.y0 + 0.2, 66)]
      : [iso(f.x0 + 0.2, fr + 0.002, 44), iso(f.x1 - 0.2, fr + 0.002, 44), iso(f.x1 - 0.2, fr + 0.002, 66), iso(f.x0 + 0.2, fr + 0.002, 66)];
    const g = ctx.createLinearGradient(scr[0][0], scr[2][1], scr[1][0], scr[0][1]);
    const k = ((t || 0) * 0.3) % 1;
    g.addColorStop(0, '#FF4FA0'); g.addColorStop(0.5 + Math.sin(k * Math.PI * 2) * 0.2, '#3EE6FF'); g.addColorStop(1, '#FFE65C');
    fillPoly(ctx, scr, g);
    const pan = f.r ? [f.x1 - 0.12, f.y0 + 0.15, f.x1 + 0.08, f.y1 - 0.15] : [f.x0 + 0.15, f.y1 - 0.12, f.x1 - 0.15, f.y1 + 0.08];
    box(ctx, pan[0], pan[1], pan[2], pan[3], 30, 36, tone('#5244A8'));
    const [bx, by] = iso((pan[0] + pan[2]) / 2, (pan[1] + pan[3]) / 2, 36.5);
    dot(ctx, bx - 4, by, 1.8, '#E83217'); dot(ctx, bx + 1, by - 1, 1.8, '#F7C04A'); dot(ctx, bx + 5, by + 1, 1.8, '#22A86B');
    const [tx, ty] = iso(f.cx, f.cy, 80);
    ctx.save(); ctx.translate(tx, ty); ctx.font = `800 7px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#FFE65C'; ctx.fillText('GAME', 0, 0); ctx.restore();
  },
  speaker(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.35, 0.14);
    box(ctx, f.x0 + 0.22, f.y0 + 0.22, f.x1 - 0.22, f.y1 - 0.22, 0, 56, tone('#2B2B33'));
    const fr = f.r ? f.x1 - 0.22 : f.y1 - 0.22;
    for (const [z, rr] of [[40, 6], [18, 8]]) { const [x, y] = f.r ? iso(fr, f.cy, z) : iso(f.cx, fr, z); ctx.fillStyle = '#4A4A58'; ctx.beginPath(); ctx.ellipse(x, y, rr * 0.75, rr, f.r ? 0.5 : -0.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1C1C22'; ctx.beginPath(); ctx.ellipse(x, y, rr * 0.3, rr * 0.4, f.r ? 0.5 : -0.5, 0, Math.PI * 2); ctx.fill(); }
  },
  pet_bed(ctx, p) {
    const f = frame(p);
    const [x, y] = iso(f.cx, f.cy, 0);
    ctx.beginPath(); ctx.ellipse(x, y, 22, 11, 0, 0, Math.PI * 2); ctx.fillStyle = '#C46F5A'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y - 1, 16, 7.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#F7D9C9'; ctx.fill();
    ctx.fillStyle = 'rgba(196,111,90,0.5)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - 6 + i * 4, y - 1 + (i % 2), 1.1, 0, Math.PI * 2); ctx.fill(); }
  },
  pet_house(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.42, 0.14);
    box(ctx, f.x0 + 0.12, f.y0 + 0.12, f.x1 - 0.12, f.y1 - 0.12, 0, 30, tone('#E9C27A'));
    // 지붕
    const z = 30; const x0 = f.x0 + 0.06, x1 = f.x1 - 0.06, y0 = f.y0 + 0.06, y1 = f.y1 - 0.06;
    if (f.r) {
      fillPoly(ctx, [iso(x0, y0, z), iso(x1, y0, z), iso((x0 + x1) / 2, y0, z + 18), iso((x0 + x1) / 2, y1, z + 18), iso(x1, y1, z)], '#D2533E');
      fillPoly(ctx, [iso(x1, y0, z), iso(x1, y1, z), iso((x0 + x1) / 2, y1, z + 18), iso((x0 + x1) / 2, y0, z + 18)], '#B94532');
    } else {
      fillPoly(ctx, [iso(x0, y0, z), iso(x0, y1, z), iso(x0, (y0 + y1) / 2, z + 18), iso(x1, (y0 + y1) / 2, z + 18), iso(x1, y1, z)], '#D2533E');
      fillPoly(ctx, [iso(x0, y1, z), iso(x1, y1, z), iso(x1, (y0 + y1) / 2, z + 18), iso(x0, (y0 + y1) / 2, z + 18)], '#B94532');
    }
    const [dx, dy] = f.r ? iso(f.x1 - 0.12, f.cy, 12) : iso(f.cx, f.y1 - 0.12, 12);
    ctx.fillStyle = '#5B3B24'; ctx.beginPath(); ctx.ellipse(dx, dy, 6, 8, f.r ? 0.45 : -0.45, Math.PI, 0); ctx.fill(); ctx.fillRect(dx - 6, dy, 12, 6);
  },
  cat_tower(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.45, 0.14);
    box(ctx, f.x0 + 0.08, f.y0 + 0.08, f.x1 - 0.08, f.y1 - 0.08, 0, 6, tone('#D8C3A5'));
    cyl(ctx, f.cx - 0.15, f.cy - 0.15, 0.08, 6, 80, tone('#E3CFA9'));
    cyl(ctx, f.cx + 0.18, f.cy + 0.15, 0.08, 6, 46, tone('#E3CFA9'));
    box(ctx, f.x0 + 0.3, f.y0 + 0.3, f.x1 - 0.05, f.y1 - 0.05, 46, 50, tone('#D8C3A5'));
    box(ctx, f.x0 + 0.08, f.y0 + 0.08, f.x0 + 0.62, f.y0 + 0.62, 80, 84, tone('#D8C3A5'));
    const [bx, by] = iso(f.cx + 0.25, f.cy + 0.3, 40); ctx.fillStyle = '#E83217'; ctx.beginPath(); ctx.arc(bx, by, 2.6, 0, Math.PI * 2); ctx.fill();
  },
  xmas_tree(ctx, p, P, theme, t) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.45, 0.16);
    cyl(ctx, f.cx, f.cy, 0.2, 0, 10, tone('#C0392B'));
    const [x, y] = iso(f.cx, f.cy, 10);
    const layers = [[24, 0, 34], [19, 22, 30], [13, 40, 26]];
    for (const [rw, z, hgt] of layers) { ctx.beginPath(); ctx.moveTo(x - rw, y - z); ctx.lineTo(x, y - z - hgt); ctx.lineTo(x + rw, y - z); ctx.closePath(); ctx.fillStyle = '#2E8B57'; ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.moveTo(x, y - z - hgt); ctx.lineTo(x + rw, y - z); ctx.lineTo(x + rw * 0.2, y - z); ctx.closePath(); ctx.fill(); }
    const r = seeded(9);
    for (let i = 0; i < 9; i++) { const zz = 6 + r() * 54; const w = 20 - zz * 0.3; const on = Math.sin((t || 0) * 3 + i) > 0; dot(ctx, x + (r() - 0.5) * w * 1.6, y - zz, 1.8, on ? ['#FFE65C', '#FF5C8A', '#3EE6FF'][i % 3] : shade(['#FFE65C', '#FF5C8A', '#3EE6FF'][i % 3], -0.4)); }
    starShape(ctx, x, y - 68, 6, '#F7C04A');
  },
  // ----- 파티 소품 -----
  balloons(ctx, p, P, theme, t) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.2, 0.12);
    const [x, y] = iso(f.cx, f.cy, 0);
    box(ctx, f.cx - 0.08, f.cy - 0.08, f.cx + 0.08, f.cy + 0.08, 0, 4, tone('#E9E4DC'));
    const cols = theme === 'game' ? ['#FF4FA0', '#3EE6FF', '#FFE65C'] : ['#E83217', '#FFB3A8', '#F7C04A'];
    const pos = [[-9, 64], [8, 70], [0, 80]];
    pos.forEach(([dx, h], i) => {
      const sw = Math.sin((t || 0) * 1.4 + i * 1.7) * 2;
      ctx.strokeStyle = 'rgba(80,70,60,0.5)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.quadraticCurveTo(x + dx * 0.5, y - h * 0.5, x + dx + sw, y - h + 8); ctx.stroke();
      const bx = x + dx + sw; const by = y - h;
      const g = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, 9); g.addColorStop(0, shade(cols[i], 0.45)); g.addColorStop(1, cols[i]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, 7.5, 9, 0, 0, Math.PI * 2); ctx.fill();
    });
  },
  gift_box(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.25, 0.14);
    box(ctx, f.cx - 0.2, f.cy - 0.2, f.cx + 0.2, f.cy + 0.2, 0, 14, tone('#2F6BFF'));
    box(ctx, f.cx - 0.03, f.cy - 0.21, f.cx + 0.03, f.cy + 0.21, 0, 14.4, tone('#F7C04A'));
    box(ctx, f.cx - 0.21, f.cy - 0.03, f.cx + 0.21, f.cy + 0.03, 0, 14.4, tone('#F7C04A'));
    const [x, y] = iso(f.cx, f.cy, 15);
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + k * 3.5, y - 2, 3.5, 2.2, k * 0.5, 0, Math.PI * 2); ctx.fillStyle = '#F7C04A'; ctx.fill(); }
  },
  teddy(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.25, 0.14);
    const [x, y] = iso(f.cx, f.cy, 0);
    const c = '#C98F5E'; const l = '#E7C29C';
    dot(ctx, x - 6, y - 3, 4, c); dot(ctx, x + 6, y - 3, 4, c);
    ctx.beginPath(); ctx.ellipse(x, y - 10, 8, 9, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y - 9, 4.6, 5.4, 0, 0, Math.PI * 2); ctx.fillStyle = l; ctx.fill();
    dot(ctx, x - 6, y - 26, 3, c); dot(ctx, x + 6, y - 26, 3, c); dot(ctx, x - 6, y - 26, 1.5, l); dot(ctx, x + 6, y - 26, 1.5, l);
    dot(ctx, x, y - 21, 7, c);
    dot(ctx, x, y - 19, 3, l); dot(ctx, x, y - 20, 1, '#2B2321');
    dot(ctx, x - 2.6, y - 23, 0.9, '#2B2321'); dot(ctx, x + 2.6, y - 23, 0.9, '#2B2321');
    ctx.fillStyle = '#E83217'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 4, y - 16); ctx.lineTo(x - 4, y - 12); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 4, y - 16); ctx.lineTo(x + 4, y - 12); ctx.closePath(); ctx.fill();
  },
  candles(ctx, p, P, theme, t) {
    const f = frame(p);
    const pos = [[-0.15, -0.1, 12], [0.12, -0.05, 9], [0, 0.15, 7]];
    shadow(ctx, f.cx, f.cy, 0.25, 0.1);
    pos.forEach(([dx, dy, h], i) => {
      cyl(ctx, f.cx + dx, f.cy + dy, 0.06, 0, h, tone('#FFF4E0'));
      const [x, y] = iso(f.cx + dx, f.cy + dy, h + 3);
      const fl = 1 + Math.sin((t || 0) * 14 + i * 2) * 0.15;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, 'rgba(255,200,110,0.55)'); g.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFB020'; ctx.beginPath(); ctx.ellipse(x, y, 1.5 * fl, 3 * fl, 0, 0, Math.PI * 2); ctx.fill();
    });
  },
  pumpkin(ctx, p, P, theme, t) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.3, 0.14);
    const [x, y] = iso(f.cx, f.cy, 0);
    for (const [dx, w] of [[-6, 7], [6, 7], [0, 9]]) { ctx.beginPath(); ctx.ellipse(x + dx, y - 10, w, 10, 0, 0, Math.PI * 2); ctx.fillStyle = dx ? '#E0701F' : '#F2872E'; ctx.fill(); }
    ctx.fillStyle = '#4E7A2E'; ctx.fillRect(x - 1.2, y - 23, 2.4, 5);
    const glow = 0.75 + Math.sin((t || 0) * 5) * 0.2;
    ctx.fillStyle = `rgba(255,220,90,${glow})`;
    ctx.beginPath(); ctx.moveTo(x - 6, y - 13); ctx.lineTo(x - 3, y - 16); ctx.lineTo(x - 1.5, y - 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 6, y - 13); ctx.lineTo(x + 3, y - 16); ctx.lineTo(x + 1.5, y - 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x + 6, y - 8); ctx.lineTo(x + 3, y - 5); ctx.lineTo(x, y - 7); ctx.lineTo(x - 3, y - 5); ctx.closePath(); ctx.fill();
  },
  snowman(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.4, 0.16);
    const [x, y] = iso(f.cx, f.cy, 0);
    dot(ctx, x, y - 12, 12, '#FFFFFF'); ctx.strokeStyle = 'rgba(150,170,200,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y - 12, 12, 0, Math.PI * 2); ctx.stroke();
    dot(ctx, x, y - 30, 8, '#FFFFFF'); ctx.beginPath(); ctx.arc(x, y - 30, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#2B2B33'; ctx.fillRect(x - 7, y - 38, 14, 2.5); ctx.fillRect(x - 4.5, y - 47, 9, 9);
    ctx.fillStyle = '#E83217'; ctx.fillRect(x - 4.5, y - 40.5, 9, 2);
    dot(ctx, x - 3, y - 31, 1.1, '#2B2B33'); dot(ctx, x + 3, y - 31, 1.1, '#2B2B33');
    ctx.fillStyle = '#F2872E'; ctx.beginPath(); ctx.moveTo(x, y - 29); ctx.lineTo(x + 7, y - 27.5); ctx.lineTo(x, y - 27); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E83217'; ctx.fillRect(x - 7, y - 23, 14, 3);
    for (const z of [8, 14, 18]) dot(ctx, x, y - z, 1.2, '#2B2B33');
  },
  photo_stand(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.35, 0.12);
    const [x, y] = iso(f.cx, f.cy, 0);
    ctx.strokeStyle = '#7A5A40'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x - 3, y - 40); ctx.moveTo(x + 9, y); ctx.lineTo(x + 3, y - 40); ctx.moveTo(x, y + 2); ctx.lineTo(x, y - 30); ctx.stroke();
    ctx.fillStyle = '#E83217'; roundRectPath(ctx, x - 20, y - 70, 40, 34, 4); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; roundRectPath(ctx, x - 16, y - 66, 32, 26, 3); ctx.fill();
    ctx.font = `900 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#E83217'; ctx.fillText('HAPPY', x, y - 56); ctx.font = `800 6px ${FONT}`; ctx.fillText('DAY', x, y - 47);
  },
  flower_stand(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.35, 0.12);
    const [x, y] = iso(f.cx, f.cy, 0);
    ctx.strokeStyle = '#B8A48A'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x - 2, y - 52); ctx.moveTo(x + 10, y); ctx.lineTo(x + 2, y - 52); ctx.stroke();
    const r = seeded(p.x * 3 + p.y * 11);
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; dot(ctx, x + Math.cos(a) * 14, y - 70 + Math.sin(a) * 14, 4 + r() * 1.5, ['#FF8FB1', '#FFFFFF', '#F7C04A', '#FF5C8A'][i % 4]); }
    dot(ctx, x, y - 70, 9, '#FFF7F0');
    ctx.fillStyle = '#E83217'; ctx.fillRect(x - 3, y - 62, 6, 34);
    ctx.save(); ctx.translate(x, y - 50); ctx.font = `800 5.5px ${FONT}`; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ['축', '하'].forEach((ch, i) => ctx.fillText(ch, 0, -6 + i * 8)); ctx.restore();
  },
  cake_tower(ctx, p) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.42, 0.14);
    cyl(ctx, f.cx, f.cy, 0.4, 0, 6, tone('#E9E2D6'));
    cyl(ctx, f.cx, f.cy, 0.34, 6, 18, { top: '#FFF4F0', left: '#FFE3DA', right: '#F5CABE' });
    cyl(ctx, f.cx, f.cy, 0.25, 18, 29, { top: '#FFFFFF', left: '#FFEDE6', right: '#F7D6CB' });
    cyl(ctx, f.cx, f.cy, 0.16, 29, 38, { top: '#FFF4F0', left: '#FFE3DA', right: '#F5CABE' });
    const [x, y] = iso(f.cx, f.cy, 38); dot(ctx, x, y - 2, 2.6, '#E83217'); ctx.fillStyle = '#4E7A2E'; ctx.fillRect(x - 0.6, y - 6, 1.2, 3);
    for (const [z, rr] of [[12, 0.34], [24, 0.25]]) { const [cx, cy] = iso(f.cx, f.cy, z); ctx.fillStyle = '#E83217'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx - rr * 40 + i * rr * 16, cy + Math.sin(i) * 1.2, 1.2, 0, Math.PI * 2); ctx.fill(); } }
  },
  neon_stand(ctx, p, P, theme, t) {
    const f = frame(p);
    shadow(ctx, f.cx, f.cy, 0.25, 0.12);
    cyl(ctx, f.cx, f.cy, 0.14, 0, 4, tone('#2B2B33'));
    cyl(ctx, f.cx, f.cy, 0.02, 4, 40, tone('#55555F'));
    const [x, y] = iso(f.cx, f.cy, 50);
    const pulse = 0.75 + Math.sin((t || 0) * 4) * 0.25;
    ctx.save(); ctx.shadowColor = '#FF4FA0'; ctx.shadowBlur = 10 * pulse; starShape(ctx, x, y, 11, `rgba(255,79,160,${pulse})`, true); ctx.restore();
  },
};

function bed(ctx, p, blanket, pillows) {
  const f = frame(p);
  shadow(ctx, f.cx, f.cy, Math.max(p.w, p.h) * 0.45, 0.14);
  box(ctx, f.x0 + 0.05, f.y0 + 0.05, f.x1 - 0.05, f.y1 - 0.05, 0, 12, tone(WOOD));
  box(ctx, f.x0 + 0.1, f.y0 + 0.1, f.x1 - 0.1, f.y1 - 0.1, 12, 20, tone('#FBF8F3'));
  // 머리판은 벽 쪽(뒤)
  if (f.r) {
    box(ctx, f.x0 + 0.02, f.y0 + 0.05, f.x0 + 0.14, f.y1 - 0.05, 0, 34, tone(WOOD_D));
    box(ctx, f.x0 + 0.62, f.y0 + 0.08, f.x1 - 0.08, f.y1 - 0.08, 20, 22, tone(blanket));
    for (let i = 0; i < pillows; i++) { const a = f.y0 + 0.15 + i * ((f.y1 - f.y0 - 0.3) / pillows); box(ctx, f.x0 + 0.18, a, f.x0 + 0.52, a + (f.y1 - f.y0 - 0.3) / pillows - 0.05, 20, 25, tone('#FFFFFF')); }
  } else {
    box(ctx, f.x0 + 0.05, f.y0 + 0.02, f.x1 - 0.05, f.y0 + 0.14, 0, 34, tone(WOOD_D));
    box(ctx, f.x0 + 0.08, f.y0 + 0.62, f.x1 - 0.08, f.y1 - 0.08, 20, 22, tone(blanket));
    for (let i = 0; i < pillows; i++) { const a = f.x0 + 0.15 + i * ((f.x1 - f.x0 - 0.3) / pillows); box(ctx, a, f.y0 + 0.18, a + (f.x1 - f.x0 - 0.3) / pillows - 0.05, f.y0 + 0.52, 20, 25, tone('#FFFFFF')); }
  }
}
function sofa(ctx, p, c) {
  const f = frame(p);
  shadow(ctx, f.cx, f.cy, Math.max(p.w, p.h) * 0.45, 0.14);
  const base = tone(c); const back = tone(shade(c, -0.08));
  box(ctx, f.x0 + 0.05, f.y0 + 0.05, f.x1 - 0.05, f.y1 - 0.05, 0, 14, base);
  if (f.r) {
    box(ctx, f.x0 + 0.05, f.y0 + 0.05, f.x0 + 0.32, f.y1 - 0.05, 14, 34, back);
    box(ctx, f.x0 + 0.05, f.y0 + 0.05, f.x1 - 0.05, f.y0 + 0.2, 14, 24, back);
    box(ctx, f.x0 + 0.05, f.y1 - 0.2, f.x1 - 0.05, f.y1 - 0.05, 14, 24, back);
  } else {
    box(ctx, f.x0 + 0.05, f.y0 + 0.05, f.x1 - 0.05, f.y0 + 0.32, 14, 34, back);
    box(ctx, f.x0 + 0.05, f.y0 + 0.05, f.x0 + 0.2, f.y1 - 0.05, 14, 24, back);
    box(ctx, f.x1 - 0.2, f.y0 + 0.05, f.x1 - 0.05, f.y1 - 0.05, 14, 24, back);
  }
}
function plant(ctx, p, pot, potH, leafR, leafH, n) {
  const f = frame(p);
  shadow(ctx, f.cx, f.cy, pot + 0.12, 0.16);
  cyl(ctx, f.cx, f.cy, pot, 0, potH, tone('#C9785A'));
  const [x, y] = iso(f.cx, f.cy, potH);
  const r = seeded(p.x * 31 + p.y * 3);
  const leaf = ['#5A9E4B', '#6DB35A', '#4B8A3E'];
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2; const d = r() * leafR * 0.7; ctx.fillStyle = leaf[i % 3]; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * d, y - leafH * 0.45 - r() * leafH + Math.sin(a) * d * 0.4, 4 + r() * (leafR * 0.25), 6 + r() * (leafR * 0.3), a, 0, Math.PI * 2); ctx.fill(); }
}
function starShape(ctx, x, y, R, color, hollow) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? R * 0.45 : R; const px = x + Math.cos(a) * r; const py = y + Math.sin(a) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  ctx.closePath();
  if (hollow) { ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// ---------- 바닥에 까는 소품 ----------
const FLAT = {
  rug_round(ctx, p) {
    const f = frame(p);
    const [x, y] = iso(f.cx, f.cy);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5);
    const r = Math.min(p.w, p.h) * HW * 0.66;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#E9A08A'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r - 8, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  },
  rug_rect(ctx, p) {
    const f = frame(p);
    const i = 0.12;
    const pts = [iso(f.x0 + i, f.y0 + i), iso(f.x1 - i, f.y0 + i), iso(f.x1 - i, f.y1 - i), iso(f.x0 + i, f.y1 - i)];
    fillPoly(ctx, pts, '#6E86C9');
    strokePoly(ctx, [iso(f.x0 + 0.3, f.y0 + 0.3), iso(f.x1 - 0.3, f.y0 + 0.3), iso(f.x1 - 0.3, f.y1 - 0.3), iso(f.x0 + 0.3, f.y1 - 0.3)], 'rgba(255,255,255,0.55)', 1.6);
    const [x, y] = iso(f.cx, f.cy); ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); ctx.rotate(Math.PI / 4); ctx.strokeStyle = 'rgba(255,230,140,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(-12, -12, 24, 24); ctx.restore();
  },
};

// ---------- 벽 장식 (x=0 이면 왼쪽 벽, y=0 이면 오른쪽 벽) ----------
function onWall(ctx, it, z, fn) {
  const side = it.y === 0 ? 'R' : 'L';
  const a = side === 'R' ? it.x + 0.5 : it.y + 0.5;
  const [sx, sy] = wallPt(side, a, z, 0.03);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.transform(1, side === 'L' ? -0.5 : 0.5, 0, 1, 0, 0);
  fn(ctx, side);
  ctx.restore();
}
const WALLS = {
  frame_photo(ctx, it) { onWall(ctx, it, 76, (c) => { c.fillStyle = '#B68A5E'; c.fillRect(-11, -14, 22, 28); c.fillStyle = '#9CC8D9'; c.fillRect(-8, -11, 16, 22); c.fillStyle = '#6DB35A'; c.beginPath(); c.moveTo(-8, 11); c.lineTo(-2, 2); c.lineTo(3, 7); c.lineTo(8, 0); c.lineTo(8, 11); c.closePath(); c.fill(); dot(c, 4, -5, 2.2, '#FFE08A'); }); },
  poster(ctx, it) { onWall(ctx, it, 74, (c) => { c.fillStyle = '#FFFFFF'; c.fillRect(-11, -17, 22, 34); c.fillStyle = '#E83217'; c.fillRect(-9, -15, 18, 14); c.font = `900 6px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFFFFF'; c.fillText('PARTY', 0, -8); c.fillStyle = '#2B2B33'; c.fillRect(-7, 2, 14, 2); c.fillRect(-7, 6, 10, 2); c.fillRect(-7, 10, 12, 2); }); },
  clock(ctx, it) { onWall(ctx, it, 82, (c) => { c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.fillStyle = '#FFFFFF'; c.fill(); c.strokeStyle = '#2B2B33'; c.lineWidth = 2; c.stroke(); const now = new Date(); const hA = ((now.getHours() % 12) / 12) * Math.PI * 2; const mA = (now.getMinutes() / 60) * Math.PI * 2; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(hA) * 5, -Math.cos(hA) * 5); c.stroke(); c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(mA) * 8, -Math.cos(mA) * 8); c.stroke(); }); },
  garland(ctx, it) { onWall(ctx, it, 98, (c) => { c.strokeStyle = 'rgba(80,70,60,0.5)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-16, 0); c.quadraticCurveTo(0, 8, 16, 0); c.stroke(); const cols = ['#E83217', '#F7C04A', '#2F6BFF', '#22A86B']; for (let i = 0; i < 5; i++) { const x = -13 + i * 6.5; const y = Math.sin(((i + 0.5) / 5) * Math.PI) * 4; c.fillStyle = cols[i % 4]; c.beginPath(); c.moveTo(x - 2.6, y); c.lineTo(x + 2.6, y); c.lineTo(x, y + 7); c.closePath(); c.fill(); } }); },
  window(ctx, it) { onWall(ctx, it, 68, (c) => { c.fillStyle = '#FFFFFF'; c.fillRect(-14, -20, 28, 40); const g = c.createLinearGradient(0, -17, 0, 17); g.addColorStop(0, '#9FD3FF'); g.addColorStop(1, '#E6F4FF'); c.fillStyle = g; c.fillRect(-11, -17, 22, 34); c.fillStyle = '#FFFFFF'; c.fillRect(-1, -17, 2, 34); c.fillRect(-11, -1, 22, 2); c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(-5, -10, 4, 2, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(232,50,23,0.25)'; c.fillRect(-15, -22, 30, 4); }); },
  shelf_wall(ctx, it) { onWall(ctx, it, 62, (c) => { c.fillStyle = '#9C7350'; c.fillRect(-15, 0, 30, 3); c.fillStyle = '#C9785A'; c.fillRect(-11, -8, 7, 8); c.fillStyle = '#6DB35A'; c.beginPath(); c.ellipse(-7.5, -11, 5, 4, 0, 0, Math.PI * 2); c.fill(); for (let i = 0; i < 4; i++) { c.fillStyle = ['#E85A4F', '#4F7BE8', '#F4B740', '#5DBB7A'][i]; c.fillRect(2 + i * 3, -11 + (i % 2) * 2, 2.4, 11 - (i % 2) * 2); } }); },
  neon_heart(ctx, it, t) { onWall(ctx, it, 80, (c) => { const k = 0.75 + Math.sin((t || 0) * 3) * 0.25; c.shadowColor = '#FF4FA0'; c.shadowBlur = 10 * k; c.strokeStyle = `rgba(255,120,190,${k})`; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, 9); c.bezierCurveTo(-14, 0, -9, -12, 0, -4); c.bezierCurveTo(9, -12, 14, 0, 0, 9); c.stroke(); }); },
  neon_party(ctx, it, t) { onWall(ctx, it, 84, (c) => { const k = 0.75 + Math.sin((t || 0) * 2.4) * 0.25; c.shadowColor = '#3EE6FF'; c.shadowBlur = 10 * k; c.font = `900 11px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeStyle = `rgba(62,230,255,${k})`; c.lineWidth = 1.2; c.strokeText('PARTY', 0, 0); c.fillStyle = `rgba(210,250,255,${k * 0.7})`; c.fillText('PARTY', 0, 0); }); },
};

// ---------- 천장에 매다는 소품 ----------
export function drawHangItem(ctx, p, t) {
  const f = frame(p);
  const [x, y] = iso(f.cx, f.cy, WALL_H - 8);
  ctx.strokeStyle = 'rgba(80,80,90,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x, y - 9); ctx.stroke();
  const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#9AA3B5');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.6;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x - 9, y + i * 3.6); ctx.lineTo(x + 9, y + i * 3.6); ctx.stroke(); }
  const r = seeded(Math.floor((t || 0) * 4));
  for (let i = 0; i < 5; i++) { const a = r() * Math.PI * 2; const d = 30 + r() * 60; ctx.fillStyle = ['rgba(255,120,190,0.5)', 'rgba(120,220,255,0.5)', 'rgba(255,240,150,0.5)'][i % 3]; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + 40 + Math.sin(a) * d * 0.5, 2.2, 0, Math.PI * 2); ctx.fill(); }
}

// ---------- 밖에서 부르는 함수 ----------
export function drawItem(ctx, p, P, theme, t) {
  const f = STAND[p.item];
  if (f) f(ctx, p, P, theme, t);
}
/** 고정 그림에 넣는 소품: 러그(바닥)와 벽 장식 */
export function paintStaticItems(ctx, map, t = 0) {
  for (const p of map.props) {
    if (p.kind !== 'item') continue;
    if (p.place === 'flat' && FLAT[p.item]) FLAT[p.item](ctx, p);
  }
  for (const p of map.props) {
    if (p.kind !== 'item' || p.place !== 'wall') continue;
    const w = WALLS[p.item];
    if (w) w(ctx, p, t);
  }
}
export const isLiveItem = (id) => ['lamp', 'arcade', 'aquarium', 'xmas_tree', 'balloons', 'candles', 'pumpkin', 'neon_stand'].includes(id);

/** 상점·편집기용 작은 그림 */
export function paintItemIcon(canvas, id, { bg = null, t = 0 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const w = canvas.clientWidth || canvas.width; const h = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  const it = ITEMS[id];
  if (!it) return;
  if (it.cat === 'paper' || it.cat === 'floor') {
    const c = it.col;
    const g = ctx.createLinearGradient(0, 0, w, h);
    c.forEach((col, i) => g.addColorStop(i / Math.max(1, c.length - 1), col));
    ctx.fillStyle = g; roundRectPath(ctx, w * 0.14, h * 0.14, w * 0.72, h * 0.72, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    return;
  }
  const fp = footprint(id, 0);
  const span = it.cat === 'wall' ? 1.4 : Math.max(fp.w + fp.h, 2);
  const tall = it.cat === 'wall' ? 60 : (it.tall || 30) + (it.place === 'hang' ? 30 : 0);
  const unit = Math.min(w / (span * HW + 16), h / (span * HH + tall + 26));
  ctx.translate(w / 2, h - 10 * unit);
  ctx.scale(unit, unit);
  const p = { kind: 'item', item: id, x: 0, y: 0, w: fp.w, h: fp.h, r: 0, place: it.place };
  const [ox, oy] = iso(fp.w, fp.h);
  ctx.translate(-ox / 2 + (fp.w - fp.h) * 0, -oy + 4);
  if (it.cat === 'wall') {
    ctx.translate(ox / 2, oy - 30);
    const fake = { ...p, x: 0, y: 0 };
    const W2 = WALLS[id]; if (W2) { ctx.save(); ctx.translate(0, 60); W2(ctx, { ...fake, x: 1, y: 0 }, t); ctx.restore(); }
    return;
  }
  if (it.place === 'flat') { FLAT[id] && FLAT[id](ctx, p); return; }
  if (it.place === 'hang') { ctx.translate(0, 90); drawHangItem(ctx, p, t); return; }
  drawItem(ctx, p, {}, 'home', t);
}
