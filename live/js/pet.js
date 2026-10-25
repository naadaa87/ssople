// 펫: 강아지·고양이·토끼·햄스터·펭귄·여우를 코드로 그려요.
// 발끝 가운데가 (0, 0)이고 위쪽이 음수예요. 방향 0·3은 오른쪽, 1·2는 왼쪽을 봐요 (2·3은 뒷모습).
import { PETS } from '../shared/catalog.js';
import { shade } from './art.js';

const OUT = 'rgba(40,28,36,0.42)';
const dot = (ctx, x, y, r, c) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
const ell = (ctx, x, y, rx, ry, c, rot = 0, line = true) => {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
  if (line) { ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke(); }
};
function tri(ctx, pts, c, line = true) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath();
  ctx.fillStyle = c; ctx.fill(); if (line) { ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke(); }
}

export function petColors(pet) {
  const sp = PETS[pet?.kind] || PETS.dog;
  const c = sp.colors[pet?.color] || sp.colors[0];
  return { main: c[0], dark: c[1] };
}

/**
 * o: { dir, t, walk, phase, scale, joy(기뻐서 폴짝), sleep, low }
 */
export function drawPet(ctx, pet, o = {}) {
  if (!pet) return;
  const kind = PETS[pet.kind] ? pet.kind : 'dog';
  const { main, dark } = petColors(pet);
  const dir = o.dir ?? 0;
  const back = dir === 2 || dir === 3;
  const flip = dir === 1 || dir === 2;
  const t = o.t || 0; const ph = o.phase || 0;
  const s = o.scale || 1;
  ctx.save();
  if (s !== 1) ctx.scale(s, s);
  if (flip) ctx.scale(-1, 1);
  let hop = o.walk ? -Math.abs(Math.sin(ph * 1.1)) * 3 : Math.sin(t * 2.6 + (pet.lv || 0)) * 0.4;
  if (o.joy) hop -= Math.abs(Math.sin(t * 9)) * 6;
  ctx.translate(0, hop);
  const legSwing = o.walk ? Math.sin(ph * 1.1) * 2 : 0;
  const light = shade(main, 0.35);
  o = { ...o, pet };
  if (kind === 'penguin') drawPenguin(ctx, main, dark, back, legSwing, o, t);
  else if (kind === 'hamster') drawHamster(ctx, main, dark, light, back, legSwing, o, t);
  else drawFourLeg(ctx, kind, main, dark, light, back, legSwing, o, t);
  ctx.restore();
}

