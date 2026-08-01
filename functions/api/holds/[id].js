/* 홀드 해제 — 결제창을 닫거나 뒤로 갔을 때 */
import { ok, requireCustomer } from '../../lib/core.js';
import { releaseHold } from '../../lib/booking.js';

export async function onRequestDelete({ params, request, env }) {
  const { error } = await requireCustomer(env, request);
  if (error) return error;
  await releaseHold(env, params.id);
  return ok({ released: true });
}
/* 페이지를 떠날 때 sendBeacon 으로도 풀 수 있게 */
export async function onRequestPost({ params, request, env }) {
  await releaseHold(env, params.id);
  return ok({ released: true });
}
