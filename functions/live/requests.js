// 온라인 파티룸 개선 요청 게시판 — 정적 화면(live/requests.html)에 대표 주소와 소유 확인 태그만 보탠다
import { renderStatic } from '../_lib/ssr.js';

export const onRequest = (context) => (['GET', 'HEAD'].includes(context.request.method) ? renderStatic(context) : context.next());
