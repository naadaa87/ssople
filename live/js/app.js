// 쏘플 온라인 파티룸 — 화면 전체를 움직이는 본체
import { h, $, $$, toast, sheet, closeSheets, confirmBox, copyText, fmtTime } from './ui.js';
import * as store from './store.js';
import { Net } from './net.js';
import { DemoNet } from './demo.js';
import { World } from './world.js';
import { GamePanel } from './games-ui.js';
import { PARTS, randomLook, paintAvatarIcon } from './avatar.js';
import { play, playNote, unlockAudio, setSound } from './sound.js';
import { makeResultCard, makePhotoCard, shareImage, saveImage } from './card.js';
import { drawQR, kakaoShare, webShare } from './share.js';
import { GAME_INFO, REACTIONS, EMOTES } from '../shared/content.js';
import { THEMES, LIGHTS, oxSide } from '../shared/maps.js';
import { cleanNick } from '../shared/filter.js';
import { cleanLook } from '../shared/engine.js';
import { ITEMS } from '../shared/catalog.js';
import { P } from './profile.js';
import { renderHub, openShop, openPets, celebrate, THEME_SWATCH } from './hub.js';
import { openArcade, closeArcade, arcadeOpen } from './arcade.js';
import { Editor } from './editor.js';
import { ARCADE } from '../shared/arcade-meta.js';

const BASE = '/live';
const DEMO_CFG = { brand: '쏘플 온라인 파티룸', ai: false, kakaoKey: null, bookingUrl: '/rooms', notice: '', event: null, square: 'SQ1', squareCount: 0, server: '' };
const DENY_TEXT = {
  full: '방이 꽉 찼어요. 자리가 나면 다시 들어와 주세요.',
  locked: '방장이 방을 잠가 두었어요. 방장에게 열어 달라고 해 주세요.',
  banned: '이 방에는 들어갈 수 없어요.',
  closed: '닫힌 방이에요.',
  notfound: '방을 찾을 수 없어요. 코드를 다시 확인해 주세요.',
  nodev: '이 브라우저에서는 저장 공간을 쓸 수 없어 들어가지 못했어요. 다른 브라우저로 열어 주세요.',
};

const S = {
  cfg: null, live: false, path: BASE + '/play',
  dev: store.deviceId(),
  profile: store.load('profile', null),
  settings: store.settings(),
  demoRoom: null,
  room: null,
};
if (!S.profile || !S.profile.look) S.profile = { nick: '', look: randomLook() };
S.profile.look = cleanLook(S.profile.look);
// 체험판을 다른 페이지 안에 넣어 보여 줄 때 (서버 없이, 저장·공유가 막힌 환경)
const EMBED = !!window.SSOPLE_EMBED;
// 자동 점검용 연결 고리 (주소에 ?qa 가 있을 때만)
if (/[?&]qa\b/.test(location.search)) window.__qa = { S, P };

// ---------- 시작 ----------
boot();

async function boot() {
  applySettings();
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio);
  document.addEventListener('click', onActClick);
  $('#nick').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); enterFromJoin(); } });
  if (!EMBED) window.addEventListener('popstate', () => route(location.pathname + location.search));
  S.cfg = await loadConfig();
  S.live = !!S.cfg.server;
  await P.init({ social: S.live, offline: !S.cfg.site });
  syncIdentity();
  P.on(() => { updateHead(); if (!$('#v-hub').hidden && !S.hubBusy) drawHub(); });
  route(EMBED ? BASE + '/demo' : location.pathname + location.search, true);
  setInterval(tickTimers, 200);
}

async function getJson(url, ms = 3500, opt = {}) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store', ...opt });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(tm); }
}

// 홈페이지 설정(같은 주소의 /api/live/config) → 실시간 서버 주소 → 실시간 서버 설정
async function loadConfig() {
  if (location.protocol === 'file:' || EMBED) return { ...DEMO_CFG, site: null };
  const site = await getJson('/api/live/config');
  const server = String((site && site.server) || window.SSOPLE_LIVE_SERVER || '').replace(/\/+$/, '');
  const rt = server ? await getJson(server + '/api/config') : null;
  const ok = !!(rt && rt.ok);
  return {
    ...DEMO_CFG,
    ...(ok ? { ai: !!rt.ai, event: rt.event || null, square: rt.square || 'SQ1', squareCount: rt.squareCount || 0, kakaoKey: rt.kakaoKey || null, notice: rt.notice || '' } : {}),
    ...(site ? { notice: site.notice || (ok ? rt.notice : '') || '', kakaoKey: site.kakaoKey || (ok ? rt.kakaoKey : null), bookingUrl: site.bookingUrl || '/rooms', boardNotice: site.boardNotice || '' } : {}),
    server: ok ? server : '',
    site,
  };
}

function api(path) { return S.cfg.server + path; }

// 회원이면 계정에 저장된 이름·모습을 쓰고, 처음이면 지금 모습을 저장
function syncIdentity() {
  const pv = P.profile || {};
  if (pv.nick) S.profile.nick = pv.nick;
  if (pv.look) S.profile.look = cleanLook(pv.look);
  if (!S.profile.nick && P.user && P.user.nick) S.profile.nick = cleanNick(P.user.nick, '');
  store.save('profile', S.profile);
  if ((!pv.nick || !pv.look) && S.profile.nick) P.act('look', { nick: S.profile.nick, look: S.profile.look }).catch(() => {});
}

function applySettings() {
  setSound(S.settings.sound);
  document.body.classList.toggle('low', !!S.settings.low);
}

function stat(k) {
  if (!S.live) return;
  try { fetch(api('/api/stat'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k }), keepalive: true }).catch(() => {}); } catch { /* 무시 */ }
}

/** 미션에 세는 일 — 실제 파티룸(실시간 서버)에서만 */
function ev(R, k, n = 1) {
  if (!R || R.local || R.tv) return;
  P.event(k, n);
}

// ---------- 화면 이동 ----------
function go(path, opt = {}) {
  if (!EMBED) { try { history[opt.replace ? 'replaceState' : 'pushState']({}, '', path); } catch { /* 무시 */ } }
  route(path, false, opt);
}

function parseRoute(path) {
  const u = new URL(path, 'http://x');
  let p = u.pathname.replace(/\/+$/, '') || '/';
  if (p === BASE || p.startsWith(BASE + '/')) p = p.slice(BASE.length) || '/';
  let m = p.match(/^\/(r|tv)\/([A-Za-z0-9]{3,8})$/);
  if (m) return { view: m[1] === 'tv' ? 'tv' : 'room', code: m[2].toUpperCase() };
  const r = u.searchParams.get('r');
  if (r && /^[A-Za-z0-9]{3,8}$/.test(r)) return { view: u.searchParams.get('tv') ? 'tv' : 'room', code: r.toUpperCase() };
  if (p === '/square' || u.searchParams.has('square')) return { view: 'square' };
  if (p === '/demo' || u.searchParams.has('demo')) return { view: 'demo' };
  if (p === '/home') return { view: 'myhome' };
  if (p === '/studio') return { view: 'studio' };
  m = p.match(/^\/arcade(?:\/([a-z]+))?$/);
  if (m) return { view: 'hub', arcade: m[1] || true };
  if (p === '/app' || p === '/index' || p === '/app.html') return { view: 'hub', fix: true };
  return { view: 'hub' };
}

function route(path, first, opt = {}) {
  S.path = path;
  if (S.room) leaveRoom(true);
  closeSheets();
  closeArcade();
  const r = parseRoute(path);
  if (r.fix && !EMBED) { try { history.replaceState({}, '', BASE + '/play'); } catch { /* 무시 */ } }
  if (!S.live && ['room', 'tv', 'square'].includes(r.view)) {
    if (first) toast('지금은 실시간 서버에 연결하지 못해 체험 방으로 안내할게요.');
    return showJoin({ kind: 'demo', code: 'DEMO01' });
  }
  if (r.view === 'room') return showJoin({ kind: 'party', code: r.code, visit: !!opt.visit });
  if (r.view === 'tv') return enterRoom({ kind: 'party', code: r.code, tv: true });
  if (r.view === 'square') return showJoin({ kind: 'square', code: S.cfg.square || 'SQ1' });
  if (r.view === 'demo') return showJoin({ kind: 'demo', code: 'DEMO01' });
  if (r.view === 'myhome' || r.view === 'studio') {
    const t = { kind: r.view, code: r.view === 'myhome' ? 'HOME01' : 'STUDIO' };
    return S.profile.nick ? enterRoom(t) : showJoin(t);
  }
  showHub(r.arcade);
}

function show(id) {
  for (const v of $$('.view')) v.hidden = v.id !== id;
  document.body.classList.toggle('in-room', id === 'v-room');
  window.scrollTo(0, 0);
}

function onActClick(ev) {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (['home', 'square', 'hub'].includes(act)) ev.preventDefault();
  if (act === 'home' || act === 'hub') go(BASE + '/play');
  else if (act === 'create') openCreate();
  else if (act === 'join') openJoinCode();
  else if (act === 'square') go(BASE + '/square');
  else if (act === 'demo') startDemo();
  else if (act === 'random') { S.profile.look = randomLook(); joinEditor && joinEditor.set(S.profile.look); }
  else if (act === 'enter') enterFromJoin();
}

function startDemo() {
  S.demoRoom = { name: '쏘플 체험 파티룸', theme: 'home', banner: '처음 오신 걸 환영해요!' };
  go(BASE + '/demo');
}

// ---------- 로비 ----------
function pauseHero() { /* 첫 화면 미리보기는 홈페이지(/live)로 옮겼어요 */ }

const loginUrl = () => '/login?next=' + encodeURIComponent(BASE + '/play');
const signupUrl = () => '/signup?next=' + encodeURIComponent(BASE + '/play');

