// 검색엔진 안내 — 사이트맵 주소는 대표 주소(도메인 연결 뒤 ssople.com, 그 전엔 접속한 주소)로 적는다
import { getSettings } from './_lib/db.js';
import { domainLive } from './_lib/seo.js';
import { siteBase } from './_lib/ssr.js';

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  let st = {};
  try { if (env && env.DB) st = await getSettings(env.DB); } catch { st = {}; }
  const origin = siteBase(url, st, await domainLive(env));
  const body = [
    'User-agent: *',
    // 지점·후기 사진은 /api/img/ 로 나간다 — 사진은 이미지 검색·검색 결과 썸네일에 쓰이도록 열어 두고, 나머지 /api/ 는 막는다
    'Allow: /api/img/',
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
