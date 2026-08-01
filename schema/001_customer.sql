-- ============================================================
-- 쏘플파티룸 홈페이지(고객) — 고객측 테이블
--
-- 중요: 이 파일은 호스트 홈페이지(ssople-host)의 schema.sql을 먼저 적용한
-- 다음에 실행합니다. 지점·예약·정산 테이블은 호스트가 주인이고,
-- 홈페이지는 그 위에 고객측 테이블만 얹습니다.
--
--   호스트가 만드는 테이블   branches, branch_photos, users, reservations,
--                            settlements, settlement_items, notices,
--                            audit_logs, reservation_logs, memberships …
--   홈페이지가 만드는 테이블  customers, customer_grade_logs, payments,
--                            refunds, reviews, web_settings, web_events,
--                            chat_logs
--
-- 홈페이지는 branches / branch_photos 를 읽기만 하고,
-- reservations 에는 source='web' 인 행만 씁니다.
-- ============================================================

-- 고객 회원 -----------------------------------------------------
-- 호스트의 users 테이블은 점주·스태프용입니다. 고객은 여기에 따로 둡니다.
CREATE TABLE IF NOT EXISTS customers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  phone          TEXT NOT NULL UNIQUE,          -- 로그인 아이디 겸 알림 수신 번호
  email          TEXT,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  salt           TEXT NOT NULL,                 -- 호스트와 같은 방식(해시+솔트 분리)
  grade          TEXT NOT NULL DEFAULT 'WELCOME',
  status         TEXT NOT NULL DEFAULT 'active',-- active | dormant | withdrawn
  marketing_ok   INTEGER NOT NULL DEFAULT 0,
  kakao_id       TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until   TEXT,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_grade_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  grade_from  TEXT,
  grade_to    TEXT NOT NULL,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 결제 ---------------------------------------------------------
-- 예약금(기본 80,000원)을 홈페이지에서 받습니다. 잔금은 현장 처리이며
-- 호스트 화면의 '잔금' 항목과 그대로 이어집니다.
CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER REFERENCES reservations(id),
  order_id       TEXT UNIQUE NOT NULL,
  pg_tid         TEXT,
  method         TEXT,                          -- card | kakaopay | naverpay | transfer
  amount         INTEGER NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'deposit', -- deposit | full
  status         TEXT NOT NULL,                 -- ready | paid | canceled | failed
  approved_at    TEXT,
  raw            TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_res ON payments(reservation_id);

CREATE TABLE IF NOT EXISTS refunds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id   INTEGER NOT NULL REFERENCES payments(id),
  amount       INTEGER NOT NULL,
  reason       TEXT,
  rule_label   TEXT,                            -- 적용 규정 문구
  status       TEXT NOT NULL DEFAULT 'done',    -- requested | done | failed
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- 후기 ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER UNIQUE NOT NULL REFERENCES reservations(id),
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  branch_id      INTEGER NOT NULL REFERENCES branches(id),
  rating         INTEGER NOT NULL,
  content        TEXT NOT NULL,
  photos         TEXT,
  reply          TEXT,                          -- 점주 답글 (호스트 화면에서 작성)
  replied_at     TEXT,
  visibility     TEXT NOT NULL DEFAULT 'visible', -- visible | hidden | reported
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_branch ON reviews(branch_id);

-- 홈페이지 설정 -------------------------------------------------
-- 운영 규정 수치를 코드가 아닌 데이터로 둡니다.
CREATE TABLE IF NOT EXISTS web_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 이벤트·공지 (고객 화면용) --------------------------------------
CREATE TABLE IF NOT EXISTS web_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  summary    TEXT,
  body       TEXT,
  thumb      TEXT,
  starts_at  TEXT,
  ends_at    TEXT,
  pinned     INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'published', -- draft | published
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 홈페이지 챗봇 대화 기록 ----------------------------------------
-- 카카오 채널 챗봇(ssople-chatbot)은 자기 기록을 따로 남깁니다.
-- 여기는 홈페이지 위젯에서 오간 대화만 남깁니다.
CREATE TABLE IF NOT EXISTS chat_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  question   TEXT NOT NULL,
  answer     TEXT,
  source     TEXT,                              -- bot | fallback
  resolved   INTEGER NOT NULL DEFAULT 1,
  handoff    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 이중 예약 방지 ------------------------------------------------
-- 한 지점의 같은 날 같은 타임은 살아있는 예약이 하나뿐이어야 합니다.
-- 호스트·홈페이지·수기 등록 어디서 들어와도 이 인덱스가 마지막으로 막습니다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_res_slot
  ON reservations(branch_id, use_date, slot)
  WHERE status IN ('waiting','confirmed','completed','noshow');
