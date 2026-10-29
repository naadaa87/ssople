// 검색 노출용 — 지역 페이지 주소, 구조화 데이터(JSON-LD), 검색엔진 소유 확인 태그
import { getSettings, getMeta, setMeta } from './db.js';
import { photoUrl } from './spaces.js';
import { AREA_GUIDES } from './area-guides.js';
import { MAGAZINE } from './magazine-index.js';
import { REGION_SLUGS, AREA_SLUGS, regionPath, areaPath } from './slugs.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');
export const jsonText = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(LS, '\\u2028').replace(PS, '\\u2029');

/* ---------- 지역·동네 주소 (slugs.js) ---------- */
export { REGION_SLUGS, AREA_SLUGS, regionPath, areaPath };

/** /area/<slug> → 어느 지역·동네인지 (slug 또는 한글 이름 둘 다 받아요) */
export function findArea(raw, spaces) {
  let key = String(raw || '');
  try { key = decodeURIComponent(key); } catch { /* 그대로 */ }
  key = key.trim().toLowerCase();
  if (!key) return null;
  const regions = [...new Set(spaces.map((s) => s.region))];
  const areas = [...new Set(spaces.map((s) => s.area))];
  const region = regions.find((r) => r.toLowerCase() === key || (REGION_SLUGS[r] || '') === key);
  // 같은 이름이 지역·동네 둘 다에 있으면(부산, 대전, 전주) 지역으로 본다
  if (region) return { kind: 'region', name: region, region, list: spaces.filter((s) => s.region === region) };
  const area = areas.find((a) => a.toLowerCase() === key || (AREA_SLUGS[a] || '') === key);
  if (area) { const list = spaces.filter((s) => s.area === area); return { kind: 'area', name: area, region: list[0].region, list }; }
  return null;
}

/** 사이트맵·지점 찾기에서 쓰는 지역·동네 주소 목록 */
export function areaPaths(spaces) {
  const out = [];
  const seen = new Set();
  for (const s of spaces) {
    const rp = regionPath(s.region);
    if (!seen.has(rp)) { seen.add(rp); out.push({ path: rp, kind: 'region', name: s.region }); }
    const ap = areaPath(s.area);
    if (!seen.has(ap)) { seen.add(ap); out.push({ path: ap, kind: 'area', name: s.area, region: s.region }); }
  }
  return out;
}

/* ---------- 구조화 데이터 ---------- */
const won = (n) => (n ? (n % 10000 === 0 ? `${n / 10000}만원` : `${(n / 10000).toFixed(1)}만원`) : '');
/** 가장 싼 요금 — 패키지 최저가와 (시간당 최저가 × 최소 시간) 중 낮은 값 */
export const minPrice = (s) => {
  const mins = (s.pkgs || []).map((p) => Math.min(...(p.p || []).filter(Boolean))).filter((n) => Number.isFinite(n));
  const h = s.hourly;
  if (h && (h.p || []).some(Boolean)) mins.push(Math.min(...h.p.filter(Boolean)) * (h.min || 1));
  return mins.length ? Math.min(...mins) : null;
};
/** 손님 화면 대표 예약 링크 — 호스트가 정한 예약 방식(링크형) → 패키지 네이버 예약 → 지점 네이버 예약 페이지 */
export function bookTarget(s) {
  const w = ((s.booking || {}).ways || []).find((x) => ['naver', 'link', 'kakao'].includes(x.k) && x.v);
  if (w) return { url: w.v, name: w.k === 'naver' ? '네이버 예약' : w.k === 'kakao' ? '카카오톡 채널' : (w.label || '예약 링크') };
  const p = (s.pkgs || []).find((x) => x.url);
  if (p) return { url: p.url, name: '네이버 예약' };
  if (s.book) return { url: s.book, name: '네이버 예약' };
  return null;
}
export const featList = (s) => {
  const f = s.feat || {};
  const out = [];
  if (f.karaoke?.on) out.push('노래방');
  if (f.bbq?.on) out.push('바베큐');
  if (f.pet?.on) out.push('반려견 동반');
  if (f.projector) out.push('빔프로젝터');
  if (f.tv) out.push('TV');
  if (f.console) out.push('게임기');
  if ((f.games || []).length) out.push('보드게임');
  if (f.fridge) out.push('냉장고');
  if (f.cook) out.push('조리 가능');
  for (const z of f.zones || []) out.push(z);
  return out;
};

