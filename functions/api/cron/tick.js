/* ============================================================
   정기 작업

   Cloudflare Pages Functions는 Cron Trigger를 못 받습니다.
   cron-worker/ 를 따로 배포해 10분마다 여기를 부르게 합니다.
   호출은 CRON_SECRET 헤더로만 허용합니다.

   호스트 홈페이지에도 같은 구조의 배치가 있습니다.
   역할이 겹치지 않도록 여기서는 홈페이지 몫만 처리합니다.
     - 이용이 끝난 예약을 completed 로 (호스트가 먼저 했으면 건드리지 않음)
     - 방문 전날 안내, 이용 다음 날 후기 요청
     - 회원등급 재산정
   정산 집계는 호스트가 합니다. 여기서 하지 않습니다.
   ============================================================ */
import { ok, err, kstNow } from '../../lib/core.js';
import { notify } from '../../lib/notify.js';
import { SLOT_LABEL } from '../../lib/booking.js';

export async function onRequest({ request, env }) {
  if (!env.CRON_SECRET || request.headers.get('x-cron-secret') !== env.CRON_SECRET)
    return err('허용되지 않은 요청입니다.', 403);

  const kst = kstNow();
  const hour = kst.getUTCHours();
  const done = [];

  await completeFinished(env, kst);            done.push('예약 상태 정리');
  if (hour === 10) { await remindTomorrow(env, kst); done.push('방문 전날 안내'); }
  if (hour === 11) { await askReview(env, kst);      done.push('후기 요청'); }
  if (hour === 4)  { await recalcGrades(env);        done.push('등급 재산정'); }

  return ok({ ranAt: kst.toISOString(), tasks: done });
}

/* 이용이 끝난 예약 정리 — 밤타임은 익일 새벽에 끝납니다 */
async function completeFinished(env, kst) {
  const today = kst.toISOString().slice(0, 10);
  const h = kst.getUTCHours();
  await env.DB.prepare(
    `UPDATE reservations SET status='completed', updated_at=datetime('now')
      WHERE status='confirmed' AND source='web'
        AND (use_date < date(?, '-1 day')
             OR (use_date = date(?, '-1 day') AND (slot='day' OR ? >= 2))
             OR (use_date = ? AND slot='day' AND ? >= 19))`
  ).bind(today, today, h, today, h).run();
}

async function remindTomorrow(env, kst) {
  const tomorrow = new Date(kst.getTime() + 86400000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT r.*, b.name branch_name, b.address, b.parking_text
       FROM reservations r JOIN branches b ON b.id=r.branch_id
      WHERE r.use_date=? AND r.status='confirmed'`).bind(tomorrow).all();
  for (const r of results) {
    await notify(env, 'WEB-03', r.phone, {
      name: r.name, when: `${r.use_date} ${SLOT_LABEL[r.slot]}`,
      address: r.address || '', parking: r.parking_text || '이용안내를 확인해 주세요',
    }, { reservationId: r.id, branchId: r.branch_id });
  }
}

async function askReview(env, kst) {
  const yesterday = new Date(kst.getTime() - 86400000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT r.*, b.name branch_name FROM reservations r JOIN branches b ON b.id=r.branch_id
      WHERE r.use_date=? AND r.status='completed' AND r.customer_id IS NOT NULL`).bind(yesterday).all();
  for (const r of results) {
    await notify(env, 'WEB-05', r.phone, {
      name: r.name, branch: r.branch_name, when: `${r.use_date} ${SLOT_LABEL[r.slot]}`,
    }, { reservationId: r.id, branchId: r.branch_id });
  }
}

/* 회원등급 — 최근 12개월 실적 */
const ORDER = ['WELCOME', 'FRIENDS', 'SSOPLE+', 'BLACK'];
async function recalcGrades(env) {
  const { results: list } = await env.DB.prepare(
    `SELECT id, grade FROM customers WHERE status='active'`).all();

  for (const u of list) {
    const st = await env.DB.prepare(
      `SELECT COUNT(*) cnt, COALESCE(SUM(total_amount),0) total FROM reservations
        WHERE customer_id=? AND status='completed' AND use_date > date('now','-12 month')`
    ).bind(u.id).first();
    const ns = await env.DB.prepare(
      `SELECT COUNT(*) c FROM reservations
        WHERE customer_id=? AND status='noshow' AND use_date > date('now','-12 month')`
    ).bind(u.id).first();

    const c = st?.cnt || 0, t = st?.total || 0;
    let grade = 'WELCOME';
    if (c >= 10 || t >= 3000000) grade = 'BLACK';
    else if (c >= 5 || t >= 1200000) grade = 'SSOPLE+';
    else if (c >= 2 || t >= 400000) grade = 'FRIENDS';

    grade = ORDER[Math.max(0, ORDER.indexOf(grade) - (ns?.c || 0))];

    if (grade !== u.grade) {
      await env.DB.prepare(`UPDATE customers SET grade=? WHERE id=?`).bind(grade, u.id).run();
      await env.DB.prepare(
        `INSERT INTO customer_grade_logs (customer_id,grade_from,grade_to,reason)
         VALUES (?,?,?,'정기 재산정')`).bind(u.id, u.grade, grade).run();
    }
  }
}
