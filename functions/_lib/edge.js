// Cloudflare 가장자리(데이터센터) 캐시
// 같은 데이터센터로 들어오는 손님끼리 "누구에게나 똑같은 결과"(공개 화면 · 공개 데이터 · 사진)를 나눠 써서
// 매번 DB까지 오가지 않게 해요. 한국 손님은 대부분 같은 데이터센터(홍콩 등)로 들어와서 효과가 커요.
//
// 지키는 것
//  · 로그인 정보·관리자 화면·예약 장부처럼 사람마다 다른 결과는 절대 넣지 않아요 (호출하는 쪽에서 공개 응답만 넘겨요).
//  · 설정값·지점 원본 데이터(비공개 칸 포함)도 넣지 않아요.
//  · 지점·설정을 고치면 「내용 버전」을 올려서, 그 뒤 요청은 새 화면을 받아요 (같은 데이터센터 기준 바로).
//  · 캐시가 안 되는 환경(로컬 시험 · pages.dev 일부)에서는 조용히 원래대로 동작해요.

const PREFIX = '/__edge/';
let origin = 'https://ssople.com';
let deploy = '';

/** 요청마다 처음에 한 번 — 캐시 키에 쓸 주소와 배포 구분값 */
export function setEdge(url, env) {
  try { origin = new URL(url).origin; } catch { /* 그대로 */ }
  try { deploy = String((env && env.CF_PAGES_COMMIT_SHA) || '').slice(0, 12); } catch { deploy = ''; }
}

function store() {
  try { return typeof caches !== 'undefined' && caches.default ? caches.default : null; } catch { return null; }
}
// 이름 전체를 경로 한 칸으로 — '#'(버전 구분)이나 '?'가 주소의 꼬리표·쿼리로 잘려 나가지 않게
const keyOf = (name) => new Request(origin + PREFIX + encodeURIComponent(name));

// 응답을 돌려준 뒤에도 마저 끝내야 하는 저장 작업 — 라우터·화면이 waitUntil 로 넘겨요
const pending = new Set();
function track(p) {
  const q = Promise.resolve(p).catch(() => {}).finally(() => pending.delete(q));
  pending.add(q);
  return q;
}
export function edgePending() { return Promise.all([...pending]); }

