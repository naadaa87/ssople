// 모임 상세 — /m/5
import { renderPage, meetupMeta } from '../_lib/ssr.js';

export const onRequestGet = (context) => renderPage(context, '/meetup', meetupMeta);

export const onRequestHead = onRequestGet;