const hubApi = {
  go: (path, opt) => go(path, opt),
  cfg: () => S.cfg,
  nick: () => S.profile.nick,
  look: () => S.profile.look,
  openAvatar: () => openAvatar(null),
  openCreate: () => openCreate(),
  openJoinCode: () => openJoinCode(),
  openArcade: (game) => openArcade({ game }),
  openRequests: () => { location.href = BASE + '/requests'; },
  loginUrl, signupUrl,
  petChanged: () => {},
  async publicRooms() {
    if (!S.live) return null;
    const j = await getJson(api('/api/public'), 5000);
    return j && Array.isArray(j.rooms) ? j : null;
  },
  goWhere(where) {
    if (where === 'arcade') openArcade({});
    else if (where === 'pet') openPets(hubApi);
    else if (where === 'home') go(BASE + '/home');
    else if (where === 'party' || where === 'create') openCreate();
    else if (where === 'public') { const el = $('.hub-rooms'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (where === 'square') go(BASE + '/square');
  },
};

function showHub(arcade) {
  show('v-hub');
  document.title = '쏘플 온라인 파티룸 — 로비';
  drawHub();
  if (arcade) openArcade({ game: typeof arcade === 'string' ? arcade : null, onClose: () => { if (location.pathname.startsWith(BASE + '/arcade')) { try { history.replaceState({}, '', BASE + '/play'); } catch { /* 무시 */ } } } });
}

function drawHub() {
  renderHub($('#hub-root'), hubApi);
  updateHead();
}

function updateHead() {
  if (!P.ready) return;
  const v = P.view();
  for (const el of $$('.hd-coin')) el.textContent = '🪙 ' + v.coins.toLocaleString();
  const u = $('#hd-user');
  if (u) u.replaceChildren(P.isMember() ? h('a', { class: 'btn sm ghost', href: '/mypage' }, (P.user.nick || '내 정보')) : (P.online ? h('a', { class: 'btn sm primary', href: loginUrl() }, '로그인') : ''));
}

// ---------- 방 만들기 / 코드로 들어가기 ----------
function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', { class: 'hint', style: { textAlign: 'left', display: 'block', marginTop: '4px' } }, hint) : null);
}

function openCreate(opt = {}) {
  const v = P.view();
  const mine = v.room;
  const hasMine = mine.items.length > 0 || mine.theme !== 'home' || mine.light !== 'warm' || !!mine.banner;
  const st = { kind: opt.kind || 'party', theme: mine.theme || 'home', useMine: opt.mine ?? hasMine };
  const nick = S.profile.nick || '나';
  const name = h('input', { class: 'inp', maxlength: 20, placeholder: '예: 민지 생일 파티' });
  const banner = h('input', { class: 'inp', maxlength: 24, placeholder: '예: 민지야 생일 축하해! (선택)', value: st.useMine ? mine.banner || '' : '' });
  const cap = h('select', { class: 'inp' }, Array.from({ length: 11 }, (_, i) => i + 2).map((n) => h('option', { value: n, selected: n === 8 }, `${n}명`)));
  const pub = h('input', { type: 'checkbox' });
  const err = h('p', { class: 'hint', style: { color: 'var(--red)' } });
  const kinds = h('div', { class: 'seg' });
  const themes = h('div', { class: 'opt-row' });
  const mineRow = h('label', { class: 'toggle' }, h('span', null, '내가 꾸민 파티룸으로 열기', h('small', null, `테마·조명·소품 ${mine.items.length}개를 그대로 가져가요`)), h('input', { type: 'checkbox', checked: st.useMine, onchange: (e) => { st.useMine = e.target.checked; draw(); } }));
  const themeField = h('div', { class: 'field' }, h('span', null, '테마'), themes);
  const bannerField = field('현수막 문구', banner, '무대 뒤 벽에 걸려요. 나중에 바꿀 수 있어요.');
  const homeNote = h('p', { class: 'sheet-text' }, `내가 꾸민 집(소품 ${v.home.items.length}개)으로 친구들을 초대해요. 펫도 함께 맞이해요. 집을 바꾸고 싶으면 먼저 「내 집」에서 꾸며 주세요.`);
  const draw = () => {
    kinds.replaceChildren(...[['party', '🎉 파티룸'], ['home', '🏠 우리 집 집들이']].map(([k, l]) => h('button', { type: 'button', class: k === st.kind ? 'on' : '', onclick: () => { st.kind = k; draw(); } }, l)));
    themes.replaceChildren(...['home', 'rooftop', 'game'].map((t) => h('button', { class: 'theme-pick' + (t === st.theme ? ' on' : ''), type: 'button', onclick: () => { st.theme = t; draw(); } }, h('i', { style: { background: THEME_SWATCH[t] } }), h('b', null, THEMES[t].name))));
    const party = st.kind === 'party';
    mineRow.hidden = !party || !hasMine;
    themeField.hidden = !party || st.useMine;
    bannerField.hidden = !party;
    homeNote.hidden = party;
    name.placeholder = party ? '예: 민지 생일 파티' : `예: ${nick}네 집들이`;
  };
  let busy = false;
  const s = sheet({
    title: '파티룸 만들기',
    body: h('div', { class: 'form-gap' },
      kinds,
      field('방 이름', name),
      homeNote, mineRow, themeField,
      field('최대 인원', cap),
      bannerField,
      S.live ? h('label', { class: 'toggle' }, h('span', null, '공개 파티룸으로 열기', h('small', null, '로비의 「지금 열린 공개 파티룸」 목록에 올라가서 누구나 놀러 올 수 있어요. 친구끼리만 놀 거면 꺼 두세요.')), pub) : null,
      err),
    actions: [{ label: '방 만들기', kind: 'primary', onClick: () => { create(); return false; } }],
  });
  draw();
  setTimeout(() => name.focus(), 250);
  async function create() {
    if (busy) return;
    const party = st.kind === 'party';
    const body = { kind: st.kind, name: name.value.trim() || (party ? '' : `${nick}네 집들이`), theme: st.theme, capacity: Number(cap.value), banner: banner.value.trim(), isPublic: pub.checked, dev: S.dev, owner: nick };
    if (party && st.useMine) Object.assign(body, { theme: mine.theme, light: mine.light, banner: body.banner || mine.banner || '', deco: mine.items });
    if (!party) body.home = v.home;
    if (!S.live) {
      S.demoRoom = { kind: body.kind, name: body.name || '우리들의 파티룸', theme: body.theme, banner: body.banner, light: body.light, deco: body.deco, home: body.home, owner: nick };
      s.close();
      showJoin({ kind: 'demo', code: 'DEMO01' });
      return;
    }
    busy = true; err.textContent = '';
    try {
      const res = await fetch(api('/api/rooms'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { err.textContent = j.error || '방을 만들지 못했어요. 다시 시도해 주세요.'; busy = false; return; }
      store.addRecent({ code: j.code, name: j.room.name, theme: j.room.theme });
      P.event('host_room');
      s.close();
      go(BASE + '/r/' + j.code);
    } catch { err.textContent = '인터넷 연결을 확인해 주세요.'; busy = false; }
  }
}

function openJoinCode() {
  const inp = h('input', { class: 'inp', maxlength: 6, placeholder: '6자리 코드', autocapitalize: 'characters', autocomplete: 'off', style: { textAlign: 'center', fontSize: '24px', fontWeight: '800', letterSpacing: '.2em', height: '58px' } });
  inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const err = h('p', { class: 'hint', style: { color: 'var(--red)' } });
  const s = sheet({
    title: '코드로 들어가기',
    body: h('div', null, h('p', { class: 'sheet-text' }, '친구에게 받은 6자리 방 코드를 넣어 주세요.'), inp, err),
    actions: [{ label: '들어가기', kind: 'primary', onClick: () => { submit(); return false; } }],
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => inp.focus(), 250);
  async function submit() {
    const code = inp.value.trim().toUpperCase();
    if (!S.live) { s.close(); toast('지금은 체험 방으로 들어가요.'); startDemo(); return; }
    if (!/^[A-Z2-9]{6}$/.test(code)) { err.textContent = '6자리 코드를 다시 확인해 주세요.'; return; }
    try {
      const res = await fetch(api('/api/rooms/' + code));
      if (!res.ok) { err.textContent = '그 코드의 방이 없어요. 코드를 다시 확인해 주세요.'; return; }
      s.close();
      go(BASE + '/r/' + code);
    } catch { err.textContent = '인터넷 연결을 확인해 주세요.'; }
  }
}

// ---------- 들어가기 전 (이름·아바타) ----------
let joinEditor = null;
let joinTarget = null;

async function showJoin(target) {
  pauseHero();
  joinTarget = target;
  show('v-join');
  const card = $('.room-card');
  const set = (theme, name, meta) => {
    $('.rc-theme', card).textContent = theme;
    $('.rc-name', card).textContent = name;
    $('.rc-meta', card).textContent = meta;
  };
  const enter = $('[data-act="enter"]');
  enter.disabled = false;
  enter.textContent = '들어가기';
  $('#nick').value = S.profile.nick || '';
  if (!joinEditor) joinEditor = avatarEditor({ canvas: $('#av-cv'), tabs: $('.av-tabs'), opts: $('.av-opts'), look: S.profile.look, onChange: (look) => { S.profile.look = look; } });
  else joinEditor.set(S.profile.look);
  const petNote = $('.join-pet');
  const pc = P.petCard();
  if (petNote) petNote.textContent = pc ? `🐾 ${pc.name}도 함께 가요` : '';
  if (target.kind === 'square') {
    set('공용 공간', '쏘플 스퀘어', `지금 ${S.cfg.squareCount || 0}명 · 공개 파티 게시판과 파티룸 입구가 있어요`);
    document.title = '쏘플 스퀘어';
  } else if (target.kind === 'myhome' || target.kind === 'studio') {
    set(target.kind === 'myhome' ? '내 집' : '내 파티룸', target.kind === 'myhome' ? '먼저 이름을 정해 주세요' : '내 파티룸 꾸미기', '친구들에게 보일 이름과 모습을 정하면 바로 들어가요');
    document.title = '쏘플 온라인 파티룸';
  } else if (target.kind === 'demo') {
    const d = S.demoRoom || { name: '쏘플 체험 파티룸', theme: 'home' };
    set(d.kind === 'home' ? '🏠 집들이' : THEMES[d.theme]?.name || '홈파티', d.name, S.live ? '가상의 친구 4명이 먼저 와 있어요 · 체험용 방이에요' : '가상의 친구 4명이 먼저 와 있어요 · 실시간 서버가 연결되면 친구들과 함께 놀 수 있어요');
    document.title = d.name;
  } else {
    set('불러오는 중', '파티룸', '');
    try {
      const res = await fetch(api('/api/rooms/' + target.code));
      const j = await res.json().catch(() => ({}));
      if (joinTarget !== target) return;
      if (!res.ok || !j.exists) { set('찾을 수 없음', '방을 찾을 수 없어요', '코드를 다시 확인하거나 방장에게 새 링크를 받아 주세요.'); enter.disabled = true; return; }
      const r = j.room;
      target.info = r;
      const bits = [`${r.count}/${r.capacity}명`];
      if (r.game) bits.push(`${GAME_INFO[r.game]?.name || '게임'} 진행 중`);
      if (r.locked) bits.push('🔒 잠긴 방');
      if (r.closed) bits.push('닫힌 방');
      if (r.hostNick) bits.push(`방장 ${r.hostNick}`);
      set(r.kind === 'home' ? '🏠 집들이' : THEMES[r.theme]?.name || '파티룸', r.name, bits.join(' · '));
      document.title = r.name;
      if (r.closed) { enter.disabled = true; enter.textContent = '닫힌 방이에요'; }
      else if (r.count >= r.capacity) { enter.textContent = '자리가 나면 들어갈 수 있어요'; }
    } catch {
      set('연결 확인', '인터넷 연결을 확인해 주세요', '');
    }
  }
}

function enterFromJoin() {
  const raw = $('#nick').value.trim();
  if (!raw) { toast('이름을 먼저 정해 주세요'); $('#nick').focus(); return; }
  const nick = cleanNick(raw, '');
  if (!nick) { toast('다른 이름으로 정해 주세요'); $('#nick').focus(); return; }
  S.profile.nick = nick;
  store.save('profile', S.profile);
  P.act('look', { nick, look: S.profile.look }).catch(() => {});
  unlockAudio();
  enterRoom(joinTarget);
}

function avatarEditor({ canvas, tabs, opts, look, onChange }) {
  let cur = { ...look };
  let part = PARTS[0];
  const paint = () => paintAvatarIcon(canvas, cur, { dir: 0 });
  const renderOpts = () => {
    opts.replaceChildren(...(part.colors
      ? part.colors.map((c, i) => h('button', { type: 'button', class: 'av-opt color' + (cur[part.key] === i ? ' on' : ''), style: { background: c }, 'aria-label': `${part.label} ${i + 1}`, onclick: () => pick(i) }))
      : part.names.map((n, i) => h('button', { type: 'button', class: 'av-opt' + (cur[part.key] === i ? ' on' : ''), onclick: () => pick(i) }, n))));
  };
  const renderTabs = () => {
    tabs.replaceChildren(...PARTS.map((p) => h('button', { type: 'button', role: 'tab', class: 'av-tab' + (p === part ? ' on' : ''), onclick: () => { part = p; renderTabs(); renderOpts(); } }, p.label)));
  };
  const pick = (i) => { cur = { ...cur, [part.key]: i }; onChange(cur); paint(); renderOpts(); };
  renderTabs(); renderOpts();
  requestAnimationFrame(paint);
  return { set(l) { cur = { ...l }; paint(); renderOpts(); }, get: () => cur };
}

// ---------- 파티룸 ----------
function enterRoom(target) {
  pauseHero();
  show('v-room');
  const room = $('#v-room');
  room.classList.toggle('tvmode', !!target.tv);
  const kind = target.kind;
  const R = S.room = {
    target, kind, code: target.code, tv: !!target.tv, square: kind === 'square', demo: kind === 'demo',
    local: kind === 'demo' || kind === 'myhome' || kind === 'studio', myhome: kind === 'myhome', studio: kind === 'studio',
    me: null, host: null, players: new Map(), chat: [], game: null, gpriv: null, cake: null, meta: null,
    unread: 0, zone: null, panelMin: false, blocked: new Set(store.load('blocked.' + target.code, [])), timers: [], conn: null, sqTry: 0,
  };
  R.world = new World($('#world'), {
    mode: R.tv ? 'tv' : 'play', low: S.settings.low,
    onPos: (x, y, tx, ty, sit) => R.conn && R.conn.send({ t: 'pos', x, y, tx, ty, sit }),
    onZone: (p) => { R.zone = p; renderActs(R); },
    onTapAvatar: (pid) => { if (!R.tv && pid !== R.me) openPerson(R, pid); },
    onTapPet: (pid) => onTapPet(R, pid),
    onSit: () => R.conn && R.conn.send({ t: 'emote', e: 'sit' }),
  });
  R.world.setBlocked(R.blocked);
  R.world.start();
  buildHud(R);
  R.onResize = () => { R.world.resize(); updatePanelOffset(R); };
  window.addEventListener('resize', R.onResize);
  R.timers.push(setInterval(() => oxWatch(R), 300));
  // 펫과 함께 파티룸에 5분 있으면 산책 미션
  R.timers.push(setInterval(() => { if (S.room === R && P.petCard() && document.visibilityState === 'visible') ev(R, 'pet_walk'); }, 300_000));
  connect(R);
}

function localRoom(R) {
  const v = P.view();
  const nick = S.profile.nick || '나';
  if (R.myhome) return { kind: 'home', name: `${nick}네 집`, home: v.home, owner: nick, light: store.load('homeLight', 'warm') };
  if (R.studio) return { kind: 'party', name: '내 파티룸 미리보기', theme: v.room.theme, light: v.room.light, banner: v.room.banner, deco: v.room.items };
  return S.demoRoom || {};
}

function connect(R) {
  let conn = null;
  const opts = {
    server: S.cfg.server, code: R.code, dev: S.dev, nick: S.profile.nick, look: S.profile.look, pet: R.tv ? null : P.petCard(), role: R.tv ? 'tv' : undefined,
    onMsg: (m) => { if (S.room === R && R.conn === conn) onMsg(R, m); },
    onState: (s, info) => { if (S.room === R && R.conn === conn) onConnState(R, s, info); },
  };
  conn = R.local ? new DemoNet({ ...opts, room: localRoom(R), bots: R.demo ? 4 : 0 }) : new Net(opts);
  R.conn = conn;
  conn.connect();
}

function leaveRoom(silent) {
  const R = S.room;
  if (!R) return;
  S.room = null;
  if (R.editor) { try { R.editor.el.remove(); } catch { /* 무시 */ } R.editor = null; }
  closeArcade();
  try { R.conn && R.conn.close(); } catch { /* 무시 */ }
  R.world.destroy();
  for (const t of R.timers) clearInterval(t);
  window.removeEventListener('resize', R.onResize);
  if (R.onKey) document.removeEventListener('keydown', R.onKey);
  if (R.offP) R.offP();
  $('#hud').replaceChildren();
  closeSheets();
  P.flush();
  if (!silent) go(BASE + '/play');
}

/** 펫을 눌렀을 때 — 내 펫이면 쓰다듬기, 다른 사람 펫이면 인사 */
async function onTapPet(R, pid) {
  play('bark');
  if (pid !== R.me) { const p = R.players.get(pid); if (p && p.pet) toast(`${p.pet.name}(${p.nick}님 펫)이 꼬리를 흔들어요`); return; }
  const v = P.view();
  const pet = v.pets.find((x) => x.id === v.petOn);
  if (!pet) return;
  try { const g = await P.act('pet', { id: pet.id, act: 'pat' }); celebrate(g); } catch (e) { toast(`${pet.name}: ${pet.mood.t} · ${e.message}`); }
}

/** 데리고 다니는 펫이 바뀌면 방에도 알려 줘요 */
function petChanged() {
  const R = S.room;
  if (!R || !R.conn || R.tv) return;
  R.conn.send({ t: 'hello', nick: S.profile.nick, look: S.profile.look, pet: P.petCard() });
}
hubApi.petChanged = petChanged;

function onConnState(R, s, info) {
  const el = R.hud.conn;
  if (s === 'reconnecting') { el.hidden = false; el.textContent = '연결이 잠시 끊겼어요. 다시 연결하는 중…'; R.wasDown = true; }
  else if (s === 'connecting') { if (R.wasDown) { el.hidden = false; el.textContent = '다시 연결하는 중…'; } }
  else if (s === 'open') { el.hidden = true; if (R.wasDown) { toast('다시 연결됐어요', 'good'); R.wasDown = false; } }
  else if (s === 'closed') { el.hidden = true; if (!R.finalShown) finalNotice(R, info || { t: 'closed' }); }
}

function finalNotice(R, m) {
  if (R.finalShown) return;
  // 스퀘어가 꽉 차면 다음 스퀘어로
  if (R.square && m.t === 'denied' && m.reason === 'full' && R.sqTry < 8) {
    R.sqTry += 1;
    const n = Number(R.code.slice(2)) + 1;
    R.code = 'SQ' + (n > 9 ? 1 : n);
    try { R.conn.close(); } catch { /* 무시 */ }
    connect(R);
    return;
  }
  R.finalShown = true;
  let title = '연결이 끝났어요'; let text = '방과의 연결이 끊겼어요.';
  const actions = [{ label: '처음으로', kind: 'primary', onClick: () => leaveRoom() }];
  if (m.t === 'denied') { title = '들어갈 수 없어요'; text = DENY_TEXT[m.reason] || text; }
  else if (m.t === 'kicked') { title = '방에서 나왔어요'; text = '방장이 이 방에서 나가도록 했어요.'; }
  else if (m.t === 'replaced') { title = '다른 창에서 들어왔어요'; text = '같은 기기의 다른 창에서 이 방에 들어와서, 이 창은 연결을 끊었어요.'; actions.unshift({ label: '여기서 다시 들어가기', kind: 'ghost', onClick: () => { const t = R.target; leaveRoom(true); enterRoom(t); } }); }
  else if (m.t === 'closed') { title = '방이 닫혔어요'; text = '운영 정책에 따라 이 방이 닫혔어요.'; }
  sheet({ title, body: h('p', { class: 'sheet-text' }, text), actions, onClose: () => { if (S.room === R) leaveRoom(); } });
}

// ---------- 메시지 처리 ----------
function onMsg(R, m) {
  const W = R.world;
  switch (m.t) {
    case 'welcome': {
      R.me = m.you; R.host = m.host; R.meta = m.room;
      R.players = new Map(m.players.map((p) => [p.pid, p]));
      R.chat = (m.chat || []).slice(-60);
      R.cake = m.cake || null;
      W.setRoom(m.room);
      W.setPlayers(m.players, R.tv ? null : m.you);
      W.setHost(R.square ? null : m.host);
      W.setLive({ cake: R.cake });
      document.title = m.room.name;
      if (!R.square && !R.local && !R.tv) store.addRecent({ code: m.room.code, name: m.room.name, theme: m.room.theme });
      if (R.square) R.code = m.room.code;
      onGame(R, m.game, true);
      R.gpriv = m.gpriv; R.panel.setPriv(m.gpriv);
      if (m.strokes) R.panel.board.reset(m.strokes);
      renderTop(R); renderActs(R); renderChat(R); renderBlow(R); renderTv(R);
      if (!R.welcomed) {
        R.welcomed = true;
        if (R.tv) setTimeout(() => toast('TV 화면을 한 번 눌러 주면 효과음이 나와요'), 1200);
        if (R.square) ev(R, 'square');
        else if (m.room.isPublic && m.host !== m.you) ev(R, 'visit_public');
        if (R.studio) setTimeout(() => { if (S.room === R && !R.editor) openEditor(R); }, 400);
        if (!R.tv) {
          const home = m.room.kind === 'home';
          const tip = R.square ? '쏘플 스퀘어에 온 걸 환영해요! 게시판에서 공개 파티를 찾아보세요.'
            : R.myhome ? (P.petCard() ? `어서 와요! ${P.petCard().name}가 기다리고 있었어요. 아래 「꾸미기」로 가구를 옮기고, 오락기 앞에 가면 미니게임을 할 수 있어요.` : '어서 와요! 아래 「꾸미기」로 집을 꾸미고, 「펫」에서 함께 살 친구를 데려와 보세요.')
              : R.studio ? '여기서 꾸민 그대로 파티룸을 열 수 있어요. 다 꾸몄으면 「이대로 방 만들기」를 눌러 주세요.'
                : home ? (R.host === R.me ? '집들이를 열었어요! TV 세트가 있으면 그 앞에서 게임을 고를 수 있어요. 먼저 친구들을 초대해 볼까요?' : `${m.room.owner || '친구'}네 집에 놀러 왔어요! 소품 가까이 가면 놀거리가 열려요.`)
                  : (R.host === R.me ? '방장이에요! TV 앞으로 가면 게임을 고를 수 있어요. 먼저 친구들을 초대해 볼까요?' : '반가워요! 소품 가까이 가면 놀거리가 열려요.');
          setTimeout(() => showMc(R, tip, 7000), 600);
        }
      }
      break;
    }
    case 'join': {
      const known = R.players.has(m.p.pid) && R.players.get(m.p.pid).on;
      R.players.set(m.p.pid, m.p);
      W.upsert(m.p);
      if (m.p.role === 'player' && !known && m.p.pid !== R.me) { addLocal(R, `${m.p.nick}님이 들어왔어요`); play('join'); }
      renderTop(R);
      break;
    }
    case 'leave': {
      const p = R.players.get(m.pid);
      if (p) { p.on = false; W.remove(m.pid); if (p.role === 'player') { addLocal(R, `${p.nick}님이 나갔어요`); play('leave'); } }
      renderTop(R);
      break;
    }
    case 'gone': R.players.delete(m.pid); W.remove(m.pid); renderTop(R); break;
    case 'player': {
      const p = { ...(R.players.get(m.p.pid) || {}), ...m.p };
      R.players.set(m.p.pid, p); W.upsert(p);
      break;
    }
    case 'pos': {
      const p = R.players.get(m.pid);
      if (p) Object.assign(p, { x: m.x, y: m.y, tx: m.tx, ty: m.ty, sit: m.sit });
      W.moveRemote(m.pid, m.x, m.y, m.tx, m.ty, m.sit, m.force);
      break;
    }
    case 'chat': {
      const c = m.m;
      if (c.pid && R.blocked.has(c.pid)) break;
      R.chat.push(c); if (R.chat.length > 80) R.chat.shift();
      if (c.pid && !c.sys && !c.mc) { W.say(c.pid, c.text.replace(/^🃏 /, '')); if (c.pid !== R.me) play('chat'); }
      appendChat(R, c);
      break;
    }
    case 'mc': showMc(R, m.text); break;
    case 'mcwait': showMc(R, 'MC가 멘트를 고르는 중이에요…', 2500); break;
    case 'emote': W.emote(m.pid, m.e); if (m.e === 'clap') play('pop'); break;
    case 'react': if (!R.blocked.has(m.pid)) { W.react(m.pid, m.e); play('pop'); } break;
    case 'room': R.meta = m.room; if (!R.editor) W.setRoom(m.room); else W.meta = m.room; renderTop(R); renderTv(R); break;
    case 'host': {
      R.host = m.pid; W.setHost(m.pid);
      if (m.pid === R.me && R.welcomed) toast('이제 내가 방장이에요');
      renderTop(R); renderActs(R); R.panel.render();
      break;
    }
    case 'game': onGame(R, m.g); break;
    case 'gpriv': R.gpriv = m.d; R.panel.setPriv(m.d); break;
    case 'gdraw': R.panel.board.addMany(m.s); break;
    case 'gclear': R.panel.board.clear(); break;
    case 'ev': onEvent(R, m); break;
    case 'notice': toast(m.text); break;
    case 'kicked': case 'replaced': case 'denied': case 'closed': finalNotice(R, m); break;
    default: break;
  }
}

function addLocal(R, text) {
  const c = { pid: null, nick: '', text, at: Date.now(), sys: true, local: true };
  R.chat.push(c); if (R.chat.length > 80) R.chat.shift();
  appendChat(R, c);
}

function onGame(R, g, quiet) {
  const prev = R.game;
  R.game = g;
  R.world.setLive({ game: !!g, gameName: g ? GAME_INFO[g.id].name : '', ox: g && g.id === 'ox' ? { phase: g.phase, answer: g.res ? g.res.a : null } : null });
  if (g && (!prev || prev.gid !== g.gid)) { R.gpriv = null; R.panel.board.clear(); R.panelMin = false; }
  R.panel.update(g, R.gpriv);
  R.hud.gpanel.dataset.game = g ? g.id : '';
  if (g) setPanelMin(R, R.panelMin && prev && prev.gid === g.gid && prev.phase === g.phase);
  else { R.hud.gmini.hidden = true; R.hud.gpanel.classList.remove('min'); }
  updatePanelOffset(R);
  renderActs(R);
  if (g && g.id === 'arcade') duelWatch(R, g);
  if (quiet || !g) return;
  if (!prev || prev.gid !== g.gid) { play('start'); return; }
  if (prev.phase === g.phase) return;
  // 단계가 바뀔 때 소리와 효과
  if (g.phase === 'end') {
    play('fanfare'); R.world.celebrate(); if (R.panelMin) setPanelMin(R, false);
    if (g.players.some((p) => p.pid === R.me)) ev(R, 'party_game');
    if (g.id === 'arcade' && arcadeOpen()) setTimeout(() => closeArcade(), 400);
    return;
  }
  if (g.phase === 'reveal' || g.phase === 'result') {
    let mine = null;
    if (g.id === 'quiz' && R.gpriv && R.gpriv.my !== null && R.gpriv.my !== undefined) mine = g.a === R.gpriv.my;
    if (g.id === 'ox' && g.res && g.res.results && g.res.results[R.me]) mine = g.res.results[R.me] === g.res.a;
    if (g.id === 'draw') mine = g.winner === R.me || (g.winner && g.drawer === R.me) ? true : null;
    if (g.id === 'liar' && g.win) { const liar = g.liar === R.me; mine = g.win === 'none' ? null : (g.win === 'liar') === liar; }
    play(mine === true ? 'correct' : mine === false ? 'wrong' : 'reveal');
    if (mine === true) R.world.burst(...(R.world.mePos() || [7, 7]), 'confetti', 18);
  } else play('whoosh');
}

// 미니게임 대결: 준비 단계에서 게임 창을 열고, 시작되면 3·2·1
function duelWatch(R, g) {
  if (R.tv || !g.players.some((p) => p.pid === R.me)) return;
  if (g.phase === 'end') return;
  if ((g.done || []).includes(R.me)) return;
  if (R.duelGid === g.gid) return;
  R.duelGid = g.gid;
  openDuel(R, g);
}
function openDuel(R, g) {
  const gid = g.gid;
  openArcade({
    duel: {
      game: g.game, seed: g.seed,
      started: () => R.game && R.game.gid === gid && R.game.phase === 'play',
      onScore: (score) => { if (R.game && R.game.gid === gid) R.panel.sendIn({ score }); },
    },
  });
}

function onEvent(R, m) {
  const W = R.world;
  if (m.k === 'cheers') { W.cheersAll(m.by); play('cheers'); if (m.text) showMc(R, `${nickOf(R, m.by)}님이 건배를 외쳤어요! ${m.text}`, 3500); }
  else if (m.k === 'cake') {
    R.cake = m.cake; W.setLive({ cake: m.cake });
    R.cakeNeed = m.need || R.cakeNeed;
    if (m.text) showMc(R, m.cake && m.cake.hero ? `${nickOf(R, m.cake.hero)}님 생일 케이크가 나왔어요! 다 같이 '후~' 버튼을 눌러요.` : m.text, 5000);
    renderBlow(R); renderActs(R);
  } else if (m.k === 'cakeout') {
    R.cake = m.cake; W.setLive({ cake: m.cake });
    W.celebrate(); play('blow'); setTimeout(() => play('birthday'), 400);
    ev(R, 'cake');
    showMc(R, m.text, 6000);
    renderBlow(R);
  } else if (m.k === 'photo') {
    const at = m.at - (m.now || 0) + Date.now();
    const local = R.conn.now ? m.at - R.conn.now() + Date.now() : at;
    photoCountdown(R, local, m.by);
  }
}

function nickOf(R, pid) { return R.players.get(pid)?.nick || '누군가'; }

// ---------- 화면 구성 ----------
function buildHud(R) {
  const hud = $('#hud');
  const H = R.hud = {};
  H.roomPill = h('button', { class: 'pill glass', onclick: () => (R.tv || R.myhome || R.studio ? null : openInvite(R)) }, h('span', { class: 'nm' }, '…'), h('span', { class: 'code' }));
  H.people = h('button', { class: 'pill glass', onclick: () => openPeople(R), 'aria-label': '함께 있는 사람' }, '👥 ', h('span', null, '1'));
  H.invite = R.myhome ? h('button', { class: 'pill red', onclick: () => openCreate({ kind: 'home' }) }, '🎉 집들이 열기')
    : R.studio ? h('button', { class: 'pill red', onclick: () => openCreate({ kind: 'party', mine: true }) }, '이대로 방 만들기')
      : h('button', { class: 'pill red', onclick: () => openInvite(R) }, '초대');
  H.menu = h('button', { class: 'round-btn glass', 'aria-label': '메뉴', onclick: () => openMenu(R) }, '☰');
  H.full = h('button', { class: 'round-btn glass', 'aria-label': '전체 화면', onclick: () => { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); } }, '⛶');
  const top = h('div', { class: 'topbar' }, H.roomPill, R.tv ? H.full : (R.myhome || R.studio ? null : H.people), h('span', { class: 'spacer' }), R.tv || R.square ? null : H.invite, R.tv ? null : H.menu);
  // 내 집·내 파티룸 꾸미기 화면의 도구
  H.tools = R.myhome || R.studio ? h('div', { class: 'tools' },
    h('button', { class: 'tool', onclick: () => openEditor(R) }, h('span', null, '🎨'), '꾸미기'),
    h('button', { class: 'tool', onclick: () => openPets({ ...hubApi, petJoy: () => R.world.petJoy(R.me) }) }, h('span', null, '🐾'), '펫'),
    h('button', { class: 'tool', onclick: () => openShop(R.studio ? 'deco' : 'furn') }, h('span', null, '🛍️'), '상점'),
    h('button', { class: 'tool', onclick: () => openArcade({}) }, h('span', null, '🕹️'), '오락실'),
    h('button', { class: 'tool', onclick: () => go(BASE + '/play') }, h('span', null, '🏠'), '로비')) : null;
  H.conn = h('div', { class: 'conn', hidden: true });
  H.mc = h('div', { class: 'mcbar glass' }, h('span', { class: 'mic' }, '🎤'), h('span', { class: 'mc-text' }));
  H.gpanel = h('div', { class: 'gpanel', hidden: true });
  H.gmini = h('button', { class: 'gmini', hidden: true, onclick: () => setPanelMin(R, false) }, '🎮 게임 화면 열기');
  R.panel = new GamePanel(H.gpanel, {
    send: (m) => R.conn && R.conn.send(m),
    me: () => R.me,
    isHost: () => !R.square && !R.tv && R.host === R.me,
    nick: (pid) => R.players.get(pid)?.nick || R.game?.players?.find((p) => p.pid === pid)?.nick || '누군가',
    look: (pid) => R.players.get(pid)?.look || {},
    mySide: () => { const p = R.world.mePos(); return p ? oxSide(R.world.map, p[0], p[1]) : '-'; },
    sideCounts: () => { const c = { O: 0, X: 0 }; for (const e of R.world.ents.values()) { if (e.gone) continue; const sd = oxSide(R.world.map, e.x, e.y); if (sd !== '-') c[sd] += 1; } return c; },
    tv: R.tv,
    walkZone: (k) => {
      const map = R.world.map;
      const z = k === 'O' ? map.oxO : k === 'X' ? map.oxX : map.stage;
      if (!z) return;
      R.world.walkTo(z[0] + 0.6 + Math.random() * (z[2] - z[0] + 0.8), z[1] + 0.6 + Math.random() * (z[3] - z[1] + 0.8));
    },
    collapse: () => setPanelMin(R, true),
    onCard: (g) => resultCard(R, g, false),
    onShare: (g) => resultCard(R, g, true),
    openPicker: () => openPicker(R),
    openDuel: (g) => openDuel(R, g),
    bookingUrl: S.cfg.bookingUrl,
    stat,
    tickTimers,
  });
  R.panel.wheel.onSpin = () => play('spin');
  R.panel.wheel.onDone = () => play('fanfare');
  new ResizeObserver(() => updatePanelOffset(R)).observe(H.gpanel);
  H.acts = h('div', { class: 'acts' });
  H.input = h('input', { placeholder: R.square ? '스퀘어에 인사를 남겨 보세요' : '메시지 보내기', maxlength: 120, enterkeyhint: 'send', 'aria-label': '메시지' });
  H.chatBtn = h('button', { class: 'icon-btn badge-dot', 'aria-label': '대화 기록', onclick: () => toggleChat(R) }, '💬');
  H.gameBtn = h('button', { class: 'icon-btn', 'aria-label': '게임 고르기', onclick: () => openPicker(R), hidden: true }, '🎮');
  const chatbar = h('form', { class: 'chatbar glass', onsubmit: (ev) => { ev.preventDefault(); sendChat(R); } },
    H.chatBtn,
    H.input,
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': '반응', onclick: () => openPop(R, 'react') }, '😊'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': '동작', onclick: () => openPop(R, 'emote') }, '🙌'),
    H.gameBtn,
    h('button', { class: 'send', 'aria-label': '보내기' }, '↑'));
  H.dock = h('div', { class: 'dock' }, H.acts, R.tv ? null : chatbar);
  H.chatlog = h('div', { class: 'chatlog glass', hidden: true },
    h('div', { class: 'cl-head' }, '대화', h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: () => toggleChat(R, false) }, '✕')),
    h('div', { class: 'cl-list' }));
  H.blow = h('button', { class: 'blow', hidden: true, onclick: () => { R.conn.send({ t: 'ev.blow' }); play('blow'); H.blow.disabled = true; } });
  H.pop = h('div', { class: 'pop glass', hidden: true });
  H.joy = R.tv ? null : joystick(R);
  H.tvq = R.tv ? h('div', { class: 'tv-qr glass' }) : null;
  hud.replaceChildren(...[top, H.tools, H.conn, H.mc, H.gpanel, H.gmini, H.chatlog, H.dock, H.blow, H.pop, H.joy, H.tvq].filter(Boolean));
  // 아이템을 사거나 집을 꾸미면 버튼과 방을 다시
  R.offP = P.on(() => { if (S.room === R) renderActs(R); });
  if (H.joy) H.joy.hidden = !S.settings.joystick;
  new ResizeObserver(() => hud.style.setProperty('--dock-h', H.dock.offsetHeight + 'px')).observe(H.dock);
  if (window.innerWidth >= 1024 && !R.tv) toggleChat(R, true);
  document.addEventListener('keydown', R.onKey = (ev) => {
    if (S.room !== R) return;
    const tag = document.activeElement?.tagName;
    if (ev.key === 'Enter' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !document.querySelector('.sheet')) { ev.preventDefault(); H.input.focus(); }
    if (ev.key === 'Escape' && document.activeElement === H.input) H.input.blur();
  });
}

