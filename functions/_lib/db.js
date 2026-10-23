// 고객 홈페이지 전용 DB(ssople-web) — 표 자동 생성, 기본 지점 데이터, 설정값
import { SEED_SPACES, SEED_VERSION, SEED_PREV } from './seed-spaces.js';
import { HttpError, lit, nowIso, parseJSON, chunk } from './util.js';

export const SCHEMA_VERSION = 3;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS spaces (code TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT, area TEXT, visible INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL DEFAULT '{}', updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS occ (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, d TEXT NOT NULL, slot TEXT, s INTEGER, e INTEGER, src TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'block', ref TEXT, note TEXT, batch TEXT, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_occ ON occ(code, d)`,
  `CREATE TABLE IF NOT EXISTS sync_log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT, at TEXT, ok INTEGER, n INTEGER, msg TEXT)`,
  `CREATE TABLE IF NOT EXISTS clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, kind TEXT, pkg TEXT, d TEXT, at TEXT, ih TEXT)`,
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, pw TEXT NOT NULL, nick TEXT NOT NULL UNIQUE, birth TEXT, region TEXT, intro TEXT, avatar TEXT, role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'active', marketing INTEGER NOT NULL DEFAULT 0, memo TEXT, host_codes TEXT, created_at TEXT, last_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS sessions (th TEXT PRIMARY KEY, uid INTEGER, admin INTEGER NOT NULL DEFAULT 0, exp INTEGER NOT NULL, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, board TEXT NOT NULL, scope INTEGER NOT NULL DEFAULT 0, uid INTEGER NOT NULL, title TEXT, body TEXT NOT NULL, imgs TEXT NOT NULL DEFAULT '[]', code TEXT, rating INTEGER, verified INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, cmts INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT, tag TEXT, answered INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_posts ON posts(board, scope, hidden, id)`,
  `CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, uid INTEGER NOT NULL, parent_id INTEGER, body TEXT NOT NULL, reports INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_cmts ON comments(post_id, id)`,
  `CREATE TABLE IF NOT EXISTS reactions (kind TEXT NOT NULL, target INTEGER NOT NULL, uid INTEGER NOT NULL, created_at TEXT, PRIMARY KEY (kind, target, uid))`,
  `CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, target INTEGER NOT NULL, uid INTEGER NOT NULL, reason TEXT, status TEXT NOT NULL DEFAULT 'open', created_at TEXT, UNIQUE (kind, target, uid))`,
  `CREATE TABLE IF NOT EXISTS meetups (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, title TEXT NOT NULL, cat TEXT, region TEXT, intro TEXT, cover TEXT, cap INTEGER NOT NULL DEFAULT 30, join_mode TEXT NOT NULL DEFAULT 'approve', chat_url TEXT, rules TEXT, members INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', reports INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS meetup_members (meetup_id INTEGER NOT NULL, uid INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'joined', msg TEXT, created_at TEXT, PRIMARY KEY (meetup_id, uid))`,
  `CREATE TABLE IF NOT EXISTS meetup_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, meetup_id INTEGER NOT NULL, uid INTEGER, title TEXT NOT NULL, d TEXT NOT NULL, t TEXT, code TEXT, place TEXT, cap INTEGER, memo TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS plan_rsvps (plan_id INTEGER NOT NULL, uid INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT, PRIMARY KEY (plan_id, uid))`,
  `CREATE TABLE IF NOT EXISTS crews (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, title TEXT NOT NULL, body TEXT, d TEXT NOT NULL, t TEXT, code TEXT, region TEXT, need INTEGER NOT NULL DEFAULT 4, cost TEXT, cond TEXT, chat_url TEXT, status TEXT NOT NULL DEFAULT 'open', accepted INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS crew_apps (crew_id INTEGER NOT NULL, uid INTEGER NOT NULL, msg TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT, PRIMARY KEY (crew_id, uid))`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, title TEXT NOT NULL, summary TEXT, body TEXT, cover TEXT, cat TEXT, d TEXT, d2 TEXT, t1 TEXT, t2 TEXT, code TEXT, place TEXT, cap INTEGER, price TEXT, mode TEXT NOT NULL DEFAULT 'rsvp', ext_url TEXT, members_only INTEGER NOT NULL DEFAULT 0, adult INTEGER NOT NULL DEFAULT 0, max_n INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'open', going INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS event_rsvps (event_id INTEGER NOT NULL, uid INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 1, msg TEXT, status TEXT NOT NULL, created_at TEXT, PRIMARY KEY (event_id, uid))`,
  `CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, uid INTEGER NOT NULL, title TEXT NOT NULL, host TEXT, d TEXT, t TEXT, code TEXT, place TEXT, msg TEXT, theme TEXT, cover TEXT, show_list INTEGER NOT NULL DEFAULT 1, deadline TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS invite_rsvps (id INTEGER PRIMARY KEY AUTOINCREMENT, invite_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 1, msg TEXT, th TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS partners (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, cat TEXT, benefit TEXT, body TEXT, url TEXT, img TEXT, region TEXT, tier TEXT NOT NULL DEFAULT 'all', code TEXT, sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT, org TEXT, contact TEXT, body TEXT, status TEXT NOT NULL DEFAULT 'new', memo TEXT, uid INTEGER, ih TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, code TEXT NOT NULL, d TEXT NOT NULL, ref TEXT, method TEXT, status TEXT NOT NULL DEFAULT 'pending', note TEXT, created_at TEXT, decided_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS badges (uid INTEGER NOT NULL, badge TEXT NOT NULL, created_at TEXT, PRIMARY KEY (uid, badge))`,
  `CREATE TABLE IF NOT EXISTS annivs (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, title TEXT NOT NULL, md TEXT NOT NULL, noti_year INTEGER, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS notis (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, kind TEXT, text TEXT NOT NULL, link TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_notis ON notis(uid, id)`,
];

let ready = null;

/** 첫 요청에서 표를 만들고 지점 기본 데이터(운영지점리스트 기준)를 넣는다. SQL을 직접 실행할 필요가 없다. */
export function ensureSchema(env) {
  if (!env.DB) {
    return Promise.reject(new HttpError(503,
      '전용 데이터베이스(DB)가 아직 연결되지 않았어요. 배포 안내서의 "D1 만들기" 단계를 확인해 주세요.'));
  }
  if (!ready) {
    ready = (async () => {
      let v = 0;
      try {
        const r = await env.DB.prepare(`SELECT v FROM meta WHERE k='schema'`).first();
        v = r ? Number(r.v) : 0;
      } catch { v = 0; }
      if (v < SCHEMA_VERSION) {
        if (!v) {
          // 안전장치: DB 연결이 실수로 호스트 예약 DB를 가리키면 표를 만들지 않고 멈춘다
          const foreign = (await env.DB.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('reservations', 'settlements', 'branches', 'web_settings') LIMIT 1`,
          ).first()) || null;
          if (foreign) {
            throw new HttpError(503, 'DB 연결이 호스트 예약 DB를 가리키고 있어요. wrangler.toml의 DB(첫 번째 d1_databases)를 ssople-web 데이터베이스 ID로 바꿔 주세요.');
          }
        }
        await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
        if (v && v < 2) {
          // v2: 회원에 호스트 지점 연결(host_codes) 칸 추가
          try { await env.DB.prepare('ALTER TABLE users ADD COLUMN host_codes TEXT').run(); } catch { /* 이미 있으면 통과 */ }
        }
        if (v && v < 3) {
          // v3: 지점 소식 분류(tag: notice·news·event)와 지점 문의 답변 여부(answered)
          try { await env.DB.prepare('ALTER TABLE posts ADD COLUMN tag TEXT').run(); } catch { /* 이미 있으면 통과 */ }
          try { await env.DB.prepare('ALTER TABLE posts ADD COLUMN answered INTEGER NOT NULL DEFAULT 0').run(); } catch { /* 이미 있으면 통과 */ }
        }
        const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM spaces').first();
        if (!c || !c.n) {
          await seedSpaces(env.DB);
          await setMeta(env.DB, 'seed', SEED_VERSION);
          await setMeta(env.DB, 'seed_at', nowIso());
        }
        await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('schema', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`)
          .bind(String(SCHEMA_VERSION)).run();
        await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('installed_at', ?) ON CONFLICT(k) DO NOTHING`).bind(nowIso()).run();
      }
      // 지점 기본 데이터가 새 판으로 바뀌었으면(예약 링크·운영 지점 목록) 한 번만 맞춘다
      if ((await getMeta(env.DB, 'seed')) !== SEED_VERSION) await applySeedUpdate(env.DB);
      if ((await getMeta(env.DB, 'biz_v')) !== BIZ_VERSION) await migrateBiz(env.DB);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const rowVals = (s, at) => {
  const data = { ...s };
  delete data.code; delete data.sort; delete data.visible;
  return `(${lit(s.code)}, ${lit(s.name)}, ${lit(s.region)}, ${lit(s.area)}, ${s.visible === false ? 0 : 1}, ${lit(s.sort || 0)}, ${lit(JSON.stringify(data))}, ${lit(at)})`;
};
export function spaceRowSql(list, at = nowIso()) {
  return `INSERT OR IGNORE INTO spaces (code, name, region, area, visible, sort, data, updated_at) VALUES ${list.map((s) => rowVals(s, at)).join(', ')}`;
}
/** 이미 있는 지점을 한 문장으로 고쳐 쓴다 (순서 sort는 그대로 둔다) */
function spaceUpsertSql(list, at) {
  return `INSERT INTO spaces (code, name, region, area, visible, sort, data, updated_at) VALUES ${list.map((s) => rowVals(s, at)).join(', ')}
    ON CONFLICT(code) DO UPDATE SET name = excluded.name, region = excluded.region, area = excluded.area,
      visible = excluded.visible, data = excluded.data, updated_at = excluded.updated_at`;
}

