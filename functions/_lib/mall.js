// 쏘플파티몰 — 쏘플이 고른 파티 준비물을 쿠팡 파트너스 링크로 모아 보여 줘요
//  - 결제·배송·교환은 모두 쿠팡에서 해요. 쏘플은 상품을 고르고 링크만 걸어요.
//  - 쿠팡 파트너스 활동이라 대가성 문구(MALL_DISCLOSURE)를 화면에 꼭 보여 줘요.
//  - 가격은 쿠팡에서 수시로 바뀌어서 쏘플 화면에는 적지 않아요.
import { HttpError, str, int, nowIso } from './util.js';
import { bumpContent } from './edge.js';

export const MALL_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

export const MALL_CATS = [
  { id: 'deco', name: '파티 데코', icon: 'sparkle', desc: '풍선·가랜드·커튼·조명으로 벽 한 면을 포토존으로' },
  { id: 'bday', name: '생일 · 기념일', icon: 'cake', desc: '케이크 토퍼와 LED 초, 주인공을 위한 소품' },
  { id: 'games', name: '보드게임', icon: 'dice', desc: '처음 만난 사이도 금방 친해지는 파티 보드게임' },
  { id: 'play', name: '음향 · 놀이', icon: 'mic', desc: '스피커·노래방 마이크·빔프로젝터, 벌칙 게임' },
  { id: 'table', name: '식기 · 테이블', icon: 'grid', desc: '접시·잔·커틀러리부터 테이블 러너와 플레이팅 보드까지' },
  { id: 'cook', name: '조리 · 바베큐', icon: 'flame', desc: '화로대·버너·전기그릴, 굽고 데우는 도구' },
  { id: 'food', name: '음식 · 간식', icon: 'pot', desc: '나눠 먹는 과자와 데워 먹는 간식, 야외용 먹거리' },
  { id: 'drink', name: '음료 · 얼음', icon: 'snow', desc: '건배 음료와 커피, 컵얼음과 아이스박스' },
  { id: 'outdoor', name: '캠핑 · 피크닉', icon: 'umbrella', desc: '테이블·의자·돗자리·그늘막·랜턴·쿨러백' },
  { id: 'weather', name: '날씨 대비', icon: 'heat', desc: '핫팩·담요·보온병, 야외에서 춥지 않게' },
  { id: 'season', name: '시즌 · 행사', icon: 'star', desc: '크리스마스·브라이덜 샤워·졸업 파티 소품' },
  { id: 'photo', name: '포토 · 추억', icon: 'camera', desc: '즉석카메라, 셀카봉, 포토 프린터' },
  { id: 'gift', name: '답례 · 선물', icon: 'gift', desc: '구디백·포장·롤링페이퍼·현수막' },
  { id: 'clean', name: '뒷정리', icon: 'trash', desc: '물티슈·위생장갑·지퍼백·대용량 봉투' },
];

