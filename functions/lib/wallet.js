/* ============================================================
   쏘플 클럽 지갑 — 포인트 · 쿠폰 공용 계산

   포인트 잔액은 어디에도 저장하지 않고 원장(points)의 합으로만
   구합니다. 적립 · 사용 · 소멸이 전부 행으로 남아 정산과 CS에서
   그대로 추적됩니다. (기획서 5.4절 원장 원칙)
   ============================================================ */

export async function pointBalance(env, customerId) {
  try {
    const r = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS b FROM points WHERE customer_id=?`
    ).bind(customerId).first();
    return Number(r?.b || 0);
  } catch { return 0; }   /* 마이그레이션 전에는 0으로 */
}

export async function usableCoupons(env, customerId) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT ci.id AS issueId, ci.expires_at, c.title, c.kind, c.value, c.min_amount
         FROM coupon_issues ci JOIN coupons c ON c.id = ci.coupon_id
        WHERE ci.customer_id=? AND ci.status='issued' AND c.status='active'
          AND (ci.expires_at IS NULL OR ci.expires_at >= datetime('now'))
        ORDER BY ci.expires_at IS NULL, ci.expires_at`
    ).bind(customerId).all();
    return results;
  } catch { return []; }
}

/* 쿠폰 한 장이 이 대관료에 얼마를 깎는가 (조건 미달이면 0) */
export function couponValue(c, rent) {
  if (!c || rent < (c.min_amount || 0)) return 0;
  const d = c.kind === 'percent' ? Math.floor((rent * c.value) / 100) : Number(c.value);
  return Math.max(0, Math.min(d, rent));
}