function renderTop(R) {
  const H = R.hud;
  if (!H || !R.meta) return;
  $('.nm', H.roomPill).textContent = R.meta.name;
  $('.code', H.roomPill).textContent = R.square ? '' : R.myhome ? '내 집' : R.studio ? '미리보기' : R.demo ? '체험' : R.meta.code;
  const n = [...R.players.values()].filter((p) => p.on !== false && p.role === 'player').length;
  $('span', H.people).textContent = String(n);
  H.gameBtn.hidden = R.square || R.host !== R.me;
}

function renderTv(R) {
  if (!R.tv || !R.hud.tvq || !R.meta) return;
  const url = location.origin + BASE + '/r/' + R.meta.code;
  const cv = h('canvas', { width: 240, height: 240 });
  drawQR(cv, url);
  R.hud.tvq.replaceChildren(cv, h('div', null, h('b', null, '폰으로 찍고 들어오세요'), h('div', { class: 'code' }, R.meta.code), h('span', null, location.host + BASE + '/r/' + R.meta.code)));
}

function sendChat(R) {
  const v = R.hud.input.value.trim();
  if (!v) return;
  R.conn.send({ t: 'chat', text: v });
  R.hud.input.value = '';
  ev(R, 'chat');
}

function showMc(R, text, ms = 6500) {
  const el = R.hud?.mc;
  if (!el) return;
  $('.mc-text', el).textContent = text;
  el.classList.add('show');
  clearTimeout(R.mcTimer);
  R.mcTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function toggleChat(R, v) {
  const el = R.hud.chatlog;
  const open = v ?? el.hidden;
  el.hidden = !open;
  if (open) { R.unread = 0; R.hud.chatBtn.removeAttribute('data-n'); renderChat(R); }
  updatePanelOffset(R);
}

function chatItem(R, c) {
  if (c.sys) return h('div', { class: 'cl-msg sys' }, c.text);
  if (c.mc) return h('div', { class: 'cl-msg mc' }, '🎤 ', c.text);
  return h('div', { class: 'cl-msg' + (c.pid === R.me ? ' me' : '') }, h('b', null, c.nick), c.text);
}
function renderChat(R) {
  const list = $('.cl-list', R.hud.chatlog);
  list.replaceChildren(...R.chat.map((c) => chatItem(R, c)));
  list.scrollTop = list.scrollHeight;
}
function appendChat(R, c) {
  if (!R.hud) return;
  if (R.hud.chatlog.hidden) {
    if (!c.sys && !c.local) { R.unread += 1; R.hud.chatBtn.setAttribute('data-n', R.unread > 9 ? '9+' : String(R.unread)); }
    return;
  }
  const list = $('.cl-list', R.hud.chatlog);
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.append(chatItem(R, c));
  while (list.children.length > 80) list.firstChild.remove();
  if (near) list.scrollTop = list.scrollHeight;
}

function openPop(R, kind) {
  const pop = R.hud.pop;
  if (!pop.hidden && pop.dataset.kind === kind) { pop.hidden = true; return; }
  pop.dataset.kind = kind;
  const close = () => { pop.hidden = true; };
  if (kind === 'react') pop.replaceChildren(...REACTIONS.map((e) => h('button', { onclick: () => { R.conn.send({ t: 'react', e }); close(); } }, e)));
  else {
    const icons = { clap: '👏', cheers: '🥂', dance: '💃', heart: '🫶', sit: '🪑', hand: '🙋', wave: '👋' };
    icons.nap = '😴';
    pop.replaceChildren(...Object.entries(EMOTES).map(([k, label]) => h('button', { class: 'lbl', onclick: () => { R.conn.send({ t: 'emote', e: k }); if (k !== 'sit') ev(R, 'emote'); close(); } }, h('span', null, icons[k]), label)));
  }
  pop.hidden = false;
  setTimeout(() => {
    const off = (ev) => { if (!pop.contains(ev.target)) { pop.hidden = true; document.removeEventListener('pointerdown', off, true); } };
    document.addEventListener('pointerdown', off, true);
  }, 0);
}

function joystick(R) {
  const knob = h('i');
  const el = h('div', { class: 'joy', 'aria-label': '조이스틱' }, knob);
  let id = null;
  const set = (ev) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    let dx = ev.clientX - cx; let dy = ev.clientY - cy;
    const max = r.width / 2 - 10; const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max; const ny = dy / max;
    R.world.setJoystick(Math.hypot(nx, ny) < 0.18 ? 0 : nx, Math.hypot(nx, ny) < 0.18 ? 0 : ny);
  };
  el.addEventListener('pointerdown', (ev) => { id = ev.pointerId; el.setPointerCapture(id); set(ev); });
  el.addEventListener('pointermove', (ev) => { if (ev.pointerId === id) set(ev); });
  const end = () => { id = null; knob.style.transform = ''; R.world.setJoystick(0, 0); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  return el;
}

function setPanelMin(R, v) {
  R.panelMin = !!v && !!R.game;
  R.hud.gpanel.classList.toggle('min', R.panelMin);
  R.hud.gmini.hidden = !R.panelMin;
  if (R.game) R.hud.gmini.textContent = `${GAME_INFO[R.game.id].icon} ${GAME_INFO[R.game.id].name} 열기`;
  updatePanelOffset(R);
  renderActs(R);
}

function updatePanelOffset(R) {
  const el = R.hud?.gpanel;
  if (!el) return;
  const open = !!R.game && !R.panelMin && !el.hidden;
  const wide = window.innerWidth >= 900 || R.tv;
  $('#hud').classList.toggle('panel-open', open && wide);
  const chatOver = !R.hud.chatlog.hidden;
  if (R.hud.joy) R.hud.joy.hidden = !S.settings.joystick || (open && !wide) || chatOver;
  $('#hud').classList.toggle('has-joy', !!R.hud.joy && !R.hud.joy.hidden);
  R.world.opts.offsetX = open && wide ? (el.offsetWidth + 18) / 2 : 0;
  R.world.opts.offsetY = open && !wide ? Math.min(el.offsetHeight, window.innerHeight * 0.62) / 2 : 0;
}

// 소품 가까이 갔을 때 버튼
function renderActs(R) {
  const H = R.hud;
  if (!H) return;
  const p = R.zone;
  const host = R.host === R.me && !R.square;
  const acts = [];
  const gameOn = !!R.game;
  const panelOpen = gameOn && !R.panelMin && window.innerWidth < 900;
  if (p && !R.tv && !panelOpen) {
    if (p.locked) acts.push({ label: '🔒 ' + p.locked, disabled: true });
    for (const a of p.actions || []) {
      if (a === 'games') acts.push(host ? { label: gameOn ? '📺 게임 진행 중' : '📺 게임 고르기', main: true, on: () => openPicker(R), disabled: gameOn } : { label: '📺 방장이 게임을 고를 수 있어요', disabled: true });
      if (a === 'sit') acts.push({ label: '🛋️ 앉기', on: () => R.conn.send({ t: 'emote', e: 'sit' }) });
      if (a === 'truth' && host && !gameOn) acts.push({ label: '🃏 진실카드', main: true, on: () => startGame(R, 'truth') });
      if (a === 'cheers') acts.push({ label: '🥂 건배하기', main: true, on: () => { R.conn.send({ t: 'ev.cheers' }); ev(R, 'cheers'); } });
      if (a === 'roulette' && host && !gameOn) acts.push({ label: '🎡 파티 룰렛', on: () => startGame(R, 'roulette') });
      if (a === 'cake') { if (host) acts.push(R.cake && R.cake.on ? { label: '🎂 케이크 치우기', on: () => R.conn.send({ t: 'ev.cake', on: false }) } : { label: '🎂 케이크 놓기', main: true, on: () => openCake(R) }); else if (!R.cake) acts.push({ label: '🎂 방장이 케이크를 놓을 수 있어요', disabled: true }); }
      if (a === 'photo') acts.push({ label: '📸 단체 사진 찍기', main: true, on: () => R.conn.send({ t: 'ev.photo' }) });
      if (a === 'ox') acts.push(host && !gameOn ? { label: '⭕ OX퀴즈 시작', main: true, on: () => startGame(R, 'ox') } : { label: gameOn ? '🎤 무대' : '🎤 무대 · 방장이 OX퀴즈를 열 수 있어요', disabled: true });
      if (a === 'notice') acts.push({ label: '📢 공지 보기', main: true, on: () => openNotice(R) });
      if (a === 'public') acts.push({ label: '🎉 공개 파티 보기', main: true, on: () => openPublic(R) });
      if (a === 'create') acts.push({ label: '✨ 파티룸 만들기', main: true, on: () => openCreate() });
      if (a === 'join') acts.push({ label: '🔑 코드로 들어가기', main: true, on: () => openJoinCode() });
      // 꾸민 소품
      if (a === 'arcade') acts.push({ label: '🕹️ 미니게임 하기', main: true, on: () => openArcade({}) });
      if (a === 'pet') acts.push(P.view().pets.length ? { label: '🐾 펫 돌보기', main: true, on: () => openPets({ ...hubApi, petJoy: () => R.world.petJoy(R.me) }) } : { label: '🐾 펫 데려오기', main: true, on: () => openPets(hubApi) });
      if (a === 'nap') acts.push({ label: '😴 낮잠 자기', on: () => { R.conn.send({ t: 'emote', e: 'nap' }); } });
      if (a === 'tv') acts.push(host ? { label: gameOn ? '📺 게임 진행 중' : '📺 게임 고르기', main: true, on: () => openPicker(R), disabled: gameOn } : { label: '📺 집주인이 게임을 고를 수 있어요', disabled: true });
      if (a === 'piano') acts.push({ label: '🎹 연주하기', main: true, on: () => playPiano(R) });
      if (a === 'fish') acts.push({ label: '🐟 물고기 밥 주기', on: () => { R.world.react(R.me, '🐟'); toast('물고기들이 몰려와요 🐠'); play('pop'); } });
      if (a === 'music') acts.push(host ? { label: '🔊 조명 바꾸기', main: true, on: () => cycleLight(R) } : { label: '🔊 음악이 흘러나와요', disabled: true });
    }
  }
  H.acts.replaceChildren(...acts.map((a) => h('button', { class: 'act' + (a.main ? ' main' : ''), disabled: !!a.disabled, onclick: () => { play('click'); a.on && a.on(); } }, a.label)));
}

function playPiano(R) {
  const tunes = [
    [523, 587, 659, 523, 659, 784, 880, 784],
    [392, 392, 440, 392, 523, 494, 392, 392, 440, 392, 587, 523],
    [659, 587, 523, 587, 659, 659, 659, 587, 587, 587, 659, 784, 784],
  ];
  const t = tunes[Math.floor(Math.random() * tunes.length)];
  t.forEach((f, i) => setTimeout(() => playNote(f, 0.3), i * 260));
  R.world.emote(R.me, 'dance');
  R.conn.send({ t: 'emote', e: 'dance' });
}

function cycleLight(R) {
  const keys = Object.keys(LIGHTS);
  const cur = R.meta?.light || 'warm';
  const next = keys[(keys.indexOf(cur) + 1) % keys.length];
  R.conn.send({ t: 'room.set', light: next });
  if (R.myhome) store.save('homeLight', next);
  toast(`${LIGHTS[next].name}으로 바꿨어요`);
}

// 꾸미기 (내 집 / 내 파티룸)
function openEditor(R) {
  if (R.editor || R.tv) return;
  closeSheets();
  const kind = R.myhome ? 'home' : 'party';
  if (!R.myhome && !R.studio) return;
  $('#hud').classList.add('editing');
  R.editor = new Editor({
    kind, world: R.world,
    mount: (el) => $('#hud').append(el),
    onStyle: (st) => { if (R.studio) { R.world.theme = st.theme; R.world.light = st.light; R.world.banner = st.banner; R.world.live.party = st.light === 'party'; R.world.invalidate(); } },
    onDone: (saved) => {
      R.editor = null;
      $('#hud').classList.remove('editing');
      if (!saved) { R.world.setRoom(R.meta); return; }
      const v = P.view();
      if (R.myhome) R.conn.send({ t: 'room.set', home: v.home });
      else R.conn.send({ t: 'room.set', theme: v.room.theme, light: v.room.light, banner: v.room.banner, deco: v.room.items });
    },
  });
}

function renderBlow(R) {
  const b = R.hud?.blow;
  if (!b) return;
  const c = R.cake;
  if (!c || !c.lit || R.tv) { b.hidden = true; return; }
  b.hidden = false;
  const mine = c.blown.includes(R.me);
  b.disabled = mine;
  const need = R.cakeNeed || Math.max(1, Math.ceil([...R.players.values()].filter((p) => p.on !== false && p.role === 'player').length * 0.6));
  b.replaceChildren(mine ? '🕯️ 후~ 했어요' : '🕯️ 후~ 불기', h('small', null, `${c.blown.length}/${need}`));
}

function oxWatch(R) {
  const g = R.game;
  if (!g || g.id !== 'ox' || g.phase !== 'answer') return;
  const c = R.tv ? R.panel.api.sideCounts() : null;
  const side = R.tv ? `${c.O}:${c.X}` : R.panel.api.mySide();
  if (side !== R.lastSide) { R.lastSide = side; R.panel.render(); }
}

function tickTimers() {
  const R = S.room;
  if (!R || !R.conn) return;
  const now = R.conn.now ? R.conn.now() : Date.now();
  for (const el of $$('[data-deadline]')) {
    const dl = Number(el.dataset.deadline); const span = Number(el.dataset.span) || 20000;
    const left = Math.max(0, dl - now);
    const i = el.querySelector('i'); if (i) i.style.width = Math.min(100, (left / span) * 100).toFixed(1) + '%';
    const s = el.querySelector('span'); if (s) s.textContent = Math.ceil(left / 1000) + '초';
    el.classList.toggle('low', left < 5000);
    const sec = Math.ceil(left / 1000);
    if (sec <= 3 && sec > 0 && el.dataset.tick !== String(sec)) { el.dataset.tick = String(sec); play('tick'); }
  }
}

// ---------- 시트들 ----------
function openPicker(R) {
  if (R.host !== R.me || R.square) { toast('게임은 방장이 고를 수 있어요'); return; }
  if (R.game) { toast('지금 게임이 진행 중이에요'); return; }
  const count = [...R.players.values()].filter((p) => p.on !== false && p.role === 'player').length;
  let rounds = 10;
  let arcadeGame = '';
  const ids = ['arcade', 'balance', 'liar', 'draw', 'quiz', 'ox', 'truth', 'roulette'].filter((id) => id !== 'ox' || R.world.map.oxO);
  const s = sheet({
    title: '게임 고르기', wide: true,
    body: h('div', { class: 'list' }, ids.map((id) => {
      const g = GAME_INFO[id];
      const short = count < g.min;
      const seg = (vals, cur, set) => h('div', { class: 'rounds' }, vals.map(([v, l]) => h('button', { class: v === cur ? 'on' : '', onclick: (ev) => { ev.stopPropagation(); set(v); for (const b of ev.currentTarget.parentElement.children) b.classList.toggle('on', b === ev.currentTarget); } }, l)));
      const rbox = id === 'balance' ? seg([5, 10, 15].map((n) => [n, `${n}문제`]), rounds, (n) => { rounds = n; })
        : id === 'arcade' ? seg([['', '🎲 랜덤'], ...Object.entries(ARCADE).map(([k, a]) => [k, `${a.icon} ${a.name}`])], arcadeGame, (k) => { arcadeGame = k; }) : null;
      return h('button', { class: 'game-pick', disabled: short, onclick: () => { s.close(); startGame(R, id, id === 'balance' ? { rounds } : id === 'arcade' ? { game: arcadeGame || undefined } : {}); } },
        h('span', { class: 'gi' }, g.icon),
        h('span', { class: 'gm' }, h('b', null, g.name), h('small', null, short ? `${g.min}명부터 할 수 있어요 (지금 ${count}명)` : `${g.desc} · ${g.rec}`), rbox),
        h('span', { class: 'gw' }, g.where));
    })),
  });
}

function startGame(R, id, opts = {}) {
  closeSheets();
  R.conn.send({ t: 'g.start', id, opts });
  if (id === 'ox') R.panel.api.walkZone('stage');
}

function openMenu(R) {
  const host = R.host === R.me && !R.square;
  const item = (icon, label, sub, on) => h('button', { class: 'list-item', onclick: () => { s.close(); on(); } }, h('span', { class: 'li-ic' }, icon), h('span', { class: 'li-main' }, h('b', null, label), sub ? h('small', null, sub) : null));
  const s = sheet({
    title: '메뉴',
    body: h('div', { class: 'list' },
      R.myhome || R.studio ? item('🎨', R.myhome ? '집 꾸미기' : '파티룸 꾸미기', '소품 놓기·옮기기·벽지·바닥', () => openEditor(R)) : null,
      R.myhome ? item('🎉', '집들이 열기', '내 집으로 친구들을 초대해요', () => openCreate({ kind: 'home' })) : null,
      R.studio ? item('🎉', '이대로 방 만들기', '꾸민 그대로 파티룸을 열어요', () => openCreate({ kind: 'party', mine: true })) : null,
      R.myhome || R.studio ? null : item('👥', '함께 있는 사람', '신고, 숨기기, 방장 넘기기', () => openPeople(R)),
      host && !R.myhome && !R.studio ? item('🎈', '방 설정', '이름, 현수막, 테마, 조명, 잠금', () => openDecorate(R)) : null,
      host ? item('🎮', '게임 고르기', '파티 게임 8가지', () => openPicker(R)) : null,
      item('🐾', '내 펫', '밥 주기, 쓰다듬기, 꾸미기, 데리고 다니기', () => openPets({ ...hubApi, petJoy: () => R.world.petJoy(R.me) })),
      item('🕹️', '오락실', '혼자 하는 미니게임 8종', () => openArcade({})),
      item('🛍️', '상점', '가구, 파티 소품, 펫 용품', () => openShop()),
      host ? item('🎂', '생일 케이크', R.cake && R.cake.on ? '케이크를 치워요' : '주인공을 고르고 케이크를 놓아요', () => (R.cake && R.cake.on ? R.conn.send({ t: 'ev.cake', on: false }) : openCake(R))) : null,
      host && !R.square ? item('🎤', 'MC 한마디', S.cfg.ai ? 'AI MC가 분위기를 띄워요' : 'MC가 분위기를 띄워요', () => R.conn.send({ t: 'mc.ask' })) : null,
      item('🧑‍🎨', '내 아바타 바꾸기', '이름과 모습', () => openAvatar(R)),
      !R.square ? item('📺', 'TV로 크게 보기', 'TV나 노트북에 방을 띄워요', () => openTv(R)) : null,
      item('⚙️', '설정', '소리, 저사양 모드, 조이스틱', () => openSettings(R)),
      item('❓', '도움말', '조작법과 놀거리', () => openHelp(R)),
      R.myhome || R.studio ? item('🏠', '로비로 가기', '미션, 출석, 공개 파티룸', () => leaveRoom()) : item('🚪', '방 나가기', '로비로 돌아가요', async () => { if (await confirmBox('방에서 나갈까요?', '나가기')) leaveRoom(); }),
    ),
  });
}

function openInvite(R) {
  if (!R.meta) return;
  if (R.square) return;
  const url = R.local ? location.href : location.origin + BASE + '/r/' + R.meta.code;
  const cv = h('canvas', { width: 360, height: 360 });
  drawQR(cv, url);
  stat('qr');
  const text = `${S.profile.nick}님이 '${R.meta.name}'에 초대했어요. 링크를 누르면 바로 들어올 수 있어요.`;
  const share = [];
  if (S.cfg.kakaoKey && !R.local) share.push(h('button', { class: 'btn kakao', onclick: async () => { const ok = await kakaoShare(S.cfg.kakaoKey, { url, title: R.meta.name, desc: text, image: location.origin + '/assets/img/og/live.jpg' }); if (ok) stat('kakao'); else toast('카카오톡 공유를 열지 못했어요. 링크 복사를 이용해 주세요.'); } }, '카카오톡으로 보내기'));
  if (navigator.share) share.push(h('button', { class: 'btn ghost', onclick: async () => { if (await webShare({ url, title: R.meta.name, text })) stat('share'); } }, '공유하기'));
  if (EMBED) {
    sheet({
      title: '친구 초대하기',
      body: h('div', null,
        h('p', { class: 'sheet-text' }, '체험판은 이 화면에서만 열려요. 실제 서비스에서는 방마다 초대 링크와 QR이 생기고, 카카오톡으로 링크를 보내면 친구가 이름만 정하고 바로 들어와요.'),
        h('div', { class: 'code-big' }, 'DEMO01')),
      actions: [{ label: '확인', kind: 'primary' }],
    });
    return;
  }
  sheet({
    title: '친구 초대하기',
    body: h('div', null,
      R.local ? h('p', { class: 'sheet-text' }, '체험 방은 이 화면에서만 열려요. 실제 서비스에서는 아래 링크와 QR로 친구가 바로 들어와요.') : null,
      h('div', { class: 'code-big' }, R.local ? 'DEMO' : R.meta.code),
      h('div', { class: 'link-box' }, h('span', null, url), h('button', { class: 'btn sm primary', onclick: async () => { const ok = await copyText(url); toast(ok ? '링크를 복사했어요. 카톡에 붙여 넣어 보내 주세요.' : '복사하지 못했어요'); if (ok) stat('invite'); } }, '링크 복사')),
      share.length ? h('div', { class: 'share-row' }, share) : null,
      h('div', { class: 'qr-box' }, cv, h('small', null, '같은 자리에 있다면 휴대폰 카메라로 찍게 해 주세요'))),
  });
}

function openTv(R) {
  const url = location.origin + BASE + '/tv/' + R.meta.code;
  const cv = h('canvas', { width: 360, height: 360 });
  drawQR(cv, url);
  sheet({
    title: 'TV로 크게 보기',
    body: h('div', null,
      h('p', { class: 'sheet-text' }, '거실 TV나 노트북 브라우저에서 아래 주소를 열면 방 전체가 크게 보여요. TV 화면은 인원수에 포함되지 않아요.'),
      R.local ? h('p', { class: 'sheet-text' }, '체험판에서는 TV 화면을 열 수 없어요.') : h('div', { class: 'link-box' }, h('span', null, url), h('button', { class: 'btn sm primary', onclick: async () => toast((await copyText(url)) ? 'TV 주소를 복사했어요' : '복사하지 못했어요') }, '복사')),
      R.local ? null : h('div', { class: 'qr-box' }, cv, h('small', null, 'TV 브라우저 대신 휴대폰으로 열어 미러링해도 돼요'))),
    actions: R.local ? [] : [{ label: '이 기기를 TV 화면으로 쓰기', kind: 'ghost', onClick: () => { leaveRoom(true); go(BASE + '/tv/' + R.meta.code); } }],
  });
}

function openPeople(R) {
  const host = R.host === R.me && !R.square;
  const list = [...R.players.values()].filter((p) => p.on !== false && p.role === 'player');
  const tvs = [...R.players.values()].filter((p) => p.on !== false && p.role === 'tv').length;
  const rows = list.sort((a, b) => (a.pid === R.me ? -1 : b.pid === R.me ? 1 : 0)).map((p) => {
    const cv = h('canvas', { class: 'li-av', width: 40, height: 46 });
    requestAnimationFrame(() => paintAvatarIcon(cv, p.look));
    return h('div', { class: 'list-item' }, cv,
      h('span', { class: 'li-main' }, h('b', null, p.nick, p.pid === R.host && !R.square ? h('span', { class: 'tag red' }, '방장') : null, p.pid === R.me ? h('span', { class: 'tag' }, '나') : null, p.muted ? h('span', { class: 'tag' }, '채팅 제한') : null, R.blocked.has(p.pid) ? h('span', { class: 'tag' }, '숨김') : null)),
      p.pid !== R.me ? h('div', { class: 'mini-btns' }, h('button', { class: 'btn sm ghost', onclick: () => { s.close(); openPerson(R, p.pid); } }, '더 보기')) : null);
  });
  const s = sheet({ title: `함께 있는 사람 ${list.length}명`, body: h('div', { class: 'list' }, rows, tvs ? h('p', { class: 'hint' }, `TV 화면 ${tvs}대가 연결돼 있어요`) : null) });
}

function openPerson(R, pid) {
  const p = R.players.get(pid);
  if (!p) return;
  const host = R.host === R.me && !R.square;
  const cv = h('canvas', { width: 90, height: 100, style: { width: '90px', height: '100px', display: 'block', margin: '0 auto' } });
  requestAnimationFrame(() => paintAvatarIcon(cv, p.look));
  const hidden = R.blocked.has(pid);
  sheet({
    title: p.nick,
    body: h('div', { class: 'list' }, cv,
      h('button', { class: 'list-item', onclick: () => { toggleBlock(R, pid); closeSheets(); } }, h('span', { class: 'li-ic' }, hidden ? '👁️' : '🙈'), h('span', { class: 'li-main' }, h('b', null, hidden ? '다시 보이기' : '내 화면에서 숨기기'), h('small', null, '이 사람의 말풍선과 채팅을 나에게만 안 보이게 해요'))),
      h('button', { class: 'list-item', onclick: () => { closeSheets(); openReport(R, pid); } }, h('span', { class: 'li-ic' }, '🚨'), h('span', { class: 'li-main' }, h('b', null, '신고하기'), h('small', null, '운영자가 대화 기록을 확인해요'))),
      host ? h('button', { class: 'list-item', onclick: async () => { closeSheets(); if (await confirmBox(`${p.nick}님에게 방장을 넘길까요?`, '넘기기')) R.conn.send({ t: 'host.give', pid }); } }, h('span', { class: 'li-ic' }, '👑'), h('span', { class: 'li-main' }, h('b', null, '방장 넘기기'))) : null,
      host ? h('button', { class: 'list-item', onclick: async () => { closeSheets(); if (await confirmBox(`${p.nick}님을 방에서 내보낼까요? 이 방에는 다시 들어올 수 없어요.`, '내보내기', 'primary')) R.conn.send({ t: 'kick', pid }); } }, h('span', { class: 'li-ic' }, '🚪'), h('span', { class: 'li-main' }, h('b', null, '내보내기'))) : null),
  });
}

function toggleBlock(R, pid) {
  if (R.blocked.has(pid)) R.blocked.delete(pid); else R.blocked.add(pid);
  store.save('blocked.' + R.code, [...R.blocked]);
  R.world.setBlocked(R.blocked);
  toast(R.blocked.has(pid) ? '내 화면에서 숨겼어요' : '다시 보이게 했어요');
}

function openReport(R, pid) {
  const p = R.players.get(pid);
  const reasons = [['abuse', '욕설·비하'], ['sexual', '성적인 말'], ['spam', '도배·광고'], ['other', '기타']];
  const row = h('div', { class: 'reason-row' }, reasons.map(([v, l], i) => h('label', null, h('input', { type: 'radio', name: 'rs', value: v, checked: i === 0 }), h('span', null, l))));
  const memo = h('textarea', { class: 'inp', rows: 2, maxlength: 100, placeholder: '무슨 일이 있었는지 짧게 적어 주세요 (선택)' });
  sheet({
    title: `${p ? p.nick : ''}님 신고`,
    body: h('div', null, h('p', { class: 'sheet-text' }, '신고하면 최근 대화 기록이 운영자에게 전달돼요. 여러 명이 신고하면 채팅이 자동으로 제한돼요.'), row, memo),
    actions: [{ label: '취소', kind: 'ghost' }, { label: '신고하기', kind: 'primary', onClick: () => { const v = row.querySelector('input:checked')?.value || 'other'; R.conn.send({ t: 'report', pid, reason: v, memo: memo.value.trim() }); } }],
  });
}

function openDecorate(R) {
  const m = R.meta;
  const st = { theme: m.theme, light: m.light };
  const name = h('input', { class: 'inp', maxlength: 20, value: m.name });
  const banner = h('input', { class: 'inp', maxlength: 24, value: m.banner || '', placeholder: '예: 민지야 생일 축하해!' });
  const cap = h('select', { class: 'inp' }, Array.from({ length: 11 }, (_, i) => i + 2).map((n) => h('option', { value: n, selected: n === m.capacity }, `${n}명`)));
  const lock = h('input', { type: 'checkbox', checked: !!m.locked });
  const pub = h('input', { type: 'checkbox', checked: !!m.isPublic });
  const themes = h('div', { class: 'opt-row' }, ['home', 'rooftop', 'game'].map((t) => h('button', { type: 'button', class: 'theme-pick' + (t === st.theme ? ' on' : ''), onclick: (ev) => { st.theme = t; for (const b of themes.children) b.classList.toggle('on', b === ev.currentTarget); } }, h('i', { style: { background: THEME_SWATCH[t] } }), h('b', null, THEMES[t].name))));
  const lights = h('div', { class: 'lights' }, Object.entries(LIGHTS).map(([k, v]) => h('button', { type: 'button', class: 'light-dot' + (k === st.light ? ' on' : ''), title: v.name, 'aria-label': v.name, style: { background: v.color }, onclick: (ev) => { st.light = k; for (const b of lights.children) b.classList.toggle('on', b === ev.currentTarget); } })));
  sheet({
    title: '방 꾸미기', wide: true,
    body: h('div', { class: 'form-gap' },
      field('방 이름', name), field('현수막 문구', banner),
      m.kind === 'home' ? null : h('div', { class: 'field' }, h('span', null, '테마'), themes),
      h('div', { class: 'field' }, h('span', null, '조명'), lights),
      field('최대 인원', cap),
      h('label', { class: 'toggle' }, h('span', null, '방 잠그기', h('small', null, '지금 있는 사람 말고는 새로 들어올 수 없어요')), lock),
      R.local ? null : h('label', { class: 'toggle' }, h('span', null, '공개 파티룸으로 열기', h('small', null, '로비의 공개 파티룸 목록에 올라가요. 모르는 사람도 들어올 수 있어요')), pub)),
    actions: [{ label: '저장', kind: 'primary', onClick: () => { R.conn.send({ t: 'room.set', name: name.value, banner: banner.value, theme: st.theme, light: st.light, capacity: Number(cap.value), locked: lock.checked, isPublic: pub.checked }); toast('방을 꾸몄어요'); } }],
  });
}

function openCake(R) {
  const list = [...R.players.values()].filter((p) => p.on !== false && p.role === 'player');
  let hero = null;
  const opts = h('div', { class: 'reason-row' }, h('label', null, h('input', { type: 'radio', name: 'hero', value: '', checked: true, onchange: () => { hero = null; } }), h('span', null, '주인공 없이')),
    list.map((p) => h('label', null, h('input', { type: 'radio', name: 'hero', value: p.pid, onchange: () => { hero = p.pid; } }), h('span', null, p.nick))));
  sheet({
    title: '케이크 놓기',
    body: h('div', null, h('p', { class: 'sheet-text' }, '오늘의 주인공을 고르면 왕관을 씌워 줘요. 모두가 \'후~\'를 누르면 촛불이 꺼져요.'), opts),
    actions: [{ label: '케이크 놓기', kind: 'primary', onClick: () => R.conn.send({ t: 'ev.cake', hero }) }],
  });
}

function openAvatar(R) {
  const canvas = h('canvas', { style: { width: '112px', height: '128px' } });
  const tabs = h('div', { class: 'av-tabs' }); const opts = h('div', { class: 'av-opts' });
  let look = { ...S.profile.look };
  const ed = avatarEditor({ canvas, tabs, opts, look, onChange: (l) => { look = l; } });
  const nick = h('input', { class: 'inp', maxlength: 10, value: S.profile.nick, placeholder: '친구들이 알아볼 이름' });
  sheet({
    title: '내 아바타', wide: true,
    body: h('div', null, h('div', { class: 'profile' }, h('div', { class: 'av-preview' }, canvas, h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { look = randomLook(); ed.set(look); } }, '🎲 랜덤')), h('div', null, field('이름', nick), tabs, opts))),
    actions: [{ label: '저장', kind: 'primary', onClick: () => {
      const n = cleanNick(nick.value.trim(), S.profile.nick || '손님');
      S.profile = { nick: n, look: ed.get() };
      store.save('profile', S.profile);
      P.act('look', { nick: n, look: S.profile.look }).catch((e) => toast(e.message));
      if (R && R.conn) R.conn.send({ t: 'hello', nick: n, look: S.profile.look, pet: P.petCard() });
      if (!R) drawHub();
    } }],
  });
}