/** 검색 결과에 보이는 웹사이트 이름·설명 (첫 화면 title·description, og:site_name 과 같게) */
export const SITE_NAME = '쏘플 파티룸 l 프라이빗 공간 · 파티룸은 쏘플!';
export const SITE_DESC = '즐거움이 가득한 쏘플 파티룸! 국내 No.1. 서울/수원/부산/광주/인천/대전/대구 등 전국 120여개 파티룸, 공간대여, 파티룸창업, 공실 솔루션. 생일파티·브라이덜샤워·기념일·송년회·회식·워크숍·동창회·촬영 대관까지 노래방·바베큐·루프탑 파티룸을 네이버 예약으로 바로 예약하세요.';
/** 네이버 서치어드바이저 소유 확인 (https://ssople.com) — 화면 머리 부분에 고정으로 들어가 있다 */
export const NAVER_VERIFY = '2b49069616c8ffe8d562333d7fa408da4fbbe2d3';

/** 상담 시간 글("월~목 10:00~19:00 · 금~일 10:00~22:00") → OpeningHoursSpecification 목록. 못 읽으면 undefined */
const DAY_KO = ['월', '화', '수', '목', '금', '토', '일'];
const DAY_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function hoursSpec(text) {
  const src = String(text || '').trim();
  if (!src) return undefined;
  const out = [];
  const hm = (t) => { const [h, m] = t.split(':'); return `${String(Number(h)).padStart(2, '0')}:${m}`; };
  for (const part of src.split(/[·,/|]|\s{2,}/)) {
    const p = part.trim();
    if (!p) continue;
    const time = p.match(/(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})/);
    if (!time) continue;
    let days = [];
    if (/매일|연중무휴|전체/.test(p)) days = [0, 1, 2, 3, 4, 5, 6];
    else if (/평일/.test(p)) days = [0, 1, 2, 3, 4];
    else if (/주말/.test(p)) days = [5, 6];
    else {
      const r = p.match(/([월화수목금토일])\s*(?:[~\-–]\s*([월화수목금토일]))?/);
      if (!r) continue;
      const a = DAY_KO.indexOf(r[1]);
      const b = r[2] ? DAY_KO.indexOf(r[2]) : a;
      for (let i = a; ; i = (i + 1) % 7) { days.push(i); if (i === b || days.length > 7) break; }
    }
    if (!days.length) continue;
    out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: days.map((i) => 'https://schema.org/' + DAY_EN[i]), opens: hm(time[1]), closes: hm(time[2]) });
  }
  return out.length ? out : undefined;
}

/** 쏘플파티룸과 창업자 소개 — 검색엔진·AI 답변이 인용하는 기본 사실 (홈 본문·브랜드 이야기·창업자 이야기와 같은 내용) */
export const BRAND_FACTS = {
  foundingYear: '2015',
  founderDesc: '2015년 홍대 소셜팩토리에서 파티룸이라는 공간 개념과 운영 방식을 만들기 시작해, 지금의 파티룸 시장과 산업의 초기 개념과 시장 구조를 만든 사람 중 한 명. 10년 넘게 340여 개 공간을 직접 기획·운영한 쏘플파티룸 창업자',
};