export async function seedSpaces(db, only) {
  const list = only ? SEED_SPACES.filter((s) => only.includes(s.code)) : SEED_SPACES;
  // 문장 길이 제한(100KB)을 넘지 않게 나눠서 넣는다
  const at = nowIso();
  for (const part of chunk(list, 12)) await db.prepare(spaceRowSql(part, at)).run();
}

export const seedOf = (code) => SEED_SPACES.find((s) => s.code === code) || null;

const itemNo = (u) => (String(u || '').match(/items\/(\d+)/) || [])[1] || '';
export const pkgSig = (pkgs) => (pkgs || []).map((p) => `${p.k}:${itemNo(p.url)}`).join(',');

/**
 * 지점 데이터 바로잡기 — 관리자·호스트가 고친 지점에도 한 번 적용한다 (새 판을 올릴 때마다 한 번)
 * 2026-10-23: 바로잡기 없음 — 아임웹 지점 상세(공간 상세·이용 안내·시설 목록·해시태그)를 빈 칸에만 채운다
 * 2026-10-22: 레스텔 게임기(닌텐도 스위치), 구로 어반아일랜드·대전 화양연화 바베큐 금액, 화양연화 '게임대' 문구 삭제
 */
const has원 = (t) => /\d\s*만?\s*원/.test(String(t || ''));
/** 모든 지점 공통 정리 — '게임대대'처럼 잘못 들어간 시설 항목·문장을 뺀다 ("게임 대회" 같은 말은 그대로) */
const BAD_ITEM = /^게임\s*대+$|게임\s*대\s*대/;
const BAD_LINE = /게임\s*대\s*대/;
export function cleanFacility(d) {
  const f = d.feat;
  if (f) for (const k of ['zones', 'games']) if (Array.isArray(f[k])) f[k] = f[k].filter((x) => !BAD_ITEM.test(String(x).trim()));
  if (Array.isArray(d.tags)) d.tags = d.tags.filter((x) => !BAD_ITEM.test(String(x).trim()));
  for (const k of ['intro', 'notice']) if (typeof d[k] === 'string' && BAD_LINE.test(d[k])) d[k] = d[k].split('\n').filter((l) => !BAD_LINE.test(l)).join('\n');
  if (d.info) for (const [k, v] of Object.entries(d.info)) if (typeof v === 'string' && BAD_LINE.test(v)) d.info[k] = v.split('\n').filter((l) => !BAD_LINE.test(l)).join('\n') || null;
  for (const it of ['karaoke', 'bbq', 'pet']) if (f && f[it] && typeof f[it].note === 'string' && BAD_LINE.test(f[it].note)) f[it].note = f[it].note.split('·').map((x) => x.trim()).filter((x) => !BAD_LINE.test(x)).join(' · ');
}

