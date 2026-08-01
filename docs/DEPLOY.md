# 배포 체크리스트

순서대로 따라가시면 됩니다. 각 단계마다 확인할 것을 적어두었습니다.

---

## 0단계 — 시작 전

- [ ] 호스트 홈페이지(`ssople-host`)를 먼저 배포했습니까?
      → 했다면 그쪽 `wrangler.toml`에서 **`database_id`를 복사**해 두세요.
      → 아직이면 이 홈페이지를 먼저 배포하고, 나중에 호스트가 같은 ID를 쓰게 하면 됩니다.

- [ ] 어느 쪽이든 **D1은 하나만 씁니다.** 두 개를 만들면 예약이 서로 안 보입니다.

---

## 1단계 — GitHub

```bash
cd ssople-front
git init && git add . && git commit -m "쏘플파티룸 홈페이지"
git branch -M main
git remote add origin https://github.com/사용자명/저장소명.git
git push -u origin main
```

- [ ] 저장소를 **Private**으로 만들었습니까? (서버 코드가 들어 있습니다)

---

## 2단계 — Cloudflare Pages 연결

**Workers & Pages → Create → Pages → Connect to Git**

| 항목 | 값 |
|---|---|
| Framework preset | **None** |
| Build command | **비워둠** |
| Build output directory | **`/`** |

- [ ] 빌드 명령을 비웠습니까? (뭔가 넣으면 배포가 실패합니다)

---

## 3단계 — 저장소 만들기

```bash
# KV (로그인 세션 · 예약 홀드) — 새로 만듭니다
npx wrangler kv namespace create KV

# D1 — 호스트가 이미 만들었으면 건너뜁니다
npx wrangler d1 create ssople
```

`wrangler.toml`에 넣습니다.

```toml
[[d1_databases]]
database_id = "여기"      # ← 호스트와 같은 값

[[kv_namespaces]]
id = "여기"
```

- [ ] `database_id`가 호스트와 **같은 값**입니까?

---

## 4단계 — 스키마 적용

```bash
npm install

npm run db:shared   # 호스트를 아직 배포 안 했다면
npm run db:alter    # 홈페이지용 컬럼 붙이기
npm run db:init     # 고객측 테이블
npm run db:seed     # 운영 규정 + 샘플
```

- [ ] `db:alter`에서 **"duplicate column name"** 오류가 났습니까?
      → 정상입니다. 이미 있다는 뜻이니 그냥 넘어가세요.

- [ ] 확인:
```bash
npx wrangler d1 execute ssople --remote \
  --command "SELECT key,value FROM web_settings WHERE key IN ('deposit.amount','refund.rules')"
```
예약금 `80000`과 환불 구간이 나오면 성공입니다.

---

## 5단계 — Pages 바인딩

**Settings → Functions → Bindings**

| 종류 | 변수명 | 대상 |
|---|---|---|
| D1 database | `DB` | 호스트와 같은 DB |
| KV namespace | `KV` | 방금 만든 KV |
| R2 bucket | `PHOTOS` | (후기 사진 쓸 때) |

- [ ] 변수명이 정확히 `DB`, `KV`입니까? (대소문자 구분)

> 여기를 빠뜨리면 모든 API가 500으로 떨어집니다. 가장 흔한 실수입니다.

---

## 6단계 — 첫 확인

배포된 주소로 들어가서:

- [ ] 메인 화면이 뜹니까?
- [ ] **파티룸 찾기**에서 지점이 보입니까?
- [ ] 지점을 눌러 **낮타임/밤타임과 요금**이 보입니까?
- [ ] 날짜를 바꾸면 타임 상태가 바뀝니까?
- [ ] 오른쪽 아래 **상담창**이 열립니까?

지점이 안 보이면 → `db:seed`를 돌렸는지, `branches.status='open'`인지 확인.

---

## 7단계 — 예약 흐름 검수 (PG 계약 전에도 됩니다)

`PG_MODE=test` 상태에서 전 과정이 실제로 돕니다.