function openSettings(R) {
  const t = (label, sub, key, on) => {
    const inp = h('input', { type: 'checkbox', checked: !!S.settings[key], onchange: () => { S.settings[key] = inp.checked; store.saveSettings(S.settings); on(inp.checked); } });
    return h('label', { class: 'toggle' }, h('span', null, label, h('small', null, sub)), inp);
  };
  sheet({
    title: '설정',
    body: h('div', null,
      t('효과음', '입장, 정답, 건배 같은 소리', 'sound', (v) => setSound(v)),
      t('저사양 모드', '오래된 폰에서 끊기면 켜 주세요. 화질과 효과를 줄여요.', 'low', (v) => { applySettings(); R.world.setLow(v); }),
      t('조이스틱', '화면을 눌러 이동하는 대신 조이스틱을 써요', 'joystick', () => updatePanelOffset(R))),
  });
}

function openHelp() {
  const li = (b, t) => h('div', { class: 'list-item' }, h('span', { class: 'li-main' }, h('b', null, b), h('small', null, t)));
  sheet({
    title: '이렇게 놀아요',
    body: h('div', { class: 'list' },
      li('걸어 다니기', '가고 싶은 곳을 누르면 걸어가요. PC에서는 방향키나 WASD도 돼요. 데리고 다니는 펫은 졸졸 따라와요.'),
      li('코인과 미션', '출석, 미니게임, 파티룸 게임, 펫 돌보기로 코인과 경험치를 모아요. 코인으로 가구와 소품을 사서 내 집과 파티룸을 꾸며요. 코인은 게임 안에서만 쓰는 포인트예요.'),
      li('내 집과 집들이', '로비의 「내 집」에서 가구를 옮기고 벽지·바닥을 바꿔요. 「집들이 열기」를 누르면 친구들을 내 집으로 초대할 수 있어요.'),
      li('놀거리 열기', 'TV 앞은 게임, 소파는 앉기와 진실카드, 바는 건배와 룰렛, 케이크 테이블은 생일 축하, 포토존은 단체 사진이에요.'),
      li('대화하기', '아래 입력칸에 쓰면 내 머리 위에 말풍선이 떠요. 😊는 반응, 🙌는 동작이에요.'),
      li('TV로 보기', '메뉴의 TV로 크게 보기를 누르면 거실 TV에 방을 띄울 수 있어요.'),
      li('불편한 사람이 있다면', '그 사람을 누르고 숨기기나 신고를 눌러 주세요.')),
  });
}