export const SEED_FIXES = {
  'S-0009': (d) => {
    d.feat = { ...(d.feat || {}), console: true };
    d.feat.games = (d.feat.games || []).map((g) => (g === '닌텐도' ? '닌텐도 스위치' : g));
    if (!d.feat.games.some((g) => /닌텐도|스위치/.test(g))) d.feat.games.unshift('닌텐도 스위치');
    if (Array.isArray(d.tags) && !d.tags.includes('게임기')) d.tags.push('게임기');
    d.intro = String(d.intro || '').replace('TJ 노래방과 TV, 이동식 인덕션, 냉장고가 있고 보드게임 11종이 비치돼 있어요.', 'TJ 노래방과 TV가 있고, TV에 연결해 쓰는 닌텐도 스위치(게임 타이틀 6종)와 보드게임 4종이 비치돼 있어요. 이동식 인덕션과 냉장고도 있어요.');
  },
  'S-0003': (d) => {
    const f = (d.feat = { ...(d.feat || {}) });
    if (f.bbq && f.bbq.on && !has원(f.bbq.note)) f.bbq = { on: true, note: '숯 바베큐 3만원 · 숯 추가 1만원 · 당일 추가 가능' };
    d.intro = String(d.intro || '').replace('테라스에서 숯 바베큐를 할 수 있어서', '테라스에서 숯 바베큐(3만원)를 할 수 있어서');
  },
  'S-0042': (d) => {
    const f = (d.feat = { ...(d.feat || {}) });
    if (f.bbq && f.bbq.on && !has원(f.bbq.note)) f.bbq = { on: true, note: '숯 바베큐 3만원(세트) · 당일 추가 가능 · 최대 2세트 · 비 올 땐 6인 이하만' };
    f.zones = (f.zones || []).filter((z) => !/게임\s*대/.test(z));
    f.games = (f.games || []).filter((z) => !/게임\s*대/.test(z));
    d.intro = String(d.intro || '').replace('루프탑에서 숯 바베큐(당일 추가 가능, 비 올 땐 6인 이하만)', '루프탑에서 숯 바베큐(세트 3만원, 당일 추가 가능, 비 올 땐 6인 이하만)')
      .split('\n').filter((l) => !/게임\s*대\s*대/.test(l)).join('\n');
    d.notice = String(d.notice || '').split('\n').filter((l) => !/게임\s*대\s*대/.test(l)).join('\n');
  },
};

