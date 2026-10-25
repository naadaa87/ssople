// 아이템·펫 목록 — 상점, 꾸미기, 서버 검사가 모두 이 파일을 봅니다.
import { cleanNick } from './filter.js';
// 가격 단위는 코인이에요. 코인은 게임 안에서만 쓰고, 돈으로 사거나 바꿀 수 없어요.
//
// cat   : furn 가구 · deco 파티 소품 · wall 벽 장식 · paper 벽지 · floor 바닥 · food 펫 먹이 · pacc 펫 꾸미기
// place : floor 바닥에 세움 · flat 바닥에 깔림 · wall 벽에 걺(벽에 붙은 칸) · hang 천장에 매달림
// where : 놓을 수 있는 곳 (home 내 집 · party 내 파티룸)
// w, h  : 차지하는 칸 (돌리면 바뀜) · block: 지나갈 수 없음 · tall: 높이(px) · seat: 앉는 자리 수 · act: 가까이 가면 생기는 버튼

export const CATS = {
  furn: '가구', deco: '파티 소품', wall: '벽 장식', paper: '벽지', floor: '바닥', food: '펫 먹이', pacc: '펫 꾸미기',
};

const F = (name, price, w, h, opt = {}) => ({ name, price, w, h, cat: 'furn', place: 'floor', where: ['home'], block: true, tall: 40, lv: 1, ...opt });
const D = (name, price, opt = {}) => ({ name, price, w: 1, h: 1, cat: 'deco', place: 'floor', where: ['home', 'party'], block: false, tall: 40, lv: 1, ...opt });
const W = (name, price, opt = {}) => ({ name, price, w: 1, h: 1, cat: 'wall', place: 'wall', where: ['home'], block: false, tall: 0, lv: 1, ...opt });

