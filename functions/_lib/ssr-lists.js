// 검색 로봇이 바로 읽는 지점 목록 — 첫 화면·지점 찾기·지역별 지점·지역 화면에 서버가 미리 채워 넣는다.
// 손님 화면은 각 화면 스크립트(home.js·rooms.js·locations.js·area.js)가 같은 자리를 최신 정보로 다시 그린다.
// 그래서 여기 모양은 화면 스크립트의 카드(SP.roomCard 등)와 같은 class 를 쓰고, 날짜별 빈 방·후기 수처럼 그때그때 바뀌는 값은 넣지 않는다.
// 지점 순서는 요청마다 랜덤. 화면 스크립트(SP.rnd)가 여기서 정한 순서를 이어 받아서, 다시 그려도 카드 자리가 그대로예요.
import { photoUrl, zoneOf } from './spaces.js';
import { regionPath, areaPath } from './slugs.js';
import { minPrice, featList } from './seo.js';
import { shuffle } from './util.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const ic = (n, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
export const won = (n) => {
  if (!n) return '';
  const m = n / 10000;
  return (Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, '')) + '만원';
};
export const REGION_ORDER = ['서울', '경기', '인천', '대전', '부산', '전주'];
const regionRank = (r) => REGION_ORDER.indexOf(r) + 1 || 99;
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/* 사진이 아직 없는 지점의 분위기 컷 — app.js SP.moodPhoto 와 같은 규칙 */
const MOOD = ['orange-room', 'moroccan', 'welcome', 'party-table', 'birthday-2', 'yearend', 'bridal-2', 'entrance'];
function moodPhoto(s) {
  const f = s.feat || {};
  let h = 0; for (const ch of String(s.code || '')) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  let pool = MOOD;
  if ((f.bbq && f.bbq.on) || (f.zones || []).some((z) => /루프탑|테라스/.test(z))) pool = ['terrace-night', 'rooftop', 'yearend', 'party-table', 'orange-room'];
  else if (f.karaoke && f.karaoke.on && (f.console || (f.games || []).length > 6)) pool = ['game-lounge', 'neon-night', 'game-lounge-2', 'birthday-2'];
  else if (f.karaoke && f.karaoke.on) pool = ['neon-night', 'birthday-2', 'orange-room', 'moroccan'];
  else if (f.projector && (s.max || 0) >= 16) pool = ['theater', 'workshop', 'meeting', 'yearend'];
  return pool[h % pool.length];
}
function cover(s, { eager = false } = {}) {
  const p = (s.photos || [])[0];
  const src = p ? photoUrl(p) : '';
  if (src) return `<img src="${esc(src)}" alt="${esc(s.name)} 파티룸 사진" ${eager ? '' : 'loading="lazy" '}decoding="async">`;
  return `<div class="cover-art" aria-hidden="true" style="--ca:url('/assets/img/photo/${moodPhoto(s)}-s.webp')"><span class="ca-note">실제 사진 준비 중</span><span class="ca-seal"></span><span class="ca-area">${esc(s.area)}</span></div>`;
}
function featTags(s, max = 4) {
  const f = s.feat || {};
  const t = [];
  if (f.karaoke && f.karaoke.on) t.push(['mic', '노래방']);
  if (f.bbq && f.bbq.on) t.push(['flame', '바베큐']);
  if (f.pet && f.pet.on) t.push(['paw', '애견 동반']);
  if ((f.zones || []).includes('루프탑')) t.push(['umbrella', '루프탑']);
  else if ((f.zones || []).includes('테라스')) t.push(['umbrella', '테라스']);
  if (f.projector) t.push(['projector', '빔프로젝터']);
  if (f.console) t.push(['game', '게임기']);
  return t.slice(0, max).map(([i, l]) => `<span class="tag">${ic(i)}${l}</span>`).join('');
}

