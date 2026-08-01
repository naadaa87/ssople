/* ============================================================
   PG 승인 통보 수신 — 시스템에서 가장 조심해야 할 지점

   - 같은 통보가 두 번 와도 결과는 한 번만 반영합니다 (멱등)
   - PG가 보낸 금액을 믿지 않고 서버 값과 대조합니다
   - 홀드가 아직 살아있는지 다시 봅니다
   - 그 사이 다른 경로(호스트 수기 등록·외부 채널)로 채워졌으면
     DB 유니크 인덱스가 막고, 즉시 자동 환불합니다

   예약은 호스트 홈페이지와 같은 규격으로 씁니다.
   status='confirmed', source='web' 로 들어가 점주 화면에 바로 뜹니다.
   ============================================================ */

import { ok, err, readJson, audit } from '../../lib/core.js';
import { readHold, releaseHold, SLOT_LABEL } from '../../lib/booking.js';
import { verifyPayment, cancelPayment } from '../../lib/payments.js';
import { notify } from '../../lib/notify.js';

export const onRequestPost = (ctx) => handle(ctx);
export const onRequestGet  = (ctx) => handle(ctx);   // 테스트 모드 승인용

async function handle({ request, env }) {
  const u = new URL(request.url);
  const body = request.method === 'POST' ? await readJson(request) : {};
  const orderId = body.orderId || u.searchParams.get('orderId');
  const pgTid   = body.paymentId || body.imp_uid || u.searchParams.get('paymentId');
  if (!orderId) return err('주문 정보가 없습니다.');

  /* 1) 이미 처리한 주문인가 */
  const done = await env.DB.prepare(
    `SELECT p.id, r.code FROM payments p JOIN reservations r ON r.id=p.reservation_id
      WHERE p.order_id=?`).bind(orderId).first();
  if (done) return finish(env, u, { code: done.code, already: true });

  /* 2) 주문 정보 */
  const raw = await env.KV.get(`order:${orderId}`);
  if (!raw) return err('결제 시간이 지났습니다. 다시 진행해 주세요.', 409, { code: 'HOLD_EXPIRED' });
  const o = JSON.parse(raw);

  /* 3) PG에 실제 결제 상태를 다시 물어봅니다 */
  const v = await verifyPayment(env, { pgTid, orderId, expectedAmount: o.deposit });
  if (!v.valid) {
    await env.KV.delete(`order:${orderId}`);
    await releaseHold(env, o.holdId);
    return err(v.reason === 'AMOUNT_MISMATCH'
      ? '결제 금액이 맞지 않아 처리를 중단했습니다.'
      : '결제가 완료되지 않았습니다.', 409);
  }

  /* 4) 홀드가 아직 살아있는가 */
  const hold = await readHold(env, o.holdId);
  if (!hold) {
    await cancelPayment(env, { pgTid: v.tid, amount: o.deposit, reason: '예약 대기 만료' });
    await env.KV.delete(`order:${orderId}`);
    return err('예약 대기 시간이 지나 결제를 취소했습니다.', 409, { code: 'HOLD_EXPIRED', refunded: true });
  }

  /* 5) 예약 생성 — 호스트와 같은 컬럼·같은 상태값 */
  let reservationId;
  try {
    const ins = await env.DB.prepare(
      `INSERT INTO reservations
        (code, branch_id, use_date, slot, name, phone,
         people_base, people_extra, base_amount, extra_amount, option_amount,
         total_amount, deposit_amount, status, source, request_note, customer_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,'confirmed','web',?,?)`
    ).bind(
      o.code, o.branchId, o.useDate, o.slot, o.guestName, o.guestPhone,
      o.peopleBase, o.peopleExtra, o.baseAmount, o.extraAmount,
      o.totalAmount, o.deposit, o.requestNote || null, o.customerId
    ).run();
    reservationId = ins.meta.last_row_id;
  } catch (e) {
    /* 같은 타임을 다른 경로가 먼저 차지한 경우 → 즉시 환불 */
    await cancelPayment(env, { pgTid: v.tid, amount: o.deposit, reason: '중복 예약 자동 환불' });
    await releaseHold(env, o.holdId);
    await env.KV.delete(`order:${orderId}`);
    await audit(env, { branchId: o.branchId, actor: '홈페이지',
      action: '중복 예약 차단', detail: `${o.useDate} ${o.slot} / ${orderId}` });
    return err('방금 다른 분이 같은 시간을 예약했습니다. 결제하신 금액은 자동으로 환불됩니다.',
      409, { code: 'SLOT_TAKEN', refunded: true });
  }

  /* 6) 결제 기록 */
  await env.DB.prepare(
    `INSERT INTO payments (reservation_id, order_id, pg_tid, method, amount, kind, status, approved_at, raw)
     VALUES (?,?,?,?,?,'deposit','paid',datetime('now'),?)`
  ).bind(reservationId, orderId, v.tid, v.method || 'card', o.deposit,
         v.raw ? JSON.stringify(v.raw).slice(0, 4000) : null).run();

  /* 7) 정리 */
  await releaseHold(env, o.holdId);
  await env.KV.delete(`order:${orderId}`);

  /* 8) 알림 — 고객과 점주 양쪽 */
  const branch = await env.DB.prepare(`SELECT * FROM branches WHERE id=?`).bind(o.branchId).first();
  const when = `${o.useDate} ${SLOT_LABEL[o.slot]}`;
  const balance = Math.max(0, o.totalAmount - o.deposit);

  await notify(env, 'WEB-01', o.guestPhone, {
    name: o.guestName, code: o.code, when, branch: branch.name,
    address: branch.address || '', deposit: o.deposit.toLocaleString(),
    balance: balance.toLocaleString(),
  }, { reservationId, branchId: o.branchId });

  if (branch.phone) {
    await notify(env, 'WEB-02', branch.phone, {
      branch: branch.name, when, people: o.peopleBase + o.peopleExtra,
    }, { reservationId, branchId: o.branchId });
  }

  await audit(env, { branchId: o.branchId, actor: '홈페이지',
    action: '예약 확정', detail: `${o.code} / ${when} / 예약금 ${o.deposit}` });

  return finish(env, u, { code: o.code, reservationId });
}

function finish(env, u, data) {
  if (u.searchParams.get('test') === '1') {
    return new Response(null, {
      status: 302,
      headers: { location: `/reservation-complete.html?code=${data.code}` },
    });
  }
  return ok(data);
}
