// 아바타: 머리가 큰 2.5D 캐릭터를 코드로 그립니다.
// 발끝이 (0, 0)이고, 위쪽이 음수입니다. 방향 0: 오른쪽 아래, 1: 왼쪽 아래, 2: 왼쪽 위(뒷모습), 3: 오른쪽 위(뒷모습)
import { shade } from './art.js';

export const SKINS = ['#FFE3CC', '#F7D2B3', '#EBB68F', '#C98E62', '#8D5A3B'];
export const HAIR_COLORS = ['#2A2321', '#4E3324', '#7A4B2A', '#D9AE5F', '#F08DB0', '#5F84F2', '#C7CCD4', '#C2412D'];
export const TOP_COLORS = ['#E83217', '#2F6BFF', '#22A86B', '#F5B82E', '#8E5CF7', '#FF7AA8', '#2B2D35', '#F4F4F2', '#6EC3F2', '#F07F2A'];
export const BOTTOMS = [
  { name: '청바지', color: '#3D5A87' }, { name: '검정 바지', color: '#2A2B33' }, { name: '베이지 바지', color: '#CDB38C' },
  { name: '반바지', color: '#4F6E5A', shorts: true }, { name: '치마', color: '#A23452', skirt: true }, { name: '트레이닝', color: '#9AA1AC', stripe: true },
];
export const PARTS = [
  { key: 'skin', label: '피부', colors: SKINS },
  { key: 'hair', label: '헤어', names: ['짧은 머리', '가르마', '단발', '긴 머리', '포니테일', '곱슬', '짧게 민 머리', '똥머리'] },
  { key: 'hairColor', label: '머리색', colors: HAIR_COLORS },
  { key: 'top', label: '상의', names: ['티셔츠', '후드티', '셔츠', '줄무늬 티', '니트', '재킷', '원피스', '멜빵'] },
  { key: 'topColor', label: '옷 색', colors: TOP_COLORS },
  { key: 'bottom', label: '하의', names: BOTTOMS.map((b) => b.name) },
  { key: 'acc', label: '소품', names: ['없음', '고깔모자', '선글라스', '야광봉', '생일 왕관', '안경', '고양이 귀', '꽃핀', '비니'] },
];

export function randomLook(rand = Math.random) {
  const pick = (n) => Math.floor(rand() * n);
  return { skin: pick(4), hair: pick(8), hairColor: pick(rand() < 0.7 ? 4 : 8), top: pick(8), topColor: pick(10), bottom: pick(6), acc: rand() < 0.45 ? 0 : pick(9) };
}

const OUT = 'rgba(40,28,36,0.38)';
function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y); ctx.lineTo(x + w - k, y); ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k); ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k); ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}
const fill = (ctx, c) => { ctx.fillStyle = c; ctx.fill(); };
const stroke = (ctx, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };
function limb(ctx, x1, y1, x2, y2, w, c) {
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = OUT; ctx.lineWidth = w + 1.2; ctx.stroke();
  ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke();
}
const dot = (ctx, x, y, r, c) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };

