/* 예약 취소 — 환불 규정 자동 판정 후 즉시 처리 */
import { ok, err, readJson, requireCustomer, kstToday, audit } from '../../../lib/core.js';
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

  const verdict = await judgeRefund(env, r.use_date, r.deposit_amount);

  /* 취소 전에 환불 금액을 먼저 보여줍니다 */
  if (!b.confirm) return ok({ preview: true, ...verdict, deposit: r.deposit_amount });

  const pay = await env.DB.prepare(
    `SELECT * FROM payments WHERE reservation_id=? AND status='paid'`).bind(id).first();

  if (verdict.refundable && pay) {
    const c = await cancelPayment(env, { pgTid: pay.pg_tid, amount: verdict.refundAmount, reason: '고객 취소' });
    if (!c.ok) return err('환불 처리에 실패했습니다. 고객센터로 문의해 주세요.', 502);
    await env.DB.prepare(
      `INSERT INTO refunds (payment_id, amount, reason, rule_label, status, completed_at)
       VALUES (?,?,?,?,'done',datetime('now'))`
    ).bind(pay.id, verdict.refundAmount, '고객 취소', verdict.label).run();
    if (verdict.rate >= 100)
      await env.DB.prepare(`UPDATE payments SET status='canceled' WHERE id=?`).bind(pay.id).run();
  }

  /* 호스트 화면에서도 같은 값으로 보이도록 refund_type 을 함께 씁니다 */
  await env.DB.prepare(
    `UPDATE reservations SET status='canceled', refund_type=?, updated_at=datetime('now') WHERE id=?`
  ).bind(verdict.type, id).run();

  const when = `${r.use_date} ${SLOT_LABEL[r.slot]}`;
  await notify(env, 'WEB-04', r.phone, {
    code: r.code, when, refund: verdict.refundAmount.toLocaleString(),
    note: verdict.refundable
      ? '카드사 사정에 따라 입금까지 3~5영업일이 걸릴 수 있습니다.'
      : '환불 규정에 따라 환불 대상이 아닙니다.',
  }, { reservationId: id, branchId: r.branch_id });

  await audit(env, { branchId: r.branch_id, actor: '홈페이지',
    action: '예약 취소', detail: `${r.code} / 환불 ${verdict.refundAmount} / ${verdict.label}` });

  return ok({ cancelled: true, ...verdict });
}
