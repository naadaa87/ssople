// 옛 아임웹 홈페이지 주소 → 새 홈페이지 주소 (301 영구 이동)
// ssople.com 을 새 홈페이지로 옮기면 검색엔진에 쌓여 있던 옛 주소가 404가 되지 않고, 쌓아 둔 검색 점수가 새 주소로 넘어가게 한다.
// 옛 주소는 2026년 10월 검색 결과에 잡힌 것 기준. 새로 찾은 옛 주소는 아래 표에 한 줄씩 더하면 된다.

/** 경로만 보고 옮기는 주소 (대소문자 무시, 끝의 / 무시) */
export const LEGACY_PATHS = {
  '/home': '/',
  '/index': '/',
  '/map': '/rooms',
  '/partyroom': '/rooms',
  '/shop_view': '/rooms',
  '/beam': '/rooms?f=projector',
  '/sing': '/rooms?f=karaoke',
  '/game': '/rooms?f=console',
  '/barbeque': '/rooms?f=bbq',
  '/bbq': '/rooms?f=bbq',
  '/big': '/magazine/large-group-partyrooms',
  '/birthday': '/purpose-birthday',
  '/seoul': '/area/seoul',
  '/96': '/area/hongdae',
  '/93': '/area/gyeonggi',
  '/84': '/area/daejeon',
  '/106': '/locations',
  '/suwon': '/area/suwon',
  '/gyeongsangdo': '/area/busan',
  '/ysnep': '/area/seoul',
  '/start': '/startup',
  '/spaceclass': '/academy',
  '/notice': '/community?b=notice',
  '/review': '/community?b=review',
  '/qna': '/community?b=qna',
  '/faq': '/guide#faq',
  '/blog': '/magazine',
};

/** 옛 지점 글(/home/?bmode=view&idx=…) → 새 지점 화면. 지금 운영하지 않는 지점은 가장 가까운 안내로 */
export const LEGACY_POSTS = {
  928829: '/room/S-0010', // 신촌 신촌서강
  1036477: '/room/S-0026', // 분당 달빛정원
  1192776: '/room/S-0025', // 부평 게임 파티룸
  998539: '/area/gyeonggi', // 평택 다올 (지금 목록에 없음)
  1305302: '/locations', // 대구 설렘 (지금 목록에 없음)
  882627: '/locations', // 대구 도심글램핑 (지금 목록에 없음)
};

/** 옛 지역 분류(?category=…) → 새 지역 화면 */
export const LEGACY_CATEGORIES = {
  W2u4m4Z2V1: '/area/gundae', // 건대·잠실·강동구
  '2fu5H8ybkP': '/area/gyeonggi', // 하남·남양주·구리
};

/** _routes.json 에 넣어 함수가 받아야 하는 옛 경로 */
export const LEGACY_ROUTES = Object.keys(LEGACY_PATHS);

/** 옛 주소면 옮길 주소를, 아니면 null */
export function legacyTarget(url) {
  const raw = url.pathname.replace(/\/+$/, '') || '/';
  const path = raw.toLowerCase();
  const q = url.searchParams;
  // 아임웹 첫 화면의 ?mode=privacy / ?mode=policy
  if (path === '/' && q.has('mode')) {
    const m = q.get('mode');
    if (m === 'privacy') return '/privacy';
    if (m === 'policy' || m === 'terms') return '/terms';
    return '/';
  }
  // 옛 게시판 글 (지점 글·공지·이벤트)
  if (q.get('bmode') === 'view' || q.has('idx')) {
    if (path === '/home' || path === '/map') return LEGACY_POSTS[Number(q.get('idx'))] || '/rooms';
    if (path === '/notice') return '/community?b=notice';
    if (path === '/event') return '/event';
    if (path === '/shop_view') return '/rooms';
  }
  if ((path === '/home' || path === '/map') && q.has('category')) return LEGACY_CATEGORIES[q.get('category')] || '/rooms';
  if (path === '/event' && (q.has('q') || q.has('t'))) return '/event';
  return LEGACY_PATHS[path] || null;
}
