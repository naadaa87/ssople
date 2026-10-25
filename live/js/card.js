// 결과 카드와 단체 사진 카드: 이미지로 만들어 저장·공유
import { drawAvatar } from './avatar.js';

const FONT = 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif';
const RED = '#E83217';
const INK = '#1F1A1D';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function dateText(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
function fit(ctx, text, max, size, weight = 800) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > max && s > 18) { s -= 2; ctx.font = `${weight} ${s}px ${FONT}`; }
  return s;
}
function header(ctx, W, brand) {
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, 1350);
  const g = ctx.createLinearGradient(0, 0, 0, 520);
  g.addColorStop(0, '#FFF1EC'); g.addColorStop(1, '#FFFFFF');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 520);
  ctx.fillStyle = RED; rr(ctx, 64, 64, 46, 46, 12); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `900 26px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', 87, 88);
  ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = `800 26px ${FONT}`; ctx.fillText(brand, 126, 88);
  ctx.textAlign = 'right'; ctx.fillStyle = '#8A8186'; ctx.font = `600 24px ${FONT}`; ctx.fillText(dateText(), W - 64, 88);
}
function footer(ctx, W, H, text) {
  ctx.fillStyle = '#F7F5F3'; ctx.fillRect(0, H - 150, W, 150);
  ctx.fillStyle = RED; ctx.fillRect(0, H - 150, W, 6);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = INK; ctx.font = `800 30px ${FONT}`; ctx.fillText('다음엔 진짜 파티룸에서 만나요', 64, H - 92);
  ctx.fillStyle = '#8A8186'; ctx.font = `600 22px ${FONT}`; ctx.fillText(text, 64, H - 52);
}

export function makeResultCard({ brand, room, game, label, unit, rank, looks }) {
  const W = 1080; const H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  header(ctx, W, brand);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = RED; ctx.font = `800 30px ${FONT}`; ctx.fillText(`${game} 결과`, 64, 200);
  const s = fit(ctx, room, W - 128, 62, 900);
  ctx.fillStyle = INK; ctx.font = `900 ${s}px ${FONT}`; ctx.fillText(room, 64, 270);
  ctx.fillStyle = '#8A8186'; ctx.font = `600 24px ${FONT}`; ctx.fillText(label, 64, 312);

  const top = rank[0];
  // 아무도 점수를 못 냈거나, 1등이 여럿일 때는 문구를 바꿔요
  const none = !!top && rank.every((r) => !r.pts);
  const tied = top ? rank.filter((r) => (r.place || 1) === (top.place || 1)).length : 0;
  // MVP
  ctx.fillStyle = '#FFFFFF'; rr(ctx, 64, 350, W - 128, 360, 28); ctx.fill();
  ctx.strokeStyle = '#F1E4DE'; ctx.lineWidth = 2; ctx.stroke();
  if (top) {
    ctx.save(); ctx.translate(250, 660); ctx.scale(4, 4);
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 4.5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
    drawAvatar(ctx, looks[top.pid], { dir: 0, t: 0.4, crown: !none, emote: 'hand', emoteT: 0.2 });
    ctx.restore();
    const title = none ? '아직 점수가 없어요' : tied > 1 ? `공동 1등 ${tied}명` : '오늘의 MVP';
    const name = none ? '다음 판에서 만나요' : tied > 1 ? `${top.nick} 외 ${tied - 1}명` : top.nick;
    const sub = none ? `모두 0${unit}` : `${top.pts}${unit}${top.tag ? ' · ' + top.tag : ''}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = RED; ctx.font = `800 28px ${FONT}`; ctx.fillText(title, 450, 470);
    const ns = fit(ctx, name, 520, 72, 900);
    ctx.fillStyle = INK; ctx.font = `900 ${ns}px ${FONT}`; ctx.fillText(name, 450, 555);
    ctx.fillStyle = '#4A4247'; ctx.font = `700 34px ${FONT}`; ctx.fillText(sub, 450, 610);
  }
  // 순위
  const rest = rank.slice(1, 7);
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
  rest.forEach((r, i) => {
    const y = 770 + i * 68;
    const place = r.place || i + 2;
    ctx.fillStyle = i % 2 ? '#FFFFFF' : '#FBF8F6'; rr(ctx, 64, y - 44, W - 128, 60, 16); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#8A8186'; ctx.font = `800 26px ${FONT}`; ctx.fillText(none ? '·' : medal[place] || String(place), 92, y - 4);
    ctx.fillStyle = INK; ctx.font = `700 28px ${FONT}`; ctx.fillText(r.nick + (r.tag ? ` · ${r.tag}` : ''), 160, y - 4);
    ctx.textAlign = 'right'; ctx.fillStyle = '#4A4247'; ctx.font = `800 28px ${FONT}`; ctx.fillText(`${r.pts}${unit}`, W - 92, y - 4);
  });
  footer(ctx, W, H, `함께한 사람 ${rank.length}명 · 쏘플 온라인 파티룸`);
  return c;
}

export function makePhotoCard({ brand, room, banner, photo, names }) {
  const W = 1080; const H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  header(ctx, W, brand);
  // 사진
  const pw = W - 128; const ph = Math.round(pw * (photo.height / photo.width));
  ctx.save(); ctx.shadowColor = 'rgba(40,20,20,0.18)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#FFFFFF'; rr(ctx, 52, 140, pw + 24, ph + 24, 24); ctx.fill(); ctx.restore();
  ctx.save(); rr(ctx, 64, 152, pw, ph, 16); ctx.clip(); ctx.drawImage(photo, 64, 152, pw, ph); ctx.restore();
  const y = 152 + ph + 80;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const s = fit(ctx, room, W - 128, 56, 900);
  ctx.fillStyle = INK; ctx.font = `900 ${s}px ${FONT}`; ctx.fillText(room, 64, y);
  if (banner) { ctx.fillStyle = RED; ctx.font = `800 30px ${FONT}`; ctx.fillText(banner, 64, y + 48); }
  const line = names.join(' · ');
  ctx.fillStyle = '#6B6267'; ctx.font = `600 24px ${FONT}`;
  let text = line;
  while (ctx.measureText(text).width > W - 128 && text.length > 4) text = text.slice(0, -2);
  if (text !== line) text += '…';
  ctx.fillText(text, 64, y + (banner ? 92 : 48));
  footer(ctx, W, H, `${dateText()} · 쏘플 온라인 파티룸에서 함께 찍은 사진`);
  return c;
}

export function canvasBlob(canvas) { return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png')); }

export async function shareImage(canvas, filename, text) {
  const blob = await canvasBlob(canvas);
  if (!blob) return 'fail';
  try {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return 'shared'; }
  } catch (err) { if (err && err.name === 'AbortError') return 'cancel'; }
  return downloadBlob(blob, filename);
}

export async function saveImage(canvas, filename) {
  const blob = await canvasBlob(canvas);
  return blob ? downloadBlob(blob, filename) : 'fail';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  return 'saved';
}