export function drawAvatar(ctx, look, o = {}) {
  const L = look || {};
  const skin = SKINS[L.skin] || SKINS[1];
  const hc = HAIR_COLORS[L.hairColor] || HAIR_COLORS[0];
  const tc = TOP_COLORS[L.topColor] || TOP_COLORS[0];
  const bot = BOTTOMS[L.bottom] || BOTTOMS[0];
  const hair = L.hair || 0; const top = L.top || 0; const acc = L.acc || 0;
  const dir = o.dir ?? 1;
  const back = dir === 2 || dir === 3;
  const flip = dir === 1 || dir === 2;
  const t = o.t || 0; const em = o.emote || null; const et = o.emoteT || 0;
  const walk = !!o.walk && !o.sit; const ph = o.phase || 0; const low = !!o.low;
  const s = o.scale || 1;

  ctx.save();
  if (s !== 1) ctx.scale(s, s);
  if (flip) ctx.scale(-1, 1);
  let bob = walk ? -Math.abs(Math.sin(ph)) * 2.2 : Math.sin(t * 2.2 + (o.seed || 0)) * 0.5;
  let sway = 0;
  if (em === 'dance') { bob = -Math.abs(Math.sin(et * 9)) * 4; sway = Math.sin(et * 4.5) * 0.16; }
  if (em === 'cheers' && et < 0.7) bob -= Math.sin((et / 0.7) * Math.PI) * 5;
  if (em === 'hand' || em === 'wave') bob -= 0.5;
  const sit = !!o.sit;
  ctx.translate(0, bob + (sit ? 7 : 0));
  if (sway) ctx.rotate(sway);

  const legCol = top === 7 ? tc : bot.color;
  const isDress = top === 6;

  // 뒤로 내려오는 머리 (앞모습일 때 몸 뒤)
  if (!back) backHair(ctx, hair, hc, false);

  // 다리
  drawLegs(ctx, { sit, walk, ph, legCol, skin, bot: top === 7 ? { color: tc } : bot, isDress, back });

  // 팔 자세
  const pose = armPose(em, et, walk, ph, sit, acc === 3);

  // 뒷모습은 팔을 먼저 (몸 뒤에 가려짐)
  if (back) drawArms(ctx, pose, top, tc, skin, 'all');
  // 후드 모자 (앞모습: 목 뒤)
  if (top === 1 && !back) { ctx.beginPath(); ctx.ellipse(0, -27.5, 11.5, 4.6, 0, 0, Math.PI * 2); fill(ctx, shade(tc, -0.2)); }
  drawTorso(ctx, top, tc, skin, back, low);
  if (!back) drawArms(ctx, pose, top, tc, skin, 'low');

  // 머리
  drawHead(ctx, skin, back);
  if (!back) {
    drawFace(ctx, o, em, et, low);
    frontHair(ctx, hair, hc, low);
  } else {
    backHair(ctx, hair, hc, true);
    if (top === 1) { ctx.beginPath(); ctx.ellipse(0, -27, 12, 6, 0, Math.PI, Math.PI * 2); fill(ctx, shade(tc, -0.15)); }
  }
  drawAcc(ctx, acc, back, hc, tc);
  if (o.crown && acc !== 4) crown(ctx);
  // 머리 위로 올린 팔은 머리 다음에 그림
  if (!back) drawArms(ctx, pose, top, tc, skin, 'high');
  // 손에 든 것
  if (!back) heldItems(ctx, pose);
  else if (pose.glow) glowStick(ctx, pose.rh[0], pose.rh[1]);
  ctx.restore();
}

function armPose(em, et, walk, ph, sit, glow) {
  // 왼손(lh)과 오른손(rh) 위치
  let lh = [-10.5, -14.5]; let rh = [10.5, -14.5]; let glass = false;
  if (walk) { lh = [-10.2 + Math.sin(ph) * 2.2, -14.5]; rh = [10.2 - Math.sin(ph) * 2.2, -14.5]; }
  if (sit) { lh = [-5.5, -11.5]; rh = [5.5, -11.5]; }
  if (em === 'clap') { const d = 1.6 + Math.abs(Math.sin(et * 13)) * 4.2; lh = [-d, -20]; rh = [d, -20]; }
  else if (em === 'cheers') { rh = [14, -37]; glass = true; }
  else if (em === 'hand') rh = [15.5, -50];
  else if (em === 'wave') rh = [16 + Math.sin(et * 11) * 3.2, -46];
  else if (em === 'heart') { lh = [-2.4, -21]; rh = [2.4, -21]; }
  else if (em === 'dance') { lh = [-15, -33 + Math.sin(et * 9) * 7]; rh = [15, -33 - Math.sin(et * 9) * 7]; }
  return { lh, rh, glass, glow: glow && !em };
}

