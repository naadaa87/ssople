// 로비: 내 캐릭터·출석·미션·바로가기·공개 파티룸 목록, 그리고 상점·펫·업적 창
import { h, $, toast, sheet, closeSheets, confirmBox } from './ui.js';
import { P, gainText } from './profile.js';
import { paintAvatarIcon } from './avatar.js';
import { paintPetIcon } from './pet.js';
import { paintItemIcon } from './deco.js';
import { play } from './sound.js';
import { ITEMS, CATS, PETS, MAX_PETS, ADOPT_PRICE, PET_NAME_MAX, shopList } from '../shared/catalog.js';
import { BADGES, lvOf } from '../shared/missions.js';
import { THEMES } from '../shared/maps.js';
import { GAME_INFO } from '../shared/content.js';
import { josa } from '../shared/josa.js';

const THEME_SWATCH = {
  home: 'linear-gradient(135deg,#F6E7D4,#E3C193)',
  rooftop: 'linear-gradient(135deg,#1B2147,#3A2C66 60%,#6A3E6E)',
  game: 'linear-gradient(135deg,#1E2136,#5B43D6 60%,#FF4FA0)',
  square: 'linear-gradient(135deg,#D9EEFF,#9ED17E)',
};
export { THEME_SWATCH };
const FOOD_ICON = { food: '🥣', snack_bone: '🦴', snack_fish: '🐟', pet_cake: '🎂' };
const WHERE_LABEL = { arcade: '오락실', pet: '펫', home: '내 집', party: '파티룸', public: '공개 파티룸', create: '파티룸 만들기', square: '쏘플 스퀘어' };

/** 얻은 것 알려 주기 (레벨업·업적 포함) */
export function celebrate(g) {
  if (!g) return;
  const t = gainText(g);
  if (g.msg) toast(g.msg + (t ? ` (${t})` : ''), 'good');
  else if (t) toast(t, 'good');
  if (g.lv) { setTimeout(() => toast(`🎉 레벨 ${g.lv}이 됐어요! 새 아이템이 열렸을 수 있어요.`, 'good'), 600); play('level'); }
  for (const b of g.badges || []) setTimeout(() => toast(`🏅 업적 「${BADGES[b]?.name}」 달성! 코인 +${BADGES[b]?.coins || 0}`, 'good'), 1200);
  if (g.petLv) setTimeout(() => toast(`🐾 펫 친밀도 ${g.petLv.lv}레벨!`, 'good'), 900);
  if (g.coins && !g.lv) play('coin');
}

async function run(op, args, btn) {
  if (btn) btn.disabled = true;
  try { const g = await P.act(op, args); celebrate(g); return g; } catch (e) { toast(e.message || '잠시 후 다시 시도해 주세요.', 'bad'); play('wrong'); return null; } finally { if (btn) btn.disabled = false; }
}
export { run as act };

