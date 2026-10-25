// 미션·출석·업적·레벨 — 문구와 보상은 여기서 고치면 돼요.
// 이벤트(k)는 게임 안에서 일어난 일이에요. 하루에 셀 수 있는 횟수(cap)를 넘으면 더 세지 않아요.

export const EVENTS = {
  checkin: { cap: 1 },
  arcade_play: { cap: 60 },
  arcade_good: { cap: 60 },      // 미니게임 A등급 이상
  pet_feed: { cap: 20 },
  pet_play: { cap: 30 },         // 쓰다듬기·놀아 주기
  place_item: { cap: 40 },
  buy: { cap: 40 },
  party_game: { cap: 20, xp: 20 },
  cheers: { cap: 20 },
  photo: { cap: 10, xp: 5 },
  visit_public: { cap: 10, xp: 5 },
  chat: { cap: 200 },
  emote: { cap: 100 },
  host_room: { cap: 5, xp: 10 },
  square: { cap: 3 },
  cake: { cap: 5, xp: 5 },
  pet_walk: { cap: 12, xp: 8 },  // 펫과 함께 파티룸에 5분 있기
};

// 일일 미션: 출석 + 혼자 하는 것 2개 + 같이 하는 것 2개 (같이 하는 서버가 없으면 혼자 하는 것 4개)
export const DAILY_FIXED = { id: 'd_checkin', title: '출석 체크하기', k: 'checkin', goal: 1, coins: 20, xp: 10, where: 'hub' };
export const DAILY_SOLO = [
  { id: 'd_arcade3', title: '미니게임 3판 하기', k: 'arcade_play', goal: 3, coins: 40, xp: 25, where: 'arcade' },
  { id: 'd_arcade_good', title: '미니게임에서 A등급 받기', k: 'arcade_good', goal: 1, coins: 50, xp: 30, where: 'arcade' },
  { id: 'd_pet_feed', title: '펫에게 밥 주기', k: 'pet_feed', goal: 1, coins: 30, xp: 20, where: 'pet' },
  { id: 'd_pet_play', title: '펫 쓰다듬거나 놀아 주기 3번', k: 'pet_play', goal: 3, coins: 30, xp: 20, where: 'pet' },
  { id: 'd_place', title: '집에 소품 하나 놓기', k: 'place_item', goal: 1, coins: 30, xp: 20, where: 'home' },
  { id: 'd_arcade5', title: '미니게임 5판 하기', k: 'arcade_play', goal: 5, coins: 60, xp: 35, where: 'arcade' },
];
export const DAILY_SOCIAL = [
  { id: 'd_party_game', title: '파티룸에서 게임 한 판 끝까지 하기', k: 'party_game', goal: 1, coins: 60, xp: 40, where: 'party' },
  { id: 'd_cheers', title: '파티룸에서 건배 2번', k: 'cheers', goal: 2, coins: 40, xp: 25, where: 'party' },
  { id: 'd_photo', title: '포토존에서 단체 사진 찍기', k: 'photo', goal: 1, coins: 40, xp: 25, where: 'party' },
  { id: 'd_visit', title: '공개 파티룸에 놀러 가기', k: 'visit_public', goal: 1, coins: 40, xp: 25, where: 'public' },
  { id: 'd_chat', title: '파티룸에서 대화 10번', k: 'chat', goal: 10, coins: 40, xp: 25, where: 'party' },
  { id: 'd_emote', title: '박수·춤 같은 동작 3번', k: 'emote', goal: 3, coins: 30, xp: 20, where: 'party' },
  { id: 'd_host', title: '파티룸 하나 열기', k: 'host_room', goal: 1, coins: 50, xp: 30, where: 'create' },
  { id: 'd_square', title: '쏘플 스퀘어 들르기', k: 'square', goal: 1, coins: 30, xp: 15, where: 'square' },
];
export const DAILY_ALL_BONUS = { id: 'd_all', title: '오늘 미션 모두 끝내기', coins: 100, xp: 50 };