async function openNotice(R) {
  const c = S.cfg;
  sheet({
    title: '공지',
    body: h('div', null,
      c.event ? h('div', { class: 'list-item' }, h('span', { class: 'li-ic' }, '🎉'), h('span', { class: 'li-main' }, h('b', null, c.event.title), h('small', null, `${fmtTime(c.event.at)}${c.event.desc ? ' · ' + c.event.desc : ''}`))) : null,
      h('p', { class: 'sheet-text', style: { marginTop: '12px' } }, c.notice || '지금은 새로운 공지가 없어요. 친구들과 파티룸을 만들어 놀아 보세요!')),
  });
}

async function openPublic() {
  let rooms = [];
  if (S.live) { const j = await getJson(api('/api/public'), 5000); rooms = (j && j.rooms) || []; }
  sheet({
    title: '공개 파티룸',
    body: h('div', { class: 'list' },
      rooms.length ? rooms.map((r) => h('button', { class: 'list-item', onclick: () => { closeSheets(); go(BASE + '/r/' + r.code, { visit: true }); } },
        h('i', { class: 'ri-dot', style: { width: '40px', height: '40px', borderRadius: '10px', background: r.kind === 'home' ? 'linear-gradient(135deg,#FFF1EC,#F7D9C9)' : THEME_SWATCH[r.theme] || THEME_SWATCH.home, flex: '0 0 auto' } }),
        h('span', { class: 'li-main' }, h('b', null, r.name), h('small', null, `${r.kind === 'home' ? '🏠 집들이 · ' : ''}${r.count}/${r.capacity}명${r.game ? ' · ' + (GAME_INFO[r.game]?.name || '') + ' 중' : ''}`)), h('span', { class: 'btn sm primary' }, '들어가기')))
        : h('p', { class: 'sheet-text' }, '지금 열려 있는 공개 파티룸이 없어요. 직접 만들어서 공개해 보는 건 어때요?'),
      h('button', { class: 'btn primary block', onclick: () => { closeSheets(); openCreate(); } }, '파티룸 만들기')),
  });
}