export async function edgeGetJSON(name) {
  const c = store();
  if (!c) return null;
  try { const r = await c.match(keyOf(name)); return r ? await r.json() : null; } catch { return null; }
}
export function edgePutJSON(name, value, ttl) {
  const c = store();
  if (!c) return Promise.resolve();
  try {
    return track(c.put(keyOf(name), new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${Math.max(1, ttl | 0)}` },
    })));
  } catch { return Promise.resolve(); }
}

/* ---------- 버전 — 바뀌면 그 뒤 요청은 새 결과를 받아요 ----------
 *  cv: 지점·설정 (공개 화면 · 공개 데이터)   av: 예약 마감 칸(occ) */
const vers = new Map();
async function versionOf(name) {
  const m = vers.get(name);
  if (m && Date.now() - m.at < 5000) return m.v;
  const e = await edgeGetJSON(name);
  let v;
  if (e && e.v) v = String(e.v);
  else { v = String(Date.now()); edgePutJSON(name, { v }, 7 * 86400); }
  vers.set(name, { v, at: Date.now() });
  return v;
}
function bump(name) {
  const v = String(Date.now()) + Math.random().toString(36).slice(2, 6);
  vers.set(name, { v, at: Date.now() });
  return edgePutJSON(name, { v }, 7 * 86400);
}
export const contentVersion = () => versionOf('cv');
export const bumpContent = () => bump('cv');
export const availVersion = () => versionOf('av');
export const bumpAvail = () => bump('av');

/* ---------- 공개 응답 저장·꺼내기 ---------- */
/**
 * 공개 응답(화면 HTML · 공개 API)을 가장자리에 두고 나눠 써요.
 *  - ttl 초 안: 저장본을 바로 (HIT)
 *  - swr 초 안: 저장본을 바로 주고, 뒤에서 새로 만들어 바꿔 둬요 (STALE)
 *  - 그 밖: 새로 만들어 주고 저장 (MISS)
 * build()는 매번 새 Response를 만들어야 해요. 200 이 아니거나 쿠키를 심는 응답은 저장하지 않아요.
 */
export async function edgeServe(context, name, build, { ttl = 60, swr = 0, browser = null } = {}) {
  const c = store();
  const method = context.request.method;
  if (!c || method !== 'GET') return build();
  // 응답 키는 이 요청의 주소(호스트)로 — 같은 서버가 여러 주소(ssople.com · pages.dev)를 동시에 받아도 섞이지 않게
  const u = new URL(context.request.url);
  const key = new Request(u.origin + PREFIX + encodeURIComponent(u.host + '|' + name + (deploy ? '~' + deploy : '')));
  let hit = null;
  try { hit = await c.match(key); } catch { hit = null; }
  if (hit) {
    const age = (Date.now() - (Number(hit.headers.get('x-sp-at')) || 0)) / 1000;
    if (age < ttl) return finish(hit, 'HIT', browser);
    if (age < Math.max(ttl, swr)) {
      const p = fill(c, key, build, ttl, swr);
      try { context.waitUntil(p); } catch { /* 무시 */ }
      return finish(hit, 'STALE', browser);
    }
  }
  const res = await build();
  if (res.status !== 200 || res.headers.has('set-cookie')) return res;
  const body = await res.arrayBuffer();
  const h = new Headers(res.headers);
  try { context.waitUntil(put(c, key, body, h, ttl, swr)); } catch { /* 무시 */ }
  const out = new Headers(res.headers);
  out.set('x-sp-cache', 'MISS');
  if (browser) out.set('cache-control', browser);
  return new Response(body, { status: 200, headers: out });
}

async function fill(c, key, build, ttl, swr) {
  try {
    const res = await build();
    if (res.status !== 200 || res.headers.has('set-cookie')) return;
    await put(c, key, await res.arrayBuffer(), new Headers(res.headers), ttl, swr);
  } catch { /* 다음 요청에서 다시 */ }
}
function put(c, key, body, h, ttl, swr) {
  h.set('x-sp-cc', h.get('cache-control') || '');
  h.set('x-sp-at', String(Date.now()));
  h.set('cache-control', `public, max-age=${Math.max(ttl, swr)}`);
  h.delete('x-sp-cache');
  return track(c.put(key, new Response(body, { status: 200, headers: h })));
}
function finish(hit, tag, browser) {
  const h = new Headers(hit.headers);
  // 브라우저에는 원래 정한 캐시 규칙을 그대로 (가장자리 보관 기간이 브라우저로 새지 않게)
  h.set('cache-control', browser || h.get('x-sp-cc') || 'no-store');
  h.delete('x-sp-cc');
  h.delete('x-sp-at');
  h.set('x-sp-cache', tag);
  return new Response(hit.body, { status: 200, headers: h });
}

/** 캐시 키에 넣을 쿼리 — 추적용 꼬리표(utm·fbclid 등)는 빼고 정렬 */
export function normQuery(url) {
  const out = [];
  for (const [k, v] of new URL(url).searchParams) {
    if (/^(utm_|fbclid|gclid|n_media|n_query|n_rank|n_ad|n_keyword|_ga|ref$|from$)/i.test(k)) continue;
    out.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  }
  return out.sort().join('&');
}

/** 화면 틀(정적 HTML)의 ETag — 배포로 틀이 바뀌면 캐시 키도 바뀌어요 */
export async function assetTag(env, origin, path) {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL(path, origin), { headers: { accept: 'text/html' } }));
    const t = r.headers.get('etag') || '';
    try { if (r.body) await r.body.cancel(); } catch { /* 무시 */ }
    return t.replace(/[^\w-]/g, '').slice(0, 40);
  } catch { return ''; }
}
