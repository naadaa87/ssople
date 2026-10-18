// 지점 상세 화면 틀은 /room/<코드> 에서만 쓴다
export const onRequestGet = ({ request }) => Response.redirect(new URL('/rooms', request.url).toString(), 302);
