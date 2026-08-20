/* ============================================================
   게스트 안내 — 참석자가 링크 하나로 모임 정보를 봅니다.
   로그인이 없는 공개 화면이라, 보여줄 것과 감출 것을 분명히 합니다.

   보여줍니다   지점 이름 · 주소 · 일시 · 주차 · 이용 수칙 · 인원 규모
   감춥니다     예약자 연락처 · 결제 금액 · 출입 방법(도어락)
               — 출입 정보는 예약 확정 고객에게만 갑니다 (기획서 권한 원칙)
   ============================================================ */

import { ok, err, getSetting, rateLimit, kstToday } from '../../lib/core.js';
import { SLOT_LABEL, slotTime } from '../../lib/booking.js';

export async function onRequestGet({ params, request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await rateLimit(env, `guest:${ip}`, 60, 600)))
    return err('요청이 너무 잦습니다. 잠시 후 다시 열어주세요.', 429);

  if ((await getSetting(env, 'guest.page.enabled', '1')) !== '1')
    return err('안내 페이지가 잠시 닫혀 있습니다.', 503);

  const token = String(params.token || '').trim();
  if (!/^[A-Za-z0-9]{8,64}$/.test(token)) return err('잘못된 링크입니다.', 400);

  const r = await env.DB.prepare(
    `SELECT r.code, r.use_date, r.slot, r.status, r.name,
            r.people_base, r.people_extra,
            b.name branch_name, b.address, b.region, b.area,
            b.parking_text, b.guide_text, b.max_people,
            b.day_start, b.day_end, b.night_start, b.night_end
       FROM reservations r JOIN branches b ON b.id = r.branch_id
      WHERE r.guest_token = ?`
  ).bind(token).first();

  if (!r) return err('안내를 찾을 수 없습니다. 링크를 다시 확인해 주세요.', 404);

  const t = slotTime(r, r.slot);
  return ok({
    guest: {
      status: r.status,                       /* confirmed | completed | canceled … */
      hostName: mask(r.name),
      branchName: r.branch_name,
      region: r.region, area: r.area,
      address: r.address,
      useDate: r.use_date,
      slot: r.slot, slotLabel: SLOT_LABEL[r.slot], slotTime: t.label,
      startHour: t.start, endHour: t.end,     /* 캘린더 파일 생성용 (24 넘으면 익일) */
      people: (r.people_base || 0) + (r.people_extra || 0),
      maxPeople: r.max_people,
      parking: r.parking_text || null,
      guide: r.guide_text || null,
      past: r.use_date < kstToday(),
      csPhone: env.CS_PHONE || '1544-3523',
    },
  });
}

const mask = (n) => {
  if (!n) return '예약자';
  if (n.length <= 1) return n;
  if (n.length === 2) return n[0] + '*';
  return n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
};
