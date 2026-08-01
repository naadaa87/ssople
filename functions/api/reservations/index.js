/* 예약 생성 (홀드 기반) — 결제 준비까지 */
import { ok, err, readJson, requireCustomer, reservationCode, getSetting, fmtPhone, onlyDigits } from '../../lib/core.js';
import { readHold, calcAmount } from '../../lib/booking.js';
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
  const amt = calcAmount(branch, hold.slot, people);
  const deposit = Number(await getSetting(env, 'deposit.amount', '80000'));

  /* 화면이 보낸 금액은 참고값입니다. 서버 계산값으로 갑니다. */
  if (b.deposit != null && Number(b.deposit) !== deposit)
    return err('결제 금액이 맞지 않습니다. 처음부터 다시 진행해 주세요.', 409);

  const code = reservationCode();
  const orderId = `${code}-${Date.now().toString(36)}`;

  /* 승인 통보를 받은 뒤에 예약을 만듭니다. 미완료 데이터를 쌓지 않습니다. */
  await env.KV.put(`order:${orderId}`, JSON.stringify({
    orderId, code, holdId: hold.holdId,
    customerId: session.customerId, branchId: hold.branchId,
    useDate: hold.dateStr, slot: hold.slot, people,
    ...amt, deposit,
    guestName, guestPhone: fmtPhone(guestPhone),
    requestNote: (b.requestNote || '').slice(0, 500),
  }), { expirationTtl: 1800 });

  const pay = await preparePayment(env, {
    orderId, amount: deposit,
    name: `${branch.name} ${hold.dateStr} ${hold.slot === 'night' ? '밤타임' : '낮타임'}`,
    buyer: { name: guestName, phone: fmtPhone(guestPhone) },
  });

  return ok({ orderId, code, deposit, totalAmount: amt.totalAmount,
    balance: Math.max(0, amt.totalAmount - deposit), payment: pay });
}
