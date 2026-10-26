// 지역·동네별 지점 모아 보기 — /area/sinchon, /area/seoul
// 한글 주소(/area/신촌)·대문자·끝 슬래시로 들어오면 정식 주소(/area/sinchon)로 301 — 같은 화면이 여러 주소로 나뉘어 검색되지 않게
import { renderPage, areaMeta } from '../_lib/ssr.js';
import { loadSpaces } from '../_lib/spaces.js';
import { findArea, regionPath, areaPath } from '../_lib/seo.js';

const norm = (p) => { try { return decodeURIComponent(p); } catch { return String(p); } };

export const onRequestGet = async (context) => {
  try {
    const { env, params, request } = context;
    if (env.DB) {
      const a = findArea(params.slug, await loadSpaces(env.DB));
      if (a) {
        const want = a.kind === 'region' ? regionPath(a.name) : areaPath(a.name);
        const url = new URL(request.url);
        if (norm(url.pathname) !== norm(want)) { url.pathname = want; return Response.redirect(url.toString(), 301); }
      }
    }
  } catch { /* DB를 못 읽으면 그대로 그린다 */ }
  return renderPage(context, '/area', areaMeta);
};

export const onRequestHead = onRequestGet;
