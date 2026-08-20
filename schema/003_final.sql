-- ============================================================
-- 003_final.sql — 고객 홈페이지 최종본 확장분
--
-- 종합기획서(2026.8.18) 6.1절의 P1 기능을 담기 위한 추가 스키마입니다.
--   · 용도별 큐레이션 / 오늘 예약 가능  → branches 확장
--   · 게스트 안내 페이지               → reservations 확장
--   · 포인트 · 쿠폰 (쏘플 클럽)        → points, coupons, coupon_issues
--   · 보증금 차감 확인                 → incidents (기획서 9.3 기준표)
--
-- 전부 "추가"만 합니다. 기존 테이블과 데이터는 건드리지 않으므로
-- 호스트 홈페이지 · 대시보드 · 챗봇에 영향이 없습니다.
--
-- 실행 위치: Cloudflare 대시보드 → D1 → ssople-host → 콘솔
-- ALTER 문은 이미 컬럼이 있으면 "duplicate column name" 오류가
-- 나는데, 그 줄만 건너뛰고 다음 줄부터 계속 실행하면 됩니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1) branches 확장 — 운영관리 총괄표(01_지점총괄)의 항목을 담습니다
-- ------------------------------------------------------------
ALTER TABLE branches ADD COLUMN area TEXT;                    -- 세부 지역 (건대 · 신촌 · 수원 …)
ALTER TABLE branches ADD COLUMN mgmt_type TEXT;               -- direct(직영) | franchise(가맹) | consign(위탁)
ALTER TABLE branches ADD COLUMN features TEXT DEFAULT '[]';   -- 특징 배열 ["3시간권","금 올데이"] 등
ALTER TABLE branches ADD COLUMN pet_ok INTEGER DEFAULT 0;     -- 애견 동반 (총괄표 '애견' 열)
ALTER TABLE branches ADD COLUMN bbq_ok INTEGER DEFAULT 0;     -- 바베큐 (총괄표 '바베큐' 열)
ALTER TABLE branches ADD COLUMN karaoke_ok INTEGER DEFAULT 0; -- 노래방 (총괄표 '노래방' 열)

-- 슬롯 표준시간 보정 — 기획서 9.1절 확정 규정: 낮 11~16시 / 밤 17~22시
-- (예전 기본값 12~18 / 19~25 로 남아 있는 지점만 표준값으로 맞춥니다.
--  지점이 직접 다른 시간으로 바꿔 둔 값은 그대로 둡니다.)
UPDATE branches SET day_start = 11, day_end = 16
 WHERE day_start = 12 AND day_end = 18;
UPDATE branches SET night_start = 17, night_end = 22
 WHERE night_start = 19 AND night_end = 25;


-- ------------------------------------------------------------
-- 2) reservations 확장 — 게스트 안내 · 포인트 · 쿠폰 사용분
-- ------------------------------------------------------------
ALTER TABLE reservations ADD COLUMN guest_token TEXT;             -- 참석자 안내 페이지 열람 토큰
ALTER TABLE reservations ADD COLUMN point_used INTEGER DEFAULT 0; -- 이 예약에 쓴 포인트
ALTER TABLE reservations ADD COLUMN coupon_issue_id INTEGER;      -- 사용한 쿠폰 (coupon_issues.id)
ALTER TABLE reservations ADD COLUMN coupon_discount INTEGER DEFAULT 0; -- 쿠폰 할인액

CREATE INDEX IF NOT EXISTS idx_res_guest_token ON reservations(guest_token);


