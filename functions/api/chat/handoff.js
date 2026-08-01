/* 상담원 연결
   카카오 채널이 있으면 그쪽으로 보냅니다. 채널 상담이 가장 빠릅니다. */
import { ok, readJson } from '../../lib/core.js';

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (b.sessionId) {
    await env.DB.prepare(
      `UPDATE chat_logs SET handoff=1 WHERE id=(SELECT MAX(id) FROM chat_logs WHERE session_id=?)`
    ).bind(b.sessionId).run().catch(() => {});
  }
  return ok({
    kakao: env.KAKAO_CHANNEL_URL || null,
    phone: env.CS_PHONE || '1544-3523',
    hours: env.CS_HOURS || '평일 10:00 ~ 19:00',
  });
}
