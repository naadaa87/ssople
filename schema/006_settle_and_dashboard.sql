-- ============================================================
-- 006_settle_and_dashboard.sql
--   ① 정산 기준을 「할인 후 실매출」로 바꿉니다
--   ② 본사 대시보드가 쓰는 테이블과 고객 홈페이지를 연결합니다
--
-- 실행 위치: Cloudflare → D1 → ssople-host → Console
-- 005_align_host.sql 을 먼저 실행한 뒤에 돌리세요.
-- ============================================================


-- ------------------------------------------------------------
-- 1) 정산 기준 금액 — 할인을 점주 8 : 본사 2 로 함께 부담
--
--    지금까지는 정가로 정산해서 쿠폰·포인트 할인을 본사가 100% 떠안았습니다.
--    앞으로는 실제로 들어온 돈(정가 − 쿠폰 − 포인트)을 기준으로 나눕니다.
--
--      정가 100,000 · 쿠폰 5,000 → 실매출 95,000
--        점주 76,000 (전보다 4,000 ↓ = 할인의 80%)
--        본사 19,000 (전보다 1,000 ↓ = 할인의 20%)
--
--    net_amount 에 실매출을 담아 두면 호스트·대시보드가
--    쿠폰 로직을 몰라도 이 값만 합산하면 됩니다.
-- ------------------------------------------------------------
ALTER TABLE reservations ADD COLUMN net_amount INTEGER;   -- 정산 기준 실매출

-- 이미 들어온 예약을 소급 계산합니다 (할인이 없으면 정가 그대로)
UPDATE reservations
   SET net_amount = MAX(0, COALESCE(total_amount,0)
                          - COALESCE(coupon_discount,0)
                          - COALESCE(point_used,0))
 WHERE net_amount IS NULL;

INSERT OR REPLACE INTO web_settings(key, value) VALUES
  ('settle.base',           'net'),
  ('settle.discount_share', 'shared');
-- settle.base = net    정산 기준이 할인 후 실매출 (현재 규정)
--             = gross  정가 기준 — 할인을 본사가 전액 부담하던 예전 방식
-- 이 값만 바꾸면 두 방식 사이를 오갈 수 있습니다.


-- ------------------------------------------------------------
-- 2) 대시보드 연동 테이블 — 없으면 만들어 둡니다
--    (대시보드를 이미 실운영으로 돌리고 계시면 전부 건너뜁니다)
-- ------------------------------------------------------------

-- 변경 감지 도장 — 다른 시스템이 무엇을 건드렸는지 대시보드에 알립니다
CREATE TABLE IF NOT EXISTS ops_touch (
  tbl TEXT NOT NULL,
  rid TEXT NOT NULL,
  up  INTEGER NOT NULL,
  PRIMARY KEY (tbl, rid)
);
CREATE INDEX IF NOT EXISTS idx_touch_up ON ops_touch(up);

-- 보증금 차감 · 분쟁 (대시보드 「분쟁·보증금」 화면의 정본)
CREATE TABLE IF NOT EXISTS ops_incidents (
  id            TEXT PRIMARY KEY,
  at            INTEGER NOT NULL,
  res_code      TEXT NOT NULL,
  branch_code   TEXT,
  kind          TEXT NOT NULL,          -- clean / damage / noise / over / smoke / etc
  note          TEXT,
  photos_json   TEXT NOT NULL DEFAULT '[]',
  amount        INTEGER NOT NULL DEFAULT 0,
  state         TEXT NOT NULL DEFAULT 'PROPOSED',  -- PROPOSED → DISPUTED → CONFIRMED / WITHDRAWN
  dispute_until TEXT,
  extra_json    TEXT NOT NULL DEFAULT '{}',
  actor         TEXT,
  up            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inc_res ON ops_incidents(res_code);

-- 포인트 원장 미러 (대시보드에서 수동 지급·차감할 때 씁니다)
CREATE TABLE IF NOT EXISTS cust_points (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       INTEGER NOT NULL,
  phone    TEXT NOT NULL,
  name     TEXT,
  kind     TEXT NOT NULL,               -- earn / use / adjust / expire
  amount   INTEGER NOT NULL,
  memo     TEXT,
  res_code TEXT,
  actor    TEXT,
  up       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cpoints_phone ON cust_points(phone);

-- 고객 문의 (대시보드 「회원·리뷰 → 문의 SLA」)
CREATE TABLE IF NOT EXISTS cust_inquiries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'web',
  name        TEXT,
  phone       TEXT,
  branch_code TEXT,
  subject     TEXT,
  body        TEXT,
  state       TEXT NOT NULL DEFAULT 'OPEN',
  assignee    TEXT,
  answer      TEXT,
  up          INTEGER NOT NULL DEFAULT 0
);

-- 창업 상담 접수 (대시보드 「창업」 파이프라인)
CREATE TABLE IF NOT EXISTS franchise_leads (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     INTEGER NOT NULL,
  name   TEXT,
  phone  TEXT,
  region TEXT,
  memo   TEXT,
  stage  TEXT NOT NULL DEFAULT 'NEW',   -- NEW → CONSULT → SURVEY → CONTRACT
  up     INTEGER NOT NULL DEFAULT 0
);


-- ------------------------------------------------------------
-- 3) 포인트 흡수 표시 — 대시보드에서 넣은 조정분이 고객 잔액에
--    이미 반영됐는지 표시합니다 (크론이 씁니다)
-- ------------------------------------------------------------
ALTER TABLE cust_points ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
