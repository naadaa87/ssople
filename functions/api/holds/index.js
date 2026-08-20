/* 홀드 생성 — 결제 진행 중 그 타임을 잠급니다 */
import { ok, err, readJson, requireCustomer } from '../../lib/core.js';
import { getAvailability, calcAmount, createHold, branchDeposit, payMode, payBreakdown, SLOTS } from '../../lib/booking.js';

export async function onRequestPost({ request, env }) {
  const { session, error } = await requireCustomer(env, request);
  if (error) return error;

  const b = await readJson(request);
  const branchId = Number(b.branchId);
  const date = b.date;
  const slot = b.slot;
  const people = Number(b.people || 0);

  if (!branchId || !date || !SLOTS.includes(slot)) return err('예약 정보를 확인해 주세요.');

  const av = await getAvailability(env, branchId, date);
  if (av.error) return err('지점을 찾을 수 없습니다.', 404);

  if (people > av.branch.max_people)
    return err(`이 지점은 최대 ${av.branch.max_people}명까지 이용하실 수 있습니다.`);

  const target = av.slots.find((s) => s.slot === slot);
  if (!target || !target.available)
    return err('방금 다른 분이 예약을 마쳤습니다. 다른 날짜나 타임을 골라주세요.', 409, { code: 'SLOT_TAKEN' });

  /* 금액은 서버가 계산합니다 */
  const amt = calcAmount(av.branch, slot, people || av.branch.base_people, date);
  const deposit = await branchDeposit(env, av.branch);
  const mode = await payMode(env);
  const pb = payBreakdown(mode, amt.totalAmount, deposit);

  const hold = await createHold(env, {
    branchId, dateStr: date, slot, customerId: session.customerId, amount: deposit,
  });
  if (hold.error) return err('방금 다른 분이 예약을 시작했습니다. 다른 타임을 골라주세요.', 409, { code: 'SLOT_TAKEN' });

  return ok({
    holdId: hold.holdId, expiresAt: hold.expiresAt, expiresIn: hold.expiresIn,
    ...amt, deposit, payMode: mode, payAmount: pb.payAmount, balance: pb.balance,
  });
}
