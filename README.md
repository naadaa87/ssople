# 쏘플파티룸 홈페이지 (고객)

전국 파티룸 예약. Cloudflare Pages + Functions + D1로 만들었습니다.

이 저장소는 **손님이 쓰는 홈페이지**입니다.
점주 화면은 호스트 홈페이지, 본사 화면은 대시보드에 따로 있습니다.

| 문서 | 내용 |
|---|---|
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | **배포 체크리스트** — 순서대로 따라가면 됩니다 |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | 네 시스템 연동 규격 — 서로 지킬 약속 |

---

## 시작하기 전에 — 가장 중요한 것

**데이터베이스는 호스트 홈페이지와 같은 것을 씁니다.**

따로 만들면 홈페이지에서 받은 예약이 점주 화면에 안 뜨고,
같은 날 같은 타임에 두 팀이 예약되는 사고가 납니다.

호스트 쪽 `wrangler.toml`의 `database_id`를 그대로 가져와 쓰세요.

---

## 1. 무엇이 도는가

| 지금 도는 것 | 계약 후 연결할 것 |
|---|---|
| 지점 탐색 (날짜별 실시간 가용) | 실결제 (PG) |
| 예약 · 예약금 결제 흐름 | 실제 알림톡 발송 |
| 취소 · 환불 판정과 처리 | |
| 회원가입 · 로그인 · 마이페이지 | |
| 비회원 예약 조회 | |
| 후기 작성 · 노출 | |
| 상담 챗봇 (카카오와 같은 서버) | |

PG 계약 전에도 `PG_MODE=test`로 두면
**예약 → 결제 → 확정 → 알림 → 취소 → 환불까지 전부 실제로 돕니다.**
계약 후에는 설정값만 `live`로 바꾸면 되고, 화면 코드는 손댈 필요가 없습니다.

---

## 2. 예약 구조

파티룸은 **낮타임 / 밤타임** 두 타임으로 팝니다. 시간 단위가 아닙니다.

```
요금 = 타임 요금 + (인원 − 기본 인원) × 추가 인원 단가
```

예) 강남점 밤타임 260,000원 · 기본 8명 · 추가 15,000원 → 12명이면
`260,000 + 4 × 15,000 = 320,000원`

홈페이지에서는 **예약금 80,000원만** 결제하고,
나머지 240,000원은 이용 당일 현장에서 냅니다.
호스트 화면의 '예약금 / 잔금' 표기와 그대로 이어집니다.

---

## 3. 배포 순서

### 3-1. GitHub에 올리기

```bash
cd ssople-front
git init
git add .
git commit -m "쏘플파티룸 홈페이지"
git branch -M main
git remote add origin https://github.com/사용자명/저장소명.git
git push -u origin main
```

> 저장소는 **Private**으로 만드세요. 서버 코드가 들어 있습니다.

### 3-2. Cloudflare Pages 연결

**Workers & Pages** → **Create** → **Pages** → **Connect to Git**

| 항목 | 값 |
|---|---|
| Framework preset | None |
| Build command | 비워둠 |
| Build output directory | `/` |

### 3-3. `wrangler.toml` 채우기

```toml
[[d1_databases]]
database_id = "호스트와 같은 D1 ID"     # ← 반드시 같은 값

[[kv_namespaces]]
id = "KV 생성 후 받은 ID"
```

KV는 새로 만듭니다. 로그인 세션과 예약 홀드가 들어갑니다.

```bash
npx wrangler kv namespace create KV
```

### 3-4. 스키마 적용

호스트 홈페이지를 **먼저** 배포했다면 공용 테이블은 이미 있습니다.

```bash
npm install

# 호스트를 아직 배포하지 않았다면 (공용 테이블 만들기)
npm run db:shared

# 홈페이지가 쓰는 컬럼 붙이기
#   "duplicate column name" 오류는 이미 있다는 뜻이니 무시하세요
npm run db:alter

# 고객측 테이블
npm run db:init

# 운영 규정 · 샘플 데이터
npm run db:seed
```

> 실제 지점 데이터는 호스트에서 관리합니다.
> `002_seed.sql` 아래쪽 샘플 지점 INSERT는 검수용이니 실운영에서는 지우세요.

### 3-5. Pages 바인딩 연결

Pages 프로젝트 → **Settings** → **Functions** → **Bindings**

