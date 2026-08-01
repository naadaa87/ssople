/* 비회원 예약 조회 — 예약번호 + 연락처
   카카오 챗봇이 "예약 조회" 버튼으로 이 화면(/lookup.html)을 링크합니다. */
import { ok, err, readJson, onlyDigits, kstToday, rateLimit } from '../../lib/core.js';
import { judgeRefund, SLOT_LABEL, slotTime } from '../../lib/booking.js';

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await rateLimit(env, `lookup:${ip}`, 20, 600)))
    return err('조회가 너무 잦습니다. 잠시 후 다시 시도해 주세요.', 429);

  const b = await readJson(request);
  const code = (b.code || '').trim().toUpperCase();
  const phone = onlyDigits(b.phone);
  if (!code || phone.length < 10) return err('예약번호와 연락처를 확인해 주세요.');

  const r = await env.DB.prepare(
    `SELECT r.*, br.name branch_name, br.address, br.parking_text, br.access_info, br.phone branch_phone,
            br.day_start, br.day_end, br.night_start, br.night_end
       FROM reservations r JOIN branches br ON br.id=r.branch_id
      WHERE r.code=? AND REPLACE(r.phone,'-','')=?`
  ).bind(code, phone).first();

  if (!r) return err('일치하는 예약이 없습니다. 예약번호와 연락처를 다시 확인해 주세요.', 404);

  const today = kstToday();
  const refund = r.status === 'confirmed' ? await judgeRefund(env, r.use_date, r.deposit_amount) : null;
  const t = slotTime(r, r.slot);

  return ok({
    reservation: {
      code: r.code, status: r.status,
      branchName: r.branch_name, address: r.address,
      parking: r.parking_text, branchPhone: r.branch_phone,
      useDate: r.use_date, slotLabel: SLOT_LABEL[r.slot], slotTime: t.label,
      people: (r.people_base || 0) + (r.people_extra || 0),
      totalAmount: r.total_amount, deposit: r.deposit_amount,
      balance: Math.max(0, r.total_amount - r.deposit_amount),
      accessInfo: r.status === 'confirmed' && r.use_date === today ? r.access_info : null,
      refund,
    },
  });
}
