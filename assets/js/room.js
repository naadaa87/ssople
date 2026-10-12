/* 지점 상세 — 요금·편의시설·오시는 길 + 날짜별 낮/밤 빈 방 + 네이버 예약 버튼 */
(function () {
  const { $, $$, esc, icon } = SP;
  const today = SP.today();
  const DAYS = 62;
  const qs = SP.qs();
  const m = location.pathname.match(/\/room\/(S-?\d{1,4})/i);
  let code = (m ? m[1] : (qs.code || qs.id || '')).toUpperCase();
  if (/^S-?\d{1,4}$/.test(code)) code = 'S-' + code.replace(/\D/g, '').padStart(4, '0');
  let space = null, near = [], reviewStat = { n: 0, avg: null }, av = null;
  let sel = qs.date && qs.date >= today && SP.dayDiff(today, qs.date) < DAYS ? qs.date : null;
  let month = (sel || today).slice(0, 7);
  const COLS = ['월~목', '금', '토', '일'];

  function notFound(msg) {
    $('#roomRoot').innerHTML = `<div class="empty" style="margin:60px 0">${icon('search')}<h3>지점을 찾을 수 없어요</h3><p>${esc(msg || '주소가 바뀌었거나 잠시 운영을 쉬는 지점일 수 있어요.')}</p><a class="btn btn-ink" href="/rooms">다른 지점 보기</a></div>`;
  }

  /* ---------------- 그리기 ---------------- */
  function render() {
    const s = space;
    const photos = s.photos || [];
    const gallery = photos.length
      ? `<div class="gallery${photos.length === 1 ? ' one' : ''}">${photos.slice(0, 5).map((p, i) => `<div><img src="${esc(p)}" alt="${esc(s.name)} 사진 ${i + 1}" data-i="${i}" ${i ? 'loading="lazy"' : ''}></div>`).join('')}${photos.length > 5 ? `<button class="btn btn-line btn-sm more" type="button" data-i="0">사진 ${photos.length}장 모두 보기</button>` : ''}</div>`
      : `<div class="gallery one nophoto"><div class="room-cover" style="border:0;border-radius:0">${SP.cover(s)}<div class="ph-wait"><b>사진을 준비하고 있어요</b>${s.place ? `<a class="btn btn-line btn-sm" href="${esc(s.place)}" target="_blank" rel="noopener" data-track="${s.code}|place">${icon('image', 'sm')}네이버 플레이스에서 사진 보기</a>` : ''}</div></div></div>`;
    const minP = SP.minPrice(s);
    $('#roomRoot').innerHTML = `
      <div style="padding-top:22px">
        <nav class="crumb" aria-label="위치"><a href="/rooms">지점 찾기</a>${icon('chev-r', 'sm')}<a href="/rooms?region=${encodeURIComponent(s.region)}">${esc(s.region)}</a>${icon('chev-r', 'sm')}<a href="/rooms?region=${encodeURIComponent(s.region)}&area=${encodeURIComponent(s.area)}">${esc(s.area)}</a></nav>
        <div class="room-head">
          <div>
            <h1 class="h1">${esc(s.name)}</h1>
            <div class="room-addr">${icon('pin', 'sm')}<span>${esc(s.addr || '주소는 예약 후 안내돼요')}</span>${s.addr ? `<button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(s.addr)}">${icon('copy', 'sm')}주소 복사</button>` : ''}</div>
          </div>
          <div class="row">
            <button class="btn btn-line btn-sm" type="button" id="shareBtn">${icon('share', 'sm')}공유</button>
            ${s.place ? `<a class="btn btn-line btn-sm" href="${esc(s.place)}" target="_blank" rel="noopener" data-track="${s.code}|place">${icon('map', 'sm')}네이버 지도</a>` : ''}
          </div>
        </div>
        ${gallery}
      </div>
      <div class="room-layout">
        <div>
          <div class="facts">
            <div><small>인원</small><b>기준 ${s.base || '-'} · 최대 ${s.max || '-'}명</b></div>
            <div><small>공간</small><b>${esc(s.info?.size || '문의')}</b></div>
            <div><small>청소 보증금</small><b>${esc(s.depositLabel || '문의')}</b></div>
            <div><small>인원 추가</small><b>${esc(s.addFeeLabel || '문의')}</b></div>
          </div>
          ${s.notice ? `<div class="callout red" style="margin-top:16px">${icon('megaphone')}<div class="prewrap">${esc(s.notice)}</div></div>` : ''}
          ${s.intro ? `<section class="room-sec"><h2>공간 소개</h2><div class="prose prewrap">${esc(s.intro)}</div></section>` : ''}
          <section class="room-sec"><h2>패키지와 요금</h2>${priceTable(s)}</section>
          <section class="room-sec"><h2>편의시설</h2>${amenities(s)}</section>
          <section class="room-sec"><h2>이용 전에 확인해 주세요</h2>${rules(s)}</section>
          <section class="room-sec"><h2>찾아오는 길</h2>${route(s)}</section>
          <section class="room-sec" id="reviews"><div class="between" style="margin-bottom:12px"><h2 style="margin:0" id="rvHead">이용후기</h2><a class="btn btn-line btn-sm" href="/write?b=review&code=${s.code}">${icon('edit', 'sm')}후기 쓰기</a></div><div id="rvList"><div class="skel" style="height:80px"></div></div></section>
        </div>
        <aside class="book" id="book" aria-label="날짜 고르고 예약하기">
          <div class="between"><h2>날짜 고르고 예약</h2><span class="small muted" id="bookAsOf"></span></div>
          <div class="cal" id="cal"><div class="skel" style="height:260px"></div></div>
          <div id="calLegend" style="margin-top:10px"></div>
          <div id="pkgArea"></div>
          <div class="callout" style="margin-top:16px;font-size:13.5px">${icon('info', 'sm')}<span>예약·결제·취소는 네이버 예약에서 진행돼요. 빈 방 표시는 실제 예약 상황과 조금 차이가 날 수 있어요.</span></div>
          <div class="row" style="margin-top:12px;flex-wrap:wrap">
            <a class="btn btn-kakao btn-sm" data-kakao href="https://pf.kakao.com/_mufLd/chat" target="_blank" rel="noopener" data-track="${s.code}|kakao">${icon('kakao', 'fill sm')}카카오톡 문의</a>
            <a class="btn btn-soft btn-sm" href="/planner?code=${s.code}#cost">${icon('won', 'sm')}예상 비용 계산</a>
          </div>
        </aside>
      </div>
      <section class="sec" style="padding-top:44px"><div class="between" style="margin-bottom:18px"><h2 class="h2">근처 다른 지점</h2><a class="sec-more" href="/rooms?region=${encodeURIComponent(s.region)}">${esc(s.region)} 지점 전체</a></div><div class="rooms" id="nearList"></div></section>`;
    $('#mobileBook').hidden = false;
    $('#mbPrice').textContent = minP ? SP.won(minP) + '부터' : '';
    SP.site().then(({ settings }) => { const k = settings && settings['kakao.url']; if (k) $$('[data-kakao]').forEach((a) => { a.href = k; }); });
    bind();
  }

  function priceTable(s) {
    const pk = s.pkgs || [];
    if (!pk.length) return '<p class="muted">요금은 네이버 예약 화면에서 확인해 주세요.</p>';
    const anyDefault = pk.some((p) => p.hd);
    return `<div class="tbl-wrap"><table class="tbl price-tbl"><thead><tr><th>패키지</th>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
      ${pk.map((p) => `<tr><td><b>${esc(p.label)}</b><div class="tiny muted">${esc(p.hrs || '')}</div></td>${[0, 1, 2, 3].map((i) => (p.p[i] ? `<td class="num">${SP.won(p.p[i])}</td>` : '<td class="na">-</td>')).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="small muted" style="margin-top:10px">기준 ${s.base || '-'}명 요금이에요. 넘는 인원은 ${esc(s.addFeeLabel || '1인당 추가 요금')}이 붙어요. ${anyDefault ? '시간이 따로 적히지 않은 패키지는 쏘플 공통 기준 시간으로 표시했어요. 정확한 시간은 네이버 예약 화면을 따라 주세요.' : ''}</p>`;
  }

  function amenities(s) {
    const f = s.feat || {};
    const items = [];
    const add = (ic, label, sub, on = true) => items.push(`<div class="${on ? '' : 'off'}">${icon(ic)}<div>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`);
    add('mic', '노래방', f.karaoke?.on ? f.karaoke.note : '없음', !!f.karaoke?.on);
    add('flame', '바베큐', f.bbq?.on ? f.bbq.note : '없음', !!f.bbq?.on);
    add('paw', '애견 동반', f.pet?.on ? (f.pet.note || '가능') : '불가', !!f.pet?.on);
    if (f.tv) add('tv', 'TV', f.console ? '게임기 연결' : '');
    if (f.console && !f.tv) add('game', '게임기', '');
    if (f.projector) add('projector', '빔프로젝터', '');
    if (f.cook) add('pot', '취사', f.cook, f.cook !== '취사 불가');
    if (f.fridge) add('fridge', '냉장고', '');
    if (f.aircon) add('snow', f.aircon, '');
    if (f.heating) add('heat', '바닥 난방', '');
    if (f.elevator != null || f.floor) add('elevator', f.elevator ? '엘리베이터 있음' : f.elevator === false ? '계단 이용' : '층수', [f.floor, f.floorNote].filter(Boolean).join(' · '), true);
    if (f.toilet) add('door', '화장실', f.toilet);
    (f.zones || []).forEach((z) => add('umbrella', z, ''));
    const games = (f.games || []).length ? `<details style="margin-top:16px"><summary class="btn btn-soft btn-sm" style="display:inline-flex">${icon('dice', 'sm')}보드게임·게임 ${f.games.length}가지 보기</summary><p class="muted small" style="margin-top:10px;line-height:1.8">${f.games.map(esc).join(', ')}</p></details>` : '';
    return `<div class="amen">${items.join('')}</div>${games}<p class="tiny faint" style="margin-top:12px">비품과 시설은 지점 사정에 따라 바뀔 수 있어요.</p>`;
  }

  function rules(s) {
    const i = s.info || {};
    const rows = [];
    if (i.sameday) rows.push(['당일 예약', i.sameday]);
    if (i.tour) rows.push(['사전 답사', i.tour]);
    rows.push(['미성년자', i.minors || '미성년자끼리는 낮·올데이 패키지만 이용할 수 있고, 전원 보호자 동의서가 필요해요.']);
    if (i.noise) rows.push(['소음', i.noise]);
    rows.push(['숙박', '파티·모임을 위한 공간이라 숙박 목적으로는 이용할 수 없어요.']);
    return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <p class="small" style="margin-top:14px"><a class="link" href="/guide#rules">보증금·환불·인원 추가 같은 공통 규정 보기</a></p>`;
  }

  function route(s) {
    const i = s.info || {};
    return `<dl class="kv">
      <dt>주소</dt><dd>${esc(s.addr || '예약 후 안내')}</dd>
      ${i.route ? `<dt>오시는 길</dt><dd>${esc(i.route)}</dd>` : ''}
      <dt>주차</dt><dd>${esc(i.parking || '예약 후 문자로 안내해 드려요.')}</dd>
      </dl>
      ${s.place ? `<a class="btn btn-line" style="margin-top:16px" href="${esc(s.place)}" target="_blank" rel="noopener" data-track="${s.code}|place">${icon('map')}네이버 지도에서 위치 보기</a>` : ''}
      <p class="tiny faint" style="margin-top:12px">주차 요금과 운영 시간은 현장 사정에 따라 달라질 수 있어요. 출발 전에 한 번 더 확인해 주세요.</p>`;
  }

  /* ---------------- 달력 ---------------- */
  function codeAt(d) {
    const c = av && av.spaces && av.spaces[code];
    const i = SP.dayDiff(today, d);
    if (!c || i < 0 || i >= DAYS) return null;
    return [c[i * 2], c[i * 2 + 1]];
  }
  function drawCal() {
    const live = !!(av && av.live);
    const [y, mo] = month.split('-').map(Number);
    const first = `${month}-01`;
    const startW = SP.wdi(first);
    const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const maxD = SP.addDays(today, DAYS - 1);
    const prevOk = month > today.slice(0, 7);
    const nextOk = month < maxD.slice(0, 7);
    let cells = ['일', '월', '화', '수', '목', '금', '토'].map((w, i) => `<div class="wd${i === 0 ? ' sun' : ''}">${w}</div>`).join('');
    for (let i = 0; i < startW; i++) cells += '<div class="cal-day blank"></div>';
    for (let d = 1; d <= daysIn; d++) {
      const ymd = `${month}-${String(d).padStart(2, '0')}`;
      const out = ymd < today || ymd > maxD;
      const st = out ? null : codeAt(ymd);
      cells += `<button type="button" class="cal-day${SP.wdi(ymd) === 0 ? ' sun' : ''}${ymd === sel ? ' sel' : ''}" data-d="${ymd}" ${out ? 'disabled' : ''} aria-label="${SP.mdw(ymd)}${st ? ` 낮 ${st[0] === 'o' ? (live ? '예약 가능' : '운영') : st[0] === 'b' ? '마감' : st[0] === 'c' ? '지남' : '없음'}, 밤 ${st[1] === 'o' ? (live ? '예약 가능' : '운영') : st[1] === 'b' ? '마감' : st[1] === 'c' ? '지남' : '없음'}` : ''}" ${ymd === sel ? 'aria-pressed="true"' : ''}>
        <span class="dd">${d}</span>${st && av.show !== false ? SP.dn(st[0], st[1], { live }) : ''}</button>`;
    }
    $('#cal').innerHTML = `<div class="cal-hd"><button class="ibtn" type="button" data-mv="-1" ${prevOk ? '' : 'disabled'} aria-label="이전 달">${icon('chev-l')}</button><b>${y}년 ${mo}월</b><button class="ibtn" type="button" data-mv="1" ${nextOk ? '' : 'disabled'} aria-label="다음 달">${icon('chev-r')}</button></div><div class="cal-grid">${cells}</div>`;
    $('#calLegend').innerHTML = av && av.show !== false ? SP.legend(live) : '';
    $('#bookAsOf').textContent = live && av.asOf ? `${SP.ago(av.asOf)} 기준` : '';
  }

  function pkgStatus(p) {
    const det = av && av.detail && av.detail[code] && av.detail[code][sel];
    return det ? det[p.k] || 'o' : 'o';
  }

  /** 상품 링크가 없을 때 갈 곳: 지점 네이버 예약 페이지 → 네이버 지도 */
  function fallback(s) {
    if (s.book) return { href: s.book, kind: 'book', label: '네이버 예약 페이지에서 예약' };
    if (s.place) return { href: s.place, kind: 'place', label: '네이버 지도에서 예약' };
    return null;
  }

  async function drawPkgs() {
    const area = $('#pkgArea');
    const s = space;
    const live = !!(av && av.live);
    if (!sel) {
      const linked = (s.pkgs || []).filter((p) => p.url);
      const fb = fallback(s);
      area.innerHTML = `<p class="small muted" style="margin-top:14px">날짜를 누르면 그날 빈 방과 요금을 보고 바로 예약할 수 있어요.${linked.length ? ' 네이버에서 날짜를 고르려면 아래 패키지를 누르세요.' : ''}</p>
        ${linked.length ? `<div class="qbook">${linked.map((p) => `<a href="${esc(SP.naverHref(p.url))}" target="_blank" rel="noopener" data-track="${s.code}|book|${p.k}|"><span><b>${esc(p.label)}</b><small>${esc(p.hrs || '')}</small></span><span class="go">네이버 예약${icon('ext', 'sm')}</span></a>`).join('')}</div>` : ''}
        ${s.book ? `<a class="btn ${linked.length ? 'btn-line' : 'btn-naver'} btn-block" style="margin-top:12px" href="${esc(s.book)}" target="_blank" rel="noopener" data-track="${s.code}|book">${icon('ext')}네이버 예약 페이지 열기</a>`
          : !linked.length && fb ? `<a class="btn btn-naver btn-block" style="margin-top:12px" href="${esc(fb.href)}" target="_blank" rel="noopener" data-track="${s.code}|${fb.kind}">${icon('ext')}${esc(fb.label)}</a>` : ''}`;
      $('#mbLabel').textContent = '날짜를 골라 주세요';
      return;
    }
    const pi = SP.priceIdx(sel);
    const list = (s.pkgs || []).map((p) => ({ p, price: p.p[pi], st: pkgStatus(p) })).filter((x) => x.price);
    let html = `<h3 class="h4" style="margin-top:18px">${SP.mdwLong(sel)}</h3><div class="pkg-list">`;
    if (!list.length) html += '<p class="muted small">이 요일에는 운영하는 패키지가 없어요.</p>';
    // 상품 링크가 하나도 없는 지점은 버튼을 패키지마다 반복하지 않고 아래에 한 번만 둔다
    const oneBtn = list.length && !list.some((x) => x.p.url) ? fallback(s) : null;
    list.forEach(({ p, price, st }) => {
      const booked = st === 'b';   // 마감 칸은 확실한 정보라 데이터가 오래됐어도 보여 준다 (비어 있음은 최신일 때만)
      const past = st === 'c';
      const badge = past ? '<span class="badge mute">지난 시간</span>' : booked ? '<span class="badge mute">마감</span>' : live ? '<span class="badge ok">비어 있음</span>' : '';
      const href = SP.naverHref(p.url, sel);
      let btn;
      if (past) btn = '<button class="btn btn-soft btn-block btn-sm" disabled>이용 시간이 지났어요</button>';
      else if (oneBtn) btn = '';
      else if (!href) {
        const fb = fallback(s);
        if (!fb) btn = '<button class="btn btn-soft btn-block btn-sm" disabled>예약 링크 준비 중이에요</button>';
        else if (booked) btn = `<a class="btn btn-soft btn-block btn-sm" href="${esc(fb.href)}" target="_blank" rel="noopener" data-track="${s.code}|${fb.kind}|${p.k}|${sel}">마감됐어요 · 네이버에서 다시 확인</a>`;
        else btn = `<a class="btn btn-naver btn-block" href="${esc(fb.href)}" target="_blank" rel="noopener" data-track="${s.code}|${fb.kind}|${p.k}|${sel}">${icon('ext')}${esc(fb.label)}</a>`;
      }
      else if (booked) btn = `<a class="btn btn-soft btn-block btn-sm" href="${esc(href)}" target="_blank" rel="noopener" data-track="${s.code}|book|${p.k}|${sel}">마감됐어요 · 네이버에서 다시 확인</a>`;
      else btn = `<a class="btn btn-naver btn-block" href="${esc(href)}" target="_blank" rel="noopener" data-track="${s.code}|book|${p.k}|${sel}">${icon('ext')}네이버에서 예약</a>`;
      html += `<div class="pkg${booked || past ? ' is-b' : ''}"><div><h3>${esc(p.label)} ${badge}</h3><div class="hrs">${esc(p.hrs || '')}</div></div><div class="pr">${SP.won(price)}</div>${btn}</div>`;
    });
    html += '</div>';
    if (oneBtn && list.some((x) => x.st !== 'c')) {
      html += `<a class="btn btn-naver btn-block" style="margin-top:12px" href="${esc(oneBtn.href)}" target="_blank" rel="noopener" data-track="${s.code}|${oneBtn.kind}||${sel}">${icon('ext')}${esc(oneBtn.label)}</a>
        <p class="tiny faint" style="margin-top:8px">이 지점은 네이버 예약 페이지에서 ${esc(SP.mdw(sel))} 날짜와 패키지를 골라 주세요.</p>`;
    }
    const allBooked = live && list.length && list.every((x) => x.st === 'b' || x.st === 'c');
    if (allBooked) html += '<div id="altBox" style="margin-top:16px"><h3 class="h4">같은 날 비어 있는 근처 지점</h3><div class="alt-list" id="altList"><p class="small muted" style="padding:8px 0">찾는 중…</p></div></div>';
    area.innerHTML = html;
    const minToday = list.filter((x) => x.st !== 'b' && x.st !== 'c').map((x) => x.price);
    $('#mbLabel').textContent = SP.mdw(sel);
    $('#mbPrice').textContent = minToday.length ? SP.won(Math.min(...minToday)) + '부터' : '이날은 마감';
    $('#mbBtn').textContent = '패키지 고르기';
    if (allBooked) alternatives();
  }

  async function alternatives() {
    const all = await SP.spaces();
    const sp = space;
    const cands = all.filter((x) => x.code !== sp.code).map((x) => ({ x, w: x.area === sp.area ? 0 : x.region === sp.region ? 1 : 2 }))
      .filter((o) => o.w < 2).sort((a, b) => a.w - b.w).slice(0, 12).map((o) => o.x);
    const a = await SP.avail(sel, 1, cands.map((x) => x.code));
    const open = cands.filter((x) => { const c = a.spaces && a.spaces[x.code]; return c && (c[0] === 'o' || c[1] === 'o'); }).slice(0, 5);
    const el = $('#altList');
    if (!el) return;
    el.innerHTML = open.length ? open.map((x) => { const c = a.spaces[x.code]; return `<a href="/room/${x.code}?date=${sel}"><span><b>${esc(x.name)}</b><br><span class="tiny muted">${esc(x.area)} · 최대 ${x.max}명</span></span>${SP.dn(c[0], c[1], { live: true })}</a>`; }).join('')
      : `<p class="small muted" style="padding:8px 0">근처도 대부분 마감이에요. <a class="link" href="/rooms?date=${sel}&open=1">이날 빈 방 전체 보기</a></p>`;
  }

  /* ---------------- 후기 · 근처 ---------------- */
  async function loadReviews() {
    try {
      const d = await SP.get(`/api/posts?board=review&code=${code}&size=5`);
      $('#rvHead').innerHTML = `이용후기 ${reviewStat.n ? `<span class="small muted" style="font-weight:600">${SP.stars(Math.round(reviewStat.avg || 0))} ${reviewStat.avg} · ${reviewStat.n}개</span>` : ''}`;
      $('#rvList').innerHTML = d.items.length ? d.items.map(SP.postRow).join('') + (reviewStat.n > 5 ? `<a class="btn btn-soft btn-sm" style="margin-top:14px" href="/community?b=review&code=${code}">후기 전체 보기</a>` : '')
        : '<div class="empty" style="padding:30px 20px"><h3>아직 후기가 없어요</h3><p>이 지점을 다녀왔다면 첫 후기를 남겨 주세요.</p></div>';
    } catch { $('#rvList').innerHTML = '<p class="muted small">후기를 불러오지 못했어요.</p>'; }
  }
  async function drawNear() {
    const el = $('#nearList');
    if (!el || !near.length) return;
    const all = await SP.spaces();
    const list = near.map((c) => all.find((x) => x.code === c)).filter(Boolean).slice(0, 3);
    const a = await SP.avail(today, 7, list.map((x) => x.code));
    el.innerHTML = list.map((x) => SP.roomCard(x, { avail: a.spaces && a.spaces[x.code], from: today, live: !!a.live })).join('');
  }

  /* ---------------- 동작 ---------------- */
  function bind() {
    $('#roomRoot').addEventListener('click', (e) => {
      const cp = e.target.closest('[data-copy]');
      if (cp) { SP.copy(cp.dataset.copy, '주소를 복사했어요.'); return; }
      const img = e.target.closest('[data-i]');
      if (img && space.photos && space.photos.length) { SP.lightbox(space.photos, Number(img.dataset.i)); return; }
      const mv = e.target.closest('[data-mv]');
      if (mv) {
        const [y, mo] = month.split('-').map(Number);
        const d = new Date(Date.UTC(y, mo - 1 + Number(mv.dataset.mv), 1));
        month = d.toISOString().slice(0, 7);
        drawCal();
        return;
      }
      const day = e.target.closest('.cal-day[data-d]');
      if (day && !day.disabled) {
        sel = day.dataset.d;
        SP.setQs({ date: sel });
        drawCal();
        drawPkgs();
      }
    });
    $('#shareBtn').addEventListener('click', () => {
      SP.track(space.code, 'share');
      SP.share({ title: `${space.name} 파티룸`, text: `${space.region} ${space.area} · 최대 ${space.max}명`, url: location.origin + '/room/' + space.code });
    });
    $('#mbBtn').addEventListener('click', (e) => { e.preventDefault(); $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  (async function init() {
    if (!/^S-\d{4}$/.test(code)) { notFound(); return; }
    const pre = window.__SSR__ && window.__SSR__.space && window.__SSR__.space.code === code ? window.__SSR__.space : null;
    try {
      if (pre) {
        space = pre;
        SP.get('/api/spaces/' + code).then((d) => { near = d.near || []; reviewStat = d.reviews || reviewStat; drawNear(); loadReviews(); }).catch(() => {});
      } else {
        const d = await SP.get('/api/spaces/' + code);
        space = d.space; near = d.near || []; reviewStat = d.reviews || reviewStat;
      }
    } catch (e) { notFound(e.status === 404 ? '' : e.message); return; }
    document.title = `${space.name} 파티룸 | 쏘플파티룸`;
    render();
    av = await SP.avail(today, DAYS, [code], true);
    drawCal();
    drawPkgs();
    if (!pre) { loadReviews(); drawNear(); }
  })();
})();