| 종류 | 변수명 | 대상 |
|---|---|---|
| D1 database | `DB` | 호스트와 같은 DB |
| KV namespace | `KV` | 새로 만든 KV |
| R2 bucket | `PHOTOS` | (후기 사진 쓸 때) |

### 3-6. 정기 작업 실행기 배포

Pages는 Cron을 못 받습니다. 작은 Worker를 따로 띄웁니다.

```bash
npx wrangler pages secret put CRON_SECRET      # 홈페이지 쪽

cd cron-worker
# wrangler.toml의 SITE_URL을 실제 주소로 바꾼 뒤
npx wrangler deploy
npx wrangler secret put CRON_SECRET            # 같은 값
```

| 시각 | 하는 일 |
|---|---|
| 10분마다 | 이용 끝난 예약 정리 |
| 매일 10시 | 방문 하루 전 안내 |
| 매일 11시 | 어제 이용자에게 후기 요청 |
| 매일 4시 | 회원등급 재산정 |

정산 집계는 **호스트가 합니다.** 홈페이지는 하지 않습니다.

---

## 4. 챗봇 (연결 완료)

상담 챗봇 "쏘플이"가 이미 연결되어 있습니다.

```toml
CHATBOT_URL  = "https://ssople-chatbot.naadaa87.workers.dev"
CHATBOT_PATH = "/skill"
```

카카오톡 채널에서 쓰는 것과 **같은 서버**를 부릅니다. 답변 규칙을 두 군데 두면
반드시 어긋나기 때문에, 규칙은 챗봇 한 곳에만 둡니다.

- 전체 20개 화면 오른쪽 아래에 상담 버튼이 있습니다.
- 지점 상세에서는 그 지점 이름을 물고 들어가 "강남점 주차 되나요?" 같은 추천 질문이 뜹니다.
- 예약·결제 화면에는 넣지 않았습니다. 10분 잠금이 걸려 있어 다른 화면으로 새면 자리를 놓칩니다.

**연결 확인**

```
https://내주소/api/chat/health
```

`connected: true` 가 나오면 정상입니다.

**챗봇 쪽에도 홈페이지 경로를 넣어주세요.** 안 맞으면 챗봇 버튼이 없는 페이지로 갑니다.
`SITE_URL`, 예약 `/rooms.html`, 예약 조회 `/lookup.html` — 자세한 목록은
[`docs/INTEGRATION.md`](docs/INTEGRATION.md) 4.6절에 있습니다.

챗봇에 9초 안에 닿지 못하면 같은 DB의 `bot_faqs`로 대신 답합니다.
환불·보증금 같은 고정 문안은 장애 중에도 그대로 나갑니다.

응답 처리 검증: `npm run test:chat` (14가지 응답 형태)

---

## 5. 결제 붙이기 (PG 계약 후)

계약할 때 **지급대행(정산대행)을 반드시 포함**시키세요.
결제 대금이 본사 계좌를 거쳐 점주에게 다시 나가면
전자금융거래법상 PG업 등록 대상이 됩니다.

```bash
npx wrangler pages secret put PORTONE_API_SECRET
npx wrangler pages secret put PORTONE_STORE_ID
npx wrangler pages secret put PORTONE_CHANNEL_KEY
```

`wrangler.toml`에서 `PG_MODE = "live"`로 바꾸고 다시 배포합니다.
PG 관리자 화면의 웹훅 주소는 `https://내도메인/api/payments/webhook`.

---

## 6. 알림톡 붙이기 (대행사 계약 후)

카카오와 직접 계약할 수 없고 공식 발송대행사를 거쳐야 합니다.

1. 카카오 비즈니스 채널 인증
2. 발송대행사(솔라피 등) 계약
3. 템플릿 5종 심사 — 본문은 `functions/lib/notify.js`에 있습니다
   - **할인·적립 문구를 넣으면 광고로 판정되어 반려됩니다.** 지금 문구는 전부 정보성입니다.
4. 키 등록 후 `ALIMTALK_MODE = "live"`

```bash
npx wrangler pages secret put SOLAPI_API_KEY
npx wrangler pages secret put SOLAPI_API_SECRET
npx wrangler pages secret put KAKAO_PFID
npx wrangler pages secret put SENDER_PHONE
```

알림톡이 실패하면 문자로 자동 대체됩니다.
발송 이력은 호스트의 `message_logs`에 함께 남아 점주도 볼 수 있습니다.

---

## 7. 운영 규정 바꾸기

규정은 코드가 아니라 `web_settings` 테이블에 있습니다.

