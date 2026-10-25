// 오락실 화면: 미니게임 고르기 → 설명 → 3·2·1 → 게임 → 결과 (코인·경험치·최고 기록)
import { h, toast, sheet } from './ui.js';
import { ARCADE, ARCADE_IDS, gradeOf } from '../shared/arcade-meta.js';
import { ARCADE_COINS } from '../shared/missions.js';
import { MiniGame, GRADE_COLOR } from './minigames.js';
import { P, gainText } from './profile.js';
import { play } from './sound.js';

let cur = null;

/**
 * opts: { game, duel: { game, seed, onScore(score), isDone() }, onClose }
 */
export function openArcade(opts = {}) {
  closeArcade();
  const root = h('div', { class: 'arc', role: 'dialog', 'aria-modal': 'true', 'aria-label': '오락실' });
  const A = cur = { root, opts, game: null, run: null };
  if (window.__qa) window.__qa.arc = A;
  document.body.append(root);
  document.body.classList.add('arc-open');
  A.onKey = (ev) => { if (ev.key === 'Escape' && !A.run) closeArcade(); };
  document.addEventListener('keydown', A.onKey);
  if (opts.duel) intro(A, opts.duel.game);
  else if (opts.game && ARCADE[opts.game]) intro(A, opts.game);
  else menu(A);
  return A;
}

export function closeArcade() {
  const A = cur;
  if (!A) return;
  cur = null;
  if (A.run) A.run.stop();
  clearInterval(A.tick);
  document.removeEventListener('keydown', A.onKey);
  A.root.remove();
  document.body.classList.remove('arc-open');
  if (A.opts.onClose) A.opts.onClose();
}
export const arcadeOpen = () => !!cur;

function head(A, title, back) {
  const v = P.ready ? P.view() : null;
  return h('div', { class: 'arc-head' },
    back ? h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: back }, '←') : h('span', { class: 'arc-logo' }, '🕹️'),
    h('b', null, title),
    h('span', { class: 'spacer' }),
    v ? h('span', { class: 'pill coin' }, '🪙 ', v.coins.toLocaleString()) : null,
    h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: () => { if (A.run && !A.opts.duel) { A.run.stop(); A.run = null; } closeArcade(); } }, '✕'));
}

function menu(A) {
  if (A.run) { A.run.stop(); A.run = null; }
  const v = P.view();
  const cards = ARCADE_IDS.map((id) => {
    const g = ARCADE[id];
    const best = v.best[id] || 0;
    const gr = best ? gradeOf(id, best) : null;
    return h('button', { class: 'arc-card', style: { '--c': g.color }, onclick: () => intro(A, id) },
      h('span', { class: 'ac-ic' }, g.icon),
      h('b', null, g.name),
      h('small', null, best ? `최고 ${best.toLocaleString()}점` : '아직 기록 없음'),
      gr ? h('i', { class: 'grade', style: { background: GRADE_COLOR[gr] } }, gr) : null);
  });
  A.root.replaceChildren(head(A, '쏘플 오락실'),
    h('div', { class: 'arc-body' },
      h('p', { class: 'arc-note' }, v.arcadeCoinsLeft > 0 ? `오늘 미니게임으로 코인 ${v.arcadeCoinsLeft}개를 더 받을 수 있어요. 등급이 높을수록 많이 받아요.` : '오늘 받을 수 있는 코인은 다 받았어요. 기록 도전은 계속할 수 있어요!'),
      h('div', { class: 'arc-grid' }, cards),
      h('div', { class: 'arc-row' }, h('button', { class: 'btn ghost', onclick: () => openRank(ARCADE_IDS[0]) }, '🏆 랭킹 보기'))));
}

