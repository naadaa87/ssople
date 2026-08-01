/* 내 예약 내역 */
import { ok, requireCustomer, kstToday } from '../../lib/core.js';
import { judgeRefund, SLOT_LABEL, slotTime } from '../../lib/booking.js';

export async function onRequestGet({ request, env }) {
  const { session, error } = await requireCustomer(env, request);
  if (error) return error;

  const { results } = await env.DB.prepare(
    `SELECT r.*, b.name branch_name, b.address, b.parking_text, b.access_info,
            b.day_start, b.day_end, b.night_start, b.night_end,
            p.method, p.amount paid_amount, p.id payment_id
       FROM reservations r
       JOIN branches b ON b.id=r.branch_id
       LEFT JOIN payments p ON p.reservation_id=r.id AND p.status='paid'
      WHERE r.customer_id=? ORDER BY r.use_date DESC, r.slot DESC`
  ).bind(session.customerId).all();

  const today = kstToday();
  const list = [];
  for (const r of results) {
    const refund = r.status === 'confirmed' ? await judgeRefund(env, r.use_date, r.deposit_amount) : null;
    const hasReview = await env.DB.prepare(`SELECT 1 FROM reviews WHERE reservation_id=?`).bind(r.id).first();
    list.push(shape(r, refund, !!hasReview, today));
  }

  return ok({
    upcoming:  list.filter((r) => r.status === 'confirmed' && r.useDate >= today),
    past:      list.filter((r) => ['completed', 'noshow'].includes(r.status)
                               || (r.status === 'confirmed' && r.useDate < today)),
    cancelled: list.filter((r) => r.status === 'canceled'),
  });
}

export function shape(r, refund, hasReview, today) {
  const t = slotTime({ day_start: r.day_start, day_end: r.day_end,
                       night_start: r.night_start, night_end: r.night_end }, r.slot);
  return {
    id: r.id, code: r.code, status: r.status,
    branchName: r.branch_name, address: r.address, parking: r.parking_text,
    useDate: r.use_date, slot: r.slot, slotLabel: SLOT_LABEL[r.slot], slotTime: t.label,
    people: (r.people_base || 0) + (r.people_extra || 0),
    totalAmount: r.total_amount, deposit: r.deposit_amount,
    balance: Math.max(0, r.total_amount - r.deposit_amount),
    method: r.method, source: r.source, requestNote: r.request_note,
    /* 출입 방법은 확정된 예약의 이용 당일에만 내려줍니다 */
    accessInfo: r.status === 'confirmed' && r.use_date === today ? r.access_info : null,
    refund,
    canReview: r.status === 'completed' && !hasReview,
  };
}
