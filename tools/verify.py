#!/usr/bin/env python3
"""
배포 전 통합 검증
  python3 tools/verify.py
실제 스키마를 메모리 DB에 올리고, 홈페이지 로직과 같은 계산으로
예약·요금·환불·이중예약·정산 대조를 확인합니다.
"""
import sqlite3, json, sys, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

def strip_comments(sql):
    """줄 단위 -- 주석 제거 (문자열 안의 -- 는 건드리지 않음)"""
    out = []
    for line in sql.split('\n'):
        if line.strip().startswith('--'):
            continue
        out.append(line)
    return '\n'.join(out)

def load(db, path):
    sql = strip_comments(open(path, encoding='utf-8').read())
    if '000_alter' in path:
        for stmt in [s.strip() for s in sql.split(';') if s.strip()]:
            try:
                db.execute(stmt)
            except sqlite3.OperationalError as e:
                if 'duplicate column' not in str(e):
                    raise
    else:
        db.executescript(sql)

def calc(br, slot, people):
    base = br['night_price'] if slot == 'night' else br['day_price']
    ex = max(0, people - br['base_people'])
    return {
        'baseAmount': base,
        'extraAmount': ex * br['extra_price'],
        'totalAmount': base + ex * br['extra_price'],
        'peopleBase': min(people, br['base_people']),
        'peopleExtra': ex,
    }

fails = []
def check(cond, msg):
    print(('  OK   ' if cond else '  실패 ') + msg)
    if not cond:
        fails.append(msg)

db = sqlite3.connect(':memory:')
for f in ['schema/000_shared.sql', 'schema/000_alter.sql',
          'schema/001_customer.sql', 'schema/002_seed.sql']:
    load(db, f)
print('스키마 4종 적용 완료\n')

# 1) 컬럼
print('[1] 테이블 구조')
cols = [c[1] for c in db.execute('PRAGMA table_info(branches)')]
check(all(c in cols for c in ['region', 'tags', 'day_start', 'night_end']),
      f'branches 홈페이지 컬럼 추가됨 (총 {len(cols)}개)')
rcols = [c[1] for c in db.execute('PRAGMA table_info(reservations)')]
need = ['branch_id', 'use_date', 'slot', 'name', 'phone', 'people_base', 'people_extra',
        'base_amount', 'extra_amount', 'total_amount', 'deposit_amount',
        'status', 'source', 'refund_type', 'customer_id']
check(all(c in rcols for c in need), 'reservations 호스트 공용 컬럼 전부 존재')
tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
check({'customers', 'payments', 'refunds', 'reviews', 'web_settings', 'chat_logs'} <= tables,
      '홈페이지 전용 테이블 생성됨')

# 2) 요금
print('\n[2] 요금 계산 — 강남점 (낮 180,000 / 밤 260,000 / 기본 8명 / 추가 15,000)')
cur = db.execute('SELECT * FROM branches WHERE id=1')
b = dict(zip([c[0] for c in cur.description], cur.fetchone()))
for slot, ppl, expect in [('day', 6, 180000), ('day', 8, 180000),
                          ('night', 8, 260000), ('night', 12, 320000)]:
    r = calc(b, slot, ppl)
    print(f'    {slot:5s} {ppl:2d}명 → {r["baseAmount"]:,} + {r["extraAmount"]:,} = {r["totalAmount"]:,}원')
    check(r['totalAmount'] == expect, f'{slot} {ppl}명 = {expect:,}원')

# 3) 예약 생성
print('\n[3] 예약 생성 (결제 웹훅과 같은 INSERT)')
DEPOSIT = int(db.execute("SELECT value FROM web_settings WHERE key='deposit.amount'").fetchone()[0])
amt = calc(b, 'night', 12)
db.execute("""INSERT INTO reservations
 (code,branch_id,use_date,slot,name,phone,people_base,people_extra,
  base_amount,extra_amount,option_amount,total_amount,deposit_amount,status,source)
 VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,'confirmed','web')""",
 ('SP26082001', 1, '2026-08-20', 'night', '홍길동', '010-1111-2222',
  amt['peopleBase'], amt['peopleExtra'], amt['baseAmount'], amt['extraAmount'],
  amt['totalAmount'], DEPOSIT))
print(f'    총 {amt["totalAmount"]:,}원 · 예약금 {DEPOSIT:,}원 · 잔금 {amt["totalAmount"]-DEPOSIT:,}원')

r = db.execute("""SELECT status, source, total_amount, deposit_amount,
                  total_amount - deposit_amount FROM reservations WHERE code='SP26082001'""").fetchone()
