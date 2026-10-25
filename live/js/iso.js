// 아이소메트릭 좌표 계산과 길찾기
import { walkable } from '../shared/maps.js';

export const TW = 64;
export const TH = 32;
export const HW = TW / 2;
export const HH = TH / 2;
export const WALL_H = 120;

// 바닥 좌표(타일) → 그림 좌표(px). z는 높이(px)
export function iso(x, y, z = 0) { return [(x - y) * HW, (x + y) * HH - z]; }
// 그림 좌표 → 바닥 좌표
export function unIso(sx, sy) { const a = sx / HW; const b = sy / HH; return [(a + b) / 2, (b - a) / 2]; }

// 화면 방향 벡터 → 바닥 방향 벡터 (조이스틱·키보드용)
export function screenDirToWorld(dx, dy) {
  const [x, y] = unIso(dx * HW, dy * HH);
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

// 이동 방향 → 아바타가 바라보는 방향 (0: 오른쪽 아래, 1: 왼쪽 아래, 2: 왼쪽 위, 3: 오른쪽 위)
export function facing(dx, dy, prev = 1) {
  const sx = dx - dy; const sy = dx + dy;
  if (Math.abs(sx) < 1e-4 && Math.abs(sy) < 1e-4) return prev;
  if (sy >= -Math.abs(sx) * 0.15) return sx >= 0 ? 0 : 1;
  return sx >= 0 ? 3 : 2;
}

// 둘레가 막혀 있지 않은지(아바타 반경 r) 확인
export function freeAt(map, x, y, r = 0.22) {
  return walkable(map, Math.floor(x - r), Math.floor(y - r)) && walkable(map, Math.floor(x + r), Math.floor(y - r))
    && walkable(map, Math.floor(x - r), Math.floor(y + r)) && walkable(map, Math.floor(x + r), Math.floor(y + r));
}

export function lineFree(map, a, b) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(d / 0.15));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!freeAt(map, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.2)) return false;
  }
  return true;
}

// 막힌 칸을 눌렀을 때 가장 가까운 빈 칸
export function nearestFree(map, x, y) {
  let best = null; let bd = Infinity;
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    if (!walkable(map, tx, ty)) continue;
    const d = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
    if (d < bd) { bd = d; best = [tx + 0.5, ty + 0.5]; }
  }
  return best;
}

// A* 길찾기 (8방향, 모서리 끼어들기 금지) → 부드럽게 다듬은 경로 [[x,y], ...]
export function findPath(map, from, to) {
  if (!to) return [];
  let goal = to;
  if (!freeAt(map, goal[0], goal[1], 0.05)) goal = nearestFree(map, goal[0], goal[1]);
  if (!goal) return [];
  if (lineFree(map, from, goal)) return [goal];
  const W = map.w; const H = map.h;
  const sx = Math.floor(from[0]); const sy = Math.floor(from[1]);
  const gx = Math.floor(goal[0]); const gy = Math.floor(goal[1]);
  const idx = (x, y) => y * W + x;
  const g = new Float32Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const open = [[0, sx, sy]];
  g[idx(sx, sy)] = 0;
  const hfun = (x, y) => { const dx = Math.abs(x - gx); const dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = false;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, x, y] = open.splice(bi, 1)[0];
    const ci = idx(x, y);
    if (closed[ci]) continue;
    closed[ci] = 1;
    if (x === gx && y === gy) { found = true; break; }
    for (const [dx, dy] of dirs) {
      const nx = x + dx; const ny = y + dy;
      if (!walkable(map, nx, ny)) continue;
      if (dx && dy && (!walkable(map, x + dx, y) || !walkable(map, x, y + dy))) continue;
      const ni = idx(nx, ny);
      if (closed[ni]) continue;
      const ng = g[ci] + (dx && dy ? 1.414 : 1);
      if (ng < g[ni]) { g[ni] = ng; came[ni] = ci; open.push([ng + hfun(nx, ny), nx, ny]); }
    }
  }
  if (!found) return [goal];
  const tiles = [];
  for (let c = idx(gx, gy); c !== -1 && c !== idx(sx, sy); c = came[c]) tiles.push([(c % W) + 0.5, Math.floor(c / W) + 0.5]);
  tiles.reverse();
  tiles[tiles.length - 1] = goal;
  // 줄 당기기: 바로 갈 수 있는 지점은 건너뜀
  const out = [];
  let cur = from;
  let i = 0;
  while (i < tiles.length) {
    let j = tiles.length - 1;
    while (j > i && !lineFree(map, cur, tiles[j])) j--;
    out.push(tiles[j]);
    cur = tiles[j];
    i = j + 1;
  }
  return out;
}

// 그리는 순서 정하기: 뒤에 있는 것부터 (아이소메트릭 상자 기준)
export function isoSort(items) {
  const n = items.length;
  const behind = Array.from({ length: n }, () => []);
  const eps = 1e-3;
  for (let i = 0; i < n; i++) {
    const a = items[i];
    for (let j = i + 1; j < n; j++) {
      const b = items[j];
      const aBehindB = a.x1 <= b.x0 + eps || a.y1 <= b.y0 + eps;
      const bBehindA = b.x1 <= a.x0 + eps || b.y1 <= a.y0 + eps;
      if (aBehindB && !bBehindA) behind[j].push(i);
      else if (bBehindA && !aBehindB) behind[i].push(j);
      else if (!aBehindB && !bBehindA) {
        // 겹치는 경우: 중심 깊이로 비교
        const da = (a.x0 + a.x1 + a.y0 + a.y1) / 2; const db = (b.x0 + b.x1 + b.y0 + b.y1) / 2;
        if (da <= db) behind[j].push(i); else behind[i].push(j);
      }
    }
  }
  const out = [];
  const state = new Uint8Array(n);
  const order = [...items.keys()].sort((p, q) => (items[p].x0 + items[p].y0) - (items[q].x0 + items[q].y0));
  const visit = (i) => {
    if (state[i]) return;
    state[i] = 1;
    for (const k of behind[i]) visit(k);
    out.push(items[i]);
  };
  for (const i of order) visit(i);
  return out;
}