// ---------------------------------------------------------------
// 로비
// api: { go(path), openAvatar(), openCreate(), openJoinCode(), openArcade(game), publicRooms(), loginUrl, signupUrl, cfg, openRequests() }
export function renderHub(root, api) {
  const v = P.view();
  const me = h('section', { class: 'hcard hub-me' });
  const avCv = h('canvas', { class: 'hub-av', width: 96, height: 110 });
  const pet = P.petCard();
  const petCv = pet ? h('canvas', { class: 'hub-pet', width: 70, height: 60 }) : null;
  const xpPct = Math.round((v.xpCur / Math.max(1, v.xpNext)) * 100);
  me.append(
    h('div', { class: 'hub-av-wrap' }, avCv, petCv),
    h('div', { class: 'hub-me-main' },
      h('div', { class: 'hub-nick' }, h('b', null, v.nick || api.nick() || '이름을 정해 주세요'), h('span', { class: 'lv' }, `Lv.${v.lv}`)),
      h('div', { class: 'xpbar', title: `경험치 ${v.xpCur} / ${v.xpNext}` }, h('i', { style: { width: xpPct + '%' } })),
      h('div', { class: 'hub-stats' }, h('span', { class: 'pill coin' }, '🪙 ', v.coins.toLocaleString()), h('span', { class: 'hub-sub' }, `다음 레벨까지 ${Math.max(0, v.xpNext - v.xpCur)}`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm ghost', onclick: () => api.openAvatar() }, '🧑‍🎨 아바타'),
        h('button', { class: 'btn sm ghost', onclick: () => openPets(api) }, '🐾 펫'),
        h('button', { class: 'btn sm ghost', onclick: () => openBadges() }, `🏅 업적 ${v.badges.length}`))));
  requestAnimationFrame(() => { paintAvatarIcon(avCv, api.look(), { dir: 0 }); if (petCv) paintPetIcon(petCv, pet, { dir: 1 }); });

  // 출석
  const att = v.att;
  const cx = P.ctx();
  const cont = !v.canCheckin || att.last === cx.yesterday;
  let filled = cont ? (att.streak || 0) % 7 : 0;
  if (cont && att.streak > 0 && att.streak % 7 === 0 && !v.canCheckin) filled = 7;
  const week = Array.from({ length: 7 }, (_, i) => h('i', { class: 'att-dot' + (i < filled ? ' on' : '') + (i === 6 ? ' big' : '') + (v.canCheckin && i === filled ? ' next' : '') }, i === 6 ? '🎁' : String(i + 1)));
  const attBtn = h('button', { class: 'btn ' + (v.canCheckin ? 'primary' : 'ghost'), disabled: !v.canCheckin, onclick: async () => { const g = await run('checkin', {}, attBtn); if (g) refresh(); } }, v.canCheckin ? '출석 체크' : '오늘 출석 완료');
  const attCard = h('section', { class: 'hcard hub-att' },
    h('div', { class: 'hc-head' }, h('b', null, '📅 출석 체크'), h('span', { class: 'hub-sub' }, att.streak ? `${att.streak}일 연속 · 이번 달 ${att.days?.length || 0}일` : '오늘부터 시작해요')),
    h('div', { class: 'att-week' }, week),
    h('p', { class: 'hub-sub' }, '매일 출석하면 코인이 조금씩 늘어나고, 7일째엔 보너스 100코인!'),
    attBtn);

  // 미션
  const mis = h('section', { class: 'hcard hub-mis' });
  let tab = 'day';
  const drawMis = () => {
    const vv = P.view();
    const tabs = h('div', { class: 'seg' }, [['day', '오늘 미션'], ['week', '주간 미션']].map(([k, l]) => h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; drawMis(); } }, l)));
    const list = (tab === 'day' ? vv.daily : vv.weekly).map((m) => missionRow(m, api, drawAll));
    const all = vv.dailyAll;
    mis.replaceChildren(
      h('div', { class: 'hc-head' }, h('b', null, '🎯 미션'), vv.claimable ? h('span', { class: 'tag red' }, `받을 보상 ${vv.claimable}`) : h('span', { class: 'hub-sub' }, '매일 새로 바뀌어요')),
      tabs,
      h('div', { class: 'mis-list' }, list),
      tab === 'day' ? h('div', { class: 'mis-row bonus' + (all.got ? ' got' : '') },
        h('span', { class: 'mis-ic' }, '🌟'), h('span', { class: 'mis-main' }, h('b', null, all.title), h('small', null, `코인 ${all.coins} · 경험치 ${all.xp}`)),
        all.got ? h('span', { class: 'mis-done' }, '받음') : h('button', { class: 'btn sm primary', disabled: !all.ready, onclick: async (ev) => { if (await run('claim', { id: all.id }, ev.currentTarget)) drawAll(); } }, all.ready ? '받기' : '모두 끝내면')) : null);
  };
  const drawAll = () => refresh();

  // 바로가기
  const tile = (icon, title, sub, on, cls = '') => h('button', { class: 'tile ' + cls, onclick: () => { play('click'); on(); } }, h('span', { class: 'ti-ic' }, icon), h('b', null, title), h('small', null, sub));
  const tiles = h('section', { class: 'hub-tiles' },
    tile('🏠', '내 집', '가구 배치 · 펫과 놀기', () => api.go('/live/home'), 'big'),
    tile('🎉', '파티룸 만들기', '친구 초대 링크가 생겨요', () => api.openCreate(), 'big red'),
    tile('🕹️', '오락실', '미니게임 8종 · 랭킹', () => api.openArcade()),
    tile('🛍️', '상점', '가구 · 소품 · 펫 용품', () => openShop()),
    tile('🎨', '내 파티룸 꾸미기', '테마 · 조명 · 소품', () => api.go('/live/studio')),
    tile('🔑', '코드로 들어가기', '받은 방 코드 입력', () => api.openJoinCode()),
    tile('🌳', '쏘플 스퀘어', '모두가 모이는 광장', () => api.go('/live/square')),
    tile('💡', '개선 요청', '이런 기능이 있으면 좋겠어요', () => api.openRequests()));

  // 공개 파티룸
  const rooms = h('section', { class: 'hcard hub-rooms' }, h('div', { class: 'hc-head' }, h('b', null, '🔥 지금 열린 공개 파티룸'), h('button', { class: 'btn sm ghost', onclick: () => loadRooms() }, '새로고침')), h('div', { class: 'room-list' }, h('p', { class: 'hint' }, '불러오는 중…')));
  const loadRooms = async () => {
    const box = $('.room-list', rooms);
    const j = await api.publicRooms();
    if (!j) { box.replaceChildren(h('p', { class: 'sheet-text' }, api.cfg().server ? '목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.' : '실시간 서버가 연결되면 여기에서 다른 사람들의 공개 파티룸에 놀러 갈 수 있어요.')); return; }
    const list = j.rooms || [];
    box.replaceChildren(...[
      ...(list.length ? list.map((r) => roomRow(r, api)) : [h('p', { class: 'sheet-text' }, '지금 열린 공개 파티룸이 없어요. 내가 먼저 열어 볼까요?')]),
      j.people ? h('p', { class: 'hint' }, `지금 ${j.people}명이 온라인 파티룸에 있어요${j.private ? ` · 친구끼리 노는 비공개 방 ${j.private}개` : ''}`) : null,
      h('button', { class: 'btn primary block', onclick: () => api.openCreate() }, '공개 파티룸 열기')].filter(Boolean));
  };

  const notice = api.cfg().notice ? h('div', { class: 'hub-notice' }, '📢 ', api.cfg().notice) : null;
  const guest = !P.isMember() ? h('section', { class: 'hub-guest' },
    h('div', null, h('b', null, P.online ? '지금은 손님으로 놀고 있어요' : '이 브라우저에만 저장되고 있어요'), h('small', null, P.online ? '로그인하면 코인·펫·집이 계정에 저장돼서 다른 기기에서도 이어서 놀 수 있어요. 지금까지 모은 것도 그대로 옮겨 드려요.' : '쏘플 홈페이지에서 열면 회원 기록으로 저장할 수 있어요.')),
    P.online ? h('div', { class: 'row' }, h('a', { class: 'btn sm primary', href: api.loginUrl() }, '로그인'), h('a', { class: 'btn sm ghost', href: api.signupUrl() }, '회원가입')) : null) : null;

  root.replaceChildren(...[notice, guest].filter(Boolean), h('div', { class: 'hub-grid' }, h('div', { class: 'hub-col' }, me, attCard, mis), h('div', { class: 'hub-col' }, tiles, rooms)));
  drawMis();
  loadRooms();
  function refresh() { renderHub(root, api); }
}

