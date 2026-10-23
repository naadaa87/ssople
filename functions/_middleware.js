// 모든 요청 앞에서
// 1) 옛 아임웹 주소(/home/?idx=…, /map, /beam …)는 새 주소로 301 이동 — 도메인을 옮겨도 검색 점수가 이어지게
// 2) 정식 도메인이 설정돼 있으면 pages.dev·www 주소를 그쪽으로 보낸다 (API·관리 화면은 제외)
import { canonicalRedirect, isNaverProbe, recordNaverHit, isPreviewBot, recordPreviewHit } from './_lib/seo.js';
import { legacyTarget } from './_lib/legacy.js';

export const onRequest = async (context) => {
  const res = await handle(context);
  // 3) 네이버 소유 확인·수집 요청이 실제로 왔는지 남긴다 (/api/health 의 naver)
  try {
    const url = new URL(context.request.url);
    if (isNaverProbe(context.request, url) && context.waitUntil) context.waitUntil(recordNaverHit(context.env, context.request, url, res.status));
    // 4) 카카오톡 등 링크 미리보기 로봇이 다녀간 기록 (/api/health 의 preview)
    if (isPreviewBot(context.request) && context.waitUntil) context.waitUntil(recordPreviewHit(context.env, context.request, url, res.status));
  } catch { /* 기록 실패는 무시 */ }
  return res;
};

async function handle(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  if ((request.method === 'GET' || request.method === 'HEAD') && !path.startsWith('/api/') && !path.startsWith('/admin')) {
    const to = legacyTarget(url);
    if (to) return Response.redirect(new URL(to, url.origin).toString(), 301);
    try { const r = await canonicalRedirect(context.env, request); if (r) return r; } catch { /* 설정을 못 읽으면 그대로 */ }
  }
  return context.next();
}
