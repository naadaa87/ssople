-- ============================================================
-- 공용 테이블 (호스트 홈페이지와 함께 쓰는 것)
--
-- 실제 운영에서는 호스트 홈페이지(ssople-host)의 db/schema.sql이
-- 이 테이블들을 만듭니다. 그때는 이 파일을 실행하지 않아도 됩니다.
--
-- 이 파일은 두 가지 용도입니다.
--   1) 홈페이지만 따로 띄워 검수할 때
--   2) 호스트 스키마와 컬럼이 맞는지 대조할 때의 기준표
--
-- CREATE TABLE IF NOT EXISTS 로만 되어 있어서, 호스트가 먼저 만들었으면
-- 아무것도 건드리지 않고 지나갑니다.
-- ============================================================

-- 지점 = 예약 단위. 파티룸 한 곳이 지점 하나입니다.
CREATE TABLE IF NOT EXISTS branches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  address       TEXT,
  phone         TEXT,
  intro         TEXT,
  day_price     INTEGER NOT NULL DEFAULT 0,     -- 낮타임 요금
  night_price   INTEGER NOT NULL DEFAULT 0,     -- 밤타임 요금
  base_people   INTEGER NOT NULL DEFAULT 8,     -- 기본 인원
  extra_price   INTEGER NOT NULL DEFAULT 15000, -- 추가 인원 1인 요금
  max_people    INTEGER NOT NULL DEFAULT 20,
  amenities     TEXT NOT NULL DEFAULT '[]',     -- JSON 배열
  guide_text    TEXT,
  parking_text  TEXT,
  access_info   TEXT,                           -- 출입 방법 (확정 고객에게만)
  bank_name     TEXT,
  bank_account  TEXT,
  bank_holder   TEXT,
  msg_quota     INTEGER NOT NULL DEFAULT 200,
  status        TEXT NOT NULL DEFAULT 'open',   -- open | preparing | closed
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 홈페이지가 쓰는 추가 컬럼.
-- 호스트 스키마에 없으면 배포 스크립트가 ALTER로 붙입니다(README 참고).
-- region      TEXT   지역 (서울/경기/…)
-- lat, lng    REAL   지도 좌표
-- tags        TEXT   목적 태그 JSON 배열 ["생일","바베큐"]
-- day_start, day_end, night_start, night_end  INTEGER  타임 시각

CREATE TABLE IF NOT EXISTS branch_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id  INTEGER NOT NULL REFERENCES branches(id),
  url        TEXT NOT NULL,
  sort_no    INTEGER NOT NULL DEFAULT 0,
  is_main    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 점주·매니저·스태프 계정 (호스트 홈페이지에서 씁니다)
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,
  salt            TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  invite_token    TEXT,
  reset_code      TEXT,
  reset_expires   TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  notif_prefs     TEXT NOT NULL DEFAULT '{}',
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_branches (
  user_id   INTEGER NOT NULL REFERENCES users(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  role      TEXT NOT NULL DEFAULT 'owner',      -- owner | manager | staff
  PRIMARY KEY (user_id, branch_id)
);

-- 예약 — 네 시스템이 공유하는 가장 중요한 테이블
CREATE TABLE IF NOT EXISTS reservations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,           -- SP26080112
  branch_id     INTEGER NOT NULL REFERENCES branches(id),
  use_date      TEXT NOT NULL,                  -- YYYY-MM-DD
  slot          TEXT NOT NULL,                  -- day | night
  name          TEXT NOT NULL,                  -- 예약자명
  phone         TEXT NOT NULL,
  people_base   INTEGER NOT NULL DEFAULT 0,
  people_extra  INTEGER NOT NULL DEFAULT 0,
  base_amount   INTEGER NOT NULL DEFAULT 0,     -- 타임 기본 요금
  extra_amount  INTEGER NOT NULL DEFAULT 0,     -- 추가 인원 요금
  option_amount INTEGER NOT NULL DEFAULT 0,     -- 옵션(현장 추가)
  total_amount  INTEGER NOT NULL DEFAULT 0,
  deposit_amount INTEGER NOT NULL DEFAULT 0,    -- 예약금 (홈페이지 결제분)
  status        TEXT NOT NULL DEFAULT 'waiting',-- waiting|confirmed|completed|canceled|noshow
  source        TEXT NOT NULL DEFAULT 'web',    -- web | manual | external
  channel       TEXT,                           -- naver | spacecloud | phone …
  refund_type   TEXT,                           -- full | none
  request_note  TEXT,
  customer_id   INTEGER,                        -- 홈페이지 회원 예약이면 customers.id
  checked_in_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_res_branch_date ON reservations(branch_id, use_date);
CREATE INDEX IF NOT EXISTS idx_res_phone ON reservations(phone);
-- idx_res_customer 는 컬럼을 추가한 뒤에 만들어야 하므로 000_alter.sql 로 옮겼습니다.

-- 지점 휴무
CREATE TABLE IF NOT EXISTS branch_closures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id  INTEGER NOT NULL REFERENCES branches(id),
  use_date   TEXT NOT NULL,
  slot       TEXT,                              -- NULL이면 하루 전체
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_closure_date ON branch_closures(branch_id, use_date);

-- 챗봇이 읽는 정책·FAQ (ssople-chatbot이 만들고 채웁니다)
CREATE TABLE IF NOT EXISTS bot_policies (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_faqs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  keywords   TEXT,
  is_fixed   INTEGER NOT NULL DEFAULT 0,
  verified   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
