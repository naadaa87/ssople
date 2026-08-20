# 쏘플파티룸 고객 홈페이지 (프론트) — 최종본

전국 파티룸 프랜차이즈 쏘플의 고객용 홈페이지입니다.
예약·결제·취소·보증금·포인트까지 사람 손 없이 흘러가는 **비대면 완결 예약**을 목표로 합니다.

- 배포 주소: https://ssople.pages.dev (도메인 연결 후 https://www.ssople.co.kr)
- 함께 도는 시스템: 호스트 센터(점주) · 본사 대시보드 · AI 챗봇 — 전부 **같은 D1 데이터베이스** 하나를 씁니다.

---

## 무엇이 들어 있나 (기획서 6.1절 기준)

| 구분 | 기능 | 구현 위치 |
|---|---|---|
| P0 | 실시간 슬롯 달력 (낮/밤) | room-detail + /api/branches/[id]/availability |
| P0 | 간편 예약·결제 (서버 계산 · 10분 홀드 · 요일 차등 요금) | booking + /api/holds, /api/reservations |
| P0 | 셀프 취소 (7일 전 전액 / 6일 이내 대관료 불가 자동 판정) | mypage + /api/reservations/[id]/cancel |
| P0 | 보증금 반환 조회 · 차감 확인 · 이의제기 | mypage 상세 + /api/reservations/[id]/detail, /api/incidents/[id]/object |
| P1 | 용도별 큐레이션 랜딩 (생일·브라이덜·워크샵·촬영) | purpose-*.html |
| P1 | 오늘 예약 가능 (당일·내일 빈 타임) | index + /api/today |
| P1 | 포인트·쿠폰 (적립·사용·등급·자동 발급) | booking, mypage + /api/me/wallet, cron |
| P1 | 사진 리뷰 (+2,000P 적립, R2 저장) | review-write + /api/uploads/review, /api/photos |
| P1 | 게스트 안내 페이지 (비회원 열람) | guest.html + /api/guest/[token] |

결제 방식은 기획서 4.3 확정안인 **전액 결제(FULL)** 가 기본입니다 —
대관료 + 보증금을 한 번에 결제하고, 보증금은 이용 후 이상이 없으면 전액 환급.
web_settings 의 `payment.mode` 값을 `DEPOSIT` 으로 바꾸면 예약금+현장잔금 방식으로 즉시 전환됩니다.

## 45개 지점 실데이터

`schema/004_branches_real.sql` 에 운영관리 총괄표(2026.8) 기준 45개 지점이 담겨 있습니다.
요일 차등 요금(월~목/금/토/일), 지점별 보증금(5·8·10만), 지점별 슬롯 시간(익일형 포함),
시설·주차·이용 안내까지 포함하며, **도어락·와이파이·점주 연락처는 담지 않았습니다.**

## 자동으로 도는 일 (크론, 매 10분 호출)

- 이용 끝난 예약 → completed 전환, **등급별 % 포인트 자동 적립** (실부담 대관료 기준)
- 매일 10시 방문 전날 안내 · 11시 후기 요청 + **D+3 재예약 쿠폰 자동 발급**
- 매일 새벽 4시 포인트 만료 소멸 · **등급 재산정** (1년 2회 실버 / 4회 골드)

## 스키마 실행 순서 (D1 콘솔)

```
000_shared.sql → 000_alter.sql → 001_customer.sql → 002_seed.sql
→ 003_final.sql → 004_branches_real.sql → 005_align_host.sql
→ 006_settle_and_dashboard.sql
```

`005_align_host.sql` 은 **호스트 센터와 같은 테이블을 쓰기 위한 정합 작업**입니다
(휴무 closures · 입금상태 · 후기 컬럼). `006_settle_and_dashboard.sql` 은
**할인 8:2 분담 정산과 본사 대시보드 연동**을 붙입니다. 둘 다 필수입니다.

## 정산 기준 — 할인은 점주 8 : 본사 2 로 함께 부담

정산은 정가가 아니라 **할인 후 실매출**(`reservations.net_amount`)로 계산합니다.

| | 금액 |
|---|---|
| 정가 | 100,000 |
| 쿠폰 할인 | −5,000 |
| **정산 기준(실매출)** | **95,000** |
| 점주 80% | 76,000 |
| 본사 20% | 19,000 |

할인 5,000원 중 점주가 4,000원, 본사가 1,000원을 부담하는 구조입니다.
`web_settings` 의 `settle.base` 를 `gross` 로 바꾸면 예전 방식(본사 전액 부담)으로 돌아갑니다.
호스트 정산 크론 수정은 `docs/호스트-정산-수정안내.md` 참고.

전부 "있으면 건너뛰기" 방식이라 여러 번 실행해도 안전합니다.
ALTER 문에서 `duplicate column name` 오류가 나면 그 줄만 건너뛰면 됩니다.
자세한 배포 절차는 **docs/배포가이드.md** 를 보세요.

## 자주 바꾸게 될 값 (코드 수정 없이 DB에서)

| 키 | 기본값 | 뜻 |
|---|---|---|
| payment.mode | FULL | 전액 결제 / DEPOSIT(예약금+잔금) |
| deposit.amount | 80000 | 전사 기본 보증금 (지점값이 우선) |
| points.earn.WELCOME/SILVER/GOLD | 5 / 7 / 10 | 등급별 적립률 % |
| points.review_photo_bonus | 2000 | 사진 후기 추가 적립 |
| coupon.rebook.after_days | 3 | 이용 후 며칠 뒤 재예약 쿠폰 |
| grade.silver/gold.year_count | 2 / 4 | 등급 승급 기준 (연간 이용 횟수) |

## 점검 도구

```
node tools/check.mjs
```
자바스크립트 문법 · 내부 링크 · 호스트 스키마 규격 · 보안 · 챗봇 연동을 한 번에 검사합니다.