function drawLegs(ctx, { sit, walk, ph, legCol, skin, bot, isDress, back }) {
  const shoe = '#2E2F38';
  if (sit) {
    for (const x of [-3.4, 3.4]) { rr(ctx, x - 2.8, -13, 5.6, 8, 2.6); fill(ctx, isDress || bot.shorts ? skin : legCol); stroke(ctx, OUT, 0.8); }
    for (const x of [-3.4, 3.4]) { ctx.beginPath(); ctx.ellipse(x + 0.6, -5, 3.3, 2.2, 0, 0, Math.PI * 2); fill(ctx, shoe); }
    if (bot.skirt && !isDress) { ctx.beginPath(); ctx.moveTo(-9.5, -13); ctx.lineTo(9.5, -13); ctx.lineTo(10.5, -8); ctx.lineTo(-10.5, -8); ctx.closePath(); fill(ctx, bot.color); }
    return;
  }
  const lift = (k) => (walk ? Math.max(0, Math.sin(ph + k * Math.PI)) * 2.6 : 0);
  const legs = [[-3.4, lift(0)], [3.4, lift(1)]];
  for (const [x, up] of legs) {
    const y0 = -13; const y1 = -1.5 - up;
    const showSkin = isDress || bot.skirt;
    rr(ctx, x - 2.6, y0, 5.2, y1 - y0, 2.4); fill(ctx, showSkin ? skin : legCol); stroke(ctx, OUT, 0.8);
    if (bot.shorts && !isDress) { rr(ctx, x - 2.9, y0, 5.8, 6, 2); fill(ctx, legCol); }
    if (bot.stripe && !isDress) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x + (x < 0 ? -2.4 : 1.3), y0 + 1, 1.1, y1 - y0 - 2); }
    ctx.beginPath(); ctx.ellipse(x + (back ? 0 : 0.7), -1.4 - up, 3.5, 2.2, 0, 0, Math.PI * 2); fill(ctx, shoe);
  }
  if (bot.skirt && !isDress) { ctx.beginPath(); ctx.moveTo(-9.3, -13); ctx.lineTo(9.3, -13); ctx.lineTo(11.2, -5.5); ctx.lineTo(-11.2, -5.5); ctx.closePath(); fill(ctx, bot.color); stroke(ctx, OUT, 0.8); }
}

function drawTorso(ctx, top, tc, skin, back, low) {
  const inner = top === 5 ? '#FFFFFF' : top === 7 ? '#F4F1EA' : tc;
  // 기본 몸통
  rr(ctx, -9.5, -28.5, 19, 18, 6.5);
  fill(ctx, top === 7 ? inner : (top === 5 ? tc : tc));
  if (top === 6) {
    // 원피스 치마
    ctx.beginPath(); ctx.moveTo(-9.5, -15); ctx.lineTo(9.5, -15); ctx.lineTo(12.5, -4.5); ctx.quadraticCurveTo(0, -2.5, -12.5, -4.5); ctx.closePath();
    fill(ctx, tc); stroke(ctx, OUT, 0.8);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(-9.5, -15.5, 19, 1.5);
  }
  rr(ctx, -9.5, -28.5, 19, 18, 6.5); stroke(ctx, OUT, 1);
  // 오른쪽 그늘
  if (!low) { ctx.save(); rr(ctx, -9.5, -28.5, 19, 18, 6.5); ctx.clip(); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(4, -29, 7, 20); ctx.restore(); }
  if (back) {
    if (top === 7) { ctx.strokeStyle = shade(tc, -0.1); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-5, -28); ctx.lineTo(4, -17); ctx.moveTo(5, -28); ctx.lineTo(-4, -17); ctx.stroke(); rr(ctx, -9.5, -17, 19, 6.5, 3); fill(ctx, tc); }
    return;
  }
  ctx.save(); rr(ctx, -9.5, -28.5, 19, 18, 6.5); ctx.clip();
  switch (top) {
    case 1: // 후드티
      rr(ctx, -6, -18.5, 12, 6, 2.5); fill(ctx, shade(tc, -0.12));
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2.2, -27.5); ctx.lineTo(-2.6, -22); ctx.moveTo(2.2, -27.5); ctx.lineTo(2.6, -22); ctx.stroke();
      break;
    case 2: // 셔츠
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(-6, -28.5); ctx.lineTo(0, -24); ctx.lineTo(-1, -28.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, -28.5); ctx.lineTo(0, -24); ctx.lineTo(1, -28.5); ctx.closePath(); ctx.fill();
      for (const y of [-21, -17, -13]) dot(ctx, 0, y, 0.9, 'rgba(255,255,255,0.85)');
      break;
    case 3: // 줄무늬
      ctx.fillStyle = tc === '#F4F4F2' ? 'rgba(30,40,80,0.75)' : 'rgba(255,255,255,0.85)';
      for (const y of [-25, -21, -17, -13]) ctx.fillRect(-10, y, 20, 1.8);
      break;
    case 4: // 니트
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.8;
      for (let x = -8; x <= 8; x += 2.2) { ctx.beginPath(); ctx.moveTo(x, -27); ctx.lineTo(x, -12); ctx.stroke(); }
      ctx.fillStyle = shade(tc, -0.15); ctx.fillRect(-10, -13.5, 20, 3.2);
      break;
    case 5: // 재킷
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-3, -29, 6, 19);
      ctx.fillStyle = shade(tc, -0.18);
      ctx.beginPath(); ctx.moveTo(-3, -28.5); ctx.lineTo(-6.5, -28.5); ctx.lineTo(-3, -20); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(3, -28.5); ctx.lineTo(6.5, -28.5); ctx.lineTo(3, -20); ctx.closePath(); ctx.fill();
      break;
    case 6: // 원피스 허리 리본
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-10, -16.5, 20, 2);
      break;
    case 7: // 멜빵
      rr(ctx, -6.5, -22, 13, 12, 2); fill(ctx, tc);
      ctx.strokeStyle = tc; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-5.5, -29); ctx.lineTo(-5, -21); ctx.moveTo(5.5, -29); ctx.lineTo(5, -21); ctx.stroke();
      dot(ctx, -4.6, -21, 0.9, '#F5D36B'); dot(ctx, 4.6, -21, 0.9, '#F5D36B');
      rr(ctx, -2.8, -19.5, 5.6, 3.5, 1); fill(ctx, shade(tc, -0.15));
      ctx.fillStyle = tc; ctx.fillRect(-10, -13, 20, 4);
      break;
    default: break;
  }
  ctx.restore();
}

