-- ============================================================
-- 홈페이지가 쓰는 컬럼을 branches 에 붙입니다.
-- 호스트 스키마에는 없는 것들입니다.
--
-- SQLite는 IF NOT EXISTS 를 지원하지 않아서, 이미 있으면 오류가 납니다.
-- "duplicate column name" 오류는 무시하고 넘어가시면 됩니다.
-- ============================================================
ALTER TABLE branches ADD COLUMN region TEXT;
ALTER TABLE branches ADD COLUMN lat REAL;
ALTER TABLE branches ADD COLUMN lng REAL;
ALTER TABLE branches ADD COLUMN tags TEXT DEFAULT '[]';
ALTER TABLE branches ADD COLUMN day_start INTEGER DEFAULT 12;
ALTER TABLE branches ADD COLUMN day_end INTEGER DEFAULT 18;
ALTER TABLE branches ADD COLUMN night_start INTEGER DEFAULT 19;
ALTER TABLE branches ADD COLUMN night_end INTEGER DEFAULT 25;
ALTER TABLE reservations ADD COLUMN customer_id INTEGER;

-- 회원 예약 조회용 인덱스 (customer_id 컬럼을 추가한 뒤에 만듭니다)
CREATE INDEX IF NOT EXISTS idx_res_customer ON reservations(customer_id);
