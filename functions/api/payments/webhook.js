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

import { ok, err, readJson, audit, ownerNotify, resLog, touch } from '../../lib/core.js';
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
  const payAmount = Number(o.payAmount ?? o.deposit);
  const v = await verifyPayment(env, { pgTid, orderId, expectedAmount: payAmount });
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
    await cancelPayment(env, { pgTid: v.tid, amount: payAmount, reason: '예약 대기 만료' });
    await env.KV.delete(`order:${orderId}`);
    return err('예약 대기 시간이 지나 결제를 취소했습니다.', 409, { code: 'HOLD_EXPIRED', refunded: true });
  }

  /* 5) 예약 생성 — 호스트와 같은 컬럼·같은 상태값 */
  let reservationId;
  try {
    const ins = await env.DB.prepare(
      /* deposit_amount 는 "선납액" 입니다.
         호스트 센터가 잔금을 total_amount − deposit_amount 로 계산하므로,
         온라인 전액결제 예약은 대관료 전액을 선납한 것으로 기록해야
         점주 화면에 잔금 0원으로 뜹니다.
         환급 대상인 보증금은 deposit_hold 에 따로 담습니다. */
      `INSERT INTO reservations
        (code, branch_id, use_date, slot, name, phone,
         people_base, people_extra, base_amount, extra_amount, option_amount,
         total_amount, net_amount, options, deposit_amount, deposit_hold,
         deposit_status, deposit_paid_at, balance_method,
         status, source, request_note, customer_id,
         point_used, coupon_issue_id, coupon_discount, guest_token)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,'[]',?,?, 'paid', datetime('now'), ?,
               'confirmed','web',?,?,?,?,?,?)`
    ).bind(
      o.code, o.branchId, o.useDate, o.slot, o.guestName, o.guestPhone,
      o.peopleBase, o.peopleExtra, o.baseAmount, o.extraAmount,
      o.totalAmount,
      /* 정산 기준 실매출 — 할인은 점주 8 : 본사 2 로 함께 부담합니다 */
      Math.max(0, o.totalAmount - (o.couponDiscount || 0) - (o.pointUse || 0)),
      o.payMode === 'FULL' ? o.totalAmount : o.deposit,   /* 선납액 */
      o.deposit,                                          /* 보증금 */
      o.payMode === 'FULL' ? '온라인 전액결제 (현장 수납 없음)' : '홈페이지 예약금 결제',
      o.requestNote || null, o.customerId,
      o.pointUse || 0, o.couponIssueId || null, o.couponDiscount || 0,
      crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    ).run();
    reservationId = ins.meta.last_row_id;
  } catch (e) {
    /* 같은 타임을 다른 경로가 먼저 차지한 경우 → 즉시 환불 */
    await cancelPayment(env, { pgTid: v.tid, amount: payAmount, reason: '중복 예약 자동 환불' });
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
     VALUES (?,?,?,?,?,?,'paid',datetime('now'),?)`
  ).bind(reservationId, orderId, v.tid, v.method || 'card', payAmount,
         o.payMode === 'FULL' ? 'full' : 'deposit',
         v.raw ? JSON.stringify(v.raw).slice(0, 4000) : null).run();

  /* 쿠폰 · 포인트 사용 확정 — 예약 행이 만들어진 뒤에만 */
  if (o.couponIssueId) {
    await env.DB.prepare(
      `UPDATE coupon_issues SET status='used', used_at=datetime('now'), reservation_id=?
        WHERE id=? AND status='issued'`).bind(reservationId, o.couponIssueId).run();
  }
  if (o.pointUse) {
    await env.DB.prepare(
      `INSERT INTO points (customer_id, amount, reason, reservation_id, memo)
       VALUES (?,?,'use',?,?)`
    ).bind(o.customerId, -Number(o.pointUse), reservationId, `예약 ${o.code} 사용`).run();
  }

  /* 7) 정리 */
  await releaseHold(env, o.holdId);
  await env.KV.delete(`order:${orderId}`);

  /* 8) 알림 — 고객과 점주 양쪽 */
  const branch = await env.DB.prepare(`SELECT * FROM branches WHERE id=?`).bind(o.branchId).first();
  const when = `${o.useDate} ${SLOT_LABEL[o.slot]}`;
  const balance = Number(o.balance ?? Math.max(0, o.totalAmount - o.deposit));

  /* 점주에게 새 예약을 알리고 이력을 남깁니다 (호스트 센터에서 바로 보입니다) */
  const slotKo = o.slot === 'night' ? '밤타임' : '낮타임';
  await ownerNotify(env, o.branchId, {
    type: 'reservation',
    title: `새 예약 ${o.useDate} ${slotKo}`,
    body: `${o.guestName} · ${(o.peopleBase || 0) + (o.peopleExtra || 0)}명 · ${o.code}`
        + (o.payMode === 'FULL' ? ' · 온라인 전액결제 완료 (현장 수납 없음)' : ''),
    link: '/owner/reservations.html',
  });
  await resLog(env, reservationId, '홈페이지', '예약 접수',
    `온라인 결제 ${payAmount.toLocaleString()}원`
    + (o.payMode === 'FULL' ? ` (대관료 + 보증금 ${Number(o.deposit).toLocaleString()}원 포함)` : '')
    + (o.pointUse ? ` · 포인트 ${o.pointUse}P 사용` : '')
    + (o.couponDiscount ? ` · 쿠폰 ${o.couponDiscount}원 할인` : ''));

  await touch(env, 'res', o.code);   /* 본사 대시보드 증분 반영 */

  const row = await env.DB.prepare(
    `SELECT guest_token FROM reservations WHERE id=?`).bind(reservationId).first();
  const site = (env.SITE_URL || '').replace(/\/$/, '');
  await notify(env, 'WEB-01', o.guestPhone, {
    name: o.guestName, code: o.code, when, branch: branch.name,
    address: branch.address || '', deposit: o.deposit.toLocaleString(),
    balance: balance.toLocaleString(),
    payLine: o.payMode === 'FULL'
      ? `결제 완료 ${payAmount.toLocaleString()}원 (보증금 ${o.deposit.toLocaleString()}원 포함 · 이용 후 환급)`
      : null,
    guestUrl: site && row?.guest_token ? `${site}/guest.html?t=${row.guest_token}` : null,
  }, { reservationId, branchId: o.branchId });

  if (branch.phone) {
    await notify(env, 'WEB-02', branch.phone, {
      branch: branch.name, when, people: o.peopleBase + o.peopleExtra,
    }, { reservationId, branchId: o.branchId });
  }

  await audit(env, { branchId: o.branchId, actor: '홈페이지',
    action: '예약 확정', detail: `${o.code} / ${when} / 결제 ${payAmount}${o.pointUse ? ` / P-${o.pointUse}` : ''}${o.couponDiscount ? ` / 쿠폰-${o.couponDiscount}` : ''}` });

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
