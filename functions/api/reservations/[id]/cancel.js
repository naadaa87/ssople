/* 예약 취소 — 환불 규정 자동 판정 후 즉시 처리 */
import { ok, err, readJson, requireCustomer, kstToday, audit, ownerNotify, resLog, touch } from '../../../lib/core.js';
import { judgeRefund, SLOT_LABEL } from '../../../lib/booking.js';
import { cancelPayment } from '../../../lib/payments.js';
import { notify } from '../../../lib/notify.js';

export async function onRequestPost({ params, request, env }) {
  const { session, error } = await requireCustomer(env, request);
  if (error) return error;
  const id = Number(params.id);
  const b = await readJson(request);

  const r = await env.DB.prepare(
    `SELECT r.*, br.name branch_name FROM reservations r JOIN branches br ON br.id=r.branch_id
      WHERE r.id=? AND r.customer_id=?`).bind(id, session.customerId).first();
  if (!r) return err('예약을 찾을 수 없습니다.', 404);
  if (r.status !== 'confirmed') return err('취소할 수 있는 상태가 아닙니다.');
  if (r.use_date < kstToday()) return err('이용일이 지난 예약은 취소할 수 없습니다.');

  const pay = await env.DB.prepare(
    `SELECT * FROM payments WHERE reservation_id=? AND status='paid'`).bind(id).first();

  /* 결제 방식에 따라 환불을 계산합니다.
     FULL   대관료(할인 반영분)에 규정을 적용하고, 보증금은 미이용이므로 항상 돌려드립니다.
     DEPOSIT 예약금(보증금 겸)에 규정을 그대로 적용합니다. — 과거 방식 */
  const isFull = pay?.kind === 'full';
  const hold = r.deposit_hold ?? r.deposit_amount ?? 0;   /* 환급 대상 보증금 */
  const rentNet = Math.max(0, (r.total_amount || 0) - (r.coupon_discount || 0) - (r.point_used || 0));
  const verdict = await judgeRefund(env, r.use_date, isFull ? rentNet : hold);
  const refundAmount = verdict.refundAmount + (isFull ? hold : 0);
  const refundable = refundAmount > 0;

  /* 취소 전에 환불 금액을 먼저 보여줍니다 */
  if (!b.confirm) return ok({
    preview: true, ...verdict,
    refundAmount, refundable,
    deposit: hold,
    depositBack: isFull ? hold : 0,
    payMode: isFull ? 'FULL' : 'DEPOSIT',
  });

  if (refundable && pay) {
    const c = await cancelPayment(env, { pgTid: pay.pg_tid, amount: refundAmount, reason: '고객 취소' });
    if (!c.ok) return err('환불 처리에 실패했습니다. 고객센터로 문의해 주세요.', 502);
    await env.DB.prepare(
      `INSERT INTO refunds (payment_id, amount, reason, rule_label, status, completed_at)
       VALUES (?,?,?,?,'done',datetime('now'))`
    ).bind(pay.id, refundAmount, '고객 취소', verdict.label).run();
    if (refundAmount >= pay.amount)
      await env.DB.prepare(`UPDATE payments SET status='canceled' WHERE id=?`).bind(pay.id).run();
  }

  /* 쓴 포인트 · 쿠폰은 대관료를 돌려드릴 때만 되살립니다.
     환불 불가 구간(이용 6일 이내)에서는 대관료가 그대로 매출로 남으므로,
     포인트까지 돌려드리면 같은 금액을 두 번 드리는 셈이 됩니다. */
  const rentBack = verdict.refundAmount > 0;
  if (rentBack && r.point_used) {
    await env.DB.prepare(
      `INSERT INTO points (customer_id, amount, reason, reservation_id, memo)
       VALUES (?,?,'refund',?,?)`
    ).bind(r.customer_id, r.point_used, id, `예약 ${r.code} 취소 복원`).run();
  }
  if (rentBack && r.coupon_issue_id) {
    await env.DB.prepare(
      `UPDATE coupon_issues SET status='issued', used_at=NULL, reservation_id=NULL
        WHERE id=? AND status='used'
          AND (expires_at IS NULL OR expires_at >= datetime('now'))`
    ).bind(r.coupon_issue_id).run();
  }

  /* 호스트 화면에서도 같은 값으로 보이도록 refund_type 을 함께 씁니다 */
  await env.DB.prepare(
    `UPDATE reservations
        SET status='canceled', refund_type=?, cancel_reason=?, canceled_at=datetime('now'),
            deposit_status = CASE WHEN ?='full' THEN 'refunded' ELSE deposit_status END,
            net_amount = CASE WHEN ?='full' THEN 0 ELSE net_amount END,
            updated_at=datetime('now')
      WHERE id=?`
  ).bind(verdict.type, '고객 직접 취소 (홈페이지)', verdict.type, verdict.type, id).run();

  const when = `${r.use_date} ${SLOT_LABEL[r.slot]}`;
  await notify(env, 'WEB-04', r.phone, {
    code: r.code, when, refund: refundAmount.toLocaleString(),
    note: refundable
      ? (isFull && verdict.rate < 100
          ? '보증금은 전액 환급되며, 대관료는 환불 규정이 적용되었습니다. 입금까지 3~5영업일이 걸릴 수 있습니다.'
          : '카드사 사정에 따라 입금까지 3~5영업일이 걸릴 수 있습니다.')
      : '환불 규정에 따라 환불 대상이 아닙니다.',
  }, { reservationId: id, branchId: r.branch_id });

  await audit(env, { branchId: r.branch_id, actor: '홈페이지',
    action: '예약 취소', detail: `${r.code} / 환불 ${refundAmount} / ${verdict.label}` });

  /* 점주가 바로 알 수 있도록 — 그 타임이 다시 열립니다 */
  await ownerNotify(env, r.branch_id, {
    type: 'cancel',
    title: `예약 취소 ${r.use_date} ${SLOT_LABEL[r.slot]}`,
    body: `${r.name} · ${r.code} · ${verdict.label}`,
    link: '/owner/reservations.html',
  });
  await resLog(env, id, '고객', '예약 취소',
    `${verdict.label} · 환불 ${refundAmount.toLocaleString()}원`
    + (rentBack ? '' : ' · 대관료는 매출로 남아 정산 대상입니다'));
  await touch(env, 'res', r.code);   /* 본사 대시보드 증분 반영 */

  return ok({ cancelled: true, ...verdict, refundAmount, refundable });
}
