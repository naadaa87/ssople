// 지역·동네별 지점 모아 보기 — /area/sinchon, /area/seoul
// 한글 주소(/area/신촌)·대문자·끝 슬래시로 들어오면 정식 주소(/area/sinchon)로 301 — 같은 화면이 여러 주소로 나뉘어 검색되지 않게
import { renderPage, areaMeta } from '../_lib/ssr.js';
import { loadSpaces } from '../_lib/spaces.js';
import { ensureSchema } from '../_lib/db.js';
import { findArea, regionPath, areaPath } from '../_lib/seo.js';
import { REGION_SLUGS, AREA_SLUGS } from '../_lib/slugs.js';

const norm = (p) => { try { return decodeURIComponent(p); } catch { return String(p); } };

export const onRequestGet = async (context) => {
  try {
    const { env, params, request } = context;
    if (env.DB) {
      await ensureSchema(env);
      const open = await loadSpaces(env.DB);
      const a = findArea(params.slug, open);
      if (a) {
        const want = a.kind === 'region' ? regionPath(a.name) : areaPath(a.name);
        const url = new URL(request.url);
        if (norm(url.pathname) !== norm(want)) { url.pathname = want; return Response.redirect(url.toString(), 301); }
      } else {
        // 지점이 모두 영업을 마친 지역·동네(예: 전주) — 같은 권역 화면, 없으면 지역별 지점으로 301
        const key = norm(params.slug).trim().toLowerCase();
        const all = await loadSpaces(env.DB, { all: true });
        const gone = findArea(key, all);
        const known = gone || Object.values(REGION_SLUGS).includes(key) || Object.values(AREA_SLUGS).includes(key);
        if (known) {
          const url = new URL(request.url);
          const reg = gone && gone.kind === 'area' && open.some((s) => s.region === gone.region) ? regionPath(gone.region) : '/locations';
          return Response.redirect(new URL(reg + url.search, url.origin).toString(), 301);
        }
      }
    }
  } catch { /* DB를 못 읽으면 그대로 그린다 */ }
  return renderPage(context, '/area', areaMeta);
};

export const onRequestHead = onRequestGet;