export const ITEMS = {
  // ----- 가구 -----
  bed_single: F('싱글 침대', 300, 2, 1, { tall: 30, act: 'nap', desc: '가까이 가면 낮잠을 잘 수 있어요' }),
  bed_double: F('더블 침대', 520, 2, 2, { tall: 32, lv: 3, act: 'nap' }),
  sofa_two: F('2인 소파', 360, 2, 1, { tall: 36, seat: 2 }),
  armchair: F('1인 소파', 180, 1, 1, { tall: 36, seat: 1 }),
  beanbag: F('빈백', 150, 1, 1, { tall: 22, seat: 1 }),
  chair: F('나무 의자', 80, 1, 1, { tall: 40, seat: 1 }),
  table_round: F('원형 테이블', 160, 1, 1, { tall: 26 }),
  table_long: F('다이닝 테이블', 280, 2, 1, { tall: 28, lv: 2 }),
  desk: F('책상', 240, 2, 1, { tall: 30 }),
  bookshelf: F('책장', 220, 1, 1, { tall: 78 }),
  wardrobe: F('옷장', 340, 2, 1, { tall: 82, lv: 2 }),
  tv_set: F('TV 세트', 420, 2, 1, { tall: 58, lv: 2, act: 'tv', desc: '집들이 때 방장은 여기서 게임을 열어요' }),
  fridge: F('냉장고', 300, 1, 1, { tall: 84, lv: 3 }),
  kitchen: F('주방 조리대', 380, 2, 1, { tall: 40, lv: 3 }),
  lamp: F('스탠드 조명', 120, 1, 1, { tall: 70, block: false }),
  plant_big: F('큰 화분', 140, 1, 1, { tall: 74 }),
  piano: F('피아노', 900, 2, 1, { tall: 50, lv: 5, act: 'piano', desc: '가까이 가면 한 곡 연주해요' }),
  aquarium: F('어항', 650, 2, 1, { tall: 52, lv: 4, act: 'fish', desc: '물고기에게 먹이를 줄 수 있어요' }),
  arcade: F('오락기', 500, 1, 1, { tall: 76, act: 'arcade', desc: '가까이 가면 미니게임을 할 수 있어요' }),
  speaker: F('스피커', 200, 1, 1, { tall: 56, act: 'music', desc: '조명 분위기를 바꿔요' }),
  pet_bed: F('펫 쿠션', 120, 1, 1, { tall: 8, block: false, act: 'pet', desc: '가까이 가면 펫을 돌볼 수 있어요' }),
  pet_house: F('펫 하우스', 380, 1, 1, { tall: 48, lv: 2, act: 'pet' }),
  cat_tower: F('캣타워', 420, 1, 1, { tall: 88, lv: 3, act: 'pet' }),
  rug_round: F('동그란 러그', 140, 2, 2, { place: 'flat', block: false, tall: 0, where: ['home', 'party'] }),
  rug_rect: F('사각 러그', 180, 3, 2, { place: 'flat', block: false, tall: 0, where: ['home', 'party'] }),
  xmas_tree: F('크리스마스 트리', 480, 1, 1, { tall: 96, lv: 2, where: ['home', 'party'] }),

  // ----- 파티 소품 (내 집·내 파티룸) -----
  balloons: D('풍선 다발', 60, { tall: 84 }),
  gift_box: D('선물 상자', 50, { tall: 18 }),
  teddy: D('곰인형', 160, { tall: 30 }),
  plant_small: D('작은 화분', 70, { tall: 28 }),
  candles: D('캔들 세트', 80, { tall: 14 }),
  pumpkin: D('호박 랜턴', 120, { tall: 22 }),
  snowman: D('눈사람', 220, { tall: 46, lv: 2, block: true }),
  photo_stand: D('포토 스탠드', 200, { tall: 70, block: true }),
  flower_stand: D('축하 화환', 260, { tall: 88, lv: 2, block: true, desc: '개업·생일 축하 화환이에요' }),
  cake_tower: D('3단 케이크', 350, { tall: 44, lv: 3, block: true }),
  mirror_ball: D('미러볼', 300, { place: 'hang', tall: 0, lv: 2, desc: '천장에 매달려 빛나요' }),
  neon_stand: D('네온 스탠드', 240, { tall: 64, lv: 2 }),

  // ----- 벽 장식 (내 집, 벽에 붙은 칸) -----
  frame_photo: W('사진 액자', 80),
  poster: W('파티 포스터', 90),
  clock: W('벽시계', 110),
  garland: W('가랜드', 120),
  window: W('창문', 200),
  shelf_wall: W('벽 선반', 140),
  neon_heart: W('네온 하트', 220, { lv: 2 }),
  neon_party: W('네온 PARTY', 260, { lv: 3 }),

  // ----- 벽지 · 바닥 -----
  w_cream: { name: '크림 벽지', price: 0, cat: 'paper', lv: 1, col: ['#F1E2CF', '#F7ECDF', '#E7D3BA'] },
  w_mint: { name: '민트 벽지', price: 200, cat: 'paper', lv: 1, col: ['#D7EEE6', '#E5F5EF', '#BFDDD2'] },
  w_pink: { name: '핑크 벽지', price: 200, cat: 'paper', lv: 1, col: ['#F8DDE1', '#FCE9EC', '#EDC3CA'] },
  w_sky: { name: '하늘 벽지', price: 220, cat: 'paper', lv: 1, col: ['#DCE8F7', '#E9F1FB', '#C3D5EE'] },
  w_stripe: { name: '줄무늬 벽지', price: 250, cat: 'paper', lv: 2, col: ['#F3EBDD', '#F8F2E8', '#E0D2BC'], pat: 'stripe' },
  w_wood: { name: '나무 패널', price: 300, cat: 'paper', lv: 2, col: ['#C9A27B', '#D6B38E', '#A98460'], pat: 'wood' },
  w_brick: { name: '벽돌 벽', price: 350, cat: 'paper', lv: 2, col: ['#C8735A', '#D3826A', '#A85E48'], pat: 'brick' },
  w_navy: { name: '네이비 벽지', price: 300, cat: 'paper', lv: 3, col: ['#2E3A5C', '#35436A', '#232D49'] },
  w_stars: { name: '별빛 벽지', price: 400, cat: 'paper', lv: 3, col: ['#2A2450', '#322B5E', '#1F1A3D'], pat: 'stars' },
  f_oak: { name: '오크 마루', price: 0, cat: 'floor', lv: 1, col: ['#E9C99F', '#E3C193', '#EDD0AA', '#E6C599'], pat: 'plank' },
  f_walnut: { name: '월넛 마루', price: 250, cat: 'floor', lv: 1, col: ['#9C6B48', '#A57452', '#93623F', '#A06E4B'], pat: 'plank' },
  f_white: { name: '화이트 마루', price: 250, cat: 'floor', lv: 1, col: ['#F2EEE8', '#EDE8E1', '#F6F3EE', '#EAE4DC'], pat: 'plank' },
  f_check: { name: '체크 타일', price: 300, cat: 'floor', lv: 2, col: ['#F4F1EC', '#2F3040'], pat: 'check' },
  f_mint: { name: '민트 타일', price: 300, cat: 'floor', lv: 2, col: ['#CFEDE3', '#BCE3D6'], pat: 'tile' },
  f_carpet: { name: '블루 카펫', price: 280, cat: 'floor', lv: 2, col: ['#6E86C9', '#7B92D2'], pat: 'carpet' },
  f_marble: { name: '대리석', price: 400, cat: 'floor', lv: 3, col: ['#F1EFEC', '#E6E2DD'], pat: 'marble' },

  // ----- 펫 먹이 (n: 한 번에 들어오는 개수) -----
  food: { name: '펫 사료 5개', price: 40, cat: 'food', lv: 1, n: 5, full: 35, joy: 5, xp: 10 },
  snack_bone: { name: '뼈다귀 간식 3개', price: 45, cat: 'food', lv: 1, n: 3, full: 10, joy: 20, xp: 14 },
  snack_fish: { name: '생선 간식 3개', price: 45, cat: 'food', lv: 1, n: 3, full: 12, joy: 18, xp: 14 },
  pet_cake: { name: '펫 케이크', price: 80, cat: 'food', lv: 2, n: 1, full: 20, joy: 40, xp: 30 },

  // ----- 펫 꾸미기 -----
  p_ribbon: { name: '리본', price: 120, cat: 'pacc', lv: 1, slot: 'head' },
  p_party_hat: { name: '파티 고깔', price: 150, cat: 'pacc', lv: 1, slot: 'head' },
  p_flower: { name: '꽃 머리핀', price: 130, cat: 'pacc', lv: 1, slot: 'head' },
  p_santa: { name: '산타 모자', price: 220, cat: 'pacc', lv: 2, slot: 'head' },
  p_crown: { name: '왕관', price: 400, cat: 'pacc', lv: 3, slot: 'head' },
  p_bowtie: { name: '나비넥타이', price: 140, cat: 'pacc', lv: 1, slot: 'neck' },
  p_scarf: { name: '목도리', price: 160, cat: 'pacc', lv: 1, slot: 'neck' },
  p_glasses: { name: '동그란 안경', price: 180, cat: 'pacc', lv: 2, slot: 'face' },
};

