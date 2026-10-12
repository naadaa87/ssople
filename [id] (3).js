// 커뮤니티 글 — /c/34
import { renderPage, postMeta } from '../_lib/ssr.js';

export const onRequestGet = (context) => renderPage(context, '/post', postMeta);

export const onRequestHead = onRequestGet;
