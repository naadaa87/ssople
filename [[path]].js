// 쏘플파티룸 고객 홈페이지 API — 모든 /api/* 요청의 입구
import { handle } from '../_lib/router.js';

export const onRequest = (context) => handle(context);