function drawArms(ctx, pose, top, tc, skin, which) {
  const longSleeve = [1, 2, 4, 5].includes(top);
  const sleeve = top === 7 ? '#F4F1EA' : tc;
  for (const [side, hand] of [[-1, pose.lh], [1, pose.rh]]) {
    const high = hand[1] < -30;
    if ((which === 'low' && high) || (which === 'high' && !high)) continue;
    const sx = side * 8.6; const sy = -25.2;
    if (longSleeve) limb(ctx, sx, sy, hand[0], hand[1], 5, sleeve);
    else {
      const mx = sx + (hand[0] - sx) * 0.45; const my = sy + (hand[1] - sy) * 0.45;
      limb(ctx, mx, my, hand[0], hand[1], 4.4, skin);
      limb(ctx, sx, sy, mx, my, 5.2, sleeve);
    }
    dot(ctx, hand[0], hand[1], 2.7, skin);
  }
}

function drawHead(ctx, skin, back) {
  if (!back) { dot(ctx, -13.6, -40, 3.2, skin); dot(ctx, 13.6, -40, 3.2, skin); dot(ctx, -13.6, -40, 1.5, shade(skin, -0.1)); dot(ctx, 13.6, -40, 1.5, shade(skin, -0.1)); }
  ctx.beginPath(); ctx.ellipse(0, -41, 14.2, 13.4, 0, 0, Math.PI * 2);
  fill(ctx, skin); stroke(ctx, OUT, 1);
}

function drawFace(ctx, o, em, et, low) {
  const fs = 1.6;
  const blink = ((o.t || 0) + (o.seed || 0) * 1.7) % 4.3 < 0.13;
  const happy = em === 'cheers' || em === 'dance' || em === 'clap' || em === 'heart';
  for (const x of [-5 + fs, 5 + fs]) {
    if (blink || em === 'heart') {
      ctx.strokeStyle = '#2B2321'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath();
      if (em === 'heart' || happy) ctx.arc(x, -39.2, 2, Math.PI * 1.1, Math.PI * 1.9); else { ctx.moveTo(x - 1.8, -40); ctx.lineTo(x + 1.8, -40); }
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(x, -40, 1.9, 2.5, 0, 0, Math.PI * 2); fill(ctx, '#2B2321');
      if (!low) dot(ctx, x + 0.6, -41, 0.75, '#FFFFFF');
    }
  }
  if (!low) { ctx.fillStyle = 'rgba(255,120,120,0.32)'; for (const x of [-8.6 + fs, 8.6 + fs]) { ctx.beginPath(); ctx.ellipse(x, -35.6, 2.6, 1.5, 0, 0, Math.PI * 2); ctx.fill(); } }
  if (happy) {
    ctx.beginPath(); ctx.moveTo(fs - 2.8, -35); ctx.quadraticCurveTo(fs, -30.5, fs + 2.8, -35); ctx.closePath(); fill(ctx, '#8E2B2B');
  } else {
    ctx.strokeStyle = '#5B2E2A'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(fs, -36.2, 2.3, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
  }
}

function capPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-14.9, -38);
  ctx.bezierCurveTo(-16.5, -52, -9, -57.5, 0, -57.2);
  ctx.bezierCurveTo(9, -57.5, 16.5, -52, 14.9, -38);
}

