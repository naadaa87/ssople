/* ============================================================
   문의 접수 — 홈페이지에서 받은 문의를 본사 대시보드로 바로 보냅니다.

     kind=general    고객 문의  → cust_inquiries (대시보드 「문의 SLA」)
     kind=franchise  창업 상담  → franchise_leads (대시보드 「창업」 파이프라인)

   지금까지는 홈페이지에 전화·카톡 안내만 있어서, 문의가 대시보드에
   기록되지 않고 담당자 배정도 되지 않았습니다.
   ============================================================ */

import { ok, err, readJson, rateLimit, onlyDigits, fmtPhone } from '../lib/core.js';

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await rateLimit(env, `inq:${ip}`, 5, 600)))
    return err('문의가 접수되었습니다. 잠시 후 다시 시도해 주세요.', 429);

  const b = await readJson(request);
  const kind = b.kind === 'franchise' ? 'franchise' : 'general';

  const name = (b.name || '').trim().slice(0, 30);
  const phone = onlyDigits(b.phone || '');
  const body = (b.body || '').trim().slice(0, 1000);

  if (name.length < 2) return err('성함을 입력해 주세요.');
  if (!/^01[016789]\d{7,8}$/.test(phone)) return err('휴대폰 번호를 정확히 입력해 주세요.');
  if (body.length < 5) return err('문의 내용을 조금 더 자세히 적어주세요.');
  if (!b.agree) return err('개인정보 수집·이용에 동의해 주세요.');

  const now = Date.now();

  if (kind === 'franchise') {
    const region = (b.region || '').trim().slice(0, 40);
    try {
      const r = await env.DB.prepare(
        `INSERT INTO franchise_leads (at, name, phone, region, memo, stage, up)
         VALUES (?,?,?,?,?, 'NEW', ?)`
      ).bind(now, name, fmtPhone(phone), region, body, now).run();
      await stamp(env, 'lead', r.meta.last_row_id);
    } catch {
      return err('접수에 실패했습니다. 1544-3523 으로 연락 주시면 바로 도와드리겠습니다.', 503);
    }
    return ok({ received: true, message: '창업 상담 신청이 접수되었습니다. 담당자가 1~2영업일 안에 연락드립니다.' });
  }

  const subject = (b.subject || '홈페이지 문의').trim().slice(0, 60);
  const branchCode = (b.branchCode || '').trim().slice(0, 20) || null;
  try {
    const r = await env.DB.prepare(
      `INSERT INTO cust_inquiries (at, channel, name, phone, branch_code, subject, body, state, up)
       VALUES (?, 'web', ?,?,?,?,?, 'OPEN', ?)`
    ).bind(now, name, fmtPhone(phone), branchCode, subject, body, now).run();
    await stamp(env, 'cinq', r.meta.last_row_id);
  } catch {
    return err('접수에 실패했습니다. 1544-3523 으로 연락 주시면 바로 도와드리겠습니다.', 503);
  }
  return ok({ received: true, message: '문의가 접수되었습니다. 영업시간 기준 하루 안에 답변드립니다.' });
}

/* 대시보드가 증분 동기화로 바로 집어가도록 도장을 찍습니다 */
async function stamp(env, table, id) {
  try {
    await env.DB.prepare(
      `INSERT INTO ops_touch (tbl, rid, up) VALUES (?,?,?)
       ON CONFLICT(tbl, rid) DO UPDATE SET up=excluded.up`
    ).bind(table, String(id), Date.now()).run();
  } catch {}
}