// 장소별·상황별 준비물 — 상품의 tags 로 묶어요 (한 상품이 여러 곳에 들어갈 수 있어요)
export const MALL_SETS = [
  { id: 'room', group: 'place', name: '파티룸', icon: 'door', desc: '쏘플파티룸에 들고 가면 좋은 것. 지점 비품에 없는 것만 챙겨요', more: ['/rooms', '파티할 지점 찾기'] },
  { id: 'home', group: 'place', name: '홈파티', icon: 'home', desc: '집들이·생일·연말 모임을 집에서 열 때' },
  { id: 'camp', group: 'place', name: '캠핑 파티', icon: 'flame', desc: '캠핑장·글램핑에서 굽고 놀고 밤까지' },
  { id: 'picnic', group: 'place', name: '한강 · 공원 피크닉', icon: 'sun', desc: '돗자리 펴고 즐기는 야외 파티' },
  { id: 'office', group: 'place', name: '회사 · 사무실 파티', icon: 'building', desc: '송년회·생일 축하·환송회를 사무실에서' },
  { id: 'birthday', group: 'occasion', name: '생일파티', icon: 'cake', desc: '풍선과 토퍼, LED 초, 주인공 소품까지', more: ['/purpose-birthday', '생일파티 하기 좋은 지점'] },
  { id: 'kids', group: 'occasion', name: '키즈 생일파티', icon: 'smile', desc: '아이 친구들을 초대하는 생일 파티와 답례품' },
  { id: 'bridal', group: 'occasion', name: '브라이덜 샤워', icon: 'heart', desc: '풍선 구름과 신부 소품, 건배 음료', more: ['/purpose-bridal', '브라이덜 샤워 하기 좋은 지점'] },
  { id: 'yearend', group: 'occasion', name: '연말 · 크리스마스', icon: 'star', desc: '트리와 앵두전구, 넉넉한 식기와 음료', more: ['/purpose-yearend', '송년회·신년회 하기 좋은 지점'] },
  { id: 'exam', group: 'occasion', name: '수능 끝 · 졸업 파티', icon: 'badge', desc: '학사모 풍선과 나눠 먹는 간식', more: ['/guide', '미성년자 이용 기준 보기'] },
  { id: 'gamenight', group: 'occasion', name: '보드게임 나이트', icon: 'dice', desc: '보드게임과 벌칙 게임, 같이 먹을 간식', more: ['/games', '쏘플 파티게임 8종'] },
];
export const MALL_GROUPS = [
  { id: 'place', title: '어디서 파티해요?', desc: '파티룸, 집, 캠핑장, 한강공원, 사무실. 장소마다 챙길 게 달라요.' },
  { id: 'occasion', title: '어떤 파티예요?', desc: '모임에 맞춰 함께 챙기면 좋은 준비물을 묶었어요.' },
];