function legs(ctx, c, swing, y = -2) {
  for (const [x, k] of [[-5.5, 1], [-2.5, -1], [3, 1], [6, -1]]) {
    ctx.beginPath(); ctx.ellipse(x + swing * k * 0.5, y + 0.5, 1.7, 2.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
  }
}

function face(ctx, x, y, o, t, opt = {}) {
  const blink = (t * 0.9 + (opt.seed || 0)) % 3.7 < 0.14 || o.sleep;
  const ex = opt.eyeGap || 3.2;
  for (const dx of [-ex / 2 + 0.6, ex / 2 + 1.6]) {
    if (blink) { ctx.strokeStyle = '#2B2321'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(x + dx, y - 0.4, 1.2, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
    else { dot(ctx, x + dx, y, 1.35, '#2B2321'); if (!o.low) dot(ctx, x + dx + 0.45, y - 0.55, 0.45, '#FFFFFF'); }
  }
  if (!o.low) { ctx.fillStyle = 'rgba(255,120,130,0.38)'; ctx.beginPath(); ctx.ellipse(x - 1.6, y + 2.2, 1.4, 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + 4.4, y + 2.2, 1.4, 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
}

function drawFourLeg(ctx, kind, main, dark, light, back, swing, o, t) {
  const hx = 5; const hy = -15;          // 머리 가운데
  // 꼬리 (몸 뒤)
  ctx.lineCap = 'round';
  if (kind === 'cat') {
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.quadraticCurveTo(-14, -12 + Math.sin(t * 3) * 2, -11, -20);
    ctx.strokeStyle = OUT; ctx.lineWidth = 3.6; ctx.stroke(); ctx.strokeStyle = main; ctx.lineWidth = 2.6; ctx.stroke();
  } else if (kind === 'fox') {
    ell(ctx, -11, -10 + Math.sin(t * 3) * 0.8, 5.5, 3.6, main, -0.6);
    ell(ctx, -14.6, -12.6 + Math.sin(t * 3) * 0.8, 2.2, 1.8, '#FFFFFF', -0.6, false);
  } else if (kind === 'rabbit') {
    dot(ctx, -8.5, -7.5, 2.6, '#FFFFFF');
  } else {
    // 강아지: 위로 말린 꼬리, 신나면 흔들어요
    const wag = Math.sin(t * (o.joy || o.walk ? 18 : 5)) * 0.35;
    ctx.save(); ctx.translate(-8, -9); ctx.rotate(-0.9 + wag);
    ell(ctx, 0, -3, 1.8, 3.6, main); ctx.restore();
  }
  legs(ctx, dark, swing);
  // 몸
  ell(ctx, 0, -7.5, kind === 'rabbit' ? 7.5 : 8.6, kind === 'rabbit' ? 6.6 : 6, main);
  if (kind === 'fox' || kind === 'dog') ell(ctx, 3.5, -6.5, 3.4, 3.2, light, 0, false);
  // 귀 (머리 뒤쪽 부분)
  if (kind === 'rabbit') {
    for (const [dx, r] of [[-2.5, -0.15], [2.5, 0.15]]) { ell(ctx, hx + dx, hy - 9, 2.2, 6.2, main, r); ell(ctx, hx + dx, hy - 9, 1.1, 4.4, '#F7B9C4', r, false); }
  }
  // 머리
  ell(ctx, hx, hy, kind === 'cat' ? 7 : 7.2, kind === 'cat' ? 6.4 : 6.6, main);
  if (kind === 'cat' || kind === 'fox') {
    const ear = kind === 'fox' ? 6.5 : 5;
    tri(ctx, [[hx - 6, hy - 2.5], [hx - 4.8, hy - 2.5 - ear], [hx - 1.2, hy - 5]], main);
    tri(ctx, [[hx + 6, hy - 2.5], [hx + 4.8, hy - 2.5 - ear], [hx + 1.2, hy - 5]], main);
    tri(ctx, [[hx - 5, hy - 3.4], [hx - 4.5, hy - 1.8 - ear], [hx - 2.4, hy - 4.8]], '#F7B9C4', false);
    tri(ctx, [[hx + 5, hy - 3.4], [hx + 4.5, hy - 1.8 - ear], [hx + 2.4, hy - 4.8]], '#F7B9C4', false);
  }
  if (kind === 'dog') {
    ell(ctx, hx - 6.2, hy + 0.5, 2.4, 4.6, dark, 0.35);
    ell(ctx, hx + 6.2, hy + 0.5, 2.4, 4.6, dark, -0.35);
  }
  if (back) return;
  // 얼굴
  if (kind === 'dog' || kind === 'fox') {
    ell(ctx, hx + 1.4, hy + 2.6, 3.6, 2.6, kind === 'fox' ? '#FFFFFF' : light, 0, false);
    dot(ctx, hx + 1.6, hy + 1.6, 1.1, '#2B2321');
  } else if (kind === 'cat') {
    dot(ctx, hx + 1.2, hy + 1.6, 0.8, '#E98A97');
    ctx.strokeStyle = 'rgba(60,40,40,0.5)'; ctx.lineWidth = 0.6;
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + 1.2 + k * 2, hy + 2.4); ctx.lineTo(hx + 1.2 + k * 6.4, hy + 1.8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(hx + 1.2 + k * 2, hy + 3); ctx.lineTo(hx + 1.2 + k * 6.2, hy + 3.6); ctx.stroke(); }
  } else if (kind === 'rabbit') {
    dot(ctx, hx + 1.2, hy + 1.8, 0.8, '#E98A97');
  }
  face(ctx, hx - 0.6, hy - 1.4, o, t, { eyeGap: 4.6 });
  accessories(ctx, o.pet || null, hx, hy, kind);
}

function drawHamster(ctx, main, dark, light, back, swing, o, t) {
  legs(ctx, dark, swing * 0.6, -1.5);
  // 둥근 몸 하나에 얼굴
  ell(ctx, 0, -9, 9.4, 8.2, main);
  ell(ctx, 1.5, -6.5, 5.6, 4.6, '#FFF6EC', 0, false);
  dot(ctx, -5, -16.5, 2.6, dark); dot(ctx, 5.5, -16.5, 2.6, dark);
  dot(ctx, -5, -16.5, 1.3, '#F7B9C4'); dot(ctx, 5.5, -16.5, 1.3, '#F7B9C4');
  if (back) return;
  ctx.fillStyle = 'rgba(255,140,150,0.45)'; ctx.beginPath(); ctx.ellipse(-3.8, -8.6, 2.2, 1.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(6, -8.6, 2.2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  dot(ctx, 1.2, -9.2, 0.8, '#E98A97');
  face(ctx, -0.6, -11.6, o, t, { eyeGap: 5 });
  accessories(ctx, o.pet || null, 0.8, -12, 'hamster');
}

function drawPenguin(ctx, main, dark, back, swing, o, t) {
  // 주황 발
  for (const [x, k] of [[-3, 1], [3.5, -1]]) ell(ctx, x + swing * k * 0.4, -0.8, 2.6, 1.3, '#F59E2B');
  // 몸통 (서 있는 모양)
  ell(ctx, 0, -11, 8, 11, main);
  if (!back) ell(ctx, 1.2, -9, 5.2, 8, '#FFFFFF', 0, false);
  // 날개
  const flap = o.joy ? Math.sin(t * 16) * 0.5 : Math.sin(t * 2) * 0.08;
  ell(ctx, -7.4, -11, 2.2, 6, dark, 0.25 + flap);
  ell(ctx, 7.6, -11, 2.2, 6, dark, -0.25 - flap);
  if (back) return;
  tri(ctx, [[0.6, -13.6], [4.6, -12.6], [0.6, -11.6]], '#F59E2B');
  face(ctx, -1.8, -16, o, t, { eyeGap: 5 });
  accessories(ctx, o.pet || null, 1, -17, 'penguin');
}

function accessories(ctx, pet, hx, hy, kind) {
  const acc = pet?.acc || {};
  const top = kind === 'penguin' ? hy - 5 : kind === 'hamster' ? hy - 7 : hy - 6.2;
  if (acc.neck === 'p_bowtie' || acc.neck === 'p_scarf') {
    const ny = kind === 'penguin' ? hy + 6.6 : kind === 'hamster' ? hy + 4.6 : hy + 6;
    const nx = kind === 'penguin' || kind === 'hamster' ? hx : hx - 1;
    if (acc.neck === 'p_bowtie') { tri(ctx, [[nx, ny], [nx - 3.6, ny - 2], [nx - 3.6, ny + 2]], '#E83217'); tri(ctx, [[nx, ny], [nx + 3.6, ny - 2], [nx + 3.6, ny + 2]], '#E83217'); dot(ctx, nx, ny, 1.1, '#B5240F'); }
    else { ctx.beginPath(); ctx.ellipse(nx, ny, 6, 2, 0, 0, Math.PI * 2); ctx.fillStyle = '#E83217'; ctx.fill(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 0.8; ctx.setLineDash([1.6, 1.6]); ctx.stroke(); ctx.setLineDash([]); ell(ctx, nx - 3, ny + 3, 1.6, 2.8, '#E83217', 0.3, false); }
  }
  if (acc.face === 'p_glasses') {
    ctx.strokeStyle = '#1F1A1D'; ctx.lineWidth = 0.9;
    for (const dx of [-1.4, 3.4]) { ctx.beginPath(); ctx.arc(hx + dx - 1, hy - 1.4, 2.1, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(hx + 0.2, hy - 1.4); ctx.lineTo(hx + 1.3, hy - 1.4); ctx.stroke();
  }
  const h = acc.head;
  if (h === 'p_ribbon') { tri(ctx, [[hx + 3, top], [hx - 0.6, top - 2.6], [hx - 0.6, top + 2.2]], '#FF5C8A'); tri(ctx, [[hx + 3, top], [hx + 6.6, top - 2.6], [hx + 6.6, top + 2.2]], '#FF5C8A'); dot(ctx, hx + 3, top, 1.2, '#E23D6E'); }
  else if (h === 'p_party_hat') {
    tri(ctx, [[hx - 3, top + 1], [hx + 3, top + 1], [hx + 0.4, top - 8]], '#2F6BFF');
    ctx.fillStyle = '#F7C04A'; ctx.fillRect(hx - 2, top - 2.6, 4.2, 1.2);
    dot(ctx, hx + 0.4, top - 8.4, 1.4, '#F7C04A');
  } else if (h === 'p_flower') {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; dot(ctx, hx + 4 + Math.cos(a) * 1.8, top + 0.5 + Math.sin(a) * 1.8, 1.4, '#FF8FB1'); }
    dot(ctx, hx + 4, top + 0.5, 1, '#F7C04A');
  } else if (h === 'p_santa') {
    tri(ctx, [[hx - 4, top + 1.2], [hx + 4, top + 1.2], [hx + 6.6, top - 6.5]], '#D7262E');
    ctx.beginPath(); ctx.ellipse(hx, top + 1.4, 4.6, 1.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    dot(ctx, hx + 6.8, top - 6.8, 1.5, '#FFFFFF');
  } else if (h === 'p_crown') {
    tri(ctx, [[hx - 3.6, top + 1], [hx - 3.6, top - 3.4], [hx - 1.8, top - 1.2], [hx, top - 4.4], [hx + 1.8, top - 1.2], [hx + 3.6, top - 3.4], [hx + 3.6, top + 1]], '#F7C04A');
    dot(ctx, hx, top - 0.6, 0.8, '#E83217');
  }
}

/** UI용 작은 펫 그림 */
export function paintPetIcon(canvas, pet, { bg = null, zoom = 1, dir = 0, joy = false, t = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const w = canvas.clientWidth || canvas.width; const h = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  if (!pet) return;
  const s = (h / 34) * zoom;
  ctx.translate(w / 2, h * 0.86);
  ctx.scale(s, s);
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 3, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
  drawPet(ctx, pet, { dir, t, joy, pet });
}
