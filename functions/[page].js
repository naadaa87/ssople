// 지점 찾기·행사·모임 같은 고정 화면 — _routes.json에 적힌 주소만 이 파일을 거친다
import { renderStatic } from './_lib/ssr.js';

export const onRequest = (context) => (['GET', 'HEAD'].includes(context.request.method) ? renderStatic(context) : context.next());
