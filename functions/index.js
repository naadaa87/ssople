// 첫 화면 — 공유 미리보기 주소를 실제 도메인으로 채워서 보낸다
import { renderStatic } from './_lib/ssr.js';

export const onRequest = (context) => (['GET', 'HEAD'].includes(context.request.method) ? renderStatic(context) : context.next());