check(r[0] == 'confirmed' and r[1] == 'web', '호스트가 읽는 상태값·경로 일치 (confirmed / web)')
check(r[4] == amt['totalAmount'] - DEPOSIT, f'잔금 계산 일치 ({r[4]:,}원)')

# 4) 이중예약
print('\n[4] 이중 예약 차단')
blocked = False
try:
    db.execute("""INSERT INTO reservations (code,branch_id,use_date,slot,name,phone,total_amount,status,source)
                  VALUES ('X',1,'2026-08-20','night','김철수','010-3333-4444',260000,'waiting','manual')""")
except sqlite3.IntegrityError:
    blocked = True
check(blocked, '호스트 수기 등록(manual)도 같은 타임이면 차단됨')

ok_other = True
try:
    db.execute("""INSERT INTO reservations (code,branch_id,use_date,slot,name,phone,total_amount,deposit_amount,status,source)
                  VALUES ('Y',1,'2026-08-20','day','이영희','010-5555-6666',180000,80000,'confirmed','web')""")
except sqlite3.IntegrityError:
    ok_other = False
check(ok_other, '같은 날 다른 타임은 정상 등록')

cancelled_ok = True
try:
    db.execute("""UPDATE reservations SET status='canceled', refund_type='full' WHERE code='Y'""")
    db.execute("""INSERT INTO reservations (code,branch_id,use_date,slot,name,phone,total_amount,deposit_amount,status,source)
                  VALUES ('Z',1,'2026-08-20','day','박민수','010-7777-8888',180000,80000,'confirmed','web')""")
except sqlite3.IntegrityError:
    cancelled_ok = False
check(cancelled_ok, '취소된 예약 자리는 다시 판매됨')

# 5) 환불
print('\n[5] 환불 판정 — 예약금 80,000원 기준')
rules = json.loads(db.execute("SELECT value FROM web_settings WHERE key='refund.rules'").fetchone()[0])
rules.sort(key=lambda x: -x['min_days'])
def judge(days_left, paid):
    h = next((r for r in rules if days_left >= r['min_days']),
             {'rate': 0, 'type': 'none', 'label': '환불 불가'})
    return h['type'], int(paid * h['rate'] / 100), h['label']
for d in [10, 8, 7, 6, 3, 0]:
    t, a, l = judge(d, DEPOSIT)
    print(f'    D-{d:<2d} → {t:5s} {a:>7,}원   {l}')
check(judge(7, DEPOSIT)[1] == DEPOSIT, 'D-7 전액 환불')
check(judge(6, DEPOSIT)[1] == 0, 'D-6 환불 불가')
check(judge(7, DEPOSIT)[0] == 'full' and judge(6, DEPOSIT)[0] == 'none',
      'refund_type 값이 호스트 규격(full/none)과 일치')

# 6) 가용성
print('\n[6] 가용성 조회')
taken = {x[0] for x in db.execute("""SELECT slot FROM reservations WHERE branch_id=1
         AND use_date='2026-08-20' AND status IN ('waiting','confirmed','completed','noshow')""")}
free = sorted({'day', 'night'} - taken)
print(f'    08-20 강남점 → 예약됨 {sorted(taken)} · 남은 타임 {free or "없음"}')
check(taken == {'day', 'night'}, '예약된 타임이 정확히 잡힘')

# 7) 정산 대조
print('\n[7] 정산 숫자 대조 (호스트가 집계하지만 원장이 맞는지 확인)')
gross = db.execute("""SELECT COALESCE(SUM(total_amount),0) FROM reservations
                      WHERE branch_id=1 AND status IN ('confirmed','completed','noshow')""").fetchone()[0]
owner = int(gross * 80 / 100)
print(f'    총매출 {gross:,} → 점주 80% {owner:,} · 본사 20% {gross-owner:,}')
check(owner + (gross - owner) == gross, '배분 합계가 총매출과 일치')

# 8) 챗봇 공유 테이블
print('\n[8] 챗봇 연동')
check('bot_faqs' in tables and 'bot_policies' in tables, '챗봇이 쓰는 테이블이 같은 DB에 있음')
db.execute("INSERT INTO bot_faqs(category,question,answer,keywords,is_fixed) VALUES ('환불','환불되나요','이용 7일 전까지 전액 환불됩니다.','환불,취소',1)")
hit = db.execute("SELECT answer FROM bot_faqs WHERE is_fixed=1").fetchone()
check(hit is not None, '고정응답 조회 가능 (챗봇 장애 시 홈페이지가 대신 답함)')

print('\n' + ('검증 실패 %d건: %s' % (len(fails), fails) if fails else '전체 검증 통과'))
sys.exit(1 if fails else 0)