/**
 * 지점 기본 데이터 새 판 적용 (2026-10-11: 운영지점리스트 기준 예약 링크 · 운영하지 않는 지점 숨김)
 *  - 관리자가 손대지 않은 지점: 새 데이터로 바꾸고 사진·소개·공지·다른 이름은 그대로 둔다
 *  - 관리자가 고친 지점: 예약 링크만 맞춘다. 이전 판 그대로인 값만 바꾸고, 직접 바꾼 값은 남긴다
 *  - 목록에 없는 지점은 숨긴다 (지우지 않음 — 관리자 화면에서 다시 공개할 수 있다)
 */
export async function applySeedUpdate(db) {
  const at = nowIso();
  const base = (await getMeta(db, 'seed_at')) || (await getMeta(db, 'installed_at'));
  const rows = (await db.prepare('SELECT code, name, region, area, visible, data, updated_at FROM spaces').all()).results || [];
  const have = new Map(rows.map((r) => [r.code, r]));
  const upd = [];
  const add = [];
  for (const seed of SEED_SPACES) {
    const r = have.get(seed.code);
    if (!r) { add.push(seed); continue; }
    const cur = parseJSON(r.data, {});
    const { visible: sv, ...fresh } = seed;
    // 관리자가 고친 지점: 고칠 때 붙는 표시(edited)로 알아보고, 표시가 없던 예전 판은 고친 시각으로 알아본다
    const touched = !!cur.edited || !base || !r.updated_at || Date.parse(r.updated_at) > Date.parse(base) + 10e3;
    let next;
    if (!touched) {
      next = {
        ...fresh,
        photos: (cur.photos && cur.photos.length) ? cur.photos : (fresh.photos || []),
        intro: cur.intro || fresh.intro || '', notice: cur.notice || fresh.notice || '',
        aliases: (cur.aliases && cur.aliases.length) ? cur.aliases : (fresh.aliases || []),
        visible: sv !== false,
      };
    } else {
      const [prevPlace, prevSig] = (SEED_PREV && SEED_PREV[seed.code]) || ['', ''];
      next = { ...cur, code: seed.code, name: r.name, region: r.region, area: r.area, visible: sv === false ? false : !!r.visible, edited: true };
      if (!cur.book && fresh.book) next.book = fresh.book;
      if (!cur.intro && fresh.intro) next.intro = fresh.intro;   // 소개가 비어 있던 지점만 새 소개 글로 채운다
      // 2026-10-23 아임웹 지점 상세: 비어 있는 칸만 채운다 (관리자·호스트가 쓴 내용은 그대로)
      for (const k of ['detail', 'care', 'facs']) if (!cur[k] && fresh[k]) next[k] = fresh[k];
      if (!(cur.kw && cur.kw.length) && fresh.kw && fresh.kw.length) next.kw = fresh.kw;
      if (!(cur.photos && cur.photos.length) && fresh.photos && fresh.photos.length) next.photos = fresh.photos;
      if (fresh.place && (!cur.place || cur.place === prevPlace)) next.place = fresh.place;
      if (pkgSig(cur.pkgs) === prevSig) {
        // 패키지 구성·링크를 손대지 않았으면 새 목록 기준으로 맞추고, 요금·시간은 관리자가 고친 값을 쓴다
        const byK = Object.fromEntries((cur.pkgs || []).map((p) => [p.k, p]));
        next.pkgs = (fresh.pkgs || []).map((p) => (byK[p.k] ? { ...byK[p.k], url: p.url } : p));
      } else {
        const prevNo = Object.fromEntries(String(prevSig).split(',').filter(Boolean).map((x) => x.split(':')));
        next.pkgs = (cur.pkgs || []).map((p) => {
          const f = (fresh.pkgs || []).find((x) => x.k === p.k);
          if (!f || !f.url) return p;
          return !p.url || itemNo(p.url) === (prevNo[p.k] || '') ? { ...p, url: f.url } : p;
        });
      }
    }
    // 이번 판에서 바로잡는 내용(바베큐 요금·게임기 등) — 고친 지점이든 아니든 해당 문장·항목만 맞춘다
    if (SEED_FIXES[seed.code]) SEED_FIXES[seed.code](next);
    cleanFacility(next);
    upd.push({ ...next, code: seed.code });
  }
  for (const part of chunk(upd, 12)) await db.prepare(spaceUpsertSql(part, at)).run();
  for (const part of chunk(add, 12)) await db.prepare(spaceRowSql(part, at)).run();
  await setMeta(db, 'seed', SEED_VERSION);
  await setMeta(db, 'seed_at', at);
  return { updated: upd.length, added: add.length };
}

