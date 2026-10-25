// 내 정보(코인·레벨·미션·출석·펫·꾸미기·미니게임 기록)의 모든 규칙.
// 홈페이지 서버(로그인 회원)와 화면(로그인 전 손님)이 같은 함수를 써서 결과가 늘 같아요.
// 코인은 게임 안에서만 쓰는 점수예요. 돈으로 사거나 돈·상품으로 바꿀 수 없어요.
import { ITEMS, PETS, START_COINS, START_INV, START_HOME, MAX_PETS, ADOPT_PRICE, PET_NAME_MAX, petNeed } from './catalog.js';
import { EVENTS, WEEKLY, pickDaily, missionById, weeklyFor, DAILY_ALL_BONUS, BADGES, lvOf, xpFor, lvReward, ARCADE_COINS, ARCADE_XP, checkinReward } from './missions.js';
import { ARCADE, ARCADE_IDS, gradeOf, plausible } from './arcade-meta.js';
import { checkLayout, THEMES, LIGHTS } from './maps.js';
import { cleanLook } from './look.js';
import { cleanNick, cleanLine } from './filter.js';
import { josa } from './josa.js';

export const PROFILE_V = 1;

export class LiveError extends Error {}
const fail = (msg) => { throw new LiveError(msg); };

// ---------- 날짜 (한국 시간) ----------
export function ctxOf(now = Date.now(), social = false) {
  const k = new Date(now + 9 * 3600e3);
  const today = k.toISOString().slice(0, 10);
  const yesterday = new Date(now + 9 * 3600e3 - 864e5).toISOString().slice(0, 10);
  const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d - y0) / 864e5 + 1) / 7);
  return { now, today, yesterday, week: `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`, social: !!social };
}

