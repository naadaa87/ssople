// 지점 상세 — /room/S-0001
import { renderPage, roomMeta } from '../_lib/ssr.js';

export const onRequestGet = (context) => renderPage(context, '/room-detail', roomMeta);

export const onRequestHead = onRequestGet;
