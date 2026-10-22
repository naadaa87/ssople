// 모든 요청 앞에서
// 1) 옛 아임웹 주소(/home/?idx=…, /map, /beam …)는 새 주소로 301 이동 — 도메인을 옮겨도 검색 점수가 이어지게
// 2) 정식 도메인이 설정돼 있으면 pages.dev·www 주소를 그쪽으로 보낸다 (API·관리 화면은 제외)
import { canonicalRedirect } from './_lib/seo.js';
import { legacyTarget } from './_lib/legacy.js';

export const onRequest = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  if ((request.method === 'GET' || request.method === 'HEAD') && !path.startsWith('/api/') && !path.startsWith('/admin')) {
    const to = legacyTarget(url);
    if (to) return Response.redirect(new URL(to, url.origin).toString(), 301);
    try { const r = await canonicalRedirect(context.env, request); if (r) return r; } catch { /* 설정을 못 읽으면 그대로 */ }
  }
  return context.next();
};