/** 지점 카드 — SP.roomCard 와 같은 모양 */
export function roomCardHtml(s, { rank = 0, eager = false } = {}) {
  const price = minPrice(s);
  const z = zoneOf(s, todayKst());
  const l = s.listing || {};
  const badges = (z === 'premium' ? '<span class="badge red">프리미엄</span>' : z === 'plus' ? '<span class="badge ink">플러스</span>' : '') + (l.type === 'host' ? '<span class="badge mute">호스트 운영</span>' : '');
  return `<a class="room" href="/room/${esc(s.code)}">
      <div class="room-cover">${cover(s, { eager })}${badges ? `<div class="room-badge">${badges}</div>` : ''}${rank ? `<span class="rank">${rank}</span>` : ''}</div>
      <div class="room-body">
        <div class="room-area">${ic('pin', 'sm')}${esc(s.region)} ${esc(s.area)}</div>
        <h3 class="room-name">${esc(s.name)}</h3>
        <div class="room-facts"><span>${ic('users', 'sm')}기준 ${esc(s.base || '-')}명 · 최대 ${esc(s.max || '-')}명</span>${s.info && s.info.size ? `<span>${ic('size', 'sm')}${esc(s.info.size)}</span>` : ''}</div>
        ${price ? `<div class="room-price"><b>${won(price)}</b> <span class="muted small">부터</span></div>` : ''}
        <div class="room-feat">${featTags(s)}</div>
      </div></a>`;
}

/** 권역 → 동네 → 지점 묶음 (권역 순서 고정) */
export function groupByRegion(spaces) {
  const by = new Map();
  for (const s of spaces) {
    if (!by.has(s.region)) by.set(s.region, new Map());
    const areas = by.get(s.region);
    if (!areas.has(s.area)) areas.set(s.area, []);
    areas.get(s.area).push(s);
  }
  return [...by.entries()].sort((a, b) => regionRank(a[0]) - regionRank(b[0]));
}


