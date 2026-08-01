/* 후기 작성 — 이용이 끝난 예약에만, 1건당 1개 */
import { ok, err, readJson, requireCustomer, getSetting } from '../../lib/core.js';

export async function onRequestPost({ request, env }) {
  const { session, error } = await requireCustomer(env, request);
  if (error) return error;
  const b = await readJson(request);
  const resId = Number(b.reservationId);
  const rating = Number(b.rating);
  const content = (b.content || '').trim();

  if (!resId || !(rating >= 1 && rating <= 5) || content.length < 10)
    return err('별점과 10자 이상의 내용을 입력해 주세요.');

  const r = await env.DB.prepare(
    `SELECT * FROM reservations WHERE id=? AND customer_id=?`).bind(resId, session.customerId).first();
  if (!r) return err('예약을 찾을 수 없습니다.', 404);
  if (r.status !== 'completed') return err('이용이 끝난 예약에만 후기를 남길 수 있습니다.');

  const days = Number(await getSetting(env, 'review.write_days', '30'));
  const limit = new Date(new Date(`${r.use_date}T00:00:00Z`).getTime() + days * 86400000);
  if (new Date() > limit) return err(`이용 후 ${days}일이 지나 후기를 남길 수 없습니다.`);

  const dup = await env.DB.prepare(`SELECT 1 FROM reviews WHERE reservation_id=?`).bind(resId).first();
  if (dup) return err('이미 후기를 남기셨습니다.');

  await env.DB.prepare(
    `INSERT INTO reviews (reservation_id, customer_id, branch_id, rating, content, photos)
     VALUES (?,?,?,?,?,?)`
  ).bind(resId, session.customerId, r.branch_id, rating, content,
         b.photos ? JSON.stringify(b.photos) : null).run();

  return ok({ written: true });
}
