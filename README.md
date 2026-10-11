# 쏘플파티룸 고객 홈페이지

전국 쏘플파티룸의 낮·밤 빈 방을 날짜별로 보여 주고, 예약은 **네이버 예약**으로 연결하는 고객용 홈페이지예요.
커뮤니티, 모임, 파티팀 모집, 행사, 놀이터(파티 도구), 초대장, 쏘플 클럽(멤버십), 제휴·협업까지 한 사이트에 담았어요.

- 예약·결제·정산: 네이버 예약과 호스트 센터(host.jssystems.kr)에서 그대로 해요. 이 홈페이지는 결제를 받지 않아요.
- 빈 방 표시: 호스트 예약 DB(ssople-host)를 **읽기만** 해서 자동으로 채워요. 아이디·비밀번호는 쓰지 않아요.
- 운영: `/admin` 관리 화면에서 방막기, 엑셀 올리기, 지점·행사·커뮤니티·회원 관리를 해요.

## 배포

배포 안내서(DEPLOY-GUIDE.md)와 운영 안내서(OPERATIONS.md)는 전달한 ZIP의 `docs` 폴더에 따로 들어 있어요. 내부 운영 내용이라 저장소(=공개 홈페이지)에는 올리지 않아요. 요약하면:

1. Cloudflare D1에서 `ssople-web` 데이터베이스 만들기
2. Pages → Settings → Variables and Secrets에 `ADMIN_PASSWORD`(Secret) 추가
3. `wrangler.toml`의 `database_id` 자리에 ID 붙여넣기 (올리기 전에)
4. GitHub 저장소의 예전 `functions` 폴더 등 지우기
5. 두 번에 나눠 업로드: ① assets·functions를 뺀 나머지 ② assets·functions
6. `/api/health`, `/admin` → 데이터 연결에서 확인

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `*.html` | 화면 (홈, 지점 찾기, 지점 상세, 행사, 모임, 파티팀, 커뮤니티, 놀이터, 초대장, 쏘플 클럽, 마이, 관리자, 약관 등) |
| `assets/` | 공통 스타일·스크립트, 화면별 스크립트, 공유 이미지·아이콘 |
| `functions/` | 서버 기능 (Cloudflare Pages Functions) — API, 공유 미리보기, 사이트맵 |
| `functions/_lib/seed-spaces.js` | 45개 지점 공개 정보 (내부 정보 제외) |
| `wrangler.toml` | DB·사진 저장소 연결 설정 |
| `_routes.json` | 서버 기능을 거치는 주소 목록 |
| `_redirects` | 설정 파일(README, wrangler.toml 등)이 홈페이지 주소로 열리지 않게 막기 |

## 연결

| 이름 | 종류 | 용도 |
|---|---|---|
| `DB` | D1 `ssople-web` | 회원, 커뮤니티, 모임, 행사, 방막기, 설정 (처음 접속할 때 자동 설치) |
| `HOSTDB` | D1 `ssople-host` | 호스트 예약 읽기 전용 |
| `PHOTOS` | R2 `ssople-photos` | 사진 |
| `ADMIN_PASSWORD` | Secret | 관리자 로그인 |
| `SYNC_TOKEN` | Secret (선택) | 외부 예약 수신 API |

버전 2026.10.10
