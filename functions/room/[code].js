// 지점 상세 — /room/S-0001
// 소문자·끝 슬래시(/room/s-0001/)로 들어오면 정식 주소(/room/S-0001)로 301
import { renderPage, roomMeta, edgePage } from '../_lib/ssr.js';
import { ensureSchema } from '../_lib/db.js';
import { loadSpaces, closedTarget } from '../_lib/spaces.js';

// 공개 화면이라 가장자리 캐시로 나눠 써요. 영업 종료(301)는 저장하지 않고, 지점을 고치면 내용 버전이 올라 바로 새로 그려요
export const onRequestGet = (context) => edgePage(context, '/room-detail', () => build(context));

async function build(context) {
  const url = new URL(context.request.url);
  const code = String(context.params.code || '');
  if (/^s-\d{4}$/i.test(code)) {
    const want = '/room/' + code.toUpperCase();
    if (url.pathname !== want) { url.pathname = want; return Response.redirect(url.toString(), 301); }
    // 영업을 마친 지점 — 같은 동네(없으면 같은 권역) 지점 화면으로 301
    try {
      if (context.env.DB) {
        await ensureSchema(context.env);
        const all = await loadSpaces(context.env.DB, { all: true });
        const s = all.find((x) => x.code === want.slice(6));
        if (s && s.closed) return Response.redirect(new URL(closedTarget(s, await loadSpaces(context.env.DB)), url.origin).toString(), 301);
      }
    } catch { /* DB를 못 읽으면 그대로 그린다 */ }
  }
  return renderPage(context, '/room-detail', roomMeta);
}

export const onRequestHead = (context) => build(context);
