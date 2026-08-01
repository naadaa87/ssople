/* ============================================================
   예약 엔진 — 낮타임 / 밤타임 기준

   호스트 홈페이지와 같은 규칙으로 계산합니다.
     타임 요금(day_price / night_price)
     + 기본 인원 초과분 × 추가 인원 단가(extra_price)
   금액은 언제나 서버가 계산하고, 화면이 보낸 금액은 믿지 않습니다.
   ============================================================ */

import { getSetting, kstNow, kstToday } from './core.js';

export const SLOTS = ['day', 'night'];
export const SLOT_LABEL = { day: '낮타임', night: '밤타임' };

/* 지점별 타임 시각. 컬럼이 없으면 기본값을 씁니다. */
export function slotTime(branch, slot) {
  if (slot === 'day') {
    const s = branch.day_start ?? 12, e = branch.day_end ?? 18;
    return { start: s, end: e, label: `${p2(s)}:00 ~ ${p2(e)}:00` };
  }
  const s = branch.night_start ?? 19, e = branch.night_end ?? 25;
  return { start: s, end: e, label: `${p2(s)}:00 ~ ${e > 24 ? '익일 ' + p2(e - 24) : p2(e)}:00` };
}
const p2 = (n) => String(n % 24).padStart(2, '0');

/* ---------- 요금 계산 ---------- */
export function calcAmount(branch, slot, people) {
  const base = slot === 'night' ? branch.night_price : branch.day_price;
  const basePeople = branch.base_people || 0;
  const extraPeople = Math.max(0, (people || 0) - basePeople);
  const extra = extraPeople * (branch.extra_price || 0);
  return {
    baseAmount: base,
    extraAmount: extra,
    totalAmount: base + extra,
    peopleBase: Math.min(people || 0, basePeople),
    peopleExtra: extraPeople,
  };
}

/* ---------- 가용성 ----------
   막히는 경우: 이미 살아있는 예약 / 휴무 등록 / 지난 타임 */
export async function getAvailability(env, branchId, dateStr) {
  const branch = await env.DB.prepare(
    `SELECT * FROM branches WHERE id=? AND status='open'`).bind(branchId).first();
  if (!branch) return { error: 'NOT_FOUND' };

  const { results: taken } = await env.DB.prepare(
    `SELECT slot FROM reservations
      WHERE branch_id=? AND use_date=? AND status IN ('waiting','confirmed','completed','noshow')`
  ).bind(branchId, dateStr).all();

  const { results: closed } = await env.DB.prepare(
    `SELECT slot FROM branch_closures WHERE branch_id=? AND use_date=?`
  ).bind(branchId, dateStr).all().catch(() => ({ results: [] }));

  const closedAll = closed.some((c) => !c.slot);
  const blocked = new Set([...taken.map((t) => t.slot), ...closed.filter((c) => c.slot).map((c) => c.slot)]);

  /* 홀드 (결제 진행 중) */
  const holds = await env.KV.list({ prefix: `hold:${branchId}:${dateStr}:` });
  for (const k of holds.keys) blocked.add(k.name.split(':').pop());

  /* 오늘이면 이미 시작한 타임은 막습니다 */
  const now = kstNow();
  if (dateStr === kstToday()) {
    const h = now.getUTCHours();
    for (const s of SLOTS) if (h >= slotTime(branch, s).start) blocked.add(s);
  }
  /* 지난 날짜 */
  if (dateStr < kstToday()) for (const s of SLOTS) blocked.add(s);

  const slots = SLOTS.map((s) => {
    const t = slotTime(branch, s);
    return {
      slot: s,
      label: SLOT_LABEL[s],
      time: t.label,
      price: s === 'night' ? branch.night_price : branch.day_price,
      available: !closedAll && !blocked.has(s),
    };
  });

  return { branch, slots, closedAllDay: closedAll };
}

/* ---------- 홀드 ---------- */
export async function createHold(env, { branchId, dateStr, slot, customerId, amount }) {
  const minutes = Number(await getSetting(env, 'hold.minutes', '10'));
  const ttl = minutes * 60;
  const key = `hold:${branchId}:${dateStr}:${slot}`;
  if (await env.KV.get(key)) return { error: 'SLOT_TAKEN' };

  const holdId = crypto.randomUUID();
  const payload = JSON.stringify({
    holdId, branchId, dateStr, slot, customerId, amount,
    expiresAt: Date.now() + ttl * 1000,
  });
  await env.KV.put(key, payload, { expirationTtl: ttl });
  await env.KV.put(`holdref:${holdId}`, payload, { expirationTtl: ttl });
  return { holdId, expiresIn: ttl, expiresAt: Date.now() + ttl * 1000 };
}

export async function readHold(env, holdId) {
  const raw = await env.KV.get(`holdref:${holdId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function releaseHold(env, holdId) {
  const h = await readHold(env, holdId);
  if (!h) return;
  await env.KV.delete(`hold:${h.branchId}:${h.dateStr}:${h.slot}`);
  await env.KV.delete(`holdref:${holdId}`);
}

/* ---------- 환불 판정 ----------
   web_settings 의 refund.rules 를 읽어 판정합니다. 코드에 날짜를 박지 않습니다.
   반환하는 type 값(full / none)은 호스트의 reservations.refund_type 과 같습니다. */
export async function judgeRefund(env, useDateStr, paidAmount) {
  let rules = [];
  try { rules = JSON.parse(await getSetting(env, 'refund.rules', '[]')); } catch { rules = []; }
  rules.sort((a, b) => b.min_days - a.min_days);

  const today = new Date(`${kstToday()}T00:00:00Z`);
  const use = new Date(`${useDateStr}T00:00:00Z`);
  const daysLeft = Math.floor((use - today) / 86400000);

  const hit = rules.find((r) => daysLeft >= r.min_days)
    || { rate: 0, type: 'none', label: '환불 불가' };

  return {
    daysLeft,
    rate: hit.rate,
    type: hit.type || (hit.rate >= 100 ? 'full' : hit.rate > 0 ? 'partial' : 'none'),
    label: hit.label,
    refundAmount: Math.floor((paidAmount * hit.rate) / 100),
    refundable: hit.rate > 0,
  };
}
