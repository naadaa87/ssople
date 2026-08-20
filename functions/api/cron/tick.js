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
import { ok, err, kstNow, getSetting } from '../../lib/core.js';
import { notify } from '../../lib/notify.js';
import { SLOT_LABEL } from '../../lib/booking.js';

export async function onRequest({ request, env }) {
  if (!env.CRON_SECRET || request.headers.get('x-cron-secret') !== env.CRON_SECRET)
    return err('허용되지 않은 요청입니다.', 403);

  const kst = kstNow();
  const hour = kst.getUTCHours();
  const done = [];

  await completeFinished(env, kst);            done.push('예약 상태 정리');
  await earnPoints(env);                       done.push('이용 완료 적립');
  await pullDashPoints(env);                   done.push('본사 포인트 조정 반영');
  if (hour === 10) { await remindTomorrow(env, kst); done.push('방문 전날 안내'); }
  if (hour === 11) { await askReview(env, kst);      done.push('후기 요청'); }
  if (hour === 11) { await issueRebookCoupons(env, kst); done.push('재예약 쿠폰'); }
  if (hour === 4)  { await expirePoints(env);  done.push('포인트 만료'); }
  if (hour === 4)  { await recalcGrades(env);  done.push('등급 재산정'); }

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

/* ------------------------------------------------------------
   이용 완료 적립 — 결제액(대관료 실부담분)의 등급별 % 를 쌓습니다.
   보증금은 돌려받는 돈이라 적립 대상이 아닙니다. (기획서 3.3)
   같은 예약에 두 번 쌓이지 않도록 원장을 먼저 확인합니다.
   ------------------------------------------------------------ */
async function earnPoints(env) {
  let rows;
  try {
    ({ results: rows } = await env.DB.prepare(
      `SELECT r.id, r.code, r.customer_id, r.total_amount, r.coupon_discount, r.point_used,
              c.grade
         FROM reservations r JOIN customers c ON c.id = r.customer_id
        WHERE r.status='completed' AND r.source='web' AND r.customer_id IS NOT NULL
          AND r.use_date >= date('now','-7 day')
          AND NOT EXISTS (SELECT 1 FROM points p
                           WHERE p.reservation_id=r.id AND p.reason='earn')`
    ).all());
  } catch { return; }   /* points 테이블 미생성 */

  if (!rows.length) return;
  const months = Number(await getSetting(env, 'points.expire_months', '12'));

  for (const r of rows) {
    const grade = (r.grade || 'WELCOME').toUpperCase();
    const rate = Number(await getSetting(env, `points.earn.${grade}`, '5'));
    const base = Math.max(0, (r.total_amount || 0) - (r.coupon_discount || 0) - (r.point_used || 0));
    const amount = Math.floor((base * rate) / 100);
    if (!amount) continue;
    await env.DB.prepare(
      `INSERT INTO points (customer_id, amount, reason, reservation_id, expires_at, memo)
       VALUES (?,?,'earn',?, datetime('now', ?), ?)`
    ).bind(r.customer_id, amount, r.id, `+${months} months`,
           `예약 ${r.code} 이용 적립 (${rate}%)`).run();
  }
}

/* ------------------------------------------------------------
   본사 대시보드에서 수동으로 지급·차감한 포인트를 고객 잔액에 반영합니다.
   대시보드는 cust_points 에 전화번호 기준으로 기록하므로,
   아직 옮기지 않은 행(synced=0)만 골라 고객 원장(points)으로 넘깁니다.
   ------------------------------------------------------------ */
async function pullDashPoints(env) {
  let rows;
  try {
    ({ results: rows } = await env.DB.prepare(
      `SELECT cp.id, cp.amount, cp.memo, cp.kind, cp.actor, c.id AS customer_id
         FROM cust_points cp
         JOIN customers c ON REPLACE(c.phone,'-','') = REPLACE(cp.phone,'-','')
        WHERE cp.synced = 0 AND cp.kind = 'adjust'
        LIMIT 200`).all());
  } catch { return; }   /* 대시보드 테이블 미생성 */

  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO points (customer_id, amount, reason, memo)
       VALUES (?,?,'admin',?)`
    ).bind(r.customer_id, r.amount, `본사 조정${r.actor ? ` (${r.actor})` : ''}${r.memo ? ` · ${r.memo}` : ''}`).run();
    await env.DB.prepare(`UPDATE cust_points SET synced = 1 WHERE id = ?`).bind(r.id).run();
  }
}

/* ------------------------------------------------------------
   재예약 쿠폰 — 이용 완료 3일 뒤 자동 발급 + 안내 (기획서 3.3)
   ------------------------------------------------------------ */
async function issueRebookCoupons(env, kst) {
  let couponId, afterDays;
  try {
    couponId = Number(await getSetting(env, 'coupon.rebook.coupon_id', '0'));
    afterDays = Number(await getSetting(env, 'coupon.rebook.after_days', '3'));
  } catch { return; }
  if (!couponId) return;

  const target = new Date(kst.getTime() - afterDays * 86400000).toISOString().slice(0, 10);
  let rows, coupon;
  try {
    coupon = await env.DB.prepare(
      `SELECT id, title, kind, value, valid_days FROM coupons WHERE id=? AND status='active'`
    ).bind(couponId).first();
    if (!coupon) return;
    ({ results: rows } = await env.DB.prepare(
      `SELECT r.id, r.code, r.customer_id, r.phone, r.name, b.name branch_name
         FROM reservations r JOIN branches b ON b.id=r.branch_id
        WHERE r.use_date=? AND r.status='completed' AND r.customer_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM coupon_issues ci
                           WHERE ci.customer_id=r.customer_id AND ci.coupon_id=?
                             AND ci.issued_at >= r.use_date)`
    ).bind(target, couponId).all());
  } catch { return; }

  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO coupon_issues (coupon_id, customer_id, expires_at)
       VALUES (?,?, datetime('now', ?))`
    ).bind(couponId, r.customer_id, `+${coupon.valid_days || 60} days`).run();

    const value = coupon.kind === 'percent' ? `${coupon.value}%` : `${Number(coupon.value).toLocaleString()}원`;
    await notify(env, 'WEB-06', r.phone, {
      name: r.name, branch: r.branch_name, title: coupon.title,
      value, days: coupon.valid_days || 60,
    }, { reservationId: r.id });
  }
}

