// 공간 지도. 좌표는 타일 단위이고, 타일 (x, y)는 [x, x+1) × [y, y+1) 영역입니다.
import { ITEMS, footprint } from './catalog.js';
import { josa } from './josa.js';
// 화면에서 x는 오른쪽 아래, y는 왼쪽 아래 방향입니다. 벽은 x=0(왼쪽 뒤)과 y=0(오른쪽 뒤)에 있습니다.

export const THEMES = {
  home: { name: '아늑한 홈파티', short: '홈파티' },
  rooftop: { name: '루프탑 야경', short: '루프탑' },
  game: { name: '게임파티룸', short: '게임파티룸' },
  square: { name: '쏘플 스퀘어', short: '스퀘어' },
};
// 방 종류: party 파티룸 · home 내 집(집들이) · square 쏘플 스퀘어
export const KINDS = ['party', 'home', 'square'];

export const LIGHTS = {
  warm: { name: '따뜻한 조명', color: '#FFB75E' },
  pink: { name: '핑크 무드', color: '#FF6FA8' },
  blue: { name: '블루 나이트', color: '#5B8CFF' },
  party: { name: '파티 컬러', color: '#B45CFF' },
};

const rect = (x0, y0, x1, y1) => { const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]); return out; };

export const PARTY_MAP = {
  id: 'party', w: 14, h: 12,
  spawn: [[12, 10], [11, 10], [12, 11], [11, 11], [13, 10], [10, 11], [13, 11], [10, 10], [9, 11], [9, 10], [8, 11], [11, 9]],
  oxO: [2, 1, 4, 3], oxX: [5, 1, 7, 3],
  stage: [2, 1, 7, 3],
  // 소파 자리: [x, y, 바라보는 방향(0: 오른쪽 아래, 1: 왼쪽 아래)]
  seats: [[5.5, 5.55, 1], [6.5, 5.55, 1], [7.5, 5.55, 1], [8.45, 5.55, 1], [5.55, 6.5, 0], [5.55, 7.45, 0]],
  props: [
    { id: 'dj', kind: 'dj', label: 'DJ 부스', x: 0, y: 1, w: 2, h: 2, blocks: rect(0, 1, 1, 2), area: [0, 0, 1, 0], locked: '2단계에 열려요' },
    { id: 'stage', kind: 'stage', label: '무대', x: 2, y: 1, w: 6, h: 3, blocks: [], area: [2, 1, 7, 3], actions: ['ox'] },
    { id: 'photo', kind: 'photo', label: '포토존', x: 9, y: 0, w: 4, h: 1, blocks: [], area: [8, 0, 13, 3], actions: ['photo'] },
    { id: 'screen', kind: 'screen', label: '빔 스크린', x: 0, y: 3, w: 1, h: 2, blocks: [], area: [0, 3, 2, 4], locked: '같이 보기는 2단계에 열려요' },
    { id: 'tv', kind: 'tv', label: 'TV', x: 0, y: 6, w: 1, h: 3, blocks: rect(0, 6, 0, 8), area: [1, 5, 3, 8], actions: ['games'] },
    { id: 'karaoke', kind: 'karaoke', label: '노래방 부스', x: 0, y: 9, w: 3, h: 3, blocks: rect(0, 9, 2, 11), area: [3, 9, 3, 11], locked: '노래방은 제휴 후 열려요' },
    { id: 'sofa', kind: 'sofa', label: '라운지 소파', x: 5, y: 5, w: 4, h: 3, blocks: [[5, 5], [6, 5], [7, 5], [8, 5], [5, 6], [5, 7], [7, 7]], area: [4, 4, 8, 7], actions: ['sit', 'truth'] },
    { id: 'bar', kind: 'bar', label: '바 테이블', x: 10, y: 5, w: 2, h: 2, blocks: rect(10, 5, 11, 6), area: [9, 4, 11, 8], actions: ['cheers', 'roulette'] },
    { id: 'cake', kind: 'cake', label: '케이크 테이블', x: 6, y: 9, w: 2, h: 2, blocks: rect(6, 9, 7, 10), area: [5, 8, 8, 11], actions: ['cake'] },
    { id: 'guestbook', kind: 'guestbook', label: '방명록', x: 13, y: 8, w: 1, h: 1, blocks: [[13, 8]], area: [12, 7, 13, 9], locked: '방명록은 2단계에 열려요' },
    { id: 'plant1', kind: 'plant', x: 13, y: 0, w: 1, h: 1, blocks: [[13, 0]] },
    { id: 'plant2', kind: 'plant', x: 4, y: 11, w: 1, h: 1, blocks: [[4, 11]] },
  ],
};

