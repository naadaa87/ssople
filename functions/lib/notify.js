/* ============================================================
   알림 발송

   알림톡은 카카오와 직접 계약할 수 없고 공식 발송대행사를 거쳐야 합니다.
   대행사 계약 전에는 ALIMTALK_MODE=test 로 두면 실제 발송 없이
   message_logs 에만 남아 문구와 흐름을 그대로 검수할 수 있습니다.

   message_logs 는 호스트 홈페이지가 쓰는 테이블입니다.
   점주가 자기 지점의 발송 이력을 그 화면에서 함께 봅니다.
   ============================================================ */

const TEMPLATES = {
  'WEB-01': {
    title: '예약 확정',
    body: ({ name, code, when, branch, address, deposit, balance, payLine, guestUrl }) =>
`${name}님, 예약이 확정되었습니다.

예약번호 ${code}
일시 ${when}
지점 ${branch}
주소 ${address}
${payLine || `결제하신 예약금 ${deposit}원
현장 잔금 ${balance}원`}${guestUrl ? `

참석자 안내 링크 (함께 오시는 분들께 전달하세요)
${guestUrl}` : ''}

방문 전 이용안내를 확인해 주세요.`,
  },
  'WEB-02': {
    title: '신규 예약 접수',
    body: ({ branch, when, people }) =>
`새 예약이 접수되었습니다.

지점 ${branch}
일시 ${when}
인원 ${people}명`,
  },
  'WEB-03': {
    title: '방문 하루 전 안내',
    body: ({ name, when, address, parking }) =>
`${name}님, 내일 방문 예정입니다.

일시 ${when}
주소 ${address}
주차 ${parking}`,
  },
  'WEB-04': {
    title: '취소 확정',
    body: ({ code, when, refund, note }) =>
`예약이 취소되었습니다.

예약번호 ${code}
일시 ${when}
환불 금액 ${refund}원
${note}`,
  },
  'WEB-06': {
    title: '재예약 감사 쿠폰',
    body: ({ name, branch, title, value, days }) =>
`${name}님, 지난 ${branch} 이용 감사드립니다.

[${title}] ${value} 쿠폰을 드렸어요.
마이페이지 > 쿠폰에서 확인하실 수 있고,
${days}일 안에 어느 지점에서나 쓰실 수 있습니다.

다음 파티도 쏘플이 준비하고 있을게요.`,
  },
  'WEB-05': {
    title: '이용 감사 · 후기 요청',
    body: ({ name, branch, when }) =>
`${name}님, 어제 이용은 어떠셨나요?

${branch}
${when}

다음 이용자에게 도움이 되도록 후기를 남겨주세요.`,
  },
};

export async function notify(env, code, to, vars, opts = {}) {
  const tpl = TEMPLATES[code];
  if (!tpl || !to) return { skipped: true };

  /* 같은 예약·같은 템플릿은 한 번만 */
  if (opts.reservationId) {
    const dup = await env.DB.prepare(
      `SELECT 1 FROM message_logs WHERE reservation_id=? AND template_code=? AND status='sent' LIMIT 1`
    ).bind(opts.reservationId, code).first().catch(() => null);
    if (dup) return { skipped: 'duplicate' };
  }

  const body = tpl.body(vars);
  const mode = (env.ALIMTALK_MODE || 'test').toLowerCase();

  if (mode === 'test') {
    await log(env, { code, to, body, channel: 'ata', status: 'sent', ...opts });
    return { sent: true, mode: 'test', preview: body };
  }

  const ata = await send(env, to, body, true);
  if (ata.ok) { await log(env, { code, to, body, channel: 'ata', status: 'sent', ...opts }); return { sent: true }; }

  const sms = await send(env, to, body, false);
  await log(env, { code, to, body, channel: sms.ok ? 'sms' : 'ata',
    status: sms.ok ? 'sent' : 'failed', error: sms.ok ? `알림톡실패:${ata.reason}` : sms.reason, ...opts });
  return { sent: sms.ok, fallback: sms.ok };
}

async function log(env, { code, to, body, channel, status, error = null, reservationId = null, branchId = null }) {
  try {
    await env.DB.prepare(
      /* 호스트 센터 「발송 내역」과 같은 테이블에 남깁니다.
         branch_id 가 없는 발송(회원 가입 등)은 로그를 남기지 않습니다. */
      `INSERT INTO message_logs (branch_id, reservation_id, sender, template, channel, content, status, created_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'))`
    ).bind(branchId, reservationId, '홈페이지', `${code} ${TEMPLATES[code]?.title || ""}`.trim(),
           channel, `${to} · ${body}`.slice(0, 2000),
           error ? `fail: ${String(error).slice(0, 120)}` : status).run();
  } catch { /* 호스트 스키마 미적용 상태 */ }
}

async function send(env, to, text, isAta) {
  try {
    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: await auth(env) },
      body: JSON.stringify({
        message: {
          to: to.replace(/-/g, ''), from: env.SENDER_PHONE, text: text.slice(0, 2000),
          ...(isAta ? { kakaoOptions: { pfId: env.KAKAO_PFID } } : {}),
        },
      }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` };
  } catch (e) { return { ok: false, reason: String(e) }; }
}

async function auth(env) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SOLAPI_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${hex}`;
}