export const PLACEABLE = (id) => ['furn', 'deco', 'wall'].includes(ITEMS[id]?.cat);

/** 놓인 모양 (돌리면 가로·세로가 바뀜) */
export function footprint(id, r) {
  const it = ITEMS[id];
  if (!it) return null;
  return r ? { w: it.h || 1, h: it.w || 1 } : { w: it.w || 1, h: it.h || 1 };
}

// ----- 펫 -----
export const PETS = {
  dog: { name: '강아지', colors: [['#E9B47C', '#C98B52'], ['#F4F1EC', '#DCD5CC'], ['#4A3B34', '#2E2420'], ['#D9C3A0', '#B89E77']] },
  cat: { name: '고양이', colors: [['#F2A85B', '#D9853A'], ['#3B3B44', '#25252C'], ['#F3EFEA', '#D9D2C9'], ['#A7A3A0', '#827E7B']] },
  rabbit: { name: '토끼', colors: [['#F7F4F0', '#E2DAD1'], ['#C9A98A', '#A9876A'], ['#8E8A88', '#6F6B69']] },
  hamster: { name: '햄스터', colors: [['#F0C08A', '#D79C5E'], ['#F5EEE6', '#DDD2C5'], ['#B9A190', '#957C6B']] },
  penguin: { name: '펭귄', colors: [['#2B2F3A', '#1C1F27'], ['#3A4A6B', '#28344D']] },
  fox: { name: '여우', colors: [['#E8763A', '#C95A22'], ['#F1EDE6', '#D7CFC4']] },
};
export const MAX_PETS = 3;
export const PET_SLOTS = ['head', 'neck', 'face'];

/** 실시간 방에 보이는 펫 정보 검사 (모르는 값은 버림) */
export function cleanPet(x) {
  if (!x || typeof x !== 'object' || !PETS[x.kind]) return null;
  const sp = PETS[x.kind];
  const color = Math.max(0, Math.min(sp.colors.length - 1, Math.floor(Number(x.color) || 0)));
  const name = cleanNick(Array.from(String(x.name || '')).slice(0, 8).join(''), sp.name);
  const lv = Math.max(1, Math.min(30, Math.floor(Number(x.lv) || 1)));
  const acc = {};
  for (const slot of PET_SLOTS) { const id = x.acc?.[slot]; if (ITEMS[id]?.cat === 'pacc' && ITEMS[id].slot === slot) acc[slot] = id; }
  return { kind: x.kind, color, name, lv, acc };
}
export const ADOPT_PRICE = 600;          // 두 번째 펫부터
export const PET_NAME_MAX = 8;
export const petNeed = (lv) => 60 * lv;  // 다음 레벨까지 필요한 친밀도

// ----- 처음 시작할 때 주는 것 -----
export const START_COINS = 300;
export const START_INV = { arcade: 1, bed_single: 1, armchair: 1, table_round: 1, lamp: 1, rug_round: 1, plant_small: 1, pet_bed: 1, frame_photo: 1, w_cream: 1, f_oak: 1, food: 5, balloons: 2, gift_box: 1 };
// 처음 집 배치 (10 × 9 방)
export const START_HOME = {
  wall: 'w_cream', floor: 'f_oak',
  items: [
    { i: 'rug_round', x: 4, y: 3, r: 0 },
    { i: 'bed_single', x: 1, y: 1, r: 0 },
    { i: 'lamp', x: 3, y: 1, r: 0 },
    { i: 'armchair', x: 7, y: 2, r: 0 },
    { i: 'table_round', x: 6, y: 3, r: 0 },
    { i: 'arcade', x: 1, y: 5, r: 0 },
    { i: 'plant_small', x: 9, y: 1, r: 0 },
    { i: 'pet_bed', x: 2, y: 7, r: 0 },
    { i: 'frame_photo', x: 5, y: 0, r: 0 },
  ],
};

/** 상점 목록 순서 */
export function shopList(cat) {
  return Object.entries(ITEMS).filter(([, it]) => (!cat || it.cat === cat) && it.price > 0).map(([id, it]) => ({ id, ...it }));
}
