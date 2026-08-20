/* 내 지갑 — 포인트 잔액 · 쿠폰 · 등급 · 요약 (결제 화면과 마이페이지가 씁니다) */
import { ok, requireCustomer, getSetting, kstToday } from '../../lib/core.js';
import { pointBalance, usableCoupons } from '../../lib/wallet.js';

export async function onRequestGet({ request, env }) {
  const { session, error } = await requireCustomer(env, request);
  if (error) return error;
  const cid = session.customerId;

  const [points, coupons, minUse, cust] = await Promise.all([
    pointBalance(env, cid),
    usableCoupons(env, cid),
    getSetting(env, 'points.min_use', '1000'),
    env.DB.prepare(`SELECT name, grade FROM customers WHERE id=?`).bind(cid).first(),
  ]);

  const grade = (cust?.grade || 'WELCOME').toUpperCase();
  const earnRate = Number(await getSetting(env, `points.earn.${grade}`, '5'));

  /* 예약 요약 */
  const today = kstToday();
  let stats = { upcoming: 0, done: 0 };
  try {
    const s = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status='confirmed' AND use_date>=? THEN 1 ELSE 0 END) AS up,
         SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS done
       FROM reservations WHERE customer_id=?`
    ).bind(today, cid).first();
    stats = { upcoming: Number(s?.up || 0), done: Number(s?.done || 0) };
  } catch {}

  /* 포인트 원장 최근 30건 */
  let pointHistory = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT amount, reason, memo, expires_at, created_at
         FROM points WHERE customer_id=? ORDER BY id DESC LIMIT 30`
    ).bind(cid).all();
    pointHistory = results;
  } catch {}

  return ok({
    name: cust?.name || session.name || '',
    grade, earnRate,
    stats,
    points,
    minUse: Number(minUse),
    pointHistory: pointHistory.map((h) => ({
      amount: h.amount, reason: h.reason, memo: h.memo,
      expiresAt: h.expires_at, at: h.created_at,
    })),
    coupons: coupons.map((c) => ({
      issueId: c.issueId, title: c.title, kind: c.kind, value: c.value,
      minAmount: c.min_amount || 0, expiresAt: c.expires_at,
    })),
  });
}
