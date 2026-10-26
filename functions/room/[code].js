// 지점 상세 — /room/S-0001
// 소문자·끝 슬래시(/room/s-0001/)로 들어오면 정식 주소(/room/S-0001)로 301
import { renderPage, roomMeta } from '../_lib/ssr.js';

export const onRequestGet = (context) => {
  const url = new URL(context.request.url);
  const code = String(context.params.code || '');
  if (/^s-\d{4}$/i.test(code)) {
    const want = '/room/' + code.toUpperCase();
    if (url.pathname !== want) { url.pathname = want; return Response.redirect(url.toString(), 301); }
  }
  return renderPage(context, '/room-detail', roomMeta);
};

export const onRequestHead = onRequestGet;
