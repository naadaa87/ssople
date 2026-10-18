// 지역·동네별 지점 모아 보기 — /area/sinchon, /area/서울
import { renderPage, areaMeta } from '../_lib/ssr.js';

export const onRequestGet = (context) => renderPage(context, '/area', areaMeta);

export const onRequestHead = onRequestGet;