export function orgJsonLd(origin, st = {}) {
  const same = ['sns.instagram', 'sns.blog', 'sns.youtube', 'kakao.url'].map((k) => st[k]).filter(Boolean);
  const tel = st['cs.phone'] ? '+82-' + String(st['cs.phone']).replace(/^0/, '').replace(/[^\d-]/g, '') : undefined;
  return {
    '@context': 'https://schema.org', '@type': 'Organization', '@id': origin + '/#org',
    name: '쏘플파티룸', alternateName: ['쏘플 파티룸', 'SSOPLE', 'SSOPLE Party Room', '쏘플'], url: origin + '/',
    legalName: st['biz.name'] || undefined,
    logo: { '@type': 'ImageObject', url: origin + '/assets/img/logo.png', width: 551, height: 211 },
    image: origin + '/assets/img/og.jpg',
    description: SITE_DESC,
    telephone: tel,
    email: st['biz.email'] || undefined,
    address: st['biz.addr'] ? { '@type': 'PostalAddress', streetAddress: st['biz.addr'], addressCountry: 'KR' } : undefined,
    foundingDate: BRAND_FACTS.foundingYear, areaServed: 'KR',
    slogan: '사람들의 시간과 즐거움을 기억하는 공간',
    knowsAbout: ['파티룸', '공간대여', '파티룸 창업', '공실 활용', '무인 공간 운영'],
    founder: { '@type': 'Person', name: '최시준', jobTitle: '쏘플파티룸 창업자·대표', description: BRAND_FACTS.founderDesc, url: origin + '/ceo', sameAs: ['https://choisijun.com'] },
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer service', telephone: tel, availableLanguage: 'Korean', hoursAvailable: hoursSpec(st['cs.hours']) }],
    sameAs: same.length ? same : undefined,
  };
}
export function websiteJsonLd(origin) {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': origin + '/#website', url: origin + '/', name: SITE_NAME, alternateName: ['쏘플 파티룸', '쏘플파티룸', '쏘플', 'SSOPLE'], description: SITE_DESC, inLanguage: 'ko-KR',
    publisher: { '@id': origin + '/#org' },
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: origin + '/rooms?q={search_term_string}' }, 'query-input': 'required name=search_term_string' },
  };
}
export function breadcrumbJsonLd(origin, items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: origin + path })) };
}
export function roomJsonLd(origin, s, st = {}) {
  const from = minPrice(s);
  const photos = (s.photos || []).slice(0, 10).map(photoUrl).filter(Boolean).map((u) => (u.startsWith('/') ? origin + u : u));
  return {
    '@context': 'https://schema.org', '@type': ['LocalBusiness', 'EventVenue'], '@id': `${origin}/room/${s.code}#place`,
    name: `쏘플파티룸 ${s.name}`, alternateName: s.name, url: `${origin}/room/${s.code}`,
    image: photos.length ? photos : [origin + '/assets/img/og.jpg'],
    description: `${s.region} ${s.area} 파티룸. 기준 ${s.base || '-'}명, 최대 ${s.max || '-'}명.${from ? ` ${won(from)}부터.` : ''} ${featList(s).slice(0, 5).join(', ')}`.trim(),
    address: s.addr ? { '@type': 'PostalAddress', streetAddress: s.addr, addressRegion: s.region, addressCountry: 'KR' } : undefined,
    telephone: st['cs.phone'] ? '+82-' + String(st['cs.phone']).replace(/^0/, '').replace(/[^\d-]/g, '') : undefined,
    priceRange: from ? `${won(from)}~` : undefined,
    maximumAttendeeCapacity: s.max || undefined,
    amenityFeature: featList(s).map((n) => ({ '@type': 'LocationFeatureSpecification', name: n, value: true })),
    parentOrganization: { '@id': origin + '/#org' },
    hasMap: s.place || undefined,
    potentialAction: bookTarget(s) ? { '@type': 'ReserveAction', target: bookTarget(s).url, name: bookTarget(s).name } : undefined,
  };
}
export function areaJsonLd(origin, a) {
  return {
    '@context': 'https://schema.org', '@type': 'ItemList', name: `${a.name} 파티룸 — 쏘플파티룸`, numberOfItems: a.list.length,
    itemListElement: a.list.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: `쏘플파티룸 ${s.name}`, url: `${origin}/room/${s.code}` })),
  };
}
/** 질문·답 묶음 → FAQPage 구조화 데이터 */
export function faqJsonLd(pairs) {
  if (!pairs || pairs.length < 2) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}
