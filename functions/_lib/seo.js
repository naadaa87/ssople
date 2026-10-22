// 검색 노출용 — 지역 페이지 주소, 구조화 데이터(JSON-LD), 검색엔진 소유 확인 태그
import { getSettings } from './db.js';
import { photoUrl } from './spaces.js';
import { AREA_GUIDES } from './area-guides.js';
import { MAGAZINE } from './magazine-index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');
export const jsonText = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(LS, '\\u2028').replace(PS, '\\u2029');

/* ---------- 지역·동네 주소 ---------- */
export const REGION_SLUGS = { 서울: 'seoul', 경기: 'gyeonggi', 인천: 'incheon', 대전: 'daejeon', 부산: 'busan', 전주: 'jeonju', 대구: 'daegu', 광주: 'gwangju', 울산: 'ulsan', 제주: 'jeju', 강원: 'gangwon', 충청: 'chungcheong', 경남: 'gyeongnam', 경북: 'gyeongbuk', 전남: 'jeonnam', 전북: 'jeonbuk', 세종: 'sejong' };
export const AREA_SLUGS = {
  건대: 'gundae', 구로: 'guro', 까치산: 'kkachisan', 선유도: 'seonyudo', 신도림: 'sindorim', 신촌: 'sinchon', 천호: 'cheonho', 혜화: 'hyehwa', 홍대: 'hongdae',
  강남: 'gangnam', 잠실: 'jamsil', 이태원: 'itaewon', 성수: 'seongsu', 합정: 'hapjeong', 왕십리: 'wangsimni', 노원: 'nowon', 신림: 'sillim', 사당: 'sadang', 영등포: 'yeongdeungpo', 종로: 'jongno', 연남: 'yeonnam', 망원: 'mangwon', 서울대입구: 'seoultaeipgu', 수유: 'suyu', 목동: 'mokdong', 강북: 'gangbuk', 마포: 'mapo', 용산: 'yongsan',
  남양주: 'namyangju', 동탄: 'dongtan', 미사: 'misa', 분당: 'bundang', 수원: 'suwon', 의왕: 'uiwang', 일산: 'ilsan', 안양: 'anyang', 평택: 'pyeongtaek', 용인: 'yongin', 성남: 'seongnam', 부천: 'bucheon', 화성: 'hwaseong', 광명: 'gwangmyeong', 김포: 'gimpo', 하남: 'hanam', 구리: 'guri', 의정부: 'uijeongbu', 안산: 'ansan', 시흥: 'siheung', 파주: 'paju', 양주: 'yangju',
  부평: 'bupyeong', 월미도: 'wolmido', 송도: 'songdo', 구월동: 'guwol', 주안: 'juan',
  대전: 'daejeon', 부산: 'busan', 전주: 'jeonju', 서면: 'seomyeon', 해운대: 'haeundae', 광안리: 'gwangalli', 둔산: 'dunsan', 유성: 'yuseong', 대구: 'daegu', 동성로: 'dongseongno', 광주: 'gwangju', 울산: 'ulsan', 제주: 'jeju', 천안: 'cheonan', 청주: 'cheongju', 춘천: 'chuncheon', 강릉: 'gangneung', 창원: 'changwon', 포항: 'pohang', 여수: 'yeosu', 순천: 'suncheon', 목포: 'mokpo', 전북: 'jeonbuk',
};
const slugOf = (name, table) => table[name] || encodeURIComponent(String(name || '').trim());
export const regionPath = (name) => '/area/' + slugOf(name, REGION_SLUGS);
export const areaPath = (name) => '/area/' + slugOf(name, AREA_SLUGS);

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
export const minPrice = (s) => {
  const mins = (s.pkgs || []).map((p) => Math.min(...(p.p || []).filter(Boolean))).filter((n) => Number.isFinite(n));
  return mins.length ? Math.min(...mins) : null;
};
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

export function orgJsonLd(origin, st = {}) {
  const same = ['sns.instagram', 'sns.blog', 'sns.youtube', 'kakao.url'].map((k) => st[k]).filter(Boolean);
  return {
    '@context': 'https://schema.org', '@type': 'Organization', '@id': origin + '/#org',
    name: '쏘플파티룸', alternateName: ['SSOPLE', 'SSOPLE Party Room', '쏘플'], url: origin + '/',
    logo: { '@type': 'ImageObject', url: origin + '/assets/img/logo.png', width: 551, height: 211 },
    image: origin + '/assets/img/og.jpg',
    description: '2016년부터 전국에 파티룸을 기획·운영해 온 브랜드. 생일파티, 브라이덜 샤워, 송년회, 워크숍, 촬영 대관까지 낮·밤 타임으로 빌릴 수 있어요.',
    telephone: st['cs.phone'] ? '+82-' + String(st['cs.phone']).replace(/^0/, '').replace(/[^\d-]/g, '') : undefined,
    email: st['biz.email'] || undefined,
    foundingDate: '2016', areaServed: 'KR',
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer service', telephone: st['cs.phone'] ? '+82-' + String(st['cs.phone']).replace(/^0/, '').replace(/[^\d-]/g, '') : undefined, availableLanguage: 'Korean', hoursAvailable: st['cs.hours'] || undefined }],
    sameAs: same.length ? same : undefined,
  };
}
export function websiteJsonLd(origin) {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': origin + '/#website', url: origin + '/', name: '쏘플파티룸', inLanguage: 'ko-KR',
    publisher: { '@id': origin + '/#org' },
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: origin + '/rooms?q={search_term_string}' }, 'query-input': 'required name=search_term_string' },
  };
}
export function breadcrumbJsonLd(origin, items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: origin + path })) };
}
export function roomJsonLd(origin, s, st = {}) {
  const from = minPrice(s);
  const photos = (s.photos || []).map(photoUrl).filter(Boolean).map((u) => (u.startsWith('/') ? origin + u : u));
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
    potentialAction: (s.pkgs || []).find((p) => p.url) ? { '@type': 'ReserveAction', target: (s.pkgs || []).find((p) => p.url).url, name: '네이버 예약' } : undefined,
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
    if (st['seo.naver_verify']) out += `<meta name="naver-site-verification" content="${esc(st['seo.naver_verify'])}">`;
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
export async function canonicalRedirect(env, request) {
  if (!env.DB) return null;
  let host = '';
  try { host = String((await getSettings(env.DB))['seo.canonical_host'] || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''); } catch { return null; }
  if (!host) return null;
  const url = new URL(request.url);
  // 정식 배포 주소(ssople.pages.dev)와 www 붙은 주소만 보내고, 미리보기 배포(브랜치.ssople.pages.dev)는 그대로 둔다
  const bare = (h) => h.replace(/^www\./, '');
  const isPagesDev = /^[^.]+\.pages\.dev$/.test(url.hostname);
  const isWwwTwin = url.hostname !== host && bare(url.hostname) === bare(host);
  if (url.hostname === host || (!isPagesDev && !isWwwTwin)) return null;
  url.hostname = host; url.protocol = 'https:'; url.port = '';
  return Response.redirect(url.toString(), 301);
}