function intro(A, id) {
  if (A.run) { A.run.stop(); A.run = null; }
  A.game = id;
  const g = ARCADE[id];
  const v = P.view();
  const best = v.best[id] || 0;
  const duel = A.opts.duel;
  const grades = h('div', { class: 'arc-grades' }, ['B', 'A', 'S'].map((k, i) => h('span', null, h('i', { class: 'grade', style: { background: GRADE_COLOR[k] } }, k), `${g.grade[i].toLocaleString()}점`)));
  const startBtn = h('button', { class: 'btn primary lg block', onclick: () => countdown(A, id) }, duel ? '대결 시작을 기다리는 중…' : '시작하기');
  if (duel) startBtn.disabled = true;
  A.root.replaceChildren(head(A, duel ? '미니게임 대결' : g.name, duel ? null : () => menu(A)),
    h('div', { class: 'arc-body intro', style: { '--c': g.color } },
      h('div', { class: 'arc-hero' }, g.icon),
      h('h2', null, g.name),
      h('p', { class: 'arc-desc' }, g.desc),
      h('p', { class: 'arc-how' }, '조작 · ', g.how, g.sec ? ` · ${g.sec}초` : ''),
      grades,
      best ? h('p', { class: 'arc-best' }, `내 최고 기록 ${best.toLocaleString()}점`) : null,
      startBtn,
      duel ? h('p', { class: 'arc-note' }, '방에 있는 모두가 같은 판으로 동시에 해요. 끝나면 점수가 자동으로 올라가요.') : h('button', { class: 'btn ghost block', onclick: () => openRank(id) }, '🏆 이 게임 랭킹')));
  if (duel) {
    // 대결은 방장이 시작하면 바로
    clearInterval(A.tick);
    A.tick = setInterval(() => { if (duel.started && duel.started()) { clearInterval(A.tick); countdown(A, id); } }, 150);
  }
}

