/* 날짜별 예약 가능 타임 */
import { ok, err, getSetting } from '../../../lib/core.js';
import { getAvailability, calcAmount } from '../../../lib/booking.js';

export async function onRequestGet({ params, request, env }) {
  const id = Number(params.id);
  const u = new URL(request.url);
  const date = u.searchParams.get('date');
  const people = Number(u.searchParams.get('people') || 0);
  if (!date) return err('날짜를 골라주세요.');

  const av = await getAvailability(env, id, date);
  if (av.error) return err('지점을 찾을 수 없습니다.', 404);

  const head = people || av.branch.base_people;
  const deposit = Number(await getSetting(env, 'deposit.amount', '80000'));

  return ok({
    date, branchId: id,
    basePeople: av.branch.base_people,
    maxPeople: av.branch.max_people,
    extraPrice: av.branch.extra_price,
    deposit,
    closedAllDay: !!av.closedAllDay,
    slots: av.slots.map((s) => {
      const amt = calcAmount(av.branch, s.slot, head);
      return { ...s, ...amt, deposit, balance: Math.max(0, amt.totalAmount - deposit) };
    }),
  });
}
