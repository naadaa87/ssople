// 모든 요청 앞에서: 정식 도메인이 설정돼 있으면 pages.dev 주소를 그쪽으로 보낸다 (API·관리 화면은 제외)
import { canonicalRedirect } from './_lib/seo.js';

export const onRequest = async (context) => {
  const { request } = context;
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && !path.startsWith('/api/') && !path.startsWith('/admin')) {
    try { const r = await canonicalRedirect(context.env, request); if (r) return r; } catch { /* 설정을 못 읽으면 그대로 */ }
  }
  return context.next();
};