/* ---------------- 사업자 정보 판 올림 ----------------
 * 관리자 화면에서 설정을 한 번이라도 저장했다면 예전 기본값((주)소셜패밀리)이 DB에 남아 있다.
 * 예전 기본값 그대로인 칸만 지워서 새 기본값(브이픽서(주))이 보이게 하고, 직접 고친 값은 그대로 둔다. */
export const BIZ_VERSION = '2026-10-22';
const OLD_BIZ = { 'biz.name': ['(주)소셜패밀리', '㈜소셜패밀리', '주식회사 소셜패밀리'], 'biz.email': ['contact@socialfamily.co.kr', 'ceo@socialfamily.co.kr'] };
export async function migrateBiz(db) {
  const rows = (await db.prepare(`SELECT k, v FROM settings WHERE k LIKE 'biz.%'`).all()).results || [];
  const cur = Object.fromEntries(rows.map((r) => [r.k, r.v ?? '']));
  const drop = [];
  const oldName = !('biz.name' in cur) || OLD_BIZ['biz.name'].includes(String(cur['biz.name']).trim());
  if ('biz.name' in cur && oldName) drop.push('biz.name');
  if ('biz.email' in cur && OLD_BIZ['biz.email'].includes(String(cur['biz.email']).trim())) drop.push('biz.email');
  if (oldName) {
    // 상호가 예전 회사 그대로였다면 대표자·사업자번호도 예전 값이므로 새 기본값으로
    if ('biz.ceo' in cur && String(cur['biz.ceo']).trim() === '최시준') drop.push('biz.ceo');
    if ('biz.no' in cur && !String(cur['biz.no']).trim()) drop.push('biz.no');
  }
  if (drop.length) await db.batch(drop.map((k) => db.prepare('DELETE FROM settings WHERE k = ?').bind(k)));
  setCache = null;
  await setMeta(db, 'biz_v', BIZ_VERSION);
  return drop;
}

