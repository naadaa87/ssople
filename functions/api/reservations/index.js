/* 예약 생성 (홀드 기반) — 결제 준비까지 */
import { ok, err, readJson, requireCustomer, reservationCode, getSetting, fmtPhone, onlyDigits } from '../../lib/core.js';
import { readHold, calcAmount, branchDeposit, payMode, payBreakdown } from '../../lib/booking.js';
import { pointBalance, couponValue } from '../../lib/wallet.js';
import { preparePayment } from '../../lib/payments.js';

export async function onRequestPost({ request, env }) {
  const { session, error } = await requireCustomer(env, request);
  if (error) return error;

  const b = await readJson(request);
  const hold = await readHold(env, b.holdId);
  if (!hold) return err('예약 대기 시간이 지났습니다. 다시 선택해 주세요.', 409, { code: 'HOLD_EXPIRED' });
  if (Number(hold.customerId) !== Number(session.customerId)) return err('권한이 없습니다.', 403);

  const guestName = (b.guestName || session.name || '').trim();
  const guestPhone = onlyDigits(b.guestPhone);
  if (!guestName) return err('예약자 이름을 입력해 주세요.');
  if (guestPhone.length < 10) return err('연락처를 확인해 주세요.');
  if (!b.agreeAll) return err('이용약관과 취소·환불 규정에 동의해 주세요.');

  const branch = await env.DB.prepare(`SELECT * FROM branches WHERE id=?`).bind(hold.branchId).first();
  if (!branch) return err('지점을 찾을 수 없습니다.', 404);

  const people = Number(b.people || branch.base_people);
  const amt = calcAmount(branch, hold.slot, people, hold.dateStr);
  const deposit = await branchDeposit(env, branch);
  const mode = await payMode(env);

  /* ---------- 쿠폰 (한 예약에 한 장) ---------- */
  let coupon = null, couponDiscount = 0;
  if (b.couponIssueId) {
    coupon = await env.DB.prepare(
      `SELECT ci.id, ci.status, ci.expires_at,
              c.title, c.kind, c.value, c.min_amount, c.scope, c.status AS cstatus
         FROM coupon_issues ci JOIN coupons c ON c.id = ci.coupon_id
        WHERE ci.id=? AND ci.customer_id=?`
    ).bind(Number(b.couponIssueId), session.customerId).first();
    const alive = coupon && coupon.status === 'issued' && coupon.cstatus === 'active'
      && (!coupon.expires_at || coupon.expires_at >= new Date().toISOString());
    if (!alive) return err('사용할 수 없는 쿠폰입니다.', 409);
    if (coupon.scope === 'first') {
      const prior = await env.DB.prepare(
        `SELECT 1 FROM reservations WHERE customer_id=? AND status IN ('confirmed','completed') LIMIT 1`
      ).bind(session.customerId).first();
      if (prior) return err('첫 예약 전용 쿠폰입니다.', 409);
    }
    couponDiscount = couponValue(coupon, amt.totalAmount);
    if (!couponDiscount)
      return err(`이 쿠폰은 ${Number(coupon.min_amount).toLocaleString()}원 이상 예약에 쓸 수 있습니다.`, 409);
  }

  /* ---------- 포인트 (원장 잔액 안에서, 대관료 한도) ---------- */
  let pointUse = Math.max(0, Math.floor(Number(b.pointUse || 0)));
  if (pointUse) {
    const minUse = Number(await getSetting(env, 'points.min_use', '1000'));
    if (pointUse < minUse)
      return err(`포인트는 ${minUse.toLocaleString()}P부터 쓸 수 있습니다.`, 409);
    const balance = await pointBalance(env, session.customerId);
    if (pointUse > balance) return err('보유 포인트보다 많이 쓸 수 없습니다.', 409);
    pointUse = Math.min(pointUse, amt.totalAmount - couponDiscount);
  }

  const rentNet = Math.max(0, amt.totalAmount - couponDiscount - pointUse);
  const pb = payBreakdown(mode, rentNet, deposit);

  /* 화면이 보낸 금액은 참고값입니다. 서버 계산값과 다르면 다시 안내합니다. */
  if (b.expectedPay != null && Number(b.expectedPay) !== pb.payAmount)
    return err('결제 금액이 갱신되었습니다. 내용을 다시 확인해 주세요.', 409, { payAmount: pb.payAmount });

  const code = reservationCode();
  const orderId = `${code}-${Date.now().toString(36)}`;

  /* 승인 통보를 받은 뒤에 예약을 만듭니다. 미완료 데이터를 쌓지 않습니다. */
  await env.KV.put(`order:${orderId}`, JSON.stringify({
    orderId, code, holdId: hold.holdId,
    customerId: session.customerId, branchId: hold.branchId,
    useDate: hold.dateStr, slot: hold.slot, people,
    ...amt, deposit,
    payMode: mode, payAmount: pb.payAmount, balance: pb.balance,
    pointUse, couponIssueId: coupon ? coupon.id : null, couponDiscount,
    couponTitle: coupon ? coupon.title : null,
    guestName, guestPhone: fmtPhone(guestPhone),
    requestNote: (b.requestNote || '').slice(0, 500),
  }), { expirationTtl: 1800 });

  const pay = await preparePayment(env, {
    orderId, amount: pb.payAmount,
    name: `${branch.name} ${hold.dateStr} ${hold.slot === 'night' ? '밤타임' : '낮타임'}`,
    buyer: { name: guestName, phone: fmtPhone(guestPhone) },
  });

  return ok({
    orderId, code, payMode: mode,
    rent: amt.totalAmount, couponDiscount, pointUse,
    deposit, payAmount: pb.payAmount, balance: pb.balance, payment: pay,
  });
}
