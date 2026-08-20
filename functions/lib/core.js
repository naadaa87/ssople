/* ============================================================
   공통 — 응답 규약 · 세션 · 비밀번호 · 설정
   비밀번호 해시는 호스트 홈페이지와 같은 방식(해시 + 솔트 분리 저장)을
   씁니다. 같은 D1을 쓰기 때문에 방식이 다르면 나중에 계정을 합칠 수 없습니다.
   ============================================================ */

export const ok = (data, init = {}) =>
  new Response(JSON.stringify({ ok: true, ...data }), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });

export const err = (message, status = 400, extra = {}) =>
  new Response(JSON.stringify({ ok: false, message, ...extra }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

/* ---------- 비밀번호 (PBKDF2, 호스트와 동일 규격) ---------- */
const enc = new TextEncoder();

export function randomSalt() {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password, storedHash, saltHex) {
  if (!storedHash || !saltHex) return false;
  const again = await hashPassword(password, saltHex);
  if (again.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < again.length; i++) diff |= again.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return diff === 0;
}

/* ---------- 세션 (KV) ---------- */
const TTL = 60 * 60 * 24 * 30; // 고객 30일

export async function createSession(env, payload) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await env.KV.put(`sess:${token}`, JSON.stringify(payload), { expirationTtl: TTL });
  return { token, ttl: TTL };
}

export async function readSession(env, request) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)ssople_c=([^;]+)/);
  if (!m) return null;
  const raw = await env.KV.get(`sess:${m[1]}`);
  if (!raw) return null;
  try { return { ...JSON.parse(raw), token: m[1] }; } catch { return null; }
}

export const destroySession = (env, token) => (token ? env.KV.delete(`sess:${token}`) : null);

export const setCookie = (token, ttl) =>
  `ssople_c=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttl}`;
export const clearCookie = () =>
  `ssople_c=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function requireCustomer(env, request) {
  const s = await readSession(env, request);
  if (!s) return { error: err('로그인이 필요합니다.', 401) };
  return { session: s };
}

/* ---------- 설정 ---------- */
export async function getSettings(env, keys) {
  const ph = keys.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT key,value FROM web_settings WHERE key IN (${ph})`).bind(...keys).all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

export async function getSetting(env, key, fallback = null) {
  const r = await env.DB.prepare(`SELECT value FROM web_settings WHERE key=?`).bind(key).first();
  return r ? r.value : fallback;
}

/* ---------- 시간 (KST) ---------- */
export const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000);
export const kstToday = () => kstNow().toISOString().slice(0, 10);
export const addDays = (d, n) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/* ---------- 기타 ---------- */
export const readJson = async (request) => { try { return await request.json(); } catch { return {}; } };

export const onlyDigits = (s) => String(s || '').replace(/[^0-9]/g, '');

export const fmtPhone = (s) => {
  const d = onlyDigits(s);
  return d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') || d;
};

export const maskPhone = (s) => {
  const d = onlyDigits(s);
  return d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, (_, a, b, c) => `${a}-${'*'.repeat(b.length)}-${c}`) || d;
};

export function reservationCode(d = kstNow()) {
  const p = (n) => String(n).padStart(2, '0');
  return `SP${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         String(Math.floor(Math.random() * 9000) + 1000);
}

/* 감사 로그 — 호스트의 audit_logs 를 그대로 씁니다. 없으면 조용히 넘어갑니다. */
/* 본사 대시보드에 "이 줄이 바뀌었다"고 알립니다.
   대시보드는 ops_touch 를 훑어 증분 동기화를 하므로,
   여기에 도장을 찍지 않으면 홈페이지에서 만든 예약이
   대시보드 화면에 바로 나타나지 않습니다. */
export async function touch(env, table, rowId) {
  if (!rowId) return;
  try {
    await env.DB.prepare(
      `INSERT INTO ops_touch (tbl, rid, up) VALUES (?,?,?)
       ON CONFLICT(tbl, rid) DO UPDATE SET up=excluded.up`
    ).bind(table, String(rowId), Date.now()).run();
  } catch { /* 대시보드 테이블이 아직 없을 수 있습니다 */ }
}

/* 점주 알림 — 호스트 센터의 종 아이콘에 뜹니다 */
export async function ownerNotify(env, branchId, { type, title, body = null, link = null }) {
  if (!branchId) return;
  try {
    await env.DB.prepare(
      `INSERT INTO owner_notifications (branch_id, type, title, body, link, read, created_at)
       VALUES (?,?,?,?,?,0,datetime('now'))`
    ).bind(branchId, type, title, body, link).run();
  } catch { /* 호스트 스키마가 아직 없을 수 있습니다 */ }
}

/* 예약 변경 이력 — 점주 화면의 "이력" 탭에 남습니다 */
export async function resLog(env, reservationId, actor, action, detail = null) {
  if (!reservationId) return;
  try {
    await env.DB.prepare(
      `INSERT INTO reservation_logs (reservation_id, actor, action, detail, created_at)
       VALUES (?,?,?,?,datetime('now'))`
    ).bind(reservationId, actor || '홈페이지', action, detail).run();
  } catch { /* 호스트 스키마가 아직 없을 수 있습니다 */ }
}

export async function audit(env, { branchId = null, actor, action, detail = null }) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (branch_id, actor, action, detail, created_at)
       VALUES (?,?,?,?,datetime('now'))`
    ).bind(branchId, actor || '홈페이지', action, detail).run();
  } catch { /* 호스트 스키마가 아직 없을 수 있음 */ }
}

/* 속도 제한 */
export async function rateLimit(env, key, limit, windowSec) {
  const k = `rl:${key}`;
  const cur = Number((await env.KV.get(k)) || 0);
  if (cur >= limit) return false;
  await env.KV.put(k, String(cur + 1), { expirationTtl: windowSec });
  return true;
}
