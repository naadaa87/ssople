/* ============================================================
   예약 상세 — 마이페이지 상세 화면의 재료를 한 번에 내려줍니다.
   상태 타임라인 · 결제 내역 · 보증금과 차감 · 환불 이력 · 게스트 링크
   (기획서 6.1 P0-④ 「보증금 반환 조회」, 부록 D 「내 예약 상세」)
   ============================================================ */

import { ok, err, requireCustomer, kstToday } from '../../../lib/core.js';
import { judgeRefund, SLOT_LABEL, slotTime } from '../../../lib/booking.js';

export async function onRequestGet({ params, request, env }) {
  const { session, error } = await requireCustomer(env, request);
  if (error) return error;
  const id = Number(params.id);

  const r = await env.DB.prepare(
    `SELECT r.*, b.name branch_name, b.address, b.region, b.area, b.parking_text,
            b.day_start, b.day_end, b.night_start, b.night_end
       FROM reservations r JOIN branches b ON b.id = r.branch_id
      WHERE r.id=? AND r.customer_id=?`
  ).bind(id, session.customerId).first();
  if (!r) return err('예약을 찾을 수 없습니다.', 404);

  const pay = await env.DB.prepare(
    `SELECT id, amount, kind, method, approved_at, status
       FROM payments WHERE reservation_id=? ORDER BY id DESC LIMIT 1`
  ).bind(id).first();

  const { results: refunds } = pay
    ? await env.DB.prepare(
        `SELECT amount, reason, rule_label, completed_at
           FROM refunds WHERE payment_id=? ORDER BY id`
      ).bind(pay.id).all()
    : { results: [] };

  /* 보증금 차감은 본사 대시보드(ops_incidents)가 정본입니다.
     본사·점주가 등록한 그 내역을 고객이 그대로 보고 이의를 냅니다.
     상태는 대시보드 규칙을 따릅니다:
       PROPOSED(차감 청구) → DISPUTED(이의 검토) → CONFIRMED(확정) / WITHDRAWN(철회) */
  let incidents = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, kind, amount, note, photos_json, state, dispute_until, extra_json, at
         FROM ops_incidents WHERE res_code=? ORDER BY at`
    ).bind(r.code).all();
    incidents = results.map((i) => {
      let extra = {}; try { extra = JSON.parse(i.extra_json || '{}'); } catch {}
      return {
        id: i.id, type: i.kind, amount: i.amount, note: i.note,
        photos: parseJson(i.photos_json), status: i.state,
        disputeUntil: i.dispute_until,
        objectionNote: extra.objection || null,
        createdAt: i.at ? new Date(Number(i.at)).toISOString() : null,
      };
    });
  } catch { /* 대시보드 테이블이 아직 없을 수 있습니다 */ }

  /* 철회된 건은 보증금에서 빠지지 않습니다 */
  const pendingDeduct = incidents
    .filter((i) => ['PROPOSED', 'DISPUTED', 'CONFIRMED'].includes(i.status))
    .reduce((s, i) => s + (i.amount || 0), 0);
  const depositRefund = refunds.find((f) => (f.reason || '').includes('보증금'));
  const isFull = pay?.kind === 'full';

  /* 취소 시 환불 미리보기 — 취소 화면과 같은 계산식 */
  const today = kstToday();
  let refundPreview = null;
  if (r.status === 'confirmed' && r.use_date >= today) {
    const rentNet = Math.max(0, (r.total_amount || 0) - (r.coupon_discount || 0) - (r.point_used || 0));
    const v = await judgeRefund(env, r.use_date, isFull ? rentNet : (r.deposit_hold ?? r.deposit_amount ?? 0));
    const refundAmount = v.refundAmount + (isFull ? ((r.deposit_hold ?? r.deposit_amount ?? 0) || 0) : 0);
    refundPreview = { ...v, refundAmount, refundable: refundAmount > 0,
      depositBack: isFull ? (r.deposit_hold ?? r.deposit_amount ?? 0) : 0 };
  }

  const t = slotTime(r, r.slot);
  return ok({
    reservation: {
      id: r.id, code: r.code, status: r.status, refundType: r.refund_type,
      branchId: r.branch_id, branchName: r.branch_name,
      address: r.address, region: r.region, area: r.area, parking: r.parking_text,
      useDate: r.use_date, slot: r.slot, slotLabel: SLOT_LABEL[r.slot], slotTime: t.label,
      people: (r.people_base || 0) + (r.people_extra || 0),
      baseAmount: r.base_amount, extraAmount: r.extra_amount,
      totalAmount: r.total_amount,
      couponDiscount: r.coupon_discount || 0, pointUsed: r.point_used || 0,
      deposit: (r.deposit_hold ?? r.deposit_amount ?? 0), payMode: isFull ? 'FULL' : 'DEPOSIT',
      balance: isFull ? 0 : Math.max(0, (r.total_amount || 0)
        - (r.coupon_discount || 0) - (r.point_used || 0) - ((r.deposit_hold ?? r.deposit_amount ?? 0) || 0)),
      requestNote: r.request_note, guestToken: r.guest_token || null,
      createdAt: r.created_at,
    },
    payment: pay ? {
      amount: pay.amount, kind: pay.kind, method: pay.method,
      approvedAt: pay.approved_at, status: pay.status,
    } : null,
    refunds: refunds.map((f) => ({
      amount: f.amount, reason: f.reason, ruleLabel: f.rule_label, at: f.completed_at,
    })),
    incidents,
    depositView: {
      amount: (r.deposit_hold ?? r.deposit_amount ?? 0),
      pendingDeduct,
      expectedReturn: Math.max(0, ((r.deposit_hold ?? r.deposit_amount ?? 0) || 0) - pendingDeduct),
      returned: depositRefund
        ? { amount: depositRefund.amount, at: depositRefund.completed_at }
        : null,
    },
    refundPreview,
  });
}

const parseJson = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