-- ------------------------------------------------------------
-- 3) 포인트 원장 — 잔액을 따로 저장하지 않고 기록의 합으로 계산합니다
--    (기획서 5.4절 원장 원칙: 덮어쓰기 금지, 기록만 쌓는다)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS points (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  amount         INTEGER NOT NULL,              -- +적립 / -사용 · 소멸
  reason         TEXT NOT NULL,                 -- earn(예약 적립) | review_photo(사진후기 적립)
                                                -- use(사용) | refund(사용 취소분 복원)
                                                -- expire(소멸) | admin(수동 조정)
  reservation_id INTEGER,                       -- 관련 예약
  review_id      INTEGER,                       -- 관련 후기
  expires_at     TEXT,                          -- 적립분 유효기한 (기본 1년)
  memo           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_points_customer ON points(customer_id);


-- ------------------------------------------------------------
-- 4) 쿠폰 — 마스터(종류)와 발급(고객별 보유)을 나눕니다
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,                     -- 프로모션 코드형이면 코드, 자동발급형이면 비움
  title       TEXT NOT NULL,                   -- 예: 재예약 감사 쿠폰
  kind        TEXT NOT NULL DEFAULT 'amount',  -- amount(정액) | percent(정률)
  value       INTEGER NOT NULL,                -- 원 또는 %
  min_amount  INTEGER NOT NULL DEFAULT 0,      -- 사용 가능한 최소 결제금액
  scope       TEXT NOT NULL DEFAULT 'all',     -- all | first(첫 예약) | rebook(재예약)
  valid_days  INTEGER NOT NULL DEFAULT 60,     -- 발급일로부터 유효일수
  starts_at   TEXT,
  ends_at     TEXT,
  status      TEXT NOT NULL DEFAULT 'active',  -- active | paused | ended
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupon_issues (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id      INTEGER NOT NULL REFERENCES coupons(id),
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  status         TEXT NOT NULL DEFAULT 'issued', -- issued(보유) | used(사용) | expired(만료)
  reservation_id INTEGER,                        -- 사용된 예약
  issued_at      TEXT NOT NULL DEFAULT (datetime('now')),
  used_at        TEXT,
  expires_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_ci_customer ON coupon_issues(customer_id);

-- 기본 쿠폰 2종 (금액 · 조건은 대시보드에서 언제든 수정)
INSERT OR IGNORE INTO coupons (id, title, kind, value, min_amount, scope, valid_days, status) VALUES
 (1, '재예약 감사 쿠폰', 'amount', 5000, 50000, 'rebook', 60, 'active'),
 (2, '첫 예약 환영 쿠폰', 'amount', 5000, 50000, 'first',  60, 'active');


-- ------------------------------------------------------------
-- 5) 보증금 차감 기록 — 기획서 9.3 차감 기준표의 실물
--    호스트 · 본사가 기록하고, 고객은 마이페이지에서 열람 · 이의제기
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id),
  branch_id      INTEGER NOT NULL,
  type           TEXT NOT NULL,                  -- clean(청소 미이행) | damage(파손·분실)
                                                 -- noise(소음·민원) | over(인원 초과)
                                                 -- smoke(실내 흡연) | noshow | etc
  amount         INTEGER NOT NULL DEFAULT 0,     -- 차감액
  note           TEXT,                           -- 사유 설명
  photos         TEXT DEFAULT '[]',              -- 증빙 사진 URL 배열
  status         TEXT NOT NULL DEFAULT 'claimed',-- claimed(청구) | confirmed(확정)
                                                 -- disputed(이의) | resolved(종결)
  objection_note TEXT,                           -- 고객 이의 내용
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_incidents_res ON incidents(reservation_id);


-- ------------------------------------------------------------
-- 6) 정책값 추가 — 기획서 3.3 · 3.4 · 9.1절
--    (숫자 · 문구를 바꾸고 싶으면 코드가 아니라 여기 값만 고치면 됩니다)
-- ------------------------------------------------------------

-- 슬롯 표준시간 문구를 확정 규정으로 교체
INSERT OR REPLACE INTO web_settings(key, value) VALUES
  ('slot.day.time',   '11:00 ~ 16:00'),
  ('slot.night.time', '17:00 ~ 22:00'),
  ('slot.gap.note',   '타임 사이 1시간은 청소·전환 시간입니다');

-- 포인트 (쏘플 클럽) — 등급별 적립률 · 유효기간 · 사용 조건
INSERT OR REPLACE INTO web_settings(key, value) VALUES
  ('points.earn.WELCOME',       '5'),     -- 결제액의 5% 적립
  ('points.earn.SILVER',        '7'),     -- 연 2회 이용 시 실버
  ('points.earn.GOLD',          '10'),    -- 연 4회 이용 시 골드
  ('points.expire_months',      '12'),    -- 적립 후 1년 유효
  ('points.min_use',            '1000'),  -- 1,000P부터 사용 가능
  ('points.review_photo_bonus', '2000'),  -- 사진후기 추가 적립
  ('grade.silver.year_count',   '2'),
  ('grade.gold.year_count',     '4');

-- 재예약 쿠폰 자동 발급 (이용 완료 후 후기 요청과 함께)
INSERT OR REPLACE INTO web_settings(key, value) VALUES
  ('coupon.rebook.after_days', '3'),      -- 이용 완료 3일 뒤 발급
  ('coupon.rebook.coupon_id',  '1'),      -- 위 4)에서 만든 쿠폰
  ('coupon.first.coupon_id',   '2');

-- 게스트 안내 페이지
INSERT OR REPLACE INTO web_settings(key, value) VALUES
  ('guest.page.enabled', '1');