function countdown(A, id) {
  const g = ARCADE[id];
  const cv = h('canvas', { class: 'arc-cv' });
  const score = h('b', { class: 'arc-score' }, '0');
  const time = h('span', { class: 'arc-time' }, g.sec ? `${g.sec}초` : '');
  const big = h('div', { class: 'arc-count' }, '3');
  const stage = h('div', { class: 'arc-stage' }, cv, big);
  A.root.replaceChildren(
    h('div', { class: 'arc-head play' }, h('span', { class: 'arc-logo' }, g.icon), h('b', null, g.name), h('span', { class: 'spacer' }), time, score,
      A.opts.duel ? null : h('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: () => { if (A.run) A.run.stop(); A.run = null; intro(A, id); } }, '✕')),
    stage);
  let n = 3;
  play('tick');
  const step = () => {
    if (cur !== A) return;
    n -= 1;
    if (n > 0) { big.textContent = String(n); play('tick'); setTimeout(step, 650); return; }
    big.textContent = '시작!'; play('start');
    setTimeout(() => big.remove(), 450);
    start(A, id, cv, score, time);
  };
  setTimeout(step, 650);
}

function start(A, id, cv, scoreEl, timeEl) {
  const duel = A.opts.duel;
  const pet = P.petCard();
  A.run = new MiniGame(cv, id, {
    seed: duel ? duel.seed : undefined,
    pet,
    onScore: (s) => { scoreEl.textContent = s.toLocaleString(); },
    onTick: (left) => { timeEl.textContent = `${Math.ceil(left)}초`; timeEl.classList.toggle('low', left < 6); },
    onEnd: (r) => finish(A, id, r),
  });
}

async function finish(A, id, { score, ms }) {
  if (cur !== A) return;
  A.run = null;
  const g = ARCADE[id];
  const duel = A.opts.duel;
  if (duel) duel.onScore(score);
  const grade = gradeOf(id, score);
  let gains = null; let err = null;
  try { gains = await P.act('score', { game: id, score, ms: Math.max(ms, g.ms[0]) }); } catch (e) { err = e.message; }
  if (cur !== A) return;
  if (grade === 'S' || grade === 'A') play('fanfare'); else play('reveal');
  const coinLine = gains ? [gains.coins ? `🪙 +${gains.coins}` : null, gains.xp ? `경험치 +${gains.xp}` : null].filter(Boolean).join(' · ') : '';
  A.root.replaceChildren(head(A, duel ? '미니게임 대결' : g.name, duel ? null : () => menu(A)),
    h('div', { class: 'arc-body result', style: { '--c': g.color } },
      h('div', { class: 'arc-grade', style: { background: GRADE_COLOR[grade] } }, grade),
      h('div', { class: 'arc-final' }, score.toLocaleString(), h('small', null, '점')),
      gains && gains.newBest ? h('p', { class: 'arc-new' }, '🎉 최고 기록이에요!') : (gains ? h('p', { class: 'arc-best' }, `최고 기록 ${Number(gains.best || 0).toLocaleString()}점`) : null),
      coinLine ? h('p', { class: 'arc-gain' }, coinLine) : null,
      gains && gains.capped ? h('p', { class: 'arc-note' }, `오늘 미니게임 코인(${ARCADE_COINS.dayCap}개)은 다 받았어요.`) : null,
      gains && gains.lv ? h('p', { class: 'arc-new' }, `레벨 ${gains.lv} 달성!`) : null,
      err ? h('p', { class: 'arc-note' }, err) : null,
      duel ? h('p', { class: 'arc-note' }, '점수를 보냈어요. 모두 끝나면 방 화면에 순위가 나와요.') : null,
      duel ? h('button', { class: 'btn primary lg block', onclick: () => closeArcade() }, '파티룸으로 돌아가기')
        : h('div', { class: 'arc-row' },
          h('button', { class: 'btn primary lg', onclick: () => countdown(A, id) }, '한 번 더'),
          h('button', { class: 'btn ghost lg', onclick: () => menu(A) }, '다른 게임')),
      duel ? null : h('button', { class: 'btn ghost block', onclick: () => openRank(id) }, '🏆 랭킹 보기')));
  if (gains && gains.lv) play('level');
}

// ---------- 랭킹 ----------
export function openRank(game) {
  let period = 'day'; let id = game;
  const tabs = h('div', { class: 'seg' });
  const pick = h('div', { class: 'chip-row' });
  const list = h('div', { class: 'rank-list' }, h('p', { class: 'hint' }, '불러오는 중…'));
  const render = async () => {
    tabs.replaceChildren(...[['day', '오늘'], ['week', '이번 주']].map(([k, l]) => h('button', { class: k === period ? 'on' : '', onclick: () => { period = k; render(); } }, l)));
    pick.replaceChildren(...ARCADE_IDS.map((k) => h('button', { class: 'chip' + (k === id ? ' on' : ''), onclick: () => { id = k; render(); } }, ARCADE[k].icon, ' ', ARCADE[k].name)));
    if (!P.online) { list.replaceChildren(h('p', { class: 'sheet-text' }, '랭킹은 쏘플 홈페이지에 연결됐을 때 볼 수 있어요.')); return; }
    list.replaceChildren(h('p', { class: 'hint' }, '불러오는 중…'));
    try {
      const j = await P.rank(id, period);
      const rows = (j.list || []).map((r, i) => h('div', { class: 'rank-row' + (r.me ? ' me' : '') }, h('b', { class: 'rk' + (i < 3 ? ' top' : '') }, i + 1), h('span', { class: 'nm' }, r.nick, h('small', null, ` Lv.${r.lv}`)), h('span', { class: 'sc' }, Number(r.score).toLocaleString())));
      list.replaceChildren(...[...(rows.length ? rows : [h('p', { class: 'sheet-text' }, '아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!')]),
        j.me ? h('p', { class: 'hint' }, `내 순위 ${j.me.rank}위 · ${Number(j.me.score).toLocaleString()}점`) : (!P.isMember() ? h('p', { class: 'hint' }, '로그인하면 내 기록도 랭킹에 올라가요.') : null)].filter(Boolean));
    } catch (e) { list.replaceChildren(h('p', { class: 'sheet-text' }, e.message)); }
  };
  sheet({ title: '미니게임 랭킹', wide: true, body: h('div', null, tabs, pick, list) });
  render();
}

export function arcadeToast(g) {
  if (g && (g.coins || g.xp)) toast(gainText(g), 'good');
}
