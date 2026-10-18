// 행사 상세 — /e/12
import { renderPage, eventMeta } from '../_lib/ssr.js';

export const onRequestGet = (context) => renderPage(context, '/event-view', eventMeta);

export const onRequestHead = onRequestGet;
