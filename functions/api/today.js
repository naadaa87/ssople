/* ============================================================
   오늘 · 내일 예약 가능 타임 모아보기 — 기획서 6.1 「오늘 예약 가능」

   막판 수요를 회수하는 홈 화면 모듈입니다.
   지점 전체를 한 번에 훑어야 하므로, 지점별로 가용성 API를
   부르는 대신 두 날짜의 예약 · 휴무 · 홀드를 통으로 읽어서
   서버 안에서 계산합니다. (요청당 쿼리 3번 + KV 목록 1번)
   ============================================================ */

import { ok, kstNow, kstToday } from '../lib/core.js';
import { SLOTS, SLOT_LABEL, slotTime, slotPrice } from '../lib/booking.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const limit = Math.min(Number(u.searchParams.get('limit') || 12), 24);

  const d0 = kstToday();
  const d1 = addDays(d0, 1);
  const nowHour = kstNow().getUTCHours();

  /* 1) 열려 있는 지점 전체 (후기 요약 포함) */
  const { results: branches } = await env.DB.prepare(
    `SELECT b.id, b.name, b.region, b.area, b.address,
            b.day_price, b.night_price, b.base_people, b.max_people,
            b.day_start, b.day_end, b.night_start, b.night_end, b.price_rules,
            (SELECT url FROM branch_photos WHERE branch_id=b.id
              ORDER BY is_main DESC, sort_no LIMIT 1)                        AS photo,
            (SELECT COUNT(*) FROM reviews
              WHERE branch_id=b.id AND hidden=0)                             AS review_count,
            (SELECT ROUND(AVG(rating),1) FROM reviews
              WHERE branch_id=b.id AND hidden=0)                             AS rating
       FROM branches b WHERE b.status='open'`
  ).all().catch(() => ({ results: [] }));

  if (!branches.length) return ok({ branchCount: 0, count: 0, items: [] });

  /* 2) 두 날짜의 살아있는 예약 · 휴무를 한 번에 */
  const { results: taken } = await env.DB.prepare(
    `SELECT branch_id, use_date, slot FROM reservations
      WHERE use_date IN (?, ?) AND status IN ('waiting','confirmed','completed','noshow')`
  ).bind(d0, d1).all();

  /* 휴무 — 지정일 · 요일반복 · 기간 세 가지를 두 날짜에 대해 한 번에 */
  const { results: closed } = await env.DB.prepare(
    `SELECT branch_id, slot,
            CASE WHEN kind='date' THEN date ELSE NULL END AS on_date,
            kind, weekday, start_date, end_date
       FROM closures
      WHERE (kind='date'   AND date IN (?, ?))
         OR (kind='weekly' AND weekday IN (CAST(strftime('%w', ?) AS INTEGER),
                                           CAST(strftime('%w', ?) AS INTEGER)))
         OR (kind='period' AND end_date >= ? AND start_date <= ?)`
  ).bind(d0, d1, d0, d1, d0, d1).all().catch(() => ({ results: [] }));

  const blocked = new Set(taken.map((t) => `${t.branch_id}:${t.use_date}:${t.slot}`));
  const closedAll = new Set();
  const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
  for (const c of closed) {
    /* 이 휴무가 두 날짜 중 어디에 걸리는지 */
    const hits = [d0, d1].filter((d) =>
      c.kind === 'date'   ? c.on_date === d
    : c.kind === 'weekly' ? c.weekday === dow(d)
    : /* period */          c.start_date <= d && d <= c.end_date);
    for (const d of hits) {
      if (!c.slot || c.slot === 'all') closedAll.add(`${c.branch_id}:${d}`);
      else blocked.add(`${c.branch_id}:${d}:${c.slot}`);
    }
  }

  /* 3) 결제 진행 중 홀드 */
  try {
    const holds = await env.KV.list({ prefix: 'hold:' });
    for (const k of holds.keys) {
      const [, branchId, date, slot] = k.name.split(':');
      if (date === d0 || date === d1) blocked.add(`${branchId}:${date}:${slot}`);
    }
  } catch { /* KV가 없으면 홀드 없이 계산 */ }

  /* 4) 빈 슬롯 수집 — 오늘은 아직 시작하지 않은 타임만 */
  const items = [];
  for (const date of [d0, d1]) {
    for (const b of branches) {
      if (closedAll.has(`${b.id}:${date}`)) continue;
      for (const s of SLOTS) {
        if (blocked.has(`${b.id}:${date}:${s}`)) continue;
        const t = slotTime(b, s);
        if (date === d0 && nowHour >= t.start) continue;   // 이미 시작한 타임
        const price = slotPrice(b, s, date);
        if (!price) continue;
        items.push({
          branchId: b.id, name: b.name,
          region: b.region || '', area: b.area || '',
          photo: b.photo || null,
          rating: b.rating, reviewCount: b.review_count,
          basePeople: b.base_people, maxPeople: b.max_people,
          date, dateLabel: date === d0 ? '오늘' : '내일',
          slot: s, slotLabel: SLOT_LABEL[s], time: t.label,
          start: t.start, price,
        });
      }
    }
  }

  /* 오늘 먼저 → 이른 타임 먼저 → 후기 많은 지점 먼저 */
  items.sort((a, c) =>
    a.date !== c.date ? (a.date < c.date ? -1 : 1)
    : a.start !== c.start ? a.start - c.start
    : (c.reviewCount || 0) - (a.reviewCount || 0));

  return ok({
    branchCount: branches.length,
    count: items.length,
    items: items.slice(0, limit),
  });
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