/* ------------------------------------------------------------
   포인트 만료 — 유효기한이 지난 적립분을 소멸 처리합니다.
   사용분이 오래된 적립부터 깎아 나간다고 보고(선입선출),
   만료 합계에서 사용 · 기존 소멸을 뺀 만큼만 소멸시킵니다.
   ------------------------------------------------------------ */
async function expirePoints(env) {
  let rows;
  try {
    ({ results: rows } = await env.DB.prepare(
      `SELECT customer_id,
              SUM(CASE WHEN amount>0 AND expires_at IS NOT NULL AND expires_at<=datetime('now')
                       THEN amount ELSE 0 END)                       AS expired_earn,
              SUM(CASE WHEN reason='use'    THEN -amount ELSE 0 END) AS used,
              SUM(CASE WHEN reason='expire' THEN -amount ELSE 0 END) AS already,
              SUM(amount)                                            AS balance
         FROM points GROUP BY customer_id
       HAVING expired_earn > 0 AND balance > 0`
    ).all());
  } catch { return; }

  for (const r of rows) {
    const toExpire = Math.min(
      Math.max(0, (r.expired_earn || 0) - (r.used || 0) - (r.already || 0)),
      r.balance || 0);
    if (!toExpire) continue;
    await env.DB.prepare(
      `INSERT INTO points (customer_id, amount, reason, memo)
       VALUES (?,?,'expire','유효기간 만료 소멸')`
    ).bind(r.customer_id, -toExpire).run();
  }
}

/* ------------------------------------------------------------
   회원등급 — 확정 규정 (기획서 3.3)
   최근 12개월 이용 완료 횟수 기준: 2회 실버 · 4회 골드
   노쇼가 있으면 한 단계 내립니다.
   ------------------------------------------------------------ */
const ORDER = ['WELCOME', 'SILVER', 'GOLD'];
async function recalcGrades(env) {
  const silverAt = Number(await getSetting(env, 'grade.silver.year_count', '2'));
  const goldAt = Number(await getSetting(env, 'grade.gold.year_count', '4'));

  const { results: list } = await env.DB.prepare(
    `SELECT id, grade FROM customers WHERE status='active'`).all();

  for (const u of list) {
    const st = await env.DB.prepare(
      `SELECT COUNT(*) cnt FROM reservations
        WHERE customer_id=? AND status='completed' AND use_date > date('now','-12 month')`
    ).bind(u.id).first();
    const ns = await env.DB.prepare(
      `SELECT COUNT(*) c FROM reservations
        WHERE customer_id=? AND status='noshow' AND use_date > date('now','-12 month')`
    ).bind(u.id).first();

    const c = st?.cnt || 0;
    let grade = c >= goldAt ? 'GOLD' : c >= silverAt ? 'SILVER' : 'WELCOME';
    grade = ORDER[Math.max(0, ORDER.indexOf(grade) - (ns?.c || 0))];

    if (grade !== (u.grade || 'WELCOME')) {
      await env.DB.prepare(`UPDATE customers SET grade=? WHERE id=?`).bind(grade, u.id).run();
      await env.DB.prepare(
        `INSERT INTO customer_grade_logs (customer_id,grade_from,grade_to,reason)
         VALUES (?,?,?,'정기 재산정')`).bind(u.id, u.grade, grade).run();
    }
  }
}