- [ ] 회원가입 → 로그인
- [ ] 지점 선택 → 타임 선택 → 예약하기
- [ ] 결제 화면에서 **10분 타이머**가 도는가
- [ ] 규정을 끝까지 스크롤해야 동의 체크가 열리는가
- [ ] 결제 완료 → **예약번호가 나오는가**
- [ ] 마이페이지에 예약이 뜨는가
- [ ] **호스트 홈페이지 예약 목록에도 같은 건이 뜨는가** ← 가장 중요
- [ ] 취소 눌렀을 때 환불 금액이 **먼저** 표시되는가
- [ ] `/lookup.html`에서 예약번호+연락처로 조회되는가

호스트에 안 뜨면 → **D1이 서로 다른 DB입니다.** 3단계로 돌아가세요.

---

## 8단계 — 정기 작업

```bash
npx wrangler pages secret put CRON_SECRET      # 값을 정해서 입력

cd cron-worker
# wrangler.toml의 SITE_URL을 실제 주소로 수정
npx wrangler deploy
npx wrangler secret put CRON_SECRET            # 같은 값 입력
```

- [ ] 양쪽 `CRON_SECRET`이 **같은 값**입니까?
- [ ] 확인:
```bash
curl -X POST https://내주소/api/cron/tick -H "x-cron-secret: 넣은값"
```
`{"ok":true,"tasks":[...]}` 가 나오면 성공입니다.

---

## 9단계 — 챗봇 연결

챗봇 워커를 배포한 뒤:

```toml
[vars]
CHATBOT_URL = "https://ssople-chatbot.계정명.workers.dev"
CHATBOT_PATH = "/skill"
```

- [ ] 홈페이지 상담창에서 "환불 규정" 물었을 때 답이 옵니까?
- [ ] 카카오 채널에서 같은 질문했을 때 **같은 답**이 옵니까?

**챗봇 쪽에도 홈페이지 주소를 알려주세요.**

| 챗봇 설정 | 값 |
|---|---|
| `SITE_URL` | `https://www.ssople.co.kr` |
| 예약 화면 | `/rooms.html` |
| 예약 조회 | `/lookup.html` |

---

## 10단계 — 실전 전환 (계약 완료 후)

### PG

```bash
npx wrangler pages secret put PORTONE_API_SECRET
npx wrangler pages secret put PORTONE_STORE_ID
npx wrangler pages secret put PORTONE_CHANNEL_KEY
```

- [ ] `wrangler.toml` → `PG_MODE = "live"`
- [ ] PG 관리자에 웹훅 등록: `https://내주소/api/payments/webhook`
- [ ] **지급대행 계약이 포함**되어 있습니까? (전자금융거래법 대응)

### 알림톡

```bash
npx wrangler pages secret put SOLAPI_API_KEY
npx wrangler pages secret put SOLAPI_API_SECRET
npx wrangler pages secret put KAKAO_PFID
npx wrangler pages secret put SENDER_PHONE
```

- [ ] 템플릿 5종 심사 통과했습니까? (본문은 `functions/lib/notify.js`)
- [ ] `ALIMTALK_MODE = "live"`

---

## 11단계 — 실제 데이터로 교체

샘플 지점 3개가 들어 있습니다. 실제 데이터로 바꾸세요.

```sql
-- 샘플 제거
DELETE FROM branches WHERE code IN ('GN01','HD01','GC01');
```

지점 데이터는 **호스트 홈페이지에서 점주가 관리**합니다.
홈페이지 전용 컬럼(`region`, `tags`, 타임 시각)만 따로 채우면 됩니다.

```sql
UPDATE branches SET region='서울',
  tags='["생일","바베큐","루프탑"]',
  day_start=12, day_end=18, night_start=19, night_end=25
WHERE code='GN01';
```

- [ ] 130개 지점의 `region`과 `tags`를 채웠습니까?
      (안 채우면 지역 필터와 목적 태그 검색이 비어 보입니다)

---

## 마지막 — 도메인 연결 전 최종 확인

- [ ] `robots.txt`, `sitemap.xml`의 도메인이 실제 주소입니까?
- [ ] 푸터의 호스트·대시보드 링크가 실제 주소입니까?
      (기본값: `host.ssople.co.kr`, `admin.ssople.co.kr`)
- [ ] 이용약관·개인정보처리방침 페이지를 연결했습니까?
      (푸터의 `#` 링크 두 곳)
- [ ] `docs/INTEGRATION.md`의 **연동 점검 9개 항목**을 전부 확인했습니까?
