# 쏘플파티룸 고객 홈페이지

전국 쏘플파티룸 지점 정보와 요금을 보여 주고, 예약은 **네이버 예약**으로 연결하는 고객용 홈페이지예요.
커뮤니티, 모임, 파티팀 모집, 행사, 놀이터(파티 도구), 초대장, 쏘플 클럽(멤버십), 제휴·협업, 호스트 센터(공간 등록·위탁운영), 창업안내, 공간 아카데미, 파티 가이드(글 83편), 파티게임 센터, 온라인 파티룸, 브랜드·창업자 이야기까지 한 사이트에 담았어요.

- 예약·결제·취소: 네이버 예약에서 해요. 이 홈페이지는 결제를 받지 않아요.
- 예약 버튼: 패키지별 네이버 예약 상품 → 지점 네이버 예약 페이지 → 네이버 지도 순서로 연결해요. (운영지점리스트 2026.10.11 기준)
- 예약 가능 표시: 네이버 예약과 자동 연동이 없어서, 관리자 화면에서 네이버 예약 엑셀을 올리거나 직접 방막기로 채웠을 때만 보여요.
- 호스트 프로그램: 호스트가 공간을 등록(플러스존·프리미엄존)하거나 위탁운영을 신청하면 관리자가 지점을 만들고 회원에게 호스트 권한을 줘요. 호스트는 `/myspace`에서 지점 정보·사진·소식을 직접 관리해요.
- 운영: `/admin` 관리 화면에서 방막기, 엑셀 올리기, 지점·행사·커뮤니티·회원·호스트·설정 관리를 해요.

## 배포

배포 안내서와 운영 안내서는 전달한 ZIP의 `docs` 폴더에 따로 들어 있어요. 내부 운영 내용이라 저장소(=공개 홈페이지)에는 올리지 않아요. 요약하면:

1. Cloudflare D1 `ssople-web`과 Pages Secret `ADMIN_PASSWORD`는 이미 준비돼 있고, `wrangler.toml`에 Database ID도 들어 있어요
2. GitHub 웹 업로드는 한 번에 100개까지라 네 번에 나눠 올려요: ① `assets`·`magazine`을 뺀 전부(화면·설정 파일·`functions`) ② `magazine` 폴더 ③ `assets` 폴더 안에서 `img`·`media` ④ `assets` 폴더 안에서 `js`·`app.css`·`admin.css`·`app.js`
3. `/api/health`, `/magazine`, `/host`, `/academy`, `/startup`, `/area/sinchon`, `/sitemap.xml`, `/admin`에서 확인
4. 네이버 서치어드바이저·구글 서치 콘솔·다음 검색등록 (`docs/SEO-GUIDE.md`)

## 온라인 파티룸 (/live)

링크 하나로 모여 아바타로 노는 온라인 파티룸이에요. 화면은 이 홈페이지(`/live/...`)에서 열리고, 여러 사람이 실시간으로 함께 노는 부분만 따로 올린 **실시간 서버(Cloudflare Workers `ssople-live`)**가 맡아요.

| 주소 | 화면 |
|---|---|
| `/live` | 소개 화면 (검색 노출용, 공개 파티룸 목록·랭킹·최근 요청) |
| `/live/play` | 로비 — 출석, 미션, 내 캐릭터, 바로가기, 공개 파티룸 목록 |
| `/live/home` · `/live/studio` | 내 집 꾸미기(펫과 함께) · 내 파티룸 꾸미기 |
| `/live/arcade` | 오락실 — 미니게임 8종과 랭킹 |
| `/live/r/방코드` · `/live/tv/방코드` | 파티룸 입장 · TV 화면 |
| `/live/square` · `/live/demo` | 쏘플 스퀘어 · 가상 친구와 체험 방 |
| `/live/requests` | 개선 요청 게시판 (관리자 → 온라인 파티룸에서 답변·상태 변경) |

- 코인·미션·펫·꾸민 집 같은 내 정보는 로그인한 회원이면 이 홈페이지 DB(`live_profiles`)에, 손님이면 그 브라우저에 저장돼요. 규칙은 `live/shared/progress.js` 하나를 화면과 서버가 같이 써요. 코인은 게임 안에서만 쓰는 포인트예요.
- 실시간 서버가 없으면(관리자 설정의 주소가 비어 있으면) 내 집·펫·오락실·체험 방만 열리고, 친구 초대와 공개 파티룸은 닫혀요.

### 실시간 서버 올리기 (처음 한 번)