function missionRow(m, api, after) {
  const pct = Math.round((m.cnt / m.goal) * 100);
  const go = WHERE_LABEL[m.where];
  return h('div', { class: 'mis-row' + (m.got ? ' got' : m.done ? ' done' : '') },
    h('span', { class: 'mis-ic' }, m.got ? '✅' : m.done ? '🎁' : '⬜'),
    h('span', { class: 'mis-main' }, h('b', null, m.title), h('div', { class: 'xpbar sm' }, h('i', { style: { width: pct + '%' } })), h('small', null, `${m.cnt}/${m.goal} · 코인 ${m.coins} · 경험치 ${m.xp}`)),
    m.got ? h('span', { class: 'mis-done' }, '받음')
      : m.done ? h('button', { class: 'btn sm primary', onclick: async (ev) => { if (await run('claim', { id: m.id }, ev.currentTarget)) after(); } }, '받기')
        : go && api.goWhere ? h('button', { class: 'btn sm ghost', onclick: () => api.goWhere(m.where) }, go) : null);
}

function roomRow(r, api) {
  const kindLabel = r.kind === 'home' ? '🏠 집들이' : (THEMES[r.theme]?.short || '파티룸');
  const sub = [`${r.count}/${r.capacity}명`, r.game ? `${GAME_INFO[r.game]?.name || '게임'} 중` : null, r.hostNick ? `방장 ${r.hostNick}` : null].filter(Boolean).join(' · ');
  return h('button', { class: 'room-row', onclick: () => api.go('/live/r/' + r.code, { visit: true }) },
    h('i', { class: 'rr-sw', style: { background: r.kind === 'home' ? 'linear-gradient(135deg,#FFF1EC,#F7D9C9)' : THEME_SWATCH[r.theme] || THEME_SWATCH.home } }, r.kind === 'home' ? '🏠' : ''),
    h('span', { class: 'rr-main' }, h('b', null, r.name), h('small', null, kindLabel, ' · ', sub)),
    h('span', { class: 'btn sm ' + (r.count >= r.capacity ? 'ghost' : 'primary') }, r.count >= r.capacity ? '꽉 참' : '놀러 가기'));
}