```sql
-- 예약금
UPDATE web_settings SET value='80000' WHERE key='deposit.amount';

-- 환불 구간 (남은 일수 → 환불률). 중간 구간을 넣고 싶다면
UPDATE web_settings SET value='[
  {"min_days":7,"rate":100,"type":"full","label":"이용 7일 전까지 · 전액 환불"},
  {"min_days":4,"rate":50, "type":"partial","label":"이용 6~4일 전 · 50% 환불"},
  {"min_days":0,"rate":0,  "type":"none","label":"이용 3일 전부터 · 환불 불가"}
]' WHERE key='refund.rules';

-- 결제 방식: DEPOSIT(예약금+잔금) 또는 FULL(전액 선결제)
UPDATE web_settings SET value='DEPOSIT' WHERE key='payment.mode';

-- 홀드 시간(분)
UPDATE web_settings SET value='10' WHERE key='hold.minutes';
```

> 환불 규정과 예약금은 **챗봇의 고정응답에도 적혀 있습니다.**
> 바꿀 때 챗봇 쪽 `bot_faqs`와 `bot_policies`도 함께 고치세요.

---

## 8. 로컬에서 돌려보기

```bash
npm install
npm run db:local
npm run dev            # http://localhost:8788
```

배포 전 점검:

```bash
npm run check          # 문법 · 링크 · 호스트 규격 준수 · 연동 지점
python3 tools/verify.py  # 요금 · 예약 · 환불 · 이중예약 · 정산 대조
```

---

## 9. 폴더 구조

```
/
├── index.html …            마케팅 페이지 14개 (실데이터 연결)
├── rooms.html              공간 찾기 — 날짜별 실시간 가용
├── room-detail.html        지점 상세 + 타임 선택 예약 위젯
├── booking.html            예약·결제 4단계
├── lookup.html             ★ 비회원 예약 조회 (챗봇이 링크로 보냄)
├── login / signup / mypage / review-write
├── assets/
│   ├── app.css / app.js    공통
│   ├── wire.css / wire.js  기존 페이지 ↔ 실데이터 연결
│   └── chat.js             ★ 상담 챗봇 위젯
├── functions/
│   ├── lib/                core · booking · payments · notify
│   └── api/                엔드포인트
├── schema/
│   ├── 000_shared.sql      공용 테이블 (호스트가 이미 만들었으면 건너뜀)
│   ├── 000_alter.sql       홈페이지용 컬럼 추가
│   ├── 001_customer.sql    고객측 테이블
│   └── 002_seed.sql        운영 규정 + 샘플
├── cron-worker/            정기 작업 실행기 (별도 배포)
├── tools/                  check.mjs · verify.py
└── docs/INTEGRATION.md     ★ 네 시스템 연동 규격
```

---

## 10. 알아두실 것

**금액은 언제나 서버가 계산합니다.** 화면에서 보낸 금액은 참고값이고,
승인 직전에 요금표로 다시 계산해 맞지 않으면 결제를 거절합니다.

**이중 예약은 DB가 막습니다.** 홈페이지·호스트·외부 채널 어디서 들어와도
같은 타임이면 유니크 인덱스에 걸립니다. 그래도 뚫리면 즉시 자동 환불합니다.

**돈이 걸린 기록은 고치지 않고 쌓습니다.** `payments`, `refunds`는
수정 대신 새 기록을 남깁니다.

**점주·본사 기능은 여기 없습니다.** 호스트 홈페이지와 대시보드가 담당합니다.
푸터에 링크만 걸어두었습니다.

---

## 11. 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| API가 전부 500 | Pages 바인딩(D1·KV)이 연결됐는지 |
| 지점이 안 보임 | `branches.status='open'`인지, `region` 컬럼이 붙었는지 |
| 예약이 점주 화면에 안 뜸 | **D1이 호스트와 같은 DB인지** (가장 흔한 원인) |
| 타임이 계속 마감으로 보임 | 다른 경로 예약이 있는지, 홀드가 남았는지 |
| 상담창이 엉뚱한 답 | `/api/chat/health` 확인. `connected:false` 면 챗봇 서버 쪽 문제입니다 |
| 상담창 버튼이 없는 페이지로 감 | 챗봇 `wrangler.toml` 의 경로 변수를 홈페이지 파일명에 맞추세요 |
| 정기 작업이 안 돎 | cron-worker 배포 여부, 양쪽 `CRON_SECRET`이 같은지 |

---

㈜소셜패밀리 · 쏘플파티룸
