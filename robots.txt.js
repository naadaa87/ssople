// 검색엔진 안내 — 사이트맵 주소는 실제 접속한 도메인으로 적는다
export const onRequestGet = ({ request }) => {
  const origin = new URL(request.url).origin;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /mypage',
    'Disallow: /login',
    'Disallow: /signup',
    'Disallow: /i/',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};

export const onRequestHead = onRequestGet;