// ---------------------------------------------------------------
// 상점
export function openShop(startCat = 'furn') {
  let cat = startCat;
  const tabs = h('div', { class: 'chip-row shop-tabs' });
  const grid = h('div', { class: 'shop-grid' });
  const coins = h('span', { class: 'pill coin' });
  const draw = () => {
    const v = P.view();
    coins.replaceChildren('🪙 ', v.coins.toLocaleString());
    tabs.replaceChildren(...Object.entries(CATS).map(([k, l]) => h('button', { class: 'chip' + (k === cat ? ' on' : ''), onclick: () => { cat = k; draw(); } }, l)));
    const lv = v.lv;
    grid.replaceChildren(...shopList(cat).map((it) => {
      const have = v.inv[it.id] || 0;
      const single = ['paper', 'floor', 'pacc'].includes(it.cat);
      const locked = lv < (it.lv || 1);
      const owned = single && have > 0;
      const cv = h('canvas', { class: 'shop-cv', width: 90, height: 80 });
      requestAnimationFrame(() => iconFor(cv, it.id));
      const btn = h('button', { class: 'btn sm ' + (owned || locked ? 'ghost' : 'primary'), disabled: owned || locked || v.coins < it.price, onclick: async () => { if (await run('buy', { item: it.id }, btn)) draw(); } }, owned ? '가지고 있어요' : locked ? `Lv.${it.lv}부터` : `🪙 ${it.price.toLocaleString()}`);
      return h('div', { class: 'shop-item' + (locked ? ' locked' : '') }, cv, h('b', null, it.name), h('small', null, itemSub(it, have)), btn);
    }));
  };
  sheet({ title: '쏘플 상점', wide: true, className: 'shop-sheet', body: h('div', null, h('div', { class: 'shop-top' }, h('span', { class: 'hint' }, '코인은 게임 안에서만 쓰는 포인트예요. 돈으로 사거나 바꿀 수 없어요.'), coins), tabs, grid) });
  draw();
}
function itemSub(it, have) {
  const bits = [];
  if (it.cat === 'furn' || it.cat === 'deco') bits.push(it.where?.includes('party') ? '집·파티룸' : '내 집');
  if (it.w && (it.w > 1 || it.h > 1)) bits.push(`${it.w}×${it.h}칸`);
  if (it.seat) bits.push(`앉기 ${it.seat}명`);
  if (it.cat === 'food') bits.push(`배부름 +${it.full} · 기분 +${it.joy}`);
  if (it.desc) bits.push(it.desc);
  if (have && !['paper', 'floor', 'pacc'].includes(it.cat)) bits.push(`${have}개 있음`);
  return bits.join(' · ');
}
export function iconFor(cv, id) {
  const it = ITEMS[id];
  if (!it) return;
  if (it.cat === 'food') {
    const ctx = cv.getContext('2d'); const w = cv.width; const hh = cv.height;
    ctx.clearRect(0, 0, w, hh); ctx.font = `${Math.round(hh * 0.5)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(FOOD_ICON[id] || '🍖', w / 2, hh / 2 + 2);
    return;
  }
  if (it.cat === 'pacc') { paintPetIcon(cv, { kind: 'dog', color: 1, lv: 1, acc: { [it.slot]: id } }, { dir: 0 }); return; }
  paintItemIcon(cv, id);
}

// ---------------------------------------------------------------
// 펫
export function openPets(api = {}) {
  const box = h('div', { class: 'pets' });
  const s = sheet({ title: '내 펫', wide: true, body: box });
  const draw = () => {
    const v = P.view();
    if (!v.pets.length) {
      box.replaceChildren(h('div', { class: 'pet-empty' }, h('p', { class: 'sheet-text' }, '함께 다닐 펫을 데려와 보세요. 첫 친구는 무료예요. 내 집에서 같이 놀고, 파티룸에 데려가면 친구들에게도 보여요.'), h('button', { class: 'btn primary lg block', onclick: () => openAdopt(draw) }, '🐾 첫 펫 데려오기')));
      return;
    }
    box.replaceChildren(...v.pets.map((pet) => petCard(pet, v, draw, api)),
      v.pets.length < MAX_PETS ? h('button', { class: 'btn ghost block', onclick: () => openAdopt(draw) }, `🐾 새 친구 데려오기 (코인 ${ADOPT_PRICE})`) : h('p', { class: 'hint' }, `펫은 ${MAX_PETS}마리까지 함께할 수 있어요.`));
  };
  draw();
  const off = P.on(() => { if (s.wrap.isConnected) draw(); else off(); });
  return s;
}

function bar(label, val, color) {
  return h('div', { class: 'pbar' }, h('span', null, label), h('div', { class: 'xpbar' }, h('i', { style: { width: Math.round(val) + '%', background: color } })), h('em', null, Math.round(val)));
}

function petCard(pet, v, redraw, api) {
  const cv = h('canvas', { class: 'pet-cv', width: 120, height: 100 });
  requestAnimationFrame(() => paintPetIcon(cv, pet, { dir: 1, joy: pet.mood.k === 'happy' }));
  const on = v.petOn === pet.id;
  const foods = Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'food');
  const now = Date.now();
  const cdLeft = (k, m) => Math.max(0, (pet.cd?.[k] || 0) + m * 60e3 - now);
  const pat = cdLeft('pat', 5); const ply = cdLeft('play', 15);
  const feedRow = h('div', { class: 'row wrap' }, foods.map((f) => {
    const n = v.inv[f] || 0;
    return h('button', { class: 'btn sm ghost', disabled: !n, title: ITEMS[f].name, onclick: async (ev) => { const g = await run('pet', { id: pet.id, act: f }, ev.currentTarget); if (g) { play('bark'); redraw(); } } }, FOOD_ICON[f], ` ${n}`);
  }), h('button', { class: 'btn sm ghost', onclick: () => { closeSheets(); openShop('food'); } }, '먹이 사러 가기'));
  return h('div', { class: 'pet-card' + (on ? ' on' : '') },
    h('div', { class: 'pet-top' }, cv,
      h('div', { class: 'pet-info' },
        h('div', { class: 'pet-name' }, h('b', null, pet.name), h('span', { class: 'tag' }, PETS[pet.kind]?.name), on ? h('span', { class: 'tag red' }, '함께 다니는 중') : null),
        h('small', { class: 'hub-sub' }, `친밀도 Lv.${pet.lv} · ${pet.mood.t}`),
        h('div', { class: 'xpbar sm' }, h('i', { style: { width: Math.round((pet.xp / pet.need) * 100) + '%' } })),
        bar('배부름', pet.full, '#F5B82E'), bar('기분', pet.joy, '#FF6FA8'))),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn sm primary', disabled: pat > 0, onclick: async (ev) => { const g = await run('pet', { id: pet.id, act: 'pat' }, ev.currentTarget); if (g) { play('bark'); api.petJoy && api.petJoy(); redraw(); } } }, pat ? `쓰다듬기 ${Math.ceil(pat / 60e3)}분 뒤` : '🤚 쓰다듬기'),
      h('button', { class: 'btn sm primary', disabled: ply > 0, onclick: async (ev) => { const g = await run('pet', { id: pet.id, act: 'play' }, ev.currentTarget); if (g) { play('bark'); api.petJoy && api.petJoy(); redraw(); } } }, ply ? `놀아 주기 ${Math.ceil(ply / 60e3)}분 뒤` : '🎾 놀아 주기'),
      h('button', { class: 'btn sm ghost', onclick: async (ev) => { if (await run('petset', { id: pet.id, on: !on }, ev.currentTarget)) { api.petChanged && api.petChanged(); redraw(); } } }, on ? '집에 두기' : '데리고 다니기')),
    h('div', { class: 'pet-sub' }, h('small', null, '밥 주기'), feedRow),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn sm ghost', onclick: () => openPetStyle(pet, redraw, api) }, '🎀 꾸미기'),
      h('button', { class: 'btn sm ghost', onclick: () => renamePet(pet, redraw, api) }, '✏️ 이름 바꾸기')));
}

function openPetStyle(pet, redraw, api) {
  const v = P.view();
  const acc = { ...(pet.acc || {}) };
  const cv = h('canvas', { width: 140, height: 120, style: { width: '140px', height: '120px', display: 'block', margin: '0 auto' } });
  const paint = () => paintPetIcon(cv, { ...pet, acc }, { dir: 1 });
  const rows = ['head', 'neck', 'face'].map((slot) => {
    const owned = Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'pacc' && ITEMS[k].slot === slot && v.inv[k] > 0);
    const row = h('div', { class: 'chip-row' });
    const drawRow = () => row.replaceChildren(
      h('button', { class: 'chip' + (!acc[slot] ? ' on' : ''), onclick: () => { delete acc[slot]; drawRow(); paint(); } }, '없음'),
      ...owned.map((k) => h('button', { class: 'chip' + (acc[slot] === k ? ' on' : ''), onclick: () => { acc[slot] = k; drawRow(); paint(); } }, ITEMS[k].name)));
    drawRow();
    return h('div', { class: 'field' }, h('span', null, { head: '머리', neck: '목', face: '얼굴' }[slot]), owned.length ? row : h('small', { class: 'hint' }, '아직 없어요. 상점의 펫 꾸미기에서 살 수 있어요.'));
  });
  requestAnimationFrame(paint);
  sheet({
    title: `${pet.name} 꾸미기`, body: h('div', { class: 'form-gap' }, cv, rows),
    actions: [{ label: '상점 가기', kind: 'ghost', onClick: () => { closeSheets(); openShop('pacc'); } }, { label: '저장', kind: 'primary', onClick: () => { run('petset', { id: pet.id, acc }).then((g) => { if (g !== null) { redraw(); api.petChanged && api.petChanged(); } }); } }],
  });
}

function renamePet(pet, redraw, api) {
  const inp = h('input', { class: 'inp', maxlength: PET_NAME_MAX, value: pet.name });
  sheet({ title: '이름 바꾸기', body: h('div', null, inp), actions: [{ label: '저장', kind: 'primary', onClick: () => { run('petset', { id: pet.id, name: inp.value.trim() }).then((g) => { if (g !== null) { redraw(); api.petChanged && api.petChanged(); } }); } }] });
  setTimeout(() => inp.focus(), 200);
}

export function openAdopt(after) {
  const v = P.view();
  const st = { kind: 'dog', color: 0 };
  const cv = h('canvas', { width: 160, height: 130, style: { width: '160px', height: '130px', display: 'block', margin: '0 auto' } });
  const kinds = h('div', { class: 'chip-row' });
  const colors = h('div', { class: 'chip-row' });
  const name = h('input', { class: 'inp', maxlength: PET_NAME_MAX, placeholder: '예: 몽이', value: '' });
  const paint = () => paintPetIcon(cv, { kind: st.kind, color: st.color, lv: 1, acc: {} }, { dir: 1, joy: true });
  const draw = () => {
    kinds.replaceChildren(...Object.entries(PETS).map(([k, sp]) => h('button', { class: 'chip' + (k === st.kind ? ' on' : ''), onclick: () => { st.kind = k; st.color = 0; draw(); } }, sp.name)));
    colors.replaceChildren(...PETS[st.kind].colors.map((c, i) => h('button', { class: 'av-opt color' + (i === st.color ? ' on' : ''), style: { background: `linear-gradient(135deg, ${c[0]} 55%, ${c[1]})` }, 'aria-label': `색 ${i + 1}`, onclick: () => { st.color = i; draw(); } })));
    paint();
  };
  const price = v.pets.length ? ADOPT_PRICE : 0;
  sheet({
    title: v.pets.length ? '새 친구 데려오기' : '첫 펫 데려오기',
    body: h('div', { class: 'form-gap' }, cv, h('div', { class: 'field' }, h('span', null, '어떤 친구?'), kinds), h('div', { class: 'field' }, h('span', null, '색'), colors), h('label', { class: 'field' }, h('span', null, '이름'), name),
      h('p', { class: 'hint' }, price ? `코인 ${price}개가 들어요. (지금 ${v.coins.toLocaleString()}개)` : '첫 친구는 무료예요.')),
    actions: [{ label: '데려오기', kind: 'primary', onClick: () => {
      const n = name.value.trim() || PETS[st.kind].name;
      run('adopt', { kind: st.kind, color: st.color, name: n }).then((g) => { if (g) { play('bark'); after && after(); } });
    } }],
  });
  requestAnimationFrame(draw);
}

// ---------------------------------------------------------------
// 업적
export function openBadges() {
  const v = P.view();
  const got = new Set(v.badges);
  const st = v.stats || {};
  sheet({
    title: `업적 ${got.size}/${Object.keys(BADGES).length}`, wide: true,
    body: h('div', null,
      h('div', { class: 'badge-grid' }, Object.entries(BADGES).map(([k, b]) => h('div', { class: 'bdg' + (got.has(k) ? ' on' : '') }, h('i', null, got.has(k) ? '🏅' : '🔒'), h('b', null, b.name), h('small', null, b.desc), h('em', null, `코인 ${b.coins}`)))),
      h('div', { class: 'kv-grid' },
        kv('총 출석', `${v.att.total || 0}일 (최고 ${v.att.best || 0}일 연속)`),
        kv('모은 코인', `${(v.earned || 0).toLocaleString()}개`),
        kv('미니게임', `${Object.values(v.plays || {}).reduce((a, b) => a + b, 0)}판`),
        kv('파티룸 게임', `${st.party_game || 0}판`),
        kv('단체 사진', `${st.photo || 0}번`),
        kv('펫 돌보기', `${(st.pet_feed || 0) + (st.pet_play || 0)}번`))),
  });
}
function kv(k, val) { return h('div', { class: 'kv2' }, h('small', null, k), h('b', null, val)); }

export function itemName(id) { return ITEMS[id]?.name || id; }
export { lvOf, josa, confirmBox };
