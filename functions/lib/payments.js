/* ============================================================
   결제 어댑터

   현행 운영은 예약금 80,000원 선입금 방식입니다.
   홈페이지는 이 예약금을 카드로 받고, 잔금은 현장에서 처리합니다.
   호스트 화면의 '예약금 / 잔금' 표기와 그대로 이어집니다.

   PG 계약 전에는 PG_MODE=test 로 두면 결제창 없이 승인이 흘러가
   예약→확정→알림→취소→환불까지 전 과정을 그대로 검수할 수 있습니다.
   ============================================================ */

export const pgMode = (env) => (env.PG_MODE || 'test').toLowerCase();

export async function preparePayment(env, { orderId, amount, name, buyer }) {
  if (pgMode(env) === 'test') {
    return { mode: 'test', orderId, amount,
      approveUrl: `/api/payments/webhook?test=1&orderId=${encodeURIComponent(orderId)}` };
  }
  return {
    mode: 'live', orderId, amount,
    storeId: env.PORTONE_STORE_ID,
    channelKey: env.PORTONE_CHANNEL_KEY,
    orderName: name,
    customer: { fullName: buyer?.name, phoneNumber: buyer?.phone },
  };
}

/* PG가 보낸 통보를 그대로 믿지 않고 PG 서버에 다시 물어봅니다. */
export async function verifyPayment(env, { pgTid, orderId, expectedAmount }) {
  if (pgMode(env) === 'test')
    return { valid: true, tid: pgTid || `TEST-${orderId}`, method: 'card', amount: expectedAmount };

  const token = await portoneToken(env);
  const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(pgTid)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { valid: false, reason: 'PG_LOOKUP_FAILED' };
  const p = await res.json();
  const paid = p.status === 'PAID';
  const match = Number(p.amount?.total) === Number(expectedAmount);
  return {
    valid: paid && match,
    reason: !paid ? 'NOT_PAID' : !match ? 'AMOUNT_MISMATCH' : null,
    tid: p.id, method: mapMethod(p.method?.type), amount: p.amount?.total, raw: p,
  };
}

export async function cancelPayment(env, { pgTid, amount, reason }) {
  if (pgMode(env) === 'test') return { ok: true, canceledAt: new Date().toISOString() };
  const token = await portoneToken(env);
  const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(pgTid)}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ amount, reason: reason || '고객 요청 취소' }),
  });
  if (!res.ok) return { ok: false, reason: await res.text() };
  return { ok: true, canceledAt: new Date().toISOString() };
}

async function portoneToken(env) {
  const res = await fetch('https://api.portone.io/login/api-secret', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiSecret: env.PORTONE_API_SECRET }),
  });
  return (await res.json()).accessToken;
}

const mapMethod = (t) => ({
  PaymentMethodCard: 'card', PaymentMethodEasyPay: 'kakaopay', PaymentMethodTransfer: 'transfer',
}[t] || 'card');
