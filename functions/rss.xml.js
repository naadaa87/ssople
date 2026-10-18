// 네이버 서치어드바이저 RSS 제출용 — 행사·커뮤니티 새 글을 최근 순으로 내보낸다
import { rss } from './_lib/ssr.js';

export const onRequestGet = (context) => rss(context);

export const onRequestHead = onRequestGet;
