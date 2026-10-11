// 파티 초대장 — /i/abcd1234
import { renderPage, inviteMeta } from '../_lib/ssr.js';

export const onRequestGet = (context) => renderPage(context, '/invite-view', inviteMeta);