export const SQUARE_MAP = {
  id: 'square', w: 16, h: 12,
  spawn: [[12, 10], [11, 10], [13, 10], [12, 11], [11, 11], [10, 10], [13, 11], [10, 11], [14, 10], [9, 10], [14, 11], [9, 11]],
  seats: [],
  props: [
    { id: 'notice', kind: 'notice', label: '공지 게시판', x: 3, y: 0, w: 4, h: 1, blocks: [], area: [2, 0, 7, 2], actions: ['notice'] },
    { id: 'board', kind: 'board', label: '공개 파티 게시판', x: 0, y: 3, w: 1, h: 4, blocks: [], area: [0, 2, 2, 7], actions: ['public'] },
    { id: 'portal1', kind: 'portal', label: '파티룸 만들기', x: 9, y: 3, w: 3, h: 1, blocks: [[9, 3], [11, 3]], area: [8, 2, 12, 5], actions: ['create'] },
    { id: 'portal2', kind: 'portal', label: '코드로 입장', x: 13, y: 6, w: 1, h: 3, blocks: [[13, 6], [13, 8]], area: [12, 5, 15, 9], actions: ['join'] },
    { id: 'fountain', kind: 'fountain', x: 5, y: 5, w: 2, h: 2, blocks: rect(5, 5, 6, 6) },
    { id: 'bench1', kind: 'bench', x: 2, y: 9, w: 2, h: 1, blocks: [[2, 9], [3, 9]] },
    { id: 'bench2', kind: 'bench', x: 8, y: 8, w: 1, h: 2, blocks: [[8, 8], [8, 9]] },
    { id: 'tree1', kind: 'tree', x: 15, y: 0, w: 1, h: 1, blocks: [[15, 0]] },
    { id: 'tree2', kind: 'tree', x: 0, y: 10, w: 1, h: 1, blocks: [[0, 10]] },
    { id: 'tree3', kind: 'tree', x: 15, y: 4, w: 1, h: 1, blocks: [[15, 4]] },
  ],
};

// 내 집: 처음엔 비어 있고, 가진 가구를 놓아 꾸며요. 현관 4칸(7~8, 6~7)은 늘 비워 둬요.
export const HOME_MAP = {
  id: 'home', w: 10, h: 9,
  spawn: [[7, 7], [8, 7], [7, 6], [8, 6], [6, 7], [6, 8], [7, 8], [8, 8], [9, 7], [9, 6], [6, 6], [5, 7]],
  entry: [[7, 6], [8, 6], [7, 7], [8, 7]],
  seats: [],
  props: [],
};

export const MAPS = { party: PARTY_MAP, square: SQUARE_MAP, home: HOME_MAP };

export function mapFor(kind) { return kind === 'square' ? SQUARE_MAP : kind === 'home' ? HOME_MAP : PARTY_MAP; }

const kindOf = (meta) => (meta?.kind === 'square' ? 'square' : meta?.kind === 'home' ? 'home' : 'party');
const itemsOf = (meta) => (kindOf(meta) === 'home' ? meta?.home?.items : meta?.deco) || [];
const built = new Map();