/* ---------------- 설정 ---------------- */
export const CLUB_BENEFITS = {
  welcome: ['클럽 회원 전용 행사 신청', '파티 초대장 · 놀이터 · 파티 준비 도구', '기념일 30일 전 알림'],
  silver: ['웰컴 혜택 전부', '제휴처 실버 혜택', '공식 행사 우선 신청'],
  gold: ['실버 혜택 전부', '제휴처 골드 혜택', '신규 지점 오픈 행사 초대'],
};

export const DEFAULTS = {
  'site.notice': '',
  'site.notice_link': '',
  'hero.title': '',
  'hero.sub': '',
  'cs.phone': '1544-3523',
  'cs.hours': '월~목 10:00~19:00 · 금~일 10:00~22:00',
  'kakao.url': 'http://pf.kakao.com/_mufLd/chat',
  'sns.instagram': 'https://www.instagram.com/ssople_partyroom',
  'sns.blog': '',
  'sns.youtube': '',
  'link.play': '',
  'link.live': '',
  'link.chatbot': '',
  'link.host': '',
  // 사업자 정보 — 바닥글·회사 정보·이용약관·개인정보처리방침에 들어간다 (2026.10.22 기존 홈페이지 기준)
  'biz.name': '브이픽서(주)',
  'biz.ceo': '김동준',
  'biz.no': '895-88-03679',
  'biz.mailorder': '',
  'biz.addr': '',
  'biz.email': 'vfixer@naver.com',
  'biz.privacy_officer': '최시준',
  // 함께 표시하는 회사 (이름을 비우면 숨김)
  'biz2.name': '제이에스시스템즈(주)',
  'biz2.ceo': '임동은',
  'biz2.no': '716-86-04411',
  'biz2.addr': '경기도 화성시 병점구 효행로 1069, 601호-H201',
  'biz2.email': 'jssystems0@naver.com',
  'club.silver': '2',
  'club.gold': '4',
  'club.benefits': JSON.stringify(CLUB_BENEFITS),
  'club.coupon_note': '',
  'avail.sync_min': '10',
  'avail.mode': 'auto',          // auto: 호스트 동기화가 살아 있을 때만 '예약 가능' 표시 / on: 항상 / off: 숨김
  'community.banned': '',
  'community.hide_at': '3',
  'signup.open': '1',
  'home.featured': '',
  'seo.naver_verify': '',
  'seo.google_verify': '',
  'seo.bing_verify': '',
  'seo.canonical_host': '',      // 비우면 자동 — ssople.com 이 이 홈페이지에 연결되면 그 주소가 대표 주소. 값을 적으면 그 값이 우선 (되돌리기: ssople.pages.dev)
  'host.premium_price': '50000',
  'host.plus_price': '30000',
  'host.discount6': '10',
  'host.discount12': '20',
  'host.managed_fee': '20',
};
const PRIVATE_KEYS = new Set(['community.banned']);

let setCache = null;
let setCacheAt = 0;
export async function getSettings(db) {
  if (setCache && Date.now() - setCacheAt < 30000) return setCache;
  const rows = (await db.prepare('SELECT k, v FROM settings').all()).results || [];
  const s = { ...DEFAULTS };
  for (const r of rows) if (r.k in DEFAULTS) s[r.k] = r.v ?? '';
  setCache = s; setCacheAt = Date.now();
  return s;
}
export function publicSettings(s) {
  const out = {};
  for (const k of Object.keys(s)) if (!PRIVATE_KEYS.has(k)) out[k] = s[k];
  out['club.benefits'] = parseJSON(s['club.benefits'], CLUB_BENEFITS);
  return out;
}
export async function saveSettings(db, patch) {
  const at = nowIso();
  const stmts = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    stmts.push(db.prepare('INSERT INTO settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at')
      .bind(k, String(v ?? ''), at));
  }
  if (stmts.length) await db.batch(stmts);
  setCache = null;
}