1. Cloudflare → Workers & Pages → 만들기 → Workers → **Git 저장소 가져오기**에서 이 저장소를 고르고, **루트 디렉터리**를 `live-server` 로 적어요. 이름은 `ssople-live`. 빌드 명령은 비워 두고, 배포 명령은 `npx wrangler deploy` 예요.
2. 배포된 Worker → 설정 → 변수 및 비밀:
   - `ADMIN_PASSWORD` (비밀) — 실시간 서버 관리 화면(`/admin`) 비밀번호
   - `ANTHROPIC_API_KEY` (비밀, 선택) — 넣으면 AI MC가 진행 멘트를 만들어요. 없으면 기본 멘트로 진행해요
   - `HOME_URL` (선택) — 기본값 `https://ssople.com`
   - `ALLOWED_ORIGINS` (선택) — 홈페이지 말고 다른 주소에서도 부를 때만. 기본으로 `ssople.com`, `www.ssople.com`, `ssople.pages.dev`(미리 보기 포함)를 허용해요
3. 홈페이지 관리자 → **온라인 파티룸** → 「실시간 서버 주소」에 `https://ssople-live.계정이름.workers.dev` 를 넣고 저장 → 「서버 연결 확인」.
4. 카카오톡 공유 버튼을 쓰려면 Worker 변수 `KAKAO_JS_KEY` 를 넣고, 카카오 개발자 콘솔의 사이트 도메인에 `https://ssople.com` 을 등록해요.

`live-server` 폴더를 고치면 Worker가, 나머지를 고치면 홈페이지가 다시 올라가요. 테스트는 `live-server` 폴더에서 `npm test`(규칙)와 `npm run test:server`(실시간 서버)예요.

## 도메인 (ssople.com)

대표 주소는 `ssople.com` 이에요. 도메인 연결(호스팅케이알·Cloudflare DNS, Pages 사용자 지정 도메인)만 하면 저장소에서 따로 바꿀 건 없어요.

- `ssople.com` 으로 첫 요청이 들어오면 서버가 "도메인 연결됨"을 기록하고, 그때부터 `ssople.pages.dev`·`www.ssople.com`·`http://` 접속을 `https://ssople.com` 으로 301 이동해요. (`functions/_lib/seo.js`)
- 정식 주소(canonical)·공유 주소·사이트맵·RSS·robots.txt 도 ssople.com 기준으로 바뀌어요. 연결 전에는 접속한 주소(ssople.pages.dev) 그대로예요.
- 아임웹 시절 옛 주소는 새 화면으로 301 이동해요. 서버 기능을 거치는 주소는 `functions/_lib/legacy.js`, 그 밖의 주소(/140·/corp·/ansan·/94·/126·/99·/video)는 `_redirects` 에 있어요. `_routes.json` 은 Cloudflare 한도(규칙 100개)에 가까워서 새 옛 주소는 `_redirects` 에 한 줄씩 더해요.
- **www.ssople.com 도 Pages 사용자 지정 도메인으로 따로 등록해야 해요.** Cloudflare → Workers & Pages → `ssople` → 사용자 설정 도메인 → `www.ssople.com` 추가(기존 www DNS 레코드는 교체). 등록하지 않으면 www 요청이 이 홈페이지까지 오지 못해 오류가 나고, 아래 301 이동도 작동하지 않아요.
- 되돌리기: 관리자 → 설정 → 검색 등록 → 대표 주소에 `ssople.pages.dev` 를 적고 저장.
- 상태 확인: `/api/health` 의 `domain.since` (연결된 시각)

## 검색 노출 (2026.10.26 보강)