function backHair(ctx, hair, hc, isBackView) {
  const dark = shade(hc, -0.12);
  if (!isBackView) {
    if (hair === 2) { rr(ctx, -16.2, -51, 32.4, 24.5, 9); fill(ctx, dark); }
    if (hair === 3) { ctx.beginPath(); ctx.moveTo(-16, -44); ctx.quadraticCurveTo(-18, -22, -14.5, -14); ctx.lineTo(14.5, -14); ctx.quadraticCurveTo(18, -22, 16, -44); ctx.closePath(); fill(ctx, dark); }
    if (hair === 4) { ctx.beginPath(); ctx.ellipse(15.5, -38, 4.2, 9, 0.35, 0, Math.PI * 2); fill(ctx, dark); }
    return;
  }
  // 뒷모습: 머리 전체를 덮음
  if (hair === 3) { ctx.beginPath(); ctx.moveTo(-15.5, -46); ctx.quadraticCurveTo(-17.5, -22, -13.5, -13); ctx.lineTo(13.5, -13); ctx.quadraticCurveTo(17.5, -22, 15.5, -46); ctx.closePath(); fill(ctx, hc); }
  if (hair === 2) { rr(ctx, -15.8, -52, 31.6, 25, 9); fill(ctx, hc); }
  ctx.beginPath(); ctx.ellipse(0, -42.5, 14.9, 14.4, 0, 0, Math.PI * 2); fill(ctx, hc);
  ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
  if (hair === 5) for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) dot(ctx, Math.cos(a) * 13.5, -43 + Math.sin(a) * 13, 4.2, hc);
  if (hair === 4) { ctx.beginPath(); ctx.ellipse(0, -30, 4, 9, 0, 0, Math.PI * 2); fill(ctx, dark); dot(ctx, 0, -40, 2.2, '#E83217'); }
  if (hair === 7) { dot(ctx, 0, -58, 6.5, hc); dot(ctx, 0, -53, 2.5, '#E83217'); }
  if (hair === 6) { ctx.beginPath(); ctx.ellipse(0, -42.5, 14.9, 14.4, 0, 0, Math.PI * 2); fill(ctx, 'rgba(255,255,255,0.12)'); }
  // 윤기
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-3, -46, 8, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
}

