/* 후기 작성 — 이용이 끝난 예약에만, 1건당 1개.
   사진을 함께 올리면 추가 포인트가 쌓입니다. (기획서 6.1 「사진 리뷰」) */
import { ok, err, readJson, requireCustomer, getSetting, ownerNotify, resLog } from '../../lib/core.js';

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

  /* 사진은 우리 저장소 경로만 받습니다 (외부 주소 차단) */
  let photos = Array.isArray(b.photos) ? b.photos.slice(0, 3) : [];
  photos = photos.filter((u) => typeof u === 'string' && u.startsWith('/api/photos/reviews/'));

  /* 호스트 센터가 읽는 컬럼(writer · reservation_code · hidden)까지 함께 채웁니다.
     그래야 점주가 답글을 달고 신고 처리를 할 수 있습니다. */
  const ins = await env.DB.prepare(
    `INSERT INTO reviews
       (branch_id, reservation_code, writer, rating, content, photos,
        report_status, hidden, reservation_id, customer_id)
     VALUES (?,?,?,?,?,?, 'none', 0, ?, ?)`
  ).bind(r.branch_id, r.code, r.name || '고객', rating, content,
         JSON.stringify(photos), resId, session.customerId).run();

  /* 점주 알림 · 예약 이력 */
  await ownerNotify(env, r.branch_id, {
    type: 'review', title: `새 후기가 등록되었습니다 (별점 ${rating})`,
    body: content.slice(0, 60), link: '/owner/reviews.html',
  });
  await resLog(env, resId, '고객', '후기 작성', `별점 ${rating}${photos.length ? ` · 사진 ${photos.length}장` : ''}`);

  /* 사진 후기 추가 적립 — 원장에 남습니다 */
  let bonus = 0;
  if (photos.length) {
    try {
      bonus = Number(await getSetting(env, 'points.review_photo_bonus', '2000'));
      const months = Number(await getSetting(env, 'points.expire_months', '12'));
      if (bonus > 0) {
        await env.DB.prepare(
          `INSERT INTO points (customer_id, amount, reason, reservation_id, review_id, expires_at, memo)
           VALUES (?,?,'review_photo',?,?, datetime('now', ?), '사진 후기 적립')`
        ).bind(session.customerId, bonus, resId, ins.meta.last_row_id, `+${months} months`).run();
      }
    } catch { bonus = 0; }
  }

  return ok({ written: true, photoBonus: bonus });
}