/** 파티 가이드 글 카드 (slug 목록 → HTML) — 지역 화면·지점 화면에서 쓴다 */
export function magCards(slugs, { small = true } = {}) {
  const arts = (slugs || []).map((x) => MAGAZINE.find((m) => m.slug === x)).filter(Boolean);
  if (!arts.length) return '';
  return `<div class="mag-grid">${arts.map((a) => `<a class="mag-card${small ? ' sm' : ''}" href="/magazine/${esc(a.slug)}"><div class="mag-thumb"><img src="/assets/img/photo/${esc(a.cover)}-s.webp" alt="" loading="lazy" width="700" height="525"></div><div class="mag-card-body"><span class="mag-cat">${esc(a.catLabel)}</span><h3>${esc(a.title)}</h3><p>${esc(a.desc)}</p></div></a>`).join('')}</div>`;
}
/** 지역·동네 안내 글 (AREA_GUIDES) → 화면 조각 */
export function areaGuideHtml(a) {
  const g = AREA_GUIDES[a.name];
  if (!g) return '';
  const intro = (g.intro || []).map((p) => `<p>${esc(p)}</p>`).join('');
  const fits = (g.fits || []).length ? `<h3 class="h3" style="margin-top:22px">이런 모임에 어울려요</h3><ul class="checks" style="margin-top:10px">${g.fits.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '';
  const faq = (g.faq || []).length ? `<h3 class="h3" style="margin-top:26px">${esc(a.name)} 파티룸 자주 묻는 질문</h3><div class="faq card-faq" style="margin-top:10px">${g.faq.map(([q, an]) => `<details><summary>${esc(q)}<svg class="ic" aria-hidden="true"><use href="#i-chev-d"/></svg></summary><div class="ans">${esc(an)}</div></details>`).join('')}</div>` : '';
  const arts = magCards(g.articles);
  return `<section class="area-guide" style="margin-top:40px"><h2 class="h2">${esc(a.name)} 파티룸, 이렇게 골라요</h2><div class="prose" style="margin-top:12px;max-width:760px">${intro}</div>${fits}${faq}${arts ? `<h3 class="h3" style="margin-top:28px">읽어 보면 좋은 글</h3><div style="margin-top:12px">${arts}</div>` : ''}</section>`;
}
export const areaGuideFaq = (a) => faqJsonLd((AREA_GUIDES[a.name] || {}).faq);
export const areaGuideDesc = (a) => { const g = AREA_GUIDES[a.name]; return g && g.intro && g.intro[0] ? g.intro[0] : ''; };

/** FAQ(details/summary)에서 FAQPage 구조화 데이터 만들기 — 정적 화면은 build 때 넣는다 */
export const jsonLdTag = (obj) => `<script type="application/ld+json">${jsonText(obj)}</script>`;

/* ---------- 검색엔진 소유 확인 ---------- */
export async function verifyTags(env) {
  if (!env.DB) return '';
  try {
    const st = await getSettings(env.DB);
    let out = '';
    // 기본 네이버 확인 코드는 화면 파일에 이미 들어 있어서, 설정에 다른 코드를 넣었을 때만 덧붙인다
    if (st['seo.naver_verify'] && st['seo.naver_verify'].trim() !== NAVER_VERIFY) out += `<meta name="naver-site-verification" content="${esc(st['seo.naver_verify'].trim())}">`;
    if (st['seo.google_verify']) out += `<meta name="google-site-verification" content="${esc(st['seo.google_verify'])}">`;
    if (st['seo.bing_verify']) out += `<meta name="msvalidate.01" content="${esc(st['seo.bing_verify'])}">`;
    return out;
  } catch { return ''; }
}

/* ---------- 지역 페이지 본문(검색엔진이 바로 읽는 부분) ---------- */
export function areaHtml(origin, a) {
  const cards = a.list.map((s) => {
    const from = minPrice(s);
    const feats = featList(s).slice(0, 4);
    return `<a class="area-card" href="/room/${esc(s.code)}"><div><h2>${esc(s.name)}</h2><p class="area-addr">${esc(s.addr || `${s.region} ${s.area}`)}</p><p class="area-facts">기준 ${esc(s.base || '-')}명 · 최대 ${esc(s.max || '-')}명${s.info?.size ? ` · ${esc(s.info.size)}` : ''}</p>${feats.length ? `<p class="area-feats">${feats.map((f) => `<span>${esc(f)}</span>`).join('')}</p>` : ''}</div><div class="area-price">${from ? `<b>${esc(won(from))}</b><span>부터</span>` : '<span>요금 문의</span>'}</div></a>`;
  }).join('');
  const regionLine = a.kind === 'area' ? `<a href="${esc(regionPath(a.region))}">${esc(a.region)} 전체 지점</a>` : '';
  return `<nav class="crumb" aria-label="현재 위치"><a href="/">홈</a><span>›</span><a href="/locations">지역별 지점</a><span>›</span>${a.kind === 'area' ? `<a href="${esc(regionPath(a.region))}">${esc(a.region)}</a><span>›</span>` : ''}<b>${esc(a.name)}</b></nav>
<h1 class="h1">${esc(a.name)} 파티룸 <span class="area-count">${a.list.length}곳</span></h1>
<p class="lead">${esc(a.name)}에서 바로 갈 수 있는 쏘플파티룸이에요. 낮·밤 타임으로 빌리고, 결제는 네이버 예약에서 해요. ${regionLine ? '' : ''}</p>
<div class="area-cards">${cards}</div>
${regionLine ? `<p class="muted small" style="margin-top:18px">${regionLine}도 같이 볼 수 있어요.</p>` : ''}
${areaGuideHtml(a)}`;
}

/* ---------- 대표 주소(정식 도메인)로 보내기 ---------- */
/** 설정 seo.canonical_host(예: ssople.com)가 있고, 지금 접속한 주소가 *.pages.dev 이면 정식 도메인으로 301 */
/* ---------- 대표 주소 (ssople.com) ----------
 * 도메인을 Cloudflare Pages(ssople 프로젝트)의 사용자 지정 도메인으로 연결하면 그때부터 자동으로 대표 주소가 된다.
 *  - ssople.com 으로 들어온 첫 요청을 보고 "도메인 연결됨"을 DB에 적어 둔다 (DNS가 아직 아임웹을 가리키면 이 요청은 여기 오지 않는다)
 *  - 그 뒤로 ssople.pages.dev 와 www.ssople.com 접속은 ssople.com 으로 301 이동, 정식 주소·사이트맵·RSS도 ssople.com 기준
 *  - 관리자 설정 "대표 주소"에 값을 적으면 그 값이 우선 (되돌리려면 ssople.pages.dev 를 적으면 된다)
 * 미리보기 배포(브랜치.ssople.pages.dev)와 /api·/admin 은 옮기지 않는다. */
export const PRIMARY_HOST = 'ssople.com';
const normHost = (h) => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
let live = null;
let liveAt = 0;
/** 도메인이 이 홈페이지로 연결된 적이 있는지 (한 번 연결되면 true, 아니면 1분마다 다시 확인) */
export async function domainLive(env) {
  if (live === true) return true;
  if (!env || !env.DB) return false;
  if (live === false && Date.now() - liveAt < 60e3) return false;
  try { live = !!(await getMeta(env.DB, 'domain_live')); } catch { live = false; }
  liveAt = Date.now();
  return live;
}
/** 테스트용 — 기억해 둔 연결 상태를 지운다 */
export function _resetDomainCache() { live = null; liveAt = 0; }
/** ssople.com·www.ssople.com 으로 들어온 요청이면 "도메인 연결됨"을 남긴다 */
export async function markDomainLive(env, url) {
  if (live === true || !env || !env.DB) return;
  if (url.hostname.toLowerCase().replace(/^www\./, '') !== PRIMARY_HOST) return;
  try {
    if (!(await getMeta(env.DB, 'domain_live'))) await setMeta(env.DB, 'domain_live', new Date().toISOString());
    live = true;
  } catch { /* meta 표가 아직 없으면 다음 요청에서 다시 */ }
}
/** 지금 쓸 대표 도메인 — 설정값 > 연결된 ssople.com > (없음: 접속한 주소 그대로) */
export function canonicalHostOf(url, st, isLive) {
  const set = normHost(st && st['seo.canonical_host']);
  if (set) return set;
  const h = url.hostname.toLowerCase();
  if (h === PRIMARY_HOST || h === 'www.' + PRIMARY_HOST || isLive) return PRIMARY_HOST;
  return '';
}
/** 네이버 소유 확인·수집 로봇이 실제로 이 홈페이지에 왔는지 남긴다 (최근 10건, IP는 저장하지 않음)
 *  /api/health 의 naver 항목에서 볼 수 있다 — 소유확인을 눌렀는데 기록이 없으면 네이버가 아직 예전 주소(아임웹)를 보고 있는 것 */
export const NAVER_FILE = '/naverbbbed6886d93c341e12b7ef250a11f53.html';
// 네이버 로봇(Yeti)만 — 네이버 앱 안의 브라우저로 들어온 손님(UA에 NAVER 포함)은 남기지 않는다
const NAVER_BOT = /\bYeti\b/i;
export function isNaverProbe(request, url) {
  return url.pathname === NAVER_FILE || NAVER_BOT.test(request.headers.get('user-agent') || '');
}
/** 저장된 기록 중 로봇 기록만 (예전에 섞여 들어간 손님 기록은 버린다) */
export function naverBotHits(list) {
  return (Array.isArray(list) ? list : []).filter((h) => h && (NAVER_BOT.test(h.ua || '') || h.path === NAVER_FILE) && !/inapp|NAVER\(/i.test(h.ua || ''));
}
export async function recordNaverHit(env, request, url, status) {
  if (!env || !env.DB) return;
  try {
    const cf = request.cf || {};
    const hit = { at: new Date().toISOString(), method: request.method, host: url.hostname, path: url.pathname, status: status || null, ua: String(request.headers.get('user-agent') || '').slice(0, 160), country: cf.country || null, org: cf.asOrganization || null };
    let prev = [];
    try { prev = naverBotHits(JSON.parse((await getMeta(env.DB, 'naver_hits')) || '[]')); } catch { prev = []; }
    await setMeta(env.DB, 'naver_hits', JSON.stringify([hit, ...prev].slice(0, 10)));
  } catch { /* 기록은 없어도 된다 */ }
}

/** 링크 미리보기 로봇(카카오톡·페이스북·슬랙 등) — 미리보기가 안 뜰 때 로봇이 실제로 다녀갔는지 확인용 */
const PREVIEW_BOT = /kakaotalk-scrap|facebookexternalhit|Slackbot|Twitterbot|TelegramBot|Discordbot|LinkedInBot|Line\/|WhatsApp/i;
export const isPreviewBot = (request) => PREVIEW_BOT.test(request.headers.get('user-agent') || '');
export async function recordPreviewHit(env, request, url, status) {
  if (!env || !env.DB) return;
  try {
    const cf = request.cf || {};
    const hit = { at: new Date().toISOString(), host: url.hostname, path: url.pathname, status: status || null, ua: String(request.headers.get('user-agent') || '').slice(0, 120), country: cf.country || null, org: cf.asOrganization || null };
    let prev = [];
    try { prev = JSON.parse((await getMeta(env.DB, 'preview_hits')) || '[]'); } catch { prev = []; }
    await setMeta(env.DB, 'preview_hits', JSON.stringify([hit, ...(Array.isArray(prev) ? prev : [])].slice(0, 20)));
  } catch { /* 기록은 없어도 된다 */ }
}

export async function canonicalRedirect(env, request) {
  const url = new URL(request.url);
  let st = {};
  try { if (env && env.DB) st = await getSettings(env.DB); } catch { st = {}; }
  await markDomainLive(env, url);
  const host = canonicalHostOf(url, st, await domainLive(env));
  if (!host) return null;
  const bare = (h) => h.replace(/^www\./, '');
  // 대표 도메인인데 http 로 들어왔으면 https 로
  if (url.hostname === host && url.protocol === 'http:' && !/^(localhost|127\.)/.test(url.hostname)) {
    url.protocol = 'https:'; url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  // 정식 배포 주소(ssople.pages.dev)와 www 붙은 주소만 보내고, 미리보기 배포(브랜치.ssople.pages.dev)는 그대로 둔다
  const isPagesDev = /^[^.]+\.pages\.dev$/.test(url.hostname);
  const isWwwTwin = url.hostname !== host && bare(url.hostname) === bare(host);
  if (url.hostname === host || (!isPagesDev && !isWwwTwin)) return null;
  url.hostname = host; url.protocol = 'https:'; url.port = '';
  return Response.redirect(url.toString(), 301);
}
