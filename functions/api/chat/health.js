/* 챗봇 연결 점검
   브라우저에서 /api/chat/health 를 열어 확인합니다.
   챗봇 서버의 /health 를 그대로 물어보고 결과를 돌려줍니다. */
import { ok } from '../../lib/core.js';

export async function onRequestGet({ env }) {
  if (!env.CHATBOT_URL)
    return ok({ connected: false, reason: 'CHATBOT_URL 이 비어 있습니다. wrangler.toml 을 확인해 주세요.' });

  const base = String(env.CHATBOT_URL).replace(/\/+$/, '');
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(base + '/health', { signal: ctl.signal });
    const text = (await res.text()).slice(0, 500);
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return ok({
      connected: res.ok, status: res.status,
      tookMs: Date.now() - started,
      url: base, skillPath: env.CHATBOT_PATH || '/skill',
      bot: body,
    });
  } catch (e) {
    return ok({ connected: false, url: base, tookMs: Date.now() - started,
      reason: String(e).includes('abort') ? '응답이 8초 안에 오지 않았습니다.' : '연결하지 못했습니다.' });
  } finally { clearTimeout(timer); }
}