export const WEEKLY = [
  { id: 'w_att5', title: '이번 주 5일 출석', k: 'checkin', goal: 5, coins: 150, xp: 80 },
  { id: 'w_arcade20', title: '미니게임 20판', k: 'arcade_play', goal: 20, coins: 150, xp: 80 },
  { id: 'w_pet10', title: '펫 돌보기 10번', k: 'pet_care', goal: 10, coins: 120, xp: 60 },
  { id: 'w_party5', title: '파티룸 게임 5판', k: 'party_game', goal: 5, coins: 200, xp: 100, social: true },
  { id: 'w_place5', title: '소품 5번 놓기', k: 'place_item', goal: 5, coins: 120, xp: 60, solo: true },
];

// 한 번만 받는 업적
export const BADGES = {
  first_pet: { name: '첫 친구', desc: '펫을 처음 데려왔어요', coins: 50 },
  pet_lv5: { name: '단짝', desc: '펫 친밀도 5레벨', coins: 100 },
  pet_lv10: { name: '평생 친구', desc: '펫 친밀도 10레벨', coins: 300 },
  home_10: { name: '집 꾸미기 시작', desc: '집에 소품 10개를 놓았어요', coins: 100 },
  home_25: { name: '인테리어 고수', desc: '집에 소품 25개를 놓았어요', coins: 250 },
  arcade_all: { name: '오락실 정복', desc: '미니게임 8종을 모두 해 봤어요', coins: 150 },
  arcade_s: { name: 'S등급', desc: '미니게임에서 S등급을 받았어요', coins: 100 },
  streak7: { name: '일주일 개근', desc: '7일 연속 출석', coins: 150 },
  streak30: { name: '한 달 개근', desc: '30일 연속 출석', coins: 500 },
  lv5: { name: '레벨 5', desc: '레벨 5가 됐어요', coins: 100 },
  lv10: { name: '레벨 10', desc: '레벨 10이 됐어요', coins: 300 },
  lv20: { name: '레벨 20', desc: '레벨 20이 됐어요', coins: 800 },
  host_first: { name: '첫 파티 호스트', desc: '파티룸을 처음 열었어요', coins: 80 },
  party_10: { name: '파티 단골', desc: '파티룸 게임 10판을 끝까지 했어요', coins: 150 },
  photo_5: { name: '사진 찍는 사람', desc: '단체 사진 5번', coins: 80 },
  shopper: { name: '쇼핑왕', desc: '아이템 10개를 샀어요', coins: 80 },
  rich: { name: '코인 부자', desc: '코인을 모두 3,000개 모았어요', coins: 200 },
};

// 레벨: 레벨 L이 되려면 누적 경험치 50 × (L-1) × L
export const lvOf = (xp) => { let l = 1; while (50 * l * (l + 1) <= xp) l++; return Math.min(99, l); };
export const xpFor = (lv) => 50 * (lv - 1) * lv;
export const lvReward = (lv) => 30 + lv * 10;

// 미니게임 보상
export const ARCADE_COINS = { base: 5, C: 0, B: 5, A: 10, S: 20, dayCap: 200 };
export const ARCADE_XP = { base: 5, C: 0, B: 2, A: 5, S: 10 };

// 출석: 기본 20 + 연속 일수 × 5 (최대 7일까지), 7일마다 100 더
export const checkinReward = (streak) => 20 + Math.min(streak, 7) * 5 + (streak > 0 && streak % 7 === 0 ? 100 : 0);

/** 오늘 미션 고르기 — 날짜로 섞어서 하루 동안은 같아요 */
export function pickDaily(day, social) {
  let h = 2166136261;
  for (const ch of String(day) + (social ? 's' : 'o')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rand = () => { h = (Math.imul(h ^ (h >>> 13), 1274126177) + 0x9e3779b9) >>> 0; return h / 4294967296; };
  const take = (list, n) => { const a = list.slice(); const out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return out; };
  const solo = take(DAILY_SOLO, social ? 2 : 4);
  const soc = social ? take(DAILY_SOCIAL, 2) : [];
  // 같은 이벤트를 세는 미션이 둘이면(미니게임 3판·5판) 하나만
  const seen = new Set();
  const list = [DAILY_FIXED, ...solo, ...soc].filter((m) => (seen.has(m.k) ? false : seen.add(m.k)));
  return list.map((m) => m.id);
}
export const missionById = (id) => [DAILY_FIXED, ...DAILY_SOLO, ...DAILY_SOCIAL].find((m) => m.id === id) || null;
export const weeklyFor = (social) => WEEKLY.filter((w) => (social ? !w.solo : !w.social));