function frontHair(ctx, hair, hc, low) {
  const hl = 'rgba(255,255,255,0.22)';
  switch (hair) {
    case 0: // 짧은 머리
      capPath(ctx); ctx.lineTo(12.5, -42); ctx.quadraticCurveTo(7, -48, 2, -45); ctx.quadraticCurveTo(-4, -49.5, -10.5, -43); ctx.lineTo(-14.9, -38); ctx.closePath();
      fill(ctx, hc); stroke(ctx, OUT, 0.9); break;
    case 1: // 가르마
      capPath(ctx); ctx.lineTo(13.5, -44); ctx.quadraticCurveTo(10, -52, 4, -51.5); ctx.quadraticCurveTo(-6, -48, -13.5, -41); ctx.lineTo(-14.9, -38); ctx.closePath();
      fill(ctx, hc); stroke(ctx, OUT, 0.9); break;
    case 2: // 단발
      capPath(ctx); ctx.lineTo(15.6, -29); ctx.lineTo(11.5, -29); ctx.lineTo(11.5, -44.5); ctx.lineTo(-11.5, -44.5); ctx.lineTo(-11.5, -29); ctx.lineTo(-15.6, -29); ctx.closePath();
      fill(ctx, hc); stroke(ctx, OUT, 0.9); break;
    case 3: // 긴 머리
      capPath(ctx); ctx.lineTo(16, -22); ctx.quadraticCurveTo(13, -18, 11.2, -22); ctx.lineTo(11.4, -44); ctx.quadraticCurveTo(5, -47.5, 0.5, -51); ctx.quadraticCurveTo(-5, -47.5, -11.4, -44); ctx.lineTo(-11.2, -22); ctx.quadraticCurveTo(-13, -18, -16, -22); ctx.closePath();
      fill(ctx, hc); stroke(ctx, OUT, 0.9); break;
    case 4: // 포니테일
      capPath(ctx); ctx.lineTo(13, -42); ctx.quadraticCurveTo(6, -46, 1, -48.5); ctx.quadraticCurveTo(-7, -46, -12.5, -41); ctx.lineTo(-14.9, -38); ctx.closePath();
      fill(ctx, hc); stroke(ctx, OUT, 0.9);
      dot(ctx, 13.2, -48, 2.2, '#E83217'); break;
    case 5: { // 곱슬
      capPath(ctx); ctx.lineTo(13, -42); ctx.lineTo(-13, -42); ctx.closePath(); fill(ctx, hc);
      for (let i = 0; i <= 8; i++) { const a = Math.PI * (1.05 + i * 0.1125); dot(ctx, Math.cos(a) * 13.4, -42 + Math.sin(a) * 13.2, 4.4, hc); }
      for (const x of [-9, -3, 3, 9]) dot(ctx, x, -45, 3.6, hc);
      break;
    }
    case 6: // 짧게 민 머리
      capPath(ctx); ctx.lineTo(14, -44); ctx.quadraticCurveTo(0, -50.5, -14, -44); ctx.closePath();
      fill(ctx, hc); ctx.globalAlpha = 1; stroke(ctx, OUT, 0.8);
      if (!low) { capPath(ctx); ctx.lineTo(14, -44); ctx.quadraticCurveTo(0, -50.5, -14, -44); ctx.closePath(); fill(ctx, 'rgba(255,255,255,0.1)'); }
      break;
    case 7: // 똥머리
      dot(ctx, 0, -58.5, 6.6, hc); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
      capPath(ctx); ctx.lineTo(12.5, -42); ctx.quadraticCurveTo(6, -46.5, 0, -45); ctx.quadraticCurveTo(-6, -46.5, -12.5, -42); ctx.lineTo(-14.9, -38); ctx.closePath();
      fill(ctx, hc); stroke(ctx, OUT, 0.9); break;
    default: break;
  }
  if (!low && hair !== 6) { ctx.strokeStyle = hl; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-2, -46.5, 8.5, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke(); }
}

function crown(ctx) {
  ctx.beginPath();
  ctx.moveTo(-8.5, -53); ctx.lineTo(-9, -61); ctx.lineTo(-4.4, -56.5); ctx.lineTo(0, -63.5); ctx.lineTo(4.4, -56.5); ctx.lineTo(9, -61); ctx.lineTo(8.5, -53); ctx.closePath();
  fill(ctx, '#F7C04A'); stroke(ctx, '#C98A14', 0.9);
  dot(ctx, 0, -57, 1.4, '#E83217'); dot(ctx, -5, -55.5, 1, '#2F6BFF'); dot(ctx, 5, -55.5, 1, '#22A86B');
}

