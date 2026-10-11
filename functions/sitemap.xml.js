// 검색엔진용 사이트맵 — 지점·행사·글 주소를 자동으로 모은다
import { sitemap } from './_lib/ssr.js';

export const onRequestGet = (context) => sitemap(context);
