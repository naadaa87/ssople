// 파티팀 모집글 — /t/7
import { renderPage, crewMeta } from '../_lib/ssr.js';

export const onRequestGet = (context) => renderPage(context, '/crew-view', crewMeta);