function drawAcc(ctx, acc, back, hc, tc) {
  const fs = 1.6;
  switch (acc) {
    case 1: { // 고깔모자
      ctx.save();
      ctx.beginPath(); ctx.moveTo(-7.5, -53); ctx.lineTo(7.5, -53); ctx.lineTo(2, -74); ctx.closePath();
      ctx.fillStyle = '#FFC531'; ctx.fill(); ctx.clip();
      ctx.fillStyle = '#E83217'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-12, -55 - i * 6); ctx.lineTo(12, -61 - i * 6); ctx.lineTo(12, -58 - i * 6); ctx.lineTo(-12, -52 - i * 6); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-7.5, -53); ctx.lineTo(7.5, -53); ctx.lineTo(2, -74); ctx.closePath(); stroke(ctx, OUT, 0.9);
      dot(ctx, 2, -74.5, 2.8, '#FFFFFF');
      break;
    }
    case 2: // 선글라스
      if (back) { ctx.strokeStyle = '#1E1E24'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-14, -41); ctx.lineTo(14, -41); ctx.stroke(); break; }
      for (const x of [-5 + fs, 5 + fs]) { rr(ctx, x - 4, -42.8, 8, 5.4, 2.2); fill(ctx, '#1E1E24'); }
      ctx.strokeStyle = '#1E1E24'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-1 + fs, -41); ctx.lineTo(1 + fs, -41); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-7 + fs, -42, 2, 1); ctx.fillRect(3 + fs, -42, 2, 1);
      break;
    case 4: crown(ctx); break;
    case 5: // 안경
      if (back) break;
      ctx.strokeStyle = '#2B2B33'; ctx.lineWidth = 1.2;
      for (const x of [-5 + fs, 5 + fs]) { ctx.beginPath(); ctx.arc(x, -40, 3.7, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-1.3 + fs, -40.5); ctx.lineTo(1.3 + fs, -40.5); ctx.stroke();
      break;
    case 6: // 고양이 귀
      for (const sd of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sd * 12.5, -48); ctx.lineTo(sd * 9, -61); ctx.lineTo(sd * 3.5, -53.5); ctx.closePath(); fill(ctx, '#2B2321'); stroke(ctx, OUT, 0.8);
        ctx.beginPath(); ctx.moveTo(sd * 10.5, -50); ctx.lineTo(sd * 8.6, -57.5); ctx.lineTo(sd * 5.6, -53.5); ctx.closePath(); fill(ctx, '#FF9EB8');
      }
      break;
    case 7: // 꽃핀
      if (back) { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; dot(ctx, -9 + Math.cos(a) * 2.6, -50 + Math.sin(a) * 2.6, 2.3, '#FF8FB1'); } dot(ctx, -9, -50, 1.6, '#F7C04A'); break; }
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; dot(ctx, 10 + Math.cos(a) * 2.6, -49 + Math.sin(a) * 2.6, 2.3, '#FF8FB1'); }
      dot(ctx, 10, -49, 1.6, '#F7C04A');
      break;
    case 8: { // 비니
      const bc = tc === '#F4F4F2' ? '#E83217' : shade(tc, -0.08);
      ctx.beginPath(); ctx.moveTo(-15.4, -43); ctx.bezierCurveTo(-16.5, -57, -8, -61.5, 0, -61.2); ctx.bezierCurveTo(8, -61.5, 16.5, -57, 15.4, -43); ctx.closePath();
      fill(ctx, bc); stroke(ctx, OUT, 0.9);
      rr(ctx, -15.8, -46.5, 31.6, 6, 3); fill(ctx, shade(bc, -0.15)); stroke(ctx, OUT, 0.8);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.8; for (let x = -12; x <= 12; x += 3) { ctx.beginPath(); ctx.moveTo(x, -46); ctx.lineTo(x, -41); ctx.stroke(); }
      dot(ctx, 0, -62, 3.6, '#FFFFFF');
      break;
    }
    default: break;
  }
}

function glowStick(ctx, x, y) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(80,255,220,0.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + 2.5, y - 13); ctx.stroke();
  ctx.strokeStyle = '#7CFFE3'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + 2.5, y - 13); ctx.stroke();
  ctx.restore();
}

function heldItems(ctx, pose) {
  if (pose.glow) glowStick(ctx, pose.rh[0], pose.rh[1]);
  if (pose.glass) {
    const [x, y] = pose.rh;
    // 잔
    ctx.beginPath(); ctx.moveTo(x - 3.2, y - 9); ctx.lineTo(x + 3.2, y - 9); ctx.lineTo(x + 2.4, y + 1); ctx.lineTo(x - 2.4, y + 1); ctx.closePath();
    fill(ctx, 'rgba(255,255,255,0.75)'); stroke(ctx, 'rgba(60,60,80,0.5)', 0.8);
    ctx.beginPath(); ctx.moveTo(x - 2.9, y - 6); ctx.lineTo(x + 2.9, y - 6); ctx.lineTo(x + 2.3, y + 0.5); ctx.lineTo(x - 2.3, y + 0.5); ctx.closePath(); fill(ctx, '#F7B733');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x - 3, y - 9, 6, 2.6);
    dot(ctx, x, y, 2.6, SKINS[1]);
  }
}

// UI용 작은 아바타 그림 (캔버스에 가운데 맞춰 그림)
export function paintAvatarIcon(canvas, look, { dir = 0, bg = null, zoom = 1, crown = false } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const w = canvas.clientWidth || canvas.width; const h = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  const s = (h / 82) * zoom;
  ctx.translate(w / 2, h * 0.93);
  ctx.scale(s, s);
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 4, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
  drawAvatar(ctx, look, { dir, t: 1, crown });
}
