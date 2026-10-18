// 파티 가이드 글 화면 — 정적 HTML에 소유 확인 태그만 보태고 그대로 내보낸다
import { renderStatic } from '../_lib/ssr.js';

export const onRequest = (context) => (['GET', 'HEAD'].includes(context.request.method) ? renderStatic(context) : context.next());