- **서버가 미리 채우는 목록**: 첫 화면(인기 지점·권역·동네), 지점 찾기(전체 지점 카드), 지역별 지점(권역·동네 링크와 지점), 지점 상세(예약 링크·요금표·찾아오는 길·근처 지점), 지역 화면(다른 지역 칩). 검색 로봇이 스크립트를 돌리지 않아도 지점 이름·주소·요금·링크를 읽어요. (`functions/_lib/ssr-lists.js`) 손님 화면은 화면 스크립트가 같은 자리를 다시 그려요.
- **정식 주소**: 지역은 `/area/seoul`·`/area/gundae` 처럼 영문 주소 하나로. 한글·대문자·끝 슬래시 주소는 301 이동. 지점은 `/room/S-0001` 로 (소문자는 301). 지역·동네 주소표는 `functions/_lib/slugs.js`.
- **사진 수집 허용**: robots.txt 에 `Allow: /api/img/` — 지점 사진이 이미지 검색·썸네일에 쓰이게.
- **브랜드 기본 사실**: 2015년 소셜팩토리에서 시작, 전국 120여 개 파티룸, 국내 No.1 파티룸 브랜드, 340여 개 공간. 구조화 데이터(`functions/_lib/seo.js` BRAND_FACTS·orgJsonLd)와 홈·브랜드 이야기·창업자 이야기·파티 가이드 글이 같은 내용을 말해요.
- **회사 설명**: 관리자 → 설정 → 사업자 정보의 「회사 설명」(`biz.role`, `biz2.role`)이 바닥글·회사 정보에 상호 옆 한 줄로 붙어요.
- **구글 애널리틱스(선택)**: 관리자 → 설정 → 검색 등록 → 「GA4 측정 ID」에 G-로 시작하는 값을 넣으면 모든 화면에 GA4가 들어가고, 네이버 예약·네이버 지도·카카오톡·전화 버튼 클릭이 `click_naver_booking`·`click_naver_map`·`click_kakao`·`click_call` 이벤트로 쌓여요. 개인정보처리방침 쿠키 안내도 자동으로 GA 사용 문구로 바뀌어요. 비워 두면 GA는 들어가지 않아요. (홈페이지 자체의 예약 버튼 클릭 기록 `/api/click` 은 GA와 상관없이 계속 남아요.)

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `*.html` | 화면 (홈, 지점 찾기, 지점 상세, 지역별, 호스트 센터, 창업안내, 공간 아카데미, 행사, 모임, 파티팀, 커뮤니티, 놀이터, 초대장, 쏘플 클럽, 마이, 내 공간 관리, 관리자, 약관 등) |
| `magazine/` | 파티 가이드 글 83편 (정적 HTML, 글마다 Article·Breadcrumb·FAQ 구조화 데이터) · 목록은 `magazine.html` |
| `live.html` · `live/` | 온라인 파티룸 소개 화면 · 앱 화면(`live/app.html`, `js`, `css`)과 화면·서버가 같이 쓰는 규칙(`live/shared`) |
| `live-server/` | 온라인 파티룸 실시간 서버 (Cloudflare Workers + Durable Objects, 별도 배포) |
| `assets/` | 공통 스타일·스크립트, 화면별 스크립트(`js/`), 로고·아이콘·사진(`img/`), 영상(`media/`) |
| `functions/` | 서버 기능 (Cloudflare Pages Functions) — API, 지점·지역 화면 서버 렌더링, 공유 미리보기, 사이트맵, RSS, 검색 노출 설정(`_lib/seo.js`), 대표 주소 이동(`_middleware.js`) |
| `functions/_lib/seed-spaces.js` | 지점 공개 정보·소개 글과 네이버 예약 링크 (내부 정보 제외) |
| `functions/_lib/area-guides.js` | 지역·동네 화면 안내 글·FAQ (서버 렌더링) |
| `functions/_lib/magazine-index.js` | 파티 가이드 글 목록 (사이트맵·RSS·지역·지점 화면 연결용) |
| `functions/_lib/live.js` | 온라인 파티룸 API — 내 정보, 미니게임 랭킹, 개선 요청 게시판, 관리자 |
| `wrangler.toml` | DB·사진 저장소 연결 설정 |
| `_routes.json` | 서버 기능을 거치는 주소 목록 |
| `_redirects` | 설정 파일(README, wrangler.toml 등)이 홈페이지 주소로 열리지 않게 막기, 예전 주소 옮기기 |

## 연결

| 이름 | 종류 | 용도 |
|---|---|---|
| `DB` | D1 `ssople-web` | 회원, 커뮤니티, 모임, 행사, 방막기, 설정, 온라인 파티룸 내 정보·랭킹·개선 요청 (처음 접속할 때 자동 설치) |
| `PHOTOS` | R2 `ssople-photos` | 사진 |
| `ADMIN_PASSWORD` | Secret | 관리자 로그인 |
| `HOSTDB` | D1 (지금은 끔) | 나중에 예전 호스트 센터 DB를 다시 쓸 때 예약 읽기 전용 |
| `SYNC_TOKEN` | Secret (나중에) | 호스트 예약 자동 업데이트·외부 예약 수신 |

버전 2026.10.26 (v7.1 — 검색 노출 보강: 서버 렌더링 목록·정식 지역 주소·사진 수집 허용·옛 주소 이동·브랜드 사실 정리·회사 설명·GA4 선택 설정) · 이전 2026.10.25 (v7 — 온라인 파티룸 /live: 로비·출석·미션·업적, 내 집 꾸미기·집들이, 펫, 미니게임 8종·랭킹, 공개 파티룸 목록, 개선 요청 게시판, 파티 가이드 6편 추가)