const CAT_IDS = new Set(MALL_CATS.map((c) => c.id));
const SET_IDS = new Set(MALL_SETS.map((s) => s.id));
const LINK_RE = /^https:\/\/(link\.coupang\.com\/a\/[A-Za-z0-9_-]{4,40}|coupa\.ng\/[A-Za-z0-9_-]{4,40})$/;
const IMG_RE = /^(https:\/\/[a-z0-9.-]+\.coupangcdn\.com\/[^\s"'<>]{4,400}|\/api\/img\/u\/\d{6}\/[A-Za-z0-9]{8,24}\.(jpg|png|webp|gif)|\/assets\/[^\s"'<>]{4,200})$/;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const tagsOf = (s) => String(s || '').split(/[\s,]+/).filter((t) => SET_IDS.has(t));

/** 공개 화면에 보여 줄 칸만 */
export const publicItem = (r) => ({ id: r.id, cat: r.cat, name: r.name, note: r.note || '', url: r.url, img: r.img || '', tags: tagsOf(r.tags), pick: r.pick ? 1 : 0 });

export async function loadMall(db, { all = false } = {}) {
  const rows = (await db.prepare(
    `SELECT id, pid, cat, name, note, url, img, tags, pick, sort, active, clicks, updated_at FROM mall_items ${all ? '' : 'WHERE active = 1'} ORDER BY sort, id`,
  ).all()).results || [];
  const pos = Object.fromEntries(MALL_CATS.map((c, i) => [c.id, i]));
  return rows.sort((a, b) => (pos[a.cat] ?? 99) - (pos[b.cat] ?? 99) || a.sort - b.sort || a.id - b.id);
}

/** 관리자가 넣은 값 다듬기 */
export function cleanMallItem(b, prev = {}) {
  const out = { ...prev };
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (has('cat') || !prev.cat) {
    if (!CAT_IDS.has(b.cat)) throw new HttpError(400, '분류를 골라 주세요.');
    out.cat = b.cat;
  }
  if (has('name') || !prev.name) out.name = str(b.name, { max: 40, required: true, name: '상품 이름' });
  if (has('note')) out.note = str(b.note, { max: 80, name: '한 줄 소개' }) || null;
  if (has('url') || !prev.url) {
    const u = String(b.url || '').trim();
    if (!LINK_RE.test(u)) throw new HttpError(400, '쿠팡 파트너스에서 만든 단축 주소(https://link.coupang.com/a/…)를 그대로 붙여 넣어 주세요.');
    out.url = u;
  }
  if (has('img')) {
    const i = String(b.img || '').trim();
    if (i && !IMG_RE.test(i)) throw new HttpError(400, '사진 주소는 쿠팡 상품 사진 주소(https://…coupangcdn.com/…)나 직접 올린 사진만 쓸 수 있어요.');
    out.img = i || null;
  }
  if (has('tags')) out.tags = (Array.isArray(b.tags) ? b.tags : tagsOf(b.tags)).filter((t) => SET_IDS.has(t)).join(' ') || null;
  if (has('pick')) out.pick = b.pick ? 1 : 0;
  if (has('sort')) out.sort = int(b.sort, { min: 0, max: 9999, def: 0 });
  if (has('active')) out.active = b.active ? 1 : 0;
  return out;
}

/* ---------------- 화면 그리기 (서버 · 검색 로봇용, 손님 화면도 그대로 써요) ---------------- */
const icon = (n, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
export function mallCard(p, { eager = false } = {}) {
  const a = `href="${esc(p.url)}" target="_blank" rel="sponsored nofollow noopener" referrerpolicy="unsafe-url" data-mall="${p.id}"`;
  return `<article class="ml-card" data-cat="${esc(p.cat)}" data-tags="${esc(p.tags.join(' '))}">
<a class="ml-img" ${a} tabindex="-1" aria-hidden="true">${p.img ? `<img src="${esc(p.img)}" alt="" width="492" height="492" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : `<span class="ml-noimg">${icon('image')}</span>`}</a>
<div class="ml-body">${p.pick ? '<span class="ml-pick">쏘플 추천</span>' : ''}<h3 class="ml-name"><a ${a}>${esc(p.name)}</a></h3>${p.note ? `<p class="ml-note">${esc(p.note)}</p>` : ''}
<a class="ml-go" ${a}>쿠팡에서 보기${icon('ext', 'sm')}</a></div></article>`;
}

/** 쏘플파티몰 본문 — 분류별 상품 */
export function mallBlocks(items) {
  const list = items.map(publicItem);
  if (!list.length) return null;
  let first = 0;
  const secs = MALL_CATS.map((c) => {
    const ps = list.filter((p) => p.cat === c.id);
    if (!ps.length) return '';
    return `<section class="ml-sec" id="c-${c.id}" data-cat="${c.id}"><div class="ml-sec-hd"><span class="ml-sec-ic">${icon(c.icon)}</span><div><h2 class="h3">${esc(c.name)}</h2><p>${esc(c.desc)}</p></div><span class="ml-sec-n">${ps.length}가지</span></div>
<div class="ml-grid">${ps.map((p) => mallCard(p, { eager: first++ < 4 })).join('')}</div></section>`;
  }).join('');
  const thumbs = (tag) => list.filter((p) => p.tags.includes(tag) && p.img);
  const setCard = (s) => {
    const n = list.filter((p) => p.tags.includes(s.id)).length;
    if (!n) return '';
    const ps = thumbs(s.id);
    const pics = [...ps.filter((p) => p.pick), ...ps.filter((p) => !p.pick)].slice(0, 4);
    return `<a class="ml-set" href="/mall?set=${s.id}#catalog" data-set="${s.id}"><span class="ml-set-pics">${pics.map((p) => `<img src="${esc(p.img)}" alt="" width="492" height="492" loading="lazy" decoding="async">`).join('')}</span>
<span class="ml-set-tx"><b>${icon(s.icon, 'sm')}${esc(s.name)}</b><small>${esc(s.desc)}</small><span class="ml-set-n">준비물 ${n}가지 보기${icon('chev-r', 'sm')}</span></span></a>`;
  };
  const sets = MALL_GROUPS.map((g) => {
    const cards = MALL_SETS.filter((s) => s.group === g.id).map(setCard).join('');
    return cards ? `<div class="ml-group" data-group="${g.id}"><div class="ml-group-hd"><h3 class="h3">${esc(g.title)}</h3><p>${esc(g.desc)}</p></div><div class="ml-sets ml-sets-${g.id}">${cards}</div></div>` : '';
  }).join('');
  const chips = `<a class="chip sm on" href="#catalog" data-cat-go="">전체 <b>${list.length}</b></a>` + MALL_CATS.filter((c) => list.some((p) => p.cat === c.id)).map((c) => `<a class="chip sm" href="#c-${c.id}" data-cat-go="${c.id}">${esc(c.name)}</a>`).join('');
  const catN = MALL_CATS.filter((c) => list.some((p) => p.cat === c.id)).length;
  return { '#mallRoot': secs, '#mallSets': sets, '#mallChips': chips, '#mallTotal': String(list.length), '#mallCatN': String(catN) };
}

/* ---------------- API ---------------- */
export function register(route) {
  // 공개 — 가장자리 캐시(router EDGE_API)로 나눠 써요
  route('GET', '/api/mall', async (c) => {
    const items = (await loadMall(c.db)).map(publicItem);
    return { cats: MALL_CATS, sets: MALL_SETS, groups: MALL_GROUPS, items, disclosure: MALL_DISCLOSURE };
  });
  // 「쿠팡에서 보기」를 누른 수 — 어떤 상품을 많이 보는지 관리자 화면에서 봐요 (개인정보 없이 숫자만)
  route('POST', '/api/mall/click', async (c) => {
    let b = {};
    try { b = JSON.parse(await c.req.text() || '{}'); } catch { b = {}; }
    const id = int(b.id, { min: 1, max: 1e9, def: 0 });
    if (!id) return { ok: true };
    try { await c.limit('mc:' + (await c.ih()), 60, 600); } catch { return { ok: true }; }
    await c.db.prepare('UPDATE mall_items SET clicks = clicks + 1 WHERE id = ? AND active = 1').bind(id).run();
    return { ok: true };
  });
}

export function registerAdmin(route) {
  route('GET', '/api/admin/mall', async (c) => {
    await c.needAdmin();
    const rows = await loadMall(c.db, { all: true });
    return { items: rows.map((r) => ({ ...publicItem(r), sort: r.sort, active: r.active, clicks: r.clicks || 0, seed: !!r.pid, updatedAt: r.updated_at })), cats: MALL_CATS, sets: MALL_SETS, groups: MALL_GROUPS };
  });
  route('POST', '/api/admin/mall', async (c) => {
    await c.needAdmin();
    const f = cleanMallItem(await c.body(), { sort: 0, active: 1, pick: 0 });
    const at = nowIso();
    const r = await c.db.prepare('INSERT INTO mall_items (cat, name, note, url, img, tags, pick, sort, active, clicks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?) RETURNING id')
      .bind(f.cat, f.name, f.note || null, f.url, f.img || null, f.tags || null, f.pick || 0, f.sort || 0, f.active ? 1 : 0, at, at).first();
    bumpContent();
    return { ok: true, id: r.id };
  });
  route('PUT', '/api/admin/mall/:id', async (c) => {
    await c.needAdmin();
    const id = int(c.params.id, { min: 1 });
    const prev = await c.db.prepare('SELECT * FROM mall_items WHERE id = ?').bind(id).first();
    if (!prev) throw new HttpError(404, '상품을 찾을 수 없어요.');
    const f = cleanMallItem(await c.body(), prev);
    await c.db.prepare('UPDATE mall_items SET cat = ?, name = ?, note = ?, url = ?, img = ?, tags = ?, pick = ?, sort = ?, active = ?, updated_at = ? WHERE id = ?')
      .bind(f.cat, f.name, f.note || null, f.url, f.img || null, f.tags || null, f.pick ? 1 : 0, f.sort || 0, f.active ? 1 : 0, nowIso(), id).run();
    bumpContent();
    return { ok: true };
  });
  route('DELETE', '/api/admin/mall/:id', async (c) => {
    await c.needAdmin();
    await c.db.prepare('DELETE FROM mall_items WHERE id = ?').bind(int(c.params.id, { min: 1 })).run();
    bumpContent();
    return { ok: true };
  });
}
