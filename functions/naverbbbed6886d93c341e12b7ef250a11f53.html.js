// 네이버 서치어드바이저 소유 확인 파일 (HTML 파일 업로드 방식) — https://ssople.com/naverbbbed6886d93c341e12b7ef250a11f53.html
// 정적 .html 파일로 두면 Cloudflare Pages가 확장자 없는 주소로 옮겨 버려서, 같은 주소에서 바로 내용을 돌려준다
const BODY = 'naver-site-verification: naverbbbed6886d93c341e12b7ef250a11f53.html';
export const onRequestGet = () => new Response(BODY, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
export const onRequestHead = onRequestGet;
