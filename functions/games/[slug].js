// 게임 센터의 게임별 화면·체험판 — 정적 HTML에 대표 주소와 소유 확인 태그만 보태고 그대로 내보낸다
import { renderStatic } from '../_lib/ssr.js';

export const onRequest = (context) => (['GET', 'HEAD'].includes(context.request.method) ? renderStatic(context) : context.next());
