// /area 만 치면 지역별 지점 안내로 보낸다 (화면 틀은 /area/<지역> 에서만 쓴다)
export const onRequestGet = ({ request }) => Response.redirect(new URL('/locations', request.url).toString(), 302);