/* ---------------- meta ---------------- */
export async function getMeta(db, k, def = null) {
  const r = await db.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first();
  return r ? r.v : def;
}
export async function setMeta(db, k, v) {
  await db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();
}

/* ---------------- 보관 기간 정리 (개인정보처리방침과 맞춤) ----------------
   하루 한 번만 돈다. 클릭 기록 400일, 문의 1년, 초대장·응답은 파티 날짜(없으면 만든 날)로부터 1년,
   알림 1년, 방문 인증의 예약번호 메모는 확인 끝나고 90일 뒤 지운다. */
export async function housekeep(db) {
  const last = await getMeta(db, 'housekeep_at');
  if (last && Date.now() - Date.parse(last) < 86400e3) return false;
  await setMeta(db, 'housekeep_at', nowIso());
  const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const y1 = ago(365).slice(0, 10);
  await db.batch([
    db.prepare('DELETE FROM clicks WHERE at < ?').bind(ago(400)),
    db.prepare('DELETE FROM inquiries WHERE created_at < ?').bind(ago(365)),
    db.prepare(`UPDATE visits SET note = NULL WHERE note LIKE '예약번호 %' AND decided_at IS NOT NULL AND decided_at < ?`).bind(ago(90)),
    db.prepare('DELETE FROM invite_rsvps WHERE invite_id IN (SELECT id FROM invites WHERE COALESCE(d, substr(created_at, 1, 10)) < ?)').bind(y1),
    db.prepare('DELETE FROM invites WHERE COALESCE(d, substr(created_at, 1, 10)) < ?').bind(y1),
    db.prepare('DELETE FROM notis WHERE created_at < ?').bind(ago(365)),
    db.prepare('DELETE FROM sync_log WHERE at < ?').bind(ago(90)),
  ]);
  return true;
}

/* ---------------- 알림 ---------------- */
export function notiStmt(db, uid, kind, text, link) {
  return db.prepare('INSERT INTO notis (uid, kind, text, link, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(uid, kind, String(text).slice(0, 200), link || null, nowIso());
}
/** 여러 명에게 같은 알림 — 문장 하나로 넣는다 (D1 요청 수 절약) */
export function notiManyStmt(db, uids, kind, text, link) {
  const at = nowIso();
  const t = String(text).slice(0, 200);
  const vals = [...new Set(uids)].filter((u) => Number.isInteger(u) && u > 0).slice(0, 1000)
    .map((u) => `(${u}, ${lit(kind)}, ${lit(t)}, ${lit(link || null)}, ${lit(at)})`);
  if (!vals.length) return null;
  return db.prepare(`INSERT INTO notis (uid, kind, text, link, created_at) VALUES ${vals.join(', ')}`);
}
export async function notify(db, uid, kind, text, link) {
  if (!uid) return;
  await notiStmt(db, uid, kind, text, link).run();
}

/* ---------------- 배지 ---------------- */
export const BADGES = {
  first_visit: { name: '첫 방문', desc: '방문 인증을 처음 받았어요' },
  regular: { name: '단골', desc: '1년 안에 4번 방문했어요' },
  reviewer: { name: '후기 작가', desc: '이용후기를 남겼어요' },
  meetup_host: { name: '모임장', desc: '모임을 열었어요' },
  crew_host: { name: '파티팀 리더', desc: '파티팀을 모았어요' },
  event_goer: { name: '행사 참여', desc: '쏘플 행사에 참가했어요' },
  inviter: { name: '초대장 호스트', desc: '초대장으로 5명 이상 모았어요' },
  writer: { name: '첫 글', desc: '커뮤니티에 처음 글을 썼어요' },
};
export function badgeStmt(db, uid, badge) {
  return db.prepare('INSERT OR IGNORE INTO badges (uid, badge, created_at) VALUES (?, ?, ?)').bind(uid, badge, nowIso());
}