/** 방 정보(꾸민 소품 포함)에 맞는 지도. 같은 배치면 같은 지도를 돌려줘요. */
export function buildMap(meta = {}) {
  const kind = kindOf(meta);
  if (kind === 'square') return SQUARE_MAP;
  const items = itemsOf(meta);
  if (!items.length) return mapFor(kind);
  const key = kind + '|' + items.map((it) => `${it.i}:${it.x}:${it.y}:${it.r ? 1 : 0}`).join(',');
  const hit = built.get(key);
  if (hit) return hit;
  const base = mapFor(kind);
  const props = base.props.slice();
  const seats = (base.seats || []).slice();
  items.forEach((it, n) => {
    const def = ITEMS[it.i];
    const fp = footprint(it.i, it.r);
    if (!def || !fp) return;
    const p = { id: 'it' + n, kind: 'item', item: it.i, x: it.x, y: it.y, w: fp.w, h: fp.h, r: it.r ? 1 : 0, place: def.place, label: def.name, blocks: [] };
    if (def.block && def.place === 'floor') for (let y = it.y; y < it.y + fp.h; y++) for (let x = it.x; x < it.x + fp.w; x++) p.blocks.push([x, y]);
    if (def.act) {
      p.area = [Math.max(0, it.x - 1), Math.max(0, it.y - 1), Math.min(base.w - 1, it.x + fp.w), Math.min(base.h - 1, it.y + fp.h)];
      p.actions = [def.act];
    }
    if (def.seat) {
      // 앞을 보는 방향: 돌리지 않으면 왼쪽 아래(1), 돌리면 오른쪽 아래(0)
      for (let k = 0; k < def.seat; k++) {
        if (it.r) seats.push([it.x + 0.42, it.y + 0.5 + k, 0, p.id]);
        else seats.push([it.x + 0.5 + k, it.y + 0.42, 1, p.id]);
      }
    }
    props.push(p);
  });
  const map = { ...base, props, seats, key };
  if (built.size > 60) built.delete(built.keys().next().value);
  built.set(key, map);
  return map;
}

// ---------- 꾸미기 배치 검사 (서버와 화면이 같은 규칙) ----------
export const LAYOUT_MAX = { home: 48, party: 24 };

/** 놓으면 안 되는 칸 — hard: 세우는 소품 금지(고정 소품·무대·앉는 자리·시작 자리·현관), soft: 러그 금지(고정 소품·무대) */
function reserved(kind) {
  const base = mapFor(kind);
  const hard = new Set(); const soft = new Set();
  const add = (set, x, y) => set.add(Math.floor(x) + ',' + Math.floor(y));
  for (const p of base.props) for (const [x, y] of p.blocks || []) { add(hard, x, y); add(soft, x, y); }
  if (base.stage) for (let y = base.stage[1]; y <= base.stage[3]; y++) for (let x = base.stage[0]; x <= base.stage[2]; x++) { add(hard, x, y); add(soft, x, y); }
  for (const [x, y] of base.seats || []) add(hard, x, y);
  for (const [x, y] of base.spawn || []) add(hard, x, y);
  for (const [x, y] of base.entry || []) add(hard, x, y);
  return { hard, soft };
}
const RESERVED = { home: reserved('home'), party: reserved('party') };