// ---------- 결과 카드와 사진 ----------
function looksMap(R) {
  const out = {};
  for (const [pid, p] of R.players) out[pid] = p.look;
  return out;
}

async function resultCard(R, g, share) {
  const res = g.result || { rank: [], unit: '점', label: '' };
  const card = makeResultCard({ brand: S.cfg.brand || '쏘플 온라인 파티룸', room: R.meta.name, game: GAME_INFO[g.id].name, label: res.label, unit: res.unit, rank: res.rank, looks: looksMap(R) });
  const file = `ssople-${g.id}-result.png`;
  if (share && !EMBED) { const r = await shareImage(card, file, `${R.meta.name} · ${GAME_INFO[g.id].name} 결과`); if (r === 'shared') stat('share'); else if (r === 'saved') { stat('card'); toast('이미지를 저장했어요'); } return; }
  previewImage('결과 카드', card, file, () => stat('card'));
}

function previewImage(title, canvas, file, onSave) {
  const img = h('img', { class: 'photo-prev', src: canvas.toDataURL('image/png'), alt: title });
  if (EMBED) {
    sheet({ title, body: h('div', null, img, h('p', { class: 'hint' }, '체험판에서는 저장 버튼 대신, 이미지를 길게 누르거나 마우스 오른쪽 버튼으로 저장해 주세요.')), actions: [{ label: '닫기', kind: 'primary' }] });
    return;
  }
  sheet({
    title, body: h('div', null, img, h('p', { class: 'hint' }, '휴대폰에서는 이미지를 길게 눌러 저장할 수도 있어요')),
    actions: [
      { label: '저장', kind: 'ghost', onClick: async () => { const r = await saveImage(canvas, file); if (r === 'saved') { onSave && onSave(); toast('이미지를 저장했어요'); } return false; } },
      { label: '공유하기', kind: 'primary', onClick: async () => { const r = await shareImage(canvas, file, title); if (r === 'shared') stat('share'); else if (r === 'saved') toast('이미지를 저장했어요'); return false; } },
    ],
  });
}

function photoCountdown(R, atLocal, by) {
  const room = $('#v-room');
  const box = h('div', { class: 'count3' });
  room.append(box);
  showMc(R, `${nickOf(R, by)}님이 단체 사진을 찍어요! 포토존으로 모여요 📸`, 4000);
  const tick = () => {
    if (S.room !== R) { box.remove(); return; }
    const left = atLocal - Date.now();
    if (left <= 0) {
      box.remove();
      play('shutter');
      R.world.cameraFlash();
      try {
        const shot = R.world.capture(1080, 810);
        const names = [...R.players.values()].filter((p) => p.on !== false && p.role === 'player').map((p) => p.nick);
        const card = makePhotoCard({ brand: S.cfg.brand || '쏘플 온라인 파티룸', room: R.meta.name, banner: R.meta.banner, photo: shot, names });
        if (!R.tv) setTimeout(() => previewImage('단체 사진', card, 'ssople-party-photo.png', () => stat('photo_save')), 500);
        ev(R, 'photo');
      } catch (err) { console.error(err); }
      return;
    }
    box.replaceChildren(h('small', null, '단체 사진'), String(Math.ceil(left / 1000)));
    setTimeout(tick, Math.min(200, left));
  };
  tick();
}