/* ---------------- 첫 화면 ---------------- */
const REGION_PHOTO = { 서울: 'neon-night', 경기: 'orange-room', 인천: 'terrace-night', 대전: 'moroccan', 부산: 'rooftop', 전주: 'welcome' };
export function homeBlocks(spaces, st = {}) {
  // 지금 가장 사랑받는 지점 — 랜덤 8곳 (관리자가 고른 첫 화면 지점이 있으면 그 지점들을 먼저, 순서는 랜덤)
  const featured = String(st['home.featured'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const mix = shuffle(spaces);
  const pop = mix.filter((s) => featured.includes(s.code)).concat(mix.filter((s) => !featured.includes(s.code))).slice(0, 8);
  const groups = groupByRegion(spaces);
  const tiles = groups.map(([r, areas]) => {
    const n = [...areas.values()].reduce((x, l) => x + l.length, 0);
    return `<a class="region" href="${esc(regionPath(r))}" style="--pp:url('/assets/img/photo/${REGION_PHOTO[r] || 'entrance'}-s.webp')"><b>${esc(r)}</b><span>${n}개 지점</span></a>`;
  }).join('') + '<a class="region all" href="/locations"><b>전체 지점 안내</b><span>전국 지점 주소·지도</span></a>';
  const chips = [];
  for (const [r, areas] of groups) {
    for (const [a, list] of [...areas.entries()].sort((x, y) => y[1].length - x[1].length)) {
      if (a === r && groups.length > 1) continue;
      chips.push(`<a class="chip" href="${esc(areaPath(a))}">${esc(a)} <span class="n">${list.length}</span></a>`);
    }
  }
  return {
    '#popRooms': pop.map((s, i) => roomCardHtml(s, { eager: i < 4 })).join(''),
    '#regionTiles': tiles,
    '#areaList': `<span class="area-chips-lb">동네별</span>${chips.join('')}`,
  };
}

/* ---------------- 지점 찾기 ---------------- */
export function roomsBlocks(spaces) {
  const list = shuffle(spaces);
  return {
    '#rList': list.map((s, i) => roomCardHtml(s, { eager: i < 6 })).join(''),
    '#rCount': '전체 지점',
  };
}

/* ---------------- 지역별 지점 안내 ---------------- */
export function locationsBlocks(spaces) {
  const groups = groupByRegion(spaces);
  const card = (s) => {
    const from = minPrice(s);
    return `<div class="loc-card">
          <a class="loc-cover" href="/room/${esc(s.code)}">${cover(s)}<span class="badge ink">${esc(s.region)}</span></a>
          <div class="loc-body">
            <h3><a href="/room/${esc(s.code)}">${esc(s.name)}</a></h3>
            <div class="loc-addr"><span>${esc(s.addr || `${s.region} ${s.area}`)}</span></div>
            <div class="loc-facts"><span>${ic('users', 'sm')}기준 ${esc(s.base || '-')}명 · 최대 ${esc(s.max || '-')}명</span>${s.info && s.info.size ? `<span>${ic('size', 'sm')}${esc(s.info.size)}</span>` : ''}${from ? `<span class="b" style="color:var(--red)">${won(from)}~</span>` : ''}</div>
            <div class="room-feat">${featTags(s, 3)}</div>
            <div class="loc-acts">${s.place ? `<a class="btn btn-line btn-sm" href="${esc(s.place)}" target="_blank" rel="noopener">${ic('map', 'sm')}지도</a>` : '<span></span>'}<a class="btn btn-naver btn-sm" href="/room/${esc(s.code)}">${ic('calendar', 'sm')}요금·예약</a></div>
          </div></div>`;
  };
  const sections = groups.map(([r, areas]) => {
    const n = [...areas.values()].reduce((x, l) => x + l.length, 0);
    const links = [...areas.keys()].map((a) => `<a class="link" href="${esc(a === r ? regionPath(r) : areaPath(a))}">${esc(a)} 파티룸</a>`).join(' · ');
    return `<section style="margin-top:34px"><div class="sec-hd" style="margin-bottom:14px"><div><h2 class="h2"><a href="${esc(regionPath(r))}">${esc(r)} 파티룸</a> <span class="area-count">${n}곳</span></h2><p>${links}</p></div></div>
        <div class="loc-grid">${shuffle([...areas.values()].flat()).map(card).join('')}</div></section>`;
  }).join('');
  return {
    '#locLead': `${groups.map(([r]) => r).join(', ')}에 있어요. 지점 이름을 누르면 요금과 네이버 예약 버튼이 나와요.`,
    '#locList': sections,
  };
}

/** 지역 화면 아래 "다른 지역도 볼까요" 칩 */
export function areaChipsHtml(spaces, current) {
  const groups = groupByRegion(spaces);
  const out = [];
  for (const [r, areas] of groups) {
    out.push(`<a class="chip${current && current.kind === 'region' && current.name === r ? ' on' : ''}" href="${esc(regionPath(r))}">${esc(r)} 전체</a>`);
    for (const a of areas.keys()) {
      if (a === r) continue;
      out.push(`<a class="chip${current && current.kind === 'area' && current.name === a ? ' on' : ''}" href="${esc(areaPath(a))}">${esc(a)}</a>`);
    }
  }
  return out.join('');
}

/* ---------------- 지점 상세: 요금표·예약 링크·근처 지점 ---------------- */
const COLS = ['월~목', '금', '토', '일'];
/** 네이버 예약 주소 — 지난 날짜(startDateTime)가 박혀 있으면 지워서 오늘부터 보이게 (app.js SP.naverHref 와 같은 규칙) */
export function naverHref(u) {
  try {
    const x = new URL(u);
    if (/booking\.naver\.com/.test(x.host)) x.searchParams.delete('startDateTime');
    return x.toString();
  } catch { return u; }
}
/** 시간제 요금표 — 요일별 시간당 요금, 최소 이용 시간, 운영 시간 */
export function hourlyHtml(s) {
  const h = s.hourly;
  if (!h || !(h.p || []).some(Boolean)) return '';
  return `<div class="tbl-wrap"><table class="tbl price-tbl"><caption class="sr-only">${esc(s.name)} 시간제 요금 (기준 ${esc(s.base || '-')}명)</caption><thead><tr><th>시간제</th>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
      <tr><td><b>1시간</b><div class="tiny muted">최소 ${esc(h.min)}시간 · ${esc(h.hrs || '')}</div></td>${[0, 1, 2, 3].map((i) => ((h.p || [])[i] ? `<td class="num">${won(h.p[i])}</td>` : '<td class="na">-</td>')).join('')}</tr>
      </tbody></table></div>${h.note ? `<p class="small muted" style="margin-top:8px">${esc(h.note)}</p>` : ''}`;
}
export function roomPriceHtml(s) {
  const pk = s.pkgs || [];
  const hr = hourlyHtml(s);
  const ways = ((s.booking || {}).ways || []);
  const basis = ways.length ? '최종 금액과 빈 시간은 호스트의 예약 안내가 기준이에요.' : '최종 금액과 빈 시간은 네이버 예약 화면이 기준이에요.';
  if (!pk.length && !hr) return `<p class="muted">${ways.length ? '요금은 예약할 때 호스트에게 확인해 주세요.' : '요금은 네이버 예약 화면에서 확인해 주세요.'}</p>`;
  const pkHtml = pk.length ? `<div class="tbl-wrap"><table class="tbl price-tbl"><caption class="sr-only">${esc(s.name)} 패키지별 요금 (기준 ${esc(s.base || '-')}명)</caption><thead><tr><th>패키지</th>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
      ${pk.map((p) => `<tr><td><b>${esc(p.label)}</b><div class="tiny muted">${esc(p.hrs || '')}</div></td>${[0, 1, 2, 3].map((i) => ((p.p || [])[i] ? `<td class="num">${won(p.p[i])}</td>` : '<td class="na">-</td>')).join('')}</tr>`).join('')}
      </tbody></table></div>` : '';
  return `${hr}${hr && pkHtml ? '<div style="height:12px"></div>' : ''}${pkHtml}
      <p class="small muted" style="margin-top:10px">기준 ${esc(s.base || '-')}명 요금이에요.${s.addFeeLabel ? ` 넘는 인원은 ${esc(s.addFeeLabel)}이 붙어요.` : ''}${s.depositLabel ? ` 청소 보증금 ${esc(s.depositLabel)}(퇴실 확인 뒤 돌려드려요).` : ''} ${basis}</p>`;
}
/** 호스트가 정한 예약 방식 → 손님 화면 버튼 목록 (app.js SP.bookWays 와 같은 규칙) */
export const BOOK_LABEL = { naver: '네이버 예약', link: '예약 링크', phone: '전화 예약', kakao: '카카오톡 채널', talk: '네이버 톡톡', insta: '인스타그램 DM', sms: '문자 예약', form: '쏘플 문의' };
export function bookWays(s) {
  const ways = ((s.booking || {}).ways || []);
  const out = [];
  for (const w of ways) {
    if (w.k === 'naver' && w.v) out.push({ k: 'naver', href: naverHref(w.v), label: w.label || '네이버 예약으로 예약', sub: w.note || '', ext: true });
    else if (w.k === 'link' && w.v) out.push({ k: 'link', href: w.v, label: w.label || '예약 페이지에서 예약', sub: w.note || '', ext: true });
    else if (w.k === 'kakao' && w.v) out.push({ k: 'kakao', href: w.v, label: w.label || '카카오톡으로 예약 문의', sub: w.note || '', ext: true });
    else if (w.k === 'talk' && w.v) out.push({ k: 'talk', href: w.v, label: w.label || '네이버 톡톡으로 예약 문의', sub: w.note || '', ext: true });
    else if (w.k === 'insta' && w.v) out.push({ k: 'insta', href: w.v, label: w.label || '인스타그램 DM으로 예약 문의', sub: w.note || '', ext: true });
    else if (w.k === 'phone' && w.v) out.push({ k: 'phone', href: 'tel:' + w.v.replace(/-/g, ''), label: w.label || '전화로 예약', sub: [w.v, w.note].filter(Boolean).join(' · '), ext: false });
    else if (w.k === 'sms' && w.v) out.push({ k: 'sms', href: 'sms:' + w.v.replace(/-/g, ''), label: w.label || '문자로 예약', sub: [w.v, w.note].filter(Boolean).join(' · '), ext: false });
    else if (w.k === 'form') out.push({ k: 'form', href: `/write?b=qna&code=${s.code}`, label: w.label || '쏘플에 문의 남기고 예약', sub: w.note || '호스트가 답을 달면 알림이 가요', ext: false });
  }
  return out;
}
export function roomBookHtml(s) {
  const ways = bookWays(s);
  if (ways.length) {
    const b = s.booking || {};
    const rows = ways.map((w) => `<li><a href="${esc(w.href)}"${w.ext ? ' target="_blank" rel="noopener"' : ''} data-track="${esc(s.code)}|${esc(w.k)}"><b>${esc(w.label)}</b>${w.sub ? ` ${esc(w.sub)}` : ''}</a></li>`);
    const notes = [b.confirm === 'approve' ? '예약은 호스트가 확인한 뒤 확정돼요.' : b.confirm === 'instant' ? '예약하면 바로 확정돼요.' : '', b.hours ? `예약 받는 시간 ${b.hours}` : ''].filter(Boolean);
    return `<ul class="checks">${rows.join('')}</ul><p class="small muted">${esc(notes.join(' · ') || '예약·결제·취소는 호스트가 정한 방법으로 진행돼요.')}</p>${b.cancel ? `<p class="small muted">취소·환불: ${esc(b.cancel)}</p>` : ''}`;
  }
  const linked = (s.pkgs || []).filter((p) => p.url);
  const from = (p) => { const v = (p.p || []).filter((x) => x); return v.length ? `${won(Math.min(...v))}부터` : ''; };
  const rows = linked.map((p) => `<li><a href="${esc(naverHref(p.url))}" target="_blank" rel="noopener" data-track="${esc(s.code)}|book|${esc(p.k)}|"><b>${esc(p.label)}</b> ${esc([p.hrs, from(p)].filter(Boolean).join(' · '))} — 네이버 예약</a></li>`);
  if (!rows.length && s.book) rows.push(`<li><a href="${esc(s.book)}" target="_blank" rel="noopener" data-track="${esc(s.code)}|book">네이버 예약 페이지 열기</a></li>`);
  if (!rows.length && s.place) rows.push(`<li><a href="${esc(s.place)}" target="_blank" rel="noopener" data-track="${esc(s.code)}|place">네이버 지도에서 예약하기</a></li>`);
  if (!rows.length) return '';
  return `<ul class="checks">${rows.join('')}</ul><p class="small muted">예약·결제·취소는 네이버 예약에서 진행돼요.</p>`;
}
export function nearRoomsHtml(s, spaces) {
  // 같은 동네 → 같은 권역 순, 같은 묶음 안에서는 랜덤
  const near = shuffle(spaces)
    .filter((x) => x.code !== s.code)
    .map((x) => ({ x, w: x.area === s.area ? 0 : x.region === s.region ? 1 : 2 }))
    .filter((o) => o.w < 2)
    .sort((a, b) => a.w - b.w)
    .slice(0, 4)
    .map((o) => o.x);
  if (!near.length) return '';
  return near.map((x) => `<a class="link" href="/room/${esc(x.code)}">${esc(x.name)}</a> (${esc(x.area)} · 최대 ${esc(x.max || '-')}명)`).join(' · ');
}
export { featList };