/** 배치를 검사해서 깨끗한 목록을 돌려줘요. 잘못되면 { error } */
export function checkLayout(kind, items, inv = null) {
  if (kind !== 'home' && kind !== 'party') return { error: '꾸밀 수 없는 곳이에요.' };
  const base = mapFor(kind);
  if (!Array.isArray(items)) return { error: '배치 정보가 올바르지 않아요.' };
  if (items.length > LAYOUT_MAX[kind]) return { error: `소품은 ${LAYOUT_MAX[kind]}개까지 놓을 수 있어요.` };
  const out = [];
  const solid = new Set();   // 지나갈 수 없는 칸
  const ground = new Set();  // 바닥에 세운 소품이 있는 칸 (겹치기 금지)
  const flat = new Set();    // 러그
  const walls = new Set();   // 벽 장식
  const hang = new Set();
  const used = {};
  const res = RESERVED[kind];
  for (const raw of items) {
    const id = String(raw?.i || '');
    const def = ITEMS[id];
    if (!def || !['furn', 'deco', 'wall'].includes(def.cat)) return { error: '모르는 소품이 있어요.' };
    if (!def.where.includes(kind)) return { error: `${josa(def.name, '은', '는')} ${kind === 'home' ? '집' : '파티룸'}에 놓을 수 없어요.` };
    const x = Number(raw.x); const y = Number(raw.y); const r = raw.r ? 1 : 0;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { error: '자리가 올바르지 않아요.' };
    const fp = footprint(id, r);
    if (x < 0 || y < 0 || x + fp.w > base.w || y + fp.h > base.h) return { error: `${josa(def.name, '이', '가')} 방 밖으로 나갔어요.` };
    used[id] = (used[id] || 0) + 1;
    if (inv && used[id] > (inv[id] || 0)) return { error: `${josa(def.name, '이', '가')} 모자라요. 상점에서 더 살 수 있어요.` };
    const cells = [];
    for (let yy = y; yy < y + fp.h; yy++) for (let xx = x; xx < x + fp.w; xx++) cells.push(xx + ',' + yy);
    if (def.place === 'wall') {
      if (x !== 0 && y !== 0) return { error: `${josa(def.name, '은', '는')} 벽에 붙은 칸에만 걸 수 있어요.` };
      const k = (y === 0 ? 'R' : 'L') + (y === 0 ? x : y);
      if (walls.has(k)) return { error: '벽 장식이 겹쳤어요.' };
      walls.add(k);
    } else if (def.place === 'hang') {
      const k = cells[0];
      if (hang.has(k)) return { error: '천장 장식이 겹쳤어요.' };
      hang.add(k);
    } else if (def.place === 'flat') {
      for (const c of cells) { if (flat.has(c)) return { error: '러그가 겹쳤어요.' }; if (res.soft.has(c)) return { error: `${josa(def.name, '은', '는')} 무대나 붙박이 소품 자리에는 깔 수 없어요.` }; }
      for (const c of cells) flat.add(c);
    } else {
      for (const c of cells) {
        if (res.hard.has(c)) return { error: kind === 'home' ? '현관 자리는 비워 두세요.' : `${josa(def.name, '은', '는')} 무대·소파 자리·입구에는 놓을 수 없어요.` };
        if (ground.has(c)) return { error: '소품끼리 겹쳤어요. 다른 칸에 놓아 주세요.' };
      }
      for (const c of cells) { ground.add(c); if (def.block) solid.add(c); }
    }
    out.push({ i: id, x, y, r });
  }
  // 막힌 칸 때문에 못 가는 곳이 생기면 안 돼요 (시작 자리에서 모두 걸어갈 수 있어야 함)
  if (solid.size) {
    const blocked = new Set([...blockedSet(base), ...solid]);
    const free = [];
    for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) if (!blocked.has(x + ',' + y)) free.push(x + ',' + y);
    const [sx, sy] = base.spawn[0];
    const seen = new Set([sx + ',' + sy]);
    const q = [[sx, sy]];
    while (q.length) {
      const [cx, cy] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx; const ny = cy + dy; const k = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= base.w || ny >= base.h || seen.has(k) || blocked.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    if (seen.size < free.length) return { error: '가구가 길을 막아서 갈 수 없는 곳이 생겼어요. 조금 띄워 놓아 주세요.' };
  }
  return { items: out };
}

export function inArea(area, x, y) {
  if (!area) return false;
  return x >= area[0] && x < area[2] + 1 && y >= area[1] && y < area[3] + 1;
}

const blockCache = new WeakMap();
export function blockedSet(map) {
  let s = blockCache.get(map);
  if (!s) { s = new Set(); for (const p of map.props) for (const [x, y] of p.blocks || []) s.add(x + ',' + y); blockCache.set(map, s); }
  return s;
}

export function walkable(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
  return !blockedSet(map).has(tx + ',' + ty);
}

// 서 있을 수 있는 실수 좌표로 보정 (지도 밖이나 막힌 칸이면 가장 가까운 빈 칸 중심으로)
export function clampPos(map, x, y) {
  let cx = Math.min(Math.max(Number(x) || 0, 0.05), map.w - 0.05);
  let cy = Math.min(Math.max(Number(y) || 0, 0.05), map.h - 0.05);
  // 의자에 앉은 위치는 막힌 칸 안이어도 허용
  for (const [sx, sy] of map.seats || []) if (Math.abs(cx - sx) < 0.2 && Math.abs(cy - sy) < 0.2) return [cx, cy];
  if (walkable(map, Math.floor(cx), Math.floor(cy))) return [cx, cy];
  let best = null, bd = Infinity;
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    if (!walkable(map, tx, ty)) continue;
    const d = (tx + 0.5 - cx) ** 2 + (ty + 0.5 - cy) ** 2;
    if (d < bd) { bd = d; best = [tx + 0.5, ty + 0.5]; }
  }
  return best || [map.spawn[0][0] + 0.5, map.spawn[0][1] + 0.5];
}

export function propAt(map, x, y) {
  for (const p of map.props) if (p.area && inArea(p.area, x, y)) return p;
  return null;
}

export function oxSide(map, x, y) {
  if (inArea(map.oxO, x, y)) return 'O';
  if (inArea(map.oxX, x, y)) return 'X';
  return '-';
}
