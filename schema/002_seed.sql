-- ============================================================
-- 홈페이지 기초 데이터
-- 운영 규정은 코드가 아니라 여기(web_settings)에 둡니다.
-- ============================================================

INSERT OR REPLACE INTO web_settings(key, value) VALUES
  ('deposit.amount',       '80000'),   -- 예약금 (현행 규정)
  ('payment.mode',         'DEPOSIT'), -- DEPOSIT(예약금+잔금) | FULL(전액 선결제)
  ('hold.minutes',         '10'),      -- 결제 진행 중 시간 잠금
  ('settle.owner_rate',    '80'),
  ('settle.hq_rate',       '20'),
  ('settle.close_day',     '1'),
  ('settle.objection_day', '5'),
  ('settle.payout_day',    '10'),
  ('review.write_days',    '30'),
  ('slot.day.label',       '낮타임'),
  ('slot.day.time',        '12:00 ~ 18:00'),
  ('slot.night.label',     '밤타임'),
  ('slot.night.time',      '19:00 ~ 익일 01:00'),
  ('chat.rate_per_hour',   '30'),
  -- 환불 구간: 이용일까지 남은 일수 하한 → 환불률(%). 내림차순 판정.
  ('refund.rules', '[{"min_days":7,"rate":100,"type":"full","label":"이용 7일 전까지 · 예약금 전액 환불"},{"min_days":0,"rate":0,"type":"none","label":"이용 6일 전부터 · 환불 불가"}]');

-- ------------------------------------------------------------
-- 아래는 홈페이지 단독 검수용 샘플입니다.
-- 실제 운영에서는 호스트 홈페이지가 지점 데이터를 관리하므로
-- 이 INSERT는 건너뛰어도 됩니다. (README 5장 참고)
-- ------------------------------------------------------------
INSERT OR IGNORE INTO branches
 (id,code,name,address,phone,intro,day_price,night_price,base_people,extra_price,max_people,amenities,guide_text,parking_text,status)
VALUES
 (1,'GN01','강남점','서울 강남구 테헤란로 123','02-000-0001',
  '탁 트인 루프탑과 실내를 함께 쓰는 공간입니다. 저녁 시간대 야경이 좋아 생일파티와 브라이덜샤워로 많이 찾으십니다.',
  180000,260000,8,15000,16,'["빔프로젝터","노래방","바베큐","루프탑","냉난방"]',
  '퇴실 30분 전에 정리를 시작해 주세요.','건물 지하 주차 2대 가능. 이후 인근 공영주차장을 이용해 주세요.','open'),
 (2,'HD01','홍대점','서울 마포구 양화로 45','02-000-0002',
  '노래방 기기와 넓은 라운지가 있는 단체용 공간입니다. 스무 명까지 편하게 들어갑니다.',
  200000,300000,10,15000,20,'["노래방","빔프로젝터","보드게임","냉난방"]',
  '밤타임은 익일 새벽 1시까지 이용하실 수 있습니다.','전용 주차 불가. 인근 공영주차장 도보 3분.','open'),
 (3,'GC01','과천문원점','경기 과천시 문원동 12-3','02-000-0003',
  '세미나와 워크샵을 위한 넓은 홀입니다. 빔프로젝터와 화이트보드를 갖췄습니다.',
  160000,220000,10,12000,30,'["빔프로젝터","화이트보드","주차","바베큐","냉난방"]',
  '단체 이용 시 사전에 인원을 알려주시면 좌석을 미리 배치해 드립니다.','건물 주차 10대 가능.','open');

-- 홈페이지 전용 컬럼 값 채우기 (컬럼이 없으면 README의 ALTER를 먼저 실행)
UPDATE branches SET region='서울', lat=37.5006, lng=127.0366, tags='["생일","바베큐","루프탑","브라이덜샤워"]' WHERE id=1;
UPDATE branches SET region='서울', lat=37.5563, lng=126.9236, tags='["생일","단체","올나잇","노래방"]'     WHERE id=2;
UPDATE branches SET region='경기', lat=37.4291, lng=126.9977, tags='["워크샵","세미나","단체","바베큐"]'   WHERE id=3;

-- 이벤트 샘플
INSERT OR IGNORE INTO web_events(id,title,summary,body,pinned,status) VALUES
 (1,'첫 예약 안내','처음 오시는 분들을 위한 이용 안내','쏘플파티룸은 무인 스마트 입장으로 운영됩니다. 예약이 확정되면 출입 방법을 문자로 보내드립니다.',1,'published');
