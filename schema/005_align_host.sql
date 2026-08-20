-- ============================================================
-- 005_align_host.sql — 호스트 센터 · 대시보드와 스키마 정합
--
-- 왜 필요한가
--   고객 홈페이지와 호스트 센터가 같은 D1 하나를 쓰는데,
--   두 시스템이 만든 테이블 정의가 서로 달랐습니다.
--   SQLite 는 CREATE TABLE IF NOT EXISTS 를 만나면 이미 있는 테이블을
--   그냥 건너뛰기 때문에, 먼저 만든 쪽(호스트)의 컬럼만 실제로 존재합니다.
--   그 결과 고객 쪽 코드가 없는 컬럼(visibility, reservation_id …)을
--   찾다가 조용히 실패하고 있었습니다.
--
-- 이 파일이 하는 일
--   ① 두 시스템이 필요로 하는 컬럼을 한 테이블에 모두 채워 넣습니다
--   ② 호스트가 쓰는 테이블(휴무 · 점주알림 · 예약이력 · 발송로그)이
--      아직 없으면 호스트 규격 그대로 만들어 둡니다
--   ③ 고객 쪽에만 있던 휴무 데이터를 호스트 표준 테이블로 옮깁니다
--
-- 실행 위치: Cloudflare → D1 → ssople-host → Console
-- "duplicate column name" 오류는 이미 있다는 뜻이니 그 줄만 건너뛰면 됩니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1) reservations — 호스트가 읽는 입금·취소 컬럼을 채웁니다
--
--    호스트 예약 상세는 잔금을
--      total_amount − (입금완료면 deposit_amount)
--    로 계산합니다. 그래서 온라인 전액결제 예약은
--      deposit_amount = total_amount  (대관료 전액 선납)
--    으로 기록해야 점주 화면에 잔금 0원으로 뜹니다.
--    환급 대상인 보증금은 헷갈리지 않도록 deposit_hold 에 따로 담습니다.
-- ------------------------------------------------------------
ALTER TABLE reservations ADD COLUMN options         TEXT    NOT NULL DEFAULT '[]';
ALTER TABLE reservations ADD COLUMN deposit_status  TEXT    NOT NULL DEFAULT 'waiting';
ALTER TABLE reservations ADD COLUMN deposit_paid_at TEXT;
ALTER TABLE reservations ADD COLUMN balance_method  TEXT;
ALTER TABLE reservations ADD COLUMN cancel_reason   TEXT;
ALTER TABLE reservations ADD COLUMN canceled_at     TEXT;
ALTER TABLE reservations ADD COLUMN deposit_hold    INTEGER;   -- 보증금 (환급 대상)
ALTER TABLE reservations ADD COLUMN updated_at      TEXT;      -- 마지막 변경 시각 (고객 시스템)

-- 이미 들어온 예약이 있다면 보증금 값을 옮겨 둡니다
UPDATE reservations SET deposit_hold = deposit_amount
 WHERE deposit_hold IS NULL AND deposit_amount > 0;


-- ------------------------------------------------------------
-- 2) reviews — 점주 답글·신고 처리와 고객 후기를 한 테이블에서
--    호스트: writer · reservation_code · hidden · report_status
--    고객  : reservation_id · customer_id (누가 쓴 후기인지 연결)
-- ------------------------------------------------------------
ALTER TABLE reviews ADD COLUMN writer           TEXT;
ALTER TABLE reviews ADD COLUMN reservation_code TEXT;
ALTER TABLE reviews ADD COLUMN photos           TEXT    NOT NULL DEFAULT '[]';
ALTER TABLE reviews ADD COLUMN reply_updated_at TEXT;
ALTER TABLE reviews ADD COLUMN report_status    TEXT    NOT NULL DEFAULT 'none';
ALTER TABLE reviews ADD COLUMN report_reason    TEXT;
ALTER TABLE reviews ADD COLUMN hidden           INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN reservation_id   INTEGER;
ALTER TABLE reviews ADD COLUMN customer_id      INTEGER;

CREATE INDEX IF NOT EXISTS idx_reviews_branch ON reviews(branch_id, hidden);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_res ON reviews(reservation_id)
  WHERE reservation_id IS NOT NULL;


-- ------------------------------------------------------------
-- 3) 호스트 표준 테이블 — 아직 없으면 만들어 둡니다
--    (호스트 센터를 먼저 배포했다면 이 블록은 전부 건너뜁니다)
-- ------------------------------------------------------------

-- 휴무 · 마감 — 지정일 / 요일반복 / 기간 세 가지를 지원합니다
CREATE TABLE IF NOT EXISTS closures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id  INTEGER NOT NULL REFERENCES branches(id),
  kind       TEXT NOT NULL DEFAULT 'date',   -- date | weekly | period
  date       TEXT,                           -- kind=date
  weekday    INTEGER,                        -- kind=weekly, 0=일 ~ 6=토
  start_date TEXT,                           -- kind=period
  end_date   TEXT,
  slot       TEXT NOT NULL DEFAULT 'all',    -- all | day | night
  reason     TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_closures_branch ON closures(branch_id);

-- 점주 알림 (호스트 센터 종 아이콘)
CREATE TABLE IF NOT EXISTS owner_notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id  INTEGER NOT NULL REFERENCES branches(id),
  user_id    INTEGER,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 예약 변경 이력
CREATE TABLE IF NOT EXISTS reservation_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id),
  actor          TEXT NOT NULL,
  action         TEXT NOT NULL,
  detail         TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 문자 · 알림톡 발송 로그 (호스트 규격)
CREATE TABLE IF NOT EXISTS message_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id      INTEGER NOT NULL REFERENCES branches(id),
  reservation_id INTEGER,
  sender         TEXT NOT NULL,
  template       TEXT NOT NULL,
  channel        TEXT NOT NULL,
  content        TEXT NOT NULL,
  status         TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 감사 로그
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id  INTEGER,
  user_id    INTEGER,
  actor      TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ------------------------------------------------------------
-- 4) 고객 쪽에만 있던 휴무 데이터를 호스트 표준으로 이관
--    (branch_closures 는 이제 쓰지 않습니다)
-- ------------------------------------------------------------
INSERT INTO closures (branch_id, kind, date, slot, reason, created_by, created_at)
SELECT branch_id, 'date', use_date, COALESCE(slot, 'all'), reason, '이관', created_at
  FROM branch_closures
 WHERE NOT EXISTS (
   SELECT 1 FROM closures c
    WHERE c.branch_id = branch_closures.branch_id
      AND c.kind = 'date' AND c.date = branch_closures.use_date
 );


-- ------------------------------------------------------------
-- 5) 정산 정책값 — 대시보드가 쓰는 키 이름을 그대로 씁니다
--    대시보드 정책 화면에서 수수료율을 바꾸면 settle.hq_rate 가 바뀌므로,
--    고객 홈페이지·호스트도 같은 키를 읽어야 세 시스템이 어긋나지 않습니다.
-- ------------------------------------------------------------
-- 정산 정책은 002_seed.sql 에서 이미 넣었습니다
--   settle.hq_rate 20 · settle.owner_rate 80
--   settle.close_day 1 · settle.objection_day 5 · settle.payout_day 10
-- 대시보드 정책 화면이 쓰는 키와 같은 이름이므로 그대로 두면 됩니다.
-- (대시보드에서 수수료율을 바꾸면 settle.hq_rate 가 갱신되고,
--  호스트 정산 크론과 고객 홈페이지가 같은 값을 읽습니다)