// ---------- 새 프로필 ----------
export function newProfile(now = Date.now()) {
  return {
    v: PROFILE_V, nick: '', look: null,
    coins: START_COINS, earned: 0, xp: 0,
    inv: { ...START_INV },
    home: { wall: START_HOME.wall, floor: START_HOME.floor, items: START_HOME.items.map((x) => ({ ...x })) },
    room: { theme: 'home', light: 'warm', banner: '', items: [] },
    pets: [], petOn: null, petSeq: 0,
    day: null, week: null,
    att: { last: null, streak: 0, best: 0, total: 0, month: '', days: [] },
    badges: [], best: {}, plays: {}, stats: {},
    created: now, updated: now,
  };
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** 빠진 칸 채우기 + 날짜가 바뀌었으면 일일·주간 미션 새로 */
export function normalize(p, ctx) {
  const base = newProfile(ctx.now);
  if (!p || typeof p !== 'object') p = base;
  for (const k of Object.keys(base)) if (p[k] === undefined) p[k] = clone(base[k]);
  if (!p.inv || typeof p.inv !== 'object') p.inv = { ...START_INV };
  if (!p.home || !Array.isArray(p.home.items)) p.home = clone(base.home);
  if (!p.room || !Array.isArray(p.room.items)) p.room = clone(base.room);
  if (!Array.isArray(p.pets)) p.pets = [];
  if (!p.day || p.day.d !== ctx.today) p.day = { d: ctx.today, list: pickDaily(ctx.today, ctx.social), cnt: {}, got: [], arcadeCoins: 0 };
  if (!p.week || p.week.w !== ctx.week) p.week = { w: ctx.week, list: weeklyFor(ctx.social).map((w) => w.id), cnt: {}, got: [] };
  p.v = PROFILE_V;
  return p;
}

// ---------- 보상 ----------
function gainsNew() { return { coins: 0, xp: 0, lv: null, badges: [], items: [], msg: '' }; }
function addCoins(p, g, n) {
  if (!n) return;
  p.coins = Math.max(0, num(p.coins) + n);
  if (n > 0) { p.earned = num(p.earned) + n; g.coins += n; if (p.earned >= 3000) badge(p, g, 'rich'); }
}
function addXp(p, g, n) {
  if (!n) return;
  const before = lvOf(num(p.xp));
  p.xp = num(p.xp) + n;
  g.xp += n;
  const after = lvOf(p.xp);
  if (after > before) {
    g.lv = after;
    for (let l = before + 1; l <= after; l++) addCoins(p, g, lvReward(l));
    if (after >= 5) badge(p, g, 'lv5');
    if (after >= 10) badge(p, g, 'lv10');
    if (after >= 20) badge(p, g, 'lv20');
  }
}
function badge(p, g, id) {
  if (!BADGES[id] || p.badges.includes(id)) return;
  p.badges.push(id);
  g.badges.push(id);
  addCoins(p, g, BADGES[id].coins);
}

/** 이벤트 세기 (하루 한도 안에서) */
function count(p, g, k, n = 1) {
  const ev = EVENTS[k];
  if (!ev) return 0;
  n = Math.max(0, Math.min(500, Math.floor(num(n))));
  const have = num(p.day.cnt[k]);
  const add = Math.max(0, Math.min(n, ev.cap - have));
  if (!add) return 0;
  p.day.cnt[k] = have + add;
  p.week.cnt[k] = num(p.week.cnt[k]) + add;
  if (k === 'pet_feed' || k === 'pet_play') p.week.cnt.pet_care = num(p.week.cnt.pet_care) + add;
  p.stats[k] = num(p.stats[k]) + add;
  if (ev.xp) addXp(p, g, ev.xp * add);
  if (k === 'host_room') badge(p, g, 'host_first');
  if (k === 'party_game' && p.stats.party_game >= 10) badge(p, g, 'party_10');
  if (k === 'photo' && p.stats.photo >= 5) badge(p, g, 'photo_5');
  if (k === 'buy' && p.stats.buy >= 10) badge(p, g, 'shopper');
  return add;
}

// ---------- 펫 ----------
export function decayPet(pet, now) {
  const h = Math.max(0, (now - num(pet.at, now)) / 3600e3);
  pet.full = Math.max(0, num(pet.full, 70) - 4 * h);
  pet.joy = Math.max(0, num(pet.joy, 70) - 3 * h);
  pet.at = now;
  return pet;
}
export function moodOf(pet) {
  if (pet.full < 25) return { k: 'hungry', t: '배고파요' };
  if (pet.joy < 25) return { k: 'bored', t: '심심해요' };
  if (pet.full >= 70 && pet.joy >= 70) return { k: 'happy', t: '행복해요' };
  return { k: 'ok', t: '기분 좋아요' };
}
function petXp(p, g, pet, n) {
  pet.xp = num(pet.xp) + n;
  while (pet.xp >= petNeed(pet.lv) && pet.lv < 30) {
    pet.xp -= petNeed(pet.lv);
    pet.lv += 1;
    g.petLv = { id: pet.id, lv: pet.lv };
    addCoins(p, g, 20 * pet.lv);
    if (pet.lv >= 5) badge(p, g, 'pet_lv5');
    if (pet.lv >= 10) badge(p, g, 'pet_lv10');
  }
}
const findPet = (p, id) => p.pets.find((x) => x.id === Number(id)) || fail('펫을 찾지 못했어요.');

// 집과 파티룸에 놓인 개수 (같은 소품을 두 곳에 동시에 둘 수는 없어요)
function placed(items) { const c = {}; for (const it of items || []) c[it.i] = (c[it.i] || 0) + 1; return c; }
function availFor(p, other) {
  const out = { ...p.inv };
  for (const [k, n] of Object.entries(placed(other))) out[k] = (out[k] || 0) - n;
  return out;
}

// ---------- 동작 ----------
const OPS = {
  look(p, a) {
    if (a.nick !== undefined) { const n = cleanNick(a.nick, ''); if (!n) fail('다른 이름으로 정해 주세요.'); p.nick = n; }
    if (a.look !== undefined) p.look = cleanLook(a.look);
  },

  checkin(p, a, ctx, g) {
    if (p.att.last === ctx.today) fail('오늘은 이미 출석했어요. 내일 또 와 주세요!');
    p.att.streak = p.att.last === ctx.yesterday ? num(p.att.streak) + 1 : 1;
    p.att.best = Math.max(num(p.att.best), p.att.streak);
    p.att.total = num(p.att.total) + 1;
    p.att.last = ctx.today;
    const month = ctx.today.slice(0, 7);
    if (p.att.month !== month) { p.att.month = month; p.att.days = []; }
    const dd = Number(ctx.today.slice(8));
    if (!p.att.days.includes(dd)) p.att.days.push(dd);
    addCoins(p, g, checkinReward(p.att.streak));
    addXp(p, g, 10);
    count(p, g, 'checkin', 1);
    if (p.att.streak >= 7) badge(p, g, 'streak7');
    if (p.att.streak >= 30) badge(p, g, 'streak30');
    g.msg = `${p.att.streak}일째 출석이에요!`;
  },

  events(p, a, ctx, g) {
    const list = Array.isArray(a.list) ? a.list.slice(0, 30) : [];
    for (const e of list) if (e && e.k !== 'checkin' && EVENTS[e.k]) count(p, g, e.k, e.n ?? 1);
  },

  claim(p, a, ctx, g) {
    const id = String(a.id || '');
    if (id === DAILY_ALL_BONUS.id) {
      const done = p.day.list.every((m) => p.day.got.includes(m));
      if (!done) fail('오늘 미션을 모두 받은 뒤에 받을 수 있어요.');
      if (p.day.got.includes(id)) fail('이미 받았어요.');
      p.day.got.push(id);
      addCoins(p, g, DAILY_ALL_BONUS.coins); addXp(p, g, DAILY_ALL_BONUS.xp);
      g.msg = '오늘 미션 완료!';
      return;
    }
    if (p.day.list.includes(id)) {
      const m = missionById(id);
      if (p.day.got.includes(id)) fail('이미 받았어요.');
      if (num(p.day.cnt[m.k]) < m.goal) fail('아직 끝나지 않은 미션이에요.');
      p.day.got.push(id);
      addCoins(p, g, m.coins); addXp(p, g, m.xp);
      return;
    }
    const w = WEEKLY.find((x) => x.id === id);
    if (w && p.week.list.includes(id)) {
      if (p.week.got.includes(id)) fail('이미 받았어요.');
      if (num(p.week.cnt[w.k]) < w.goal) fail('아직 끝나지 않은 미션이에요.');
      p.week.got.push(id);
      addCoins(p, g, w.coins); addXp(p, g, w.xp);
      return;
    }
    fail('지금 받을 수 있는 미션이 아니에요.');
  },

  buy(p, a, ctx, g) {
    const id = String(a.item || '');
    const it = ITEMS[id];
    if (!it || !(it.price > 0)) fail('살 수 없는 아이템이에요.');
    const n = Math.max(1, Math.min(10, Math.floor(num(a.n, 1))));
    if (lvOf(p.xp) < (it.lv || 1)) fail(`레벨 ${it.lv}부터 살 수 있어요.`);
    const single = ['paper', 'floor', 'pacc'].includes(it.cat);
    if (single && (p.inv[id] || 0) >= 1) fail('이미 가지고 있어요.');
    if (single && n > 1) fail('하나만 살 수 있어요.');
    const cost = it.price * n;
    if (num(p.coins) < cost) fail(`코인이 ${cost - num(p.coins)}개 모자라요.`);
    p.coins -= cost;
    p.inv[id] = (p.inv[id] || 0) + (it.n || 1) * n;
    g.items.push({ id, n: (it.n || 1) * n });
    g.spent = cost;
    count(p, g, 'buy', n);
    g.msg = `${josa(it.name, '을', '를')} 샀어요.`;
  },

  home(p, a, ctx, g) {
    const wall = String(a.wall || p.home.wall); const floor = String(a.floor || p.home.floor);
    if (ITEMS[wall]?.cat !== 'paper' || !(p.inv[wall] > 0)) fail('가지고 있는 벽지만 쓸 수 있어요.');
    if (ITEMS[floor]?.cat !== 'floor' || !(p.inv[floor] > 0)) fail('가지고 있는 바닥만 쓸 수 있어요.');
    const r = checkLayout('home', a.items ?? p.home.items, availFor(p, p.room.items));
    if (r.error) fail(r.error);
    const before = p.home.items.length;
    p.home = { wall, floor, items: r.items };
    const more = r.items.length - before;
    if (more > 0) count(p, g, 'place_item', more);
    if (r.items.length >= 10) badge(p, g, 'home_10');
    if (r.items.length >= 25) badge(p, g, 'home_25');
  },

  room(p, a, ctx, g) {
    const theme = a.theme !== undefined ? String(a.theme) : p.room.theme;
    if (!THEMES[theme] || theme === 'square') fail('테마를 다시 골라 주세요.');
    const light = a.light !== undefined ? String(a.light) : p.room.light;
    if (!LIGHTS[light]) fail('조명을 다시 골라 주세요.');
    const banner = a.banner !== undefined ? cleanLine(a.banner, 24) : p.room.banner;
    const r = checkLayout('party', a.items ?? p.room.items, availFor(p, p.home.items));
    if (r.error) fail(r.error);
    const before = p.room.items.length;
    p.room = { theme, light, banner, items: r.items };
    if (r.items.length > before) count(p, g, 'place_item', r.items.length - before);
  },

  adopt(p, a, ctx, g) {
    const kind = String(a.kind || '');
    const sp = PETS[kind];
    if (!sp) fail('데려올 친구를 골라 주세요.');
    if (p.pets.length >= MAX_PETS) fail(`펫은 ${MAX_PETS}마리까지 함께할 수 있어요.`);
    const color = Math.floor(num(a.color));
    if (color < 0 || color >= sp.colors.length) fail('색을 다시 골라 주세요.');
    const name = cleanNick(String(a.name || '').slice(0, PET_NAME_MAX), '');
    if (!name) fail('이름을 정해 주세요.');
    const price = p.pets.length ? ADOPT_PRICE : 0;
    if (num(p.coins) < price) fail(`두 번째 펫부터는 코인 ${price}개가 필요해요.`);
    p.coins -= price;
    p.petSeq = num(p.petSeq) + 1;
    const pet = { id: p.petSeq, kind, color, name: Array.from(name).slice(0, PET_NAME_MAX).join(''), lv: 1, xp: 0, full: 80, joy: 80, at: ctx.now, acc: {}, cd: {}, born: ctx.today };
    p.pets.push(pet);
    if (!p.petOn) p.petOn = pet.id;
    g.pet = pet.id;
    badge(p, g, 'first_pet');
    g.msg = `${josa(pet.name, '이', '가')} 새 가족이 됐어요!`;
  },

  pet(p, a, ctx, g) {
    const pet = findPet(p, a.id);
    decayPet(pet, ctx.now);
    const act = String(a.act || '');
    pet.cd = pet.cd || {};
    if (act === 'pat' || act === 'play') {
      const wait = act === 'pat' ? 5 * 60e3 : 15 * 60e3;
      const left = num(pet.cd[act]) + wait - ctx.now;
      if (left > 0) fail(`${Math.ceil(left / 60e3)}분 뒤에 다시 ${act === 'pat' ? '쓰다듬을' : '놀아 줄'} 수 있어요.`);
      pet.cd[act] = ctx.now;
      if (act === 'pat') { pet.joy = Math.min(100, pet.joy + 12); petXp(p, g, pet, 5); }
      else { pet.joy = Math.min(100, pet.joy + 22); pet.full = Math.max(0, pet.full - 6); petXp(p, g, pet, 12); }
      count(p, g, 'pet_play', 1);
      g.msg = act === 'pat' ? `${josa(pet.name, '이', '가')} 기분 좋아해요.` : `${josa(pet.name, '이', '가')} 신나게 놀았어요.`;
      return;
    }
    const food = ITEMS[act];
    if (!food || food.cat !== 'food') fail('줄 수 있는 먹이를 골라 주세요.');
    if (!(p.inv[act] > 0)) fail(`${josa(food.name.replace(/\s?\d+개$/, ''), '이', '가')} 없어요. 상점에서 살 수 있어요.`);
    if (pet.full >= 95 && act === 'food') fail(`${josa(pet.name, '은', '는')} 배가 불러서 더 먹기 싫대요.`);
    p.inv[act] -= 1;
    pet.full = Math.min(100, pet.full + food.full);
    pet.joy = Math.min(100, pet.joy + food.joy);
    petXp(p, g, pet, food.xp);
    count(p, g, 'pet_feed', 1);
    g.msg = `${josa(pet.name, '이', '가')} 맛있게 먹었어요.`;
  },

  petset(p, a) {
    const pet = findPet(p, a.id);
    if (a.name !== undefined) {
      const n = cleanNick(String(a.name).slice(0, PET_NAME_MAX), '');
      if (!n) fail('이름을 다시 정해 주세요.');
      pet.name = n;
    }
    if (a.acc && typeof a.acc === 'object') {
      const acc = {};
      for (const slot of ['head', 'neck', 'face']) {
        const id = a.acc[slot];
        if (!id) continue;
        const it = ITEMS[id];
        if (!it || it.cat !== 'pacc' || it.slot !== slot) fail('꾸미기 아이템을 다시 골라 주세요.');
        if (!(p.inv[id] > 0)) fail(`${josa(it.name, '은', '는')} 아직 없어요. 상점에서 살 수 있어요.`);
        acc[slot] = id;
      }
      pet.acc = acc;
    }
    if (a.on !== undefined) p.petOn = a.on ? pet.id : (p.petOn === pet.id ? null : p.petOn);
  },

  score(p, a, ctx, g) {
    const game = String(a.game || '');
    const score = Math.floor(num(a.score, -1));
    const ms = num(a.ms, 0);
    if (!ARCADE[game]) fail('모르는 미니게임이에요.');
    if (!plausible(game, score, ms)) fail('점수를 확인하지 못했어요.');
    const grade = gradeOf(game, score);
    p.plays[game] = num(p.plays[game]) + 1;
    const prev = num(p.best[game]);
    g.best = Math.max(prev, score);
    g.newBest = score > prev;
    if (g.newBest) p.best[game] = score;
    g.grade = grade;
    const want = ARCADE_COINS.base + (ARCADE_COINS[grade] || 0);
    const room = Math.max(0, ARCADE_COINS.dayCap - num(p.day.arcadeCoins));
    const coins = Math.min(want, room);
    p.day.arcadeCoins = num(p.day.arcadeCoins) + coins;
    g.capped = coins < want;
    addCoins(p, g, coins);
    addXp(p, g, ARCADE_XP.base + (ARCADE_XP[grade] || 0));
    count(p, g, 'arcade_play', 1);
    if (grade === 'A' || grade === 'S') count(p, g, 'arcade_good', 1);
    if (grade === 'S') badge(p, g, 'arcade_s');
    if (ARCADE_IDS.every((k) => num(p.plays[k]) > 0)) badge(p, g, 'arcade_all');
  },
};
export const OP_NAMES = Object.keys(OPS);

/** 동작 하나 적용 — 원본은 건드리지 않고 새 프로필과 얻은 것을 돌려줘요 */
export function apply(profile, op, args, ctx) {
  const fn = OPS[op];
  if (!fn) fail('할 수 없는 동작이에요.');
  const p = normalize(clone(profile || newProfile(ctx.now)), ctx);
  const g = gainsNew();
  fn(p, args && typeof args === 'object' ? args : {}, ctx, g);
  p.updated = ctx.now;
  return { profile: p, gains: g };
}

// ---------- 화면에 보여 줄 값 ----------
export function view(profile, ctx) {
  const p = normalize(clone(profile || newProfile(ctx.now)), ctx);
  const lv = lvOf(p.xp);
  const daily = p.day.list.map((id) => {
    const m = missionById(id);
    if (!m) return null;
    const cnt = Math.min(m.goal, num(p.day.cnt[m.k]));
    return { ...m, cnt, done: cnt >= m.goal, got: p.day.got.includes(id) };
  }).filter(Boolean);
  const allGot = daily.every((m) => m.got);
  const weekly = p.week.list.map((id) => WEEKLY.find((w) => w.id === id)).filter(Boolean).map((w) => {
    const cnt = Math.min(w.goal, num(p.week.cnt[w.k]));
    return { ...w, cnt, done: cnt >= w.goal, got: p.week.got.includes(w.id) };
  });
  const pets = p.pets.map((x) => { const q = decayPet({ ...x }, ctx.now); return { ...q, full: Math.round(q.full), joy: Math.round(q.joy), mood: moodOf(q), need: petNeed(q.lv) }; });
  const usedHome = placed(p.home.items); const usedRoom = placed(p.room.items);
  const free = {};
  for (const [k, n] of Object.entries(p.inv)) free[k] = n - (usedHome[k] || 0) - (usedRoom[k] || 0);
  const claimable = daily.filter((m) => m.done && !m.got).length + weekly.filter((w) => w.done && !w.got).length + (allGot && !p.day.got.includes(DAILY_ALL_BONUS.id) ? 1 : 0);
  return {
    nick: p.nick, look: p.look, coins: p.coins, earned: p.earned, xp: p.xp, lv,
    xpCur: p.xp - xpFor(lv), xpNext: xpFor(lv + 1) - xpFor(lv),
    canCheckin: p.att.last !== ctx.today, att: p.att,
    daily, dailyAll: { ...DAILY_ALL_BONUS, ready: allGot, got: p.day.got.includes(DAILY_ALL_BONUS.id) }, weekly, claimable,
    arcadeCoinsLeft: Math.max(0, ARCADE_COINS.dayCap - num(p.day.arcadeCoins)),
    pets, petOn: p.petOn, inv: p.inv, free, home: p.home, room: p.room,
    badges: p.badges, best: p.best, plays: p.plays, stats: p.stats,
  };
}

/** 실시간 방에 보낼 내 펫 정보 */
export function petCard(profile) {
  const pet = profile?.pets?.find((x) => x.id === profile.petOn);
  if (!pet) return null;
  return { kind: pet.kind, color: pet.color, name: pet.name, lv: pet.lv, acc: pet.acc || {} };
}

/** 손님으로 모은 것을 계정으로 옮길 때 — 말이 안 되는 값은 잘라요 */
export function sanitizeImport(g, ctx) {
  const p = normalize(newProfile(ctx.now), ctx);
  if (!g || typeof g !== 'object') return p;
  p.nick = cleanNick(g.nick || '', '');
  if (g.look) p.look = cleanLook(g.look);
  p.coins = Math.max(0, Math.min(2000, Math.floor(num(g.coins, START_COINS))));
  p.earned = Math.max(0, Math.min(3000, Math.floor(num(g.earned))));
  p.xp = Math.max(0, Math.min(3000, Math.floor(num(g.xp))));
  const inv = {};
  for (const [k, v] of Object.entries(g.inv || {})) {
    const it = ITEMS[k];
    if (!it) continue;
    const cap = ['paper', 'floor', 'pacc'].includes(it.cat) ? 1 : it.cat === 'food' ? 30 : 6;
    const n = Math.max(0, Math.min(cap, Math.floor(num(v))));
    if (n) inv[k] = n;
  }
  for (const [k, v] of Object.entries(START_INV)) inv[k] = Math.max(inv[k] || 0, v);
  p.inv = inv;
  const home = checkLayout('home', g.home?.items || [], inv);
  if (!home.error && ITEMS[g.home?.wall]?.cat === 'paper' && inv[g.home.wall] && ITEMS[g.home?.floor]?.cat === 'floor' && inv[g.home.floor]) p.home = { wall: g.home.wall, floor: g.home.floor, items: home.items };
  const room = checkLayout('party', g.room?.items || [], availFor(p, p.home.items));
  if (!room.error && THEMES[g.room?.theme] && g.room.theme !== 'square') p.room = { theme: g.room.theme, light: LIGHTS[g.room.light] ? g.room.light : 'warm', banner: cleanLine(g.room.banner || '', 24), items: room.items };
  p.pets = (Array.isArray(g.pets) ? g.pets : []).slice(0, MAX_PETS).filter((x) => PETS[x?.kind]).map((x, i) => ({
    id: i + 1, kind: x.kind, color: Math.max(0, Math.min(PETS[x.kind].colors.length - 1, Math.floor(num(x.color)))),
    name: cleanNick(String(x.name || '').slice(0, PET_NAME_MAX), PETS[x.kind].name), lv: Math.max(1, Math.min(10, Math.floor(num(x.lv, 1)))), xp: 0,
    full: 70, joy: 70, at: ctx.now, acc: {}, cd: {}, born: typeof x.born === 'string' ? x.born.slice(0, 10) : ctx.today,
  }));
  p.petSeq = p.pets.length;
  // 같은 날 출석·미션을 두 번 받지 않도록 오늘 기록도 옮겨요
  const ymd = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  if (g.att && typeof g.att === 'object') {
    p.att = {
      last: ymd(g.att.last), streak: Math.max(0, Math.min(60, Math.floor(num(g.att.streak)))), best: Math.max(0, Math.min(60, Math.floor(num(g.att.best)))),
      total: Math.max(0, Math.min(120, Math.floor(num(g.att.total)))), month: typeof g.att.month === 'string' ? g.att.month.slice(0, 7) : '',
      days: (Array.isArray(g.att.days) ? g.att.days : []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 31).slice(0, 31),
    };
  }
  if (g.day && g.day.d === ctx.today) {
    for (const [k, v] of Object.entries(g.day.cnt || {})) if (EVENTS[k]) p.day.cnt[k] = Math.max(0, Math.min(EVENTS[k].cap, Math.floor(num(v))));
    p.day.got = (Array.isArray(g.day.got) ? g.day.got : []).filter((id) => typeof id === 'string').slice(0, 10);
    p.day.arcadeCoins = Math.max(0, Math.min(ARCADE_COINS.dayCap, Math.floor(num(g.day.arcadeCoins))));
  }
  if (g.week && g.week.w === ctx.week) {
    for (const [k, v] of Object.entries(g.week.cnt || {})) if (EVENTS[k] || k === 'pet_care') p.week.cnt[k] = Math.max(0, Math.min(500, Math.floor(num(v))));
    p.week.got = (Array.isArray(g.week.got) ? g.week.got : []).filter((id) => typeof id === 'string').slice(0, 10);
  }
  p.petOn = p.pets.length ? 1 : null;
  p.badges = (Array.isArray(g.badges) ? g.badges : []).filter((b) => BADGES[b]).slice(0, 40);
  for (const k of ARCADE_IDS) {
    const b = Math.floor(num(g.best?.[k]));
    if (b > 0 && b <= ARCADE[k].max) p.best[k] = b;
    const n = Math.floor(num(g.plays?.[k]));
    if (n > 0) p.plays[k] = Math.min(n, 500);
  }
  return p;
}
