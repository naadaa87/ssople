/* 지점 상세 — 요금·편의시설·오시는 길 + 날짜별 요금 + 네이버 예약 버튼 */
(function () {
  const { $, $$, esc, icon } = SP;
  const today = SP.today();
  const DAYS = 62;
  const qs = SP.qs();
  const m = location.pathname.match(/\/room\/(S-?\d{1,4})/i);
  let code = (m ? m[1] : (qs.code || qs.id || '')).toUpperCase();
  if (/^S-?\d{1,4}$/.test(code)) code = 'S-' + code.replace(/\D/g, '').padStart(4, '0');
  let space = null, near = [], reviewStat = { n: 0, avg: null }, av = null, spyIO = null;
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
      ? `<div class="gallery${photos.length === 1 ? ' one' : ''}">${photos.slice(0, 5).map((p, i) => `<div><img src="${esc(p)}" alt="${esc(s.name)} 사진 ${i + 1}" data-i="${i}" ${i ? 'loading="lazy"' : ''}></div>`).join('')}${photos.length > 1 ? `<button class="btn btn-line btn-sm more${photos.length <= 5 ? ' m-only' : ''}" type="button" data-i="0">${icon('image', 'sm')}사진 ${photos.length}장 모두 보기</button>` : ''}</div>`
      : `<div class="gallery one nophoto"><div class="room-cover" style="border:0;border-radius:0">${SP.cover(s)}<div class="ph-wait"><b>실제 사진을 준비하고 있어요 · 지금 보이는 건 쏘플 분위기 컷이에요</b>${s.place ? `<a class="btn btn-line btn-sm" href="${esc(s.place)}" target="_blank" rel="noopener" data-track="${s.code}|place">${icon('image', 'sm')}네이버 플레이스에서 사진 보기</a>` : ''}</div></div></div>`;
    const minP = SP.minPrice(s);
    $('#roomRoot').innerHTML = `
      <div style="padding-top:22px">
        <nav class="crumb" aria-label="위치"><a href="/locations">지역별 지점</a>${icon('chev-r', 'sm')}<a href="${esc(s.rp || '/rooms?region=' + encodeURIComponent(s.region))}">${esc(s.region)}</a>${s.area !== s.region ? `${icon('chev-r', 'sm')}<a href="${esc(s.ap || '/rooms?region=' + encodeURIComponent(s.region) + '&area=' + encodeURIComponent(s.area))}">${esc(s.area)}</a>` : ''}</nav>
        <div class="room-head">
          <div>
            <h1 class="h1">${esc(s.name)}</h1>
            ${listingBadges(s)}
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
          <nav class="room-nav" id="roomNav" aria-label="이 지점 안내 바로가기">${subnav(s)}</nav>
          ${s.intro ? `<section class="room-sec" id="r-intro"><h2>공간 소개</h2><div class="prose prewrap">${esc(s.intro)}</div></section>` : ''}
          ${bookSec(s)}
          ${photoSec(s)}
          ${s.detail ? `<section class="room-sec" id="r-detail"><h2>공간 상세</h2>${detailView(s.detail)}${kwTags(s)}</section>` : ''}
          <section class="room-sec" id="hostNews" hidden><div class="between" style="margin-bottom:12px"><h2 style="margin:0">지점 소식</h2><a class="sec-more" href="/community?b=host&code=${s.code}">소식 전체</a></div><div id="hnList"></div></section>
          <section class="room-sec" id="r-price"><h2>${s.hourly && !(s.pkgs || []).length ? '시간제 요금' : s.hourly ? '요금' : '패키지와 요금'}</h2>${priceTable(s)}</section>
          <section class="room-sec" id="r-feat"><h2>편의시설</h2>${amenities(s)}</section>
          ${(s.items || []).length ? `<section class="room-sec" id="r-items"><div class="between" style="margin-bottom:12px"><h2 style="margin:0">비품·물품</h2><span class="small muted">${s.items.length}가지</span></div>${SP.itemsView(s.items)}<p class="tiny faint" style="margin-top:12px">호스트가 직접 적은 목록이에요. 수량은 바뀔 수 있으니 꼭 필요한 물품은 <a class="link" href="#r-qna">지점에 물어보기</a>로 확인해 주세요.</p></section>` : ''}
          <section class="room-sec" id="r-rules"><h2>이용 전에 확인해 주세요</h2>${rules(s)}</section>
          <section class="room-sec" id="r-route"><h2>찾아오는 길</h2>${route(s)}</section>
          ${isHost(s) ? `<section class="room-sec" id="r-host"><h2>호스트 정보</h2>${hostInfo(s)}</section>` : ''}
          <section class="room-sec" id="r-qna"><div class="between" style="margin-bottom:6px"><h2 style="margin:0">지점에 물어보기</h2><a class="btn btn-ink btn-sm" href="/write?b=qna&code=${s.code}">${icon('chat', 'sm')}문의 남기기</a></div><p class="small muted" style="margin-bottom:12px">비품, 꾸미기, 반입, 주차처럼 궁금한 걸 남기면 ${isHost(s) ? '호스트가' : '지점 담당자가'} 답해요. 모두가 보는 공개 질문이라 예약번호·연락처는 적지 마세요. 급한 일은 카카오톡 상담이 빨라요.</p><div id="qaList"><div class="skel" style="height:60px"></div></div></section>
          <section class="room-sec" id="reviews"><div class="between" style="margin-bottom:12px"><h2 style="margin:0" id="rvHead">이용후기</h2><a class="btn btn-line btn-sm" href="/write?b=review&code=${s.code}">${icon('edit', 'sm')}후기 쓰기</a></div><div id="rvList"><div class="skel" style="height:80px"></div></div></section>
          <section class="room-sec" id="r-social"><h2>네이버·인스타그램 후기</h2><p class="small muted" style="margin-bottom:12px">다녀간 분들이 네이버와 인스타그램에 남긴 글과 사진도 함께 보세요.</p><div id="socialBox">${SP.socialView ? SP.socialView(s, SP.settings) : ''}</div></section>
        </div>
        <aside class="book" id="book" aria-label="날짜 고르고 예약하기">
          <div class="between"><h2>날짜 고르고 예약</h2><span class="small muted" id="bookAsOf"></span></div>
          <div class="cal" id="cal"><div class="skel" style="height:260px"></div></div>
          <div id="calLegend" style="margin-top:10px"></div>
          <div id="pkgArea"></div>
          <div class="callout" style="margin-top:16px;font-size:13.5px">${icon('info', 'sm')}<span>${bookNote(s)}</span></div>
          <div class="row" style="margin-top:12px;flex-wrap:wrap">
            ${hostKakao(s) ? `<a class="btn btn-kakao btn-sm" href="${esc(hostKakao(s))}" target="_blank" rel="noopener" data-track="${s.code}|kakao">${icon('kakao', 'fill sm')}호스트 카카오톡</a>` : isHost(s) ? `<a class="btn btn-line btn-sm" href="#r-qna">${icon('chat', 'sm')}지점에 물어보기</a>` : `<a class="btn btn-kakao btn-sm" data-kakao href="http://pf.kakao.com/_mufLd/chat" target="_blank" rel="noopener" data-track="${s.code}|kakao">${icon('kakao', 'fill sm')}카카오톡 문의</a>`}
            <a class="btn btn-soft btn-sm" href="/planner?code=${s.code}#cost">${icon('won', 'sm')}예상 비용 계산</a>
          </div>
        </aside>
      </div>
      ${journey(s)}
      ${guideCards(s)}
      <section class="sec" style="padding-top:44px"><div class="between" style="margin-bottom:18px"><h2 class="h2">근처 다른 지점</h2><a class="sec-more" href="/rooms?region=${encodeURIComponent(s.region)}">${esc(s.region)} 지점 전체</a></div><div class="rooms" id="nearList"></div></section>`;
    $('#mobileBook').hidden = false;
    $('#mbPrice').textContent = minP ? SP.won(minP) + '부터' + (s.hourly && !(s.pkgs || []).length ? ` (${s.hourly.min}시간)` : '') : '';
    const pw = primaryWay(s);
    if (pw) {
      // 호스트가 정한 예약 방식이 있으면 휴대폰 고정 버튼이 그 방식으로 바로 이어져요
      const mb = $('#mbBtn');
      mb.href = pw.href; mb.textContent = pw.label; mb.dataset.way = pw.k;
      if (pw.ext) { mb.target = '_blank'; mb.rel = 'noopener'; }
      mb.setAttribute('data-track', `${s.code}|${pw.k}`);
    }
    SP.site().then(({ settings }) => { const k = settings && settings['kakao.url']; if (k) $$('[data-kakao]').forEach((a) => { a.href = k; }); });
    bind();
  }

  function isHost(s) { return !!(s.listing && s.listing.type === 'host'); }
  /* 호스트 운영 지점 — 누가 운영하는지와 쏘플의 역할을 분명하게 */
  function hostInfo(s) {
    const l = s.listing || {}, b = s.hostBiz || {};
    const rows = [['운영', l.hostName ? `${l.hostName} (호스트 직접 운영)` : '호스트 직접 운영']];
    if (b.name) rows.push(['상호', b.name]);
    if (b.ceo) rows.push(['대표자', b.ceo]);
    if (b.no) rows.push(['사업자등록번호', b.no]);
    if (b.mail) rows.push(['통신판매업 신고', b.mail]);
    return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <p class="small muted" style="margin-top:12px">쏘플파티룸은 이 공간의 정보를 소개하고 호스트가 정한 예약 방법으로 연결해 드려요. 예약·결제·취소·환불은 손님과 호스트 사이에서 진행돼요. 궁금한 점은 <a class="link" href="#r-qna">지점에 물어보기</a>로 남겨 주세요.</p>`;
  }
  /* 호스트가 정한 예약 방식 — 첫 번째가 대표 버튼. 없으면 예전 방식(패키지별 네이버 예약 → 지점 네이버 예약 페이지 → 네이버 지도) */
  const ways = (s, date) => SP.bookWays(s, date);
  const primaryWay = (s, date) => ways(s, date)[0] || null;
  const hostKakao = (s) => { const w = (s.booking && s.booking.ways || []).find((x) => x.k === 'kakao' && x.v); return w ? w.v : ''; };
  function bookNote(s) {
    const b = s.booking || {};
    if (ways(s).length) {
      const bits = [b.confirm === 'approve' ? '예약은 호스트가 확인한 뒤 확정돼요.' : b.confirm === 'instant' ? '예약하면 바로 확정돼요.' : '예약·결제·취소는 호스트가 정한 방법으로 진행돼요.'];
      if (b.hours) bits.push(`예약 받는 시간 ${b.hours}.`);
      bits.push('달력의 마감 표시는 참고용이에요.');
      return bits.join(' ');
    }
    return isHost(s) ? '이 지점은 호스트가 직접 운영해요. 예약·결제·취소는 네이버 예약에서, 자세한 문의는 호스트에게 이어져요.' : '예약·결제·취소는 네이버 예약에서 진행돼요. 달력의 마감 표시는 참고용이고, 예약 가능 여부는 네이버 예약 화면이 기준이에요.';
  }
  function wayBtn(w, s, date, { block = false, big = false } = {}) {
    return `<a class="btn ${w.cls}${block ? ' btn-block' : ''}${big ? '' : ' btn-sm'}" href="${esc(w.href)}"${w.ext ? ' target="_blank" rel="noopener"' : ''} data-track="${s.code}|${w.k}${date ? '||' + date : ''}">${icon(w.ic, w.k === 'kakao' ? 'fill sm' : 'sm')}${esc(w.label)}</a>`;
  }
  function waysList(s, date) {
    const list = ways(s, date);
    if (!list.length) return '';
    return `<div class="qbook qb-ways">${list.map((w) => `<a href="${esc(w.href)}"${w.ext ? ' target="_blank" rel="noopener"' : ''} data-track="${s.code}|${w.k}${date ? '||' + date : ''}"><span><b>${esc(w.label)}</b>${w.sub ? `<small>${esc(w.sub)}</small>` : ''}</span><span class="go ${w.k}">${icon(w.ic, w.k === 'kakao' ? 'fill sm' : 'sm')}${SP.BOOK_KINDS[w.k]}</span></a>`).join('')}</div>`;
  }

  /* 공간 상세 — 한 줄씩: "## 소제목", "- 목록", "> 안내 상자"(첫 줄 "> ### 제목"), 그 밖은 문단 */
  function detailParse(src) {
    const lead = [], groups = [];
    let g = null, box = null;
    const target = () => (g ? g.body : lead);
    for (const raw of String(src || '').split('\n')) {
      const l = raw.trim();
      if (!l) { box = null; continue; }
      if (l.startsWith('## ')) { box = null; g = { h: l.slice(3).trim(), body: [] }; groups.push(g); continue; }
      if (l.startsWith('>')) {
        const t = l.replace(/^>\s?/, '').trim();
        if (t.startsWith('### ')) {
          // 제목 있는 안내 상자는 따로 한 칸(가로 전체)으로
          g = { h: t.slice(4).trim(), note: true, body: [] }; groups.push(g);
          box = { t: 'ul', items: [] }; g.body.push(box);
          continue;
        }
        if (g && g.note) { if (t) box.items.push(t); continue; }
        if (!box) { box = { t: 'box', title: '', lines: [] }; target().push(box); }
        if (t) box.lines.push(t);
        continue;
      }
      if (g && g.note) { g = { h: '', body: [] }; groups.push(g); }   // 안내 칸이 끝나면 이어지는 글은 새 칸으로
      box = null;
      const b = target();
      if (/^[-·•]\s/.test(l)) {
        const last = b[b.length - 1];
        if (last && last.t === 'ul') last.items.push(l.slice(2).trim()); else b.push({ t: 'ul', items: [l.slice(2).trim()] });
        continue;
      }
      b.push({ t: 'p', text: l });
    }
    return { lead, groups };
  }
  function detailBody(arr) {
    return arr.map((n) => {
      if (n.t === 'p') return `<p>${esc(n.text)}</p>`;
      if (n.t === 'ul') return `<ul>${n.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      const many = n.title || n.lines.length > 1;
      return `<div class="dt-box">${icon('info', 'sm')}<div>${n.title ? `<b>${esc(n.title)}</b>` : ''}${many ? `<ul>${n.lines.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p>${esc(n.lines[0] || '')}</p>`}</div></div>`;
    }).join('');
  }
  function detailView(src) {
    const { lead } = detailParse(src);
    const groups = detailParse(src).groups.filter((x) => x.body.some((n) => (n.items ? n.items.length : true)));
    // 두 칸씩 놓다가 홀수로 끝나는 칸은 가로 전체로 (빈자리 없이)
    let run = [];
    const close = () => { if (run.length % 2) run[run.length - 1].wide = true; run = []; };
    groups.forEach((x) => { if (x.note) close(); else run.push(x); });
    close();
    const SHOW = 6;
    const blk = (x) => (x.note
      ? `<div class="dt-blk note"><h3>${icon('info', 'sm')}${esc(x.h)}</h3>${detailBody(x.body)}</div>`
      : `<div class="dt-blk${x.wide ? ' wide' : ''}">${x.h ? `<h3>${esc(x.h)}</h3>` : ''}${detailBody(x.body)}</div>`);
    const first = groups.slice(0, SHOW), rest = groups.slice(SHOW);
    return `${lead.length ? `<div class="dt-lead">${detailBody(lead)}</div>` : ''}
      ${first.length ? `<div class="dt-grid">${first.map(blk).join('')}</div>` : ''}
      ${rest.length ? `<details class="dt-rest"><summary class="btn btn-soft btn-sm">${icon('plus', 'sm')}상세 ${rest.length}가지 더 보기</summary><div class="dt-grid">${rest.map(blk).join('')}</div></details>` : ''}`;
  }
  function kwTags(s) {
    const kw = (s.kw || []).filter(Boolean);
    return kw.length ? `<div class="kw-tags" aria-label="해시태그">${kw.map((k) => `<span>#${esc(k)}</span>`).join('')}</div>` : '';
  }
  /* 시설 목록 — 한 줄에 "분류: 항목, 항목" */
  function facsView(src) {
    const rows = String(src || '').split('\n').map((l) => {
      const i = l.indexOf(':');
      if (i < 1) return null;
      const items = l.slice(i + 1).split(',').map((x) => x.trim()).filter(Boolean);
      return items.length ? { g: l.slice(0, i).trim(), items } : null;
    }).filter(Boolean);
    if (!rows.length) return '';
    return `<div class="fac-list"><h3>시설 목록</h3>${rows.map((r) => `<div class="fac-row"><b>${esc(r.g)}</b><ul>${r.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>`;
  }
  /* 긴 지점 화면 안에서 바로 가기 */
  /* 소개 바로 아래 예약 칸 — 오른쪽(휴대폰은 아래) 달력 예약과 같은 네이버 예약으로 이어진다 */
  function bookSec(s) {
    if (ways(s).length) {
      const b = s.booking || {};
      return `<section class="room-sec" id="r-book"><div class="between" style="margin-bottom:4px"><h2 style="margin:0">예약하기</h2><span class="small muted">${esc(SP.CONFIRM_KINDS[b.confirm] || '호스트 직접 예약')}</span></div>
      <p class="small muted">${esc(bookNote(s))}</p>
      ${waysList(s)}
      <div class="rbook-acts"><a class="btn btn-soft" href="#book" data-tobook>${icon('calendar', 'sm')}날짜별 요금 보기</a></div></section>`;
    }
    const linked = (s.pkgs || []).filter((p) => p.url);
    const fb = fallback(s);
    if (!linked.length && !fb) return '';
    const from = (p) => { const v = (p.p || []).filter((x) => x); return v.length ? `${SP.won(Math.min(...v))}부터` : ''; };
    return `<section class="room-sec" id="r-book"><div class="between" style="margin-bottom:4px"><h2 style="margin:0">예약하기</h2><span class="small muted">네이버 예약</span></div>
      <p class="small muted">패키지를 누르면 네이버 예약으로 바로 이어져요. 예약·결제·취소는 네이버 예약에서 진행돼요.</p>
      ${linked.length ? `<div class="qbook">${linked.map((p) => `<a href="${esc(SP.naverHref(p.url))}" target="_blank" rel="noopener" data-track="${s.code}|book|${p.k}|"><span><b>${esc(p.label)}</b><small>${esc([p.hrs, from(p)].filter(Boolean).join(' · '))}</small></span><span class="go">네이버 예약${icon('ext', 'sm')}</span></a>`).join('')}</div>` : ''}
      <div class="rbook-acts">${s.book ? `<a class="btn ${linked.length ? 'btn-line' : 'btn-naver'}" href="${esc(s.book)}" target="_blank" rel="noopener" data-track="${s.code}|book">${icon('ext', 'sm')}네이버 예약 페이지 열기</a>`
        : !linked.length ? `<a class="btn btn-naver" href="${esc(fb.href)}" target="_blank" rel="noopener" data-track="${s.code}|${fb.kind}">${icon('ext', 'sm')}${esc(fb.label)}</a>` : ''}<a class="btn btn-soft" href="#book" data-tobook>${icon('calendar', 'sm')}날짜별 요금 보기</a></div></section>`;
  }

  /* 공간 사진 — 지점 사진 전부를 바둑판으로, 9장 넘으면 접어 두기 */
  const PH_FOLD = 9;
  function photoSec(s) {
    const photos = s.photos || [];
    if (photos.length < 2) return '';
    const fold = photos.length > PH_FOLD + 2;
    return `<section class="room-sec" id="r-photos"><div class="between" style="margin-bottom:14px"><h2 style="margin:0">공간 사진</h2><span class="small muted">${photos.length}장</span></div>
      <div class="rp-grid${fold ? ' fold' : ''}" id="rpGrid">${photos.map((p, i) => `<button type="button" class="rp-cell" data-i="${i}" aria-label="${i + 1}번째 사진 크게 보기"><img src="${esc(p)}" alt="${esc(s.name)} 사진 ${i + 1}" loading="lazy" decoding="async"></button>`).join('')}</div>
      ${fold ? `<button class="btn btn-line btn-block rp-more" type="button" id="rpMore">사진 ${photos.length - PH_FOLD}장 더 보기${icon('chev-d', 'sm')}</button>` : ''}</section>`;
  }
  function subnav(s) {
    const l = [['r-intro', '소개', !!s.intro], ['r-book', '예약', ways(s).length > 0 || (s.pkgs || []).some((p) => p.url) || !!s.book || !!s.place], ['r-photos', '사진', (s.photos || []).length > 1], ['r-detail', '상세', !!s.detail], ['r-price', '요금', true], ['r-feat', '시설', true], ['r-items', '비품', (s.items || []).length > 0], ['r-rules', '이용 안내', true], ['r-route', '오시는 길', true], ['r-host', '호스트', isHost(s)], ['r-qna', '문의', true], ['reviews', '후기', true], ['r-social', 'SNS 후기', true]];
    return l.filter((x) => x[2]).map(([id, t]) => `<a href="#${id}">${t}</a>`).join('');
  }
  /* 예약 뒤 이어지는 준비 — 지점 화면에서 쏘플의 다른 기능으로 */
  function journey(s) {
    const steps = [
      ['send', '초대장 보내기', '날짜·장소가 들어간 초대장을 링크 하나로', `/invite?code=${s.code}`],
      ['list', '준비물 · N빵', '체크리스트와 1인당 비용 계산', `/planner?code=${s.code}`],
      ['game', '파티게임 띄우기', `TV${s.feat && s.feat.projector ? '·빔프로젝터' : ''}에 띄워 다 같이 퀴즈·라이어 게임`, '/games'],
      ['chat', '지점에 물어보기', '비품·반입·꾸미기 궁금한 점', '#r-qna'],
      ['star', '다녀와서 후기', '후기와 방문 인증으로 쏘플 클럽 혜택', `/write?b=review&code=${s.code}`],
    ];
    return `<section class="sec journey-sec" style="padding-top:44px;padding-bottom:0"><div class="between" style="margin-bottom:14px"><h2 class="h2">예약했다면, 이렇게 준비해요</h2></div>
      <ol class="journey">${steps.map(([ic, t, d, u]) => `<li><a href="${u}">${icon(ic)}<b>${t}</b><span>${d}</span></a></li>`).join('')}</ol></section>`;
  }
  /* 지점 시설에 맞는 파티 가이드 글 3개 */
  function guideSlugs(s) {
    const f = s.feat || {}, out = [];
    if ((s.max || 0) >= 20) out.push('year-end-party-guide', 'large-group-partyrooms');
    if (f.bbq && f.bbq.on) out.push('rooftop-terrace-partyrooms', 'party-food-guide');
    if (f.pet && f.pet.on) out.push('pet-friendly-partyroom');
    if (f.console) out.push('tv-party-games');
    if (f.karaoke && f.karaoke.on) out.push('karaoke-party-tips');
    if (f.projector) out.push('movie-night-partyroom');
    if ((s.max || 0) <= 10) out.push('couple-anniversary-partyroom');
    out.push('birthday-party-guide', 'party-checklist', 'party-games-50', 'what-is-partyroom');
    return [...new Set(out)].slice(0, 3);
  }
  function guideCards(s) {
    const list = window.SP_MAG || [];
    const arts = guideSlugs(s).map((x) => list.find((m) => m.slug === x)).filter(Boolean);
    if (!arts.length) return '';
    return `<section class="sec" style="padding-top:44px;padding-bottom:0"><div class="between" style="margin-bottom:18px"><h2 class="h2">이 지점에서 파티 준비하기</h2><a class="sec-more" href="/magazine">파티 가이드 전체</a></div><div class="mag-grid">${arts.map((a) => `<a class="mag-card sm" href="/magazine/${esc(a.slug)}"><div class="mag-thumb"><img src="/assets/img/photo/${esc(a.cover)}-s.webp" alt="" loading="lazy" width="700" height="525"></div><div class="mag-card-body"><span class="mag-cat">${esc(a.catLabel)}</span><h3>${esc(a.title)}</h3><p>${esc(a.desc)}</p></div></a>`).join('')}</div></section>`;
  }
  function listingBadges(s) {
    const l = s.listing || {};
    const zone = SP.zoneOf(s);
    const out = [];
    if (zone === 'premium') out.push('<span class="badge red">프리미엄존</span>');
    else if (zone === 'plus') out.push('<span class="badge ink">플러스존</span>');
    if (l.type === 'host') out.push(`<span class="badge mute">호스트 운영${l.hostName ? ' · ' + esc(l.hostName) : ''}</span>`);
    else if (l.type === 'direct') out.push('<span class="badge mute">쏘플 직영</span>');
    return out.length ? `<div class="row" style="gap:6px;margin:6px 0 2px;flex-wrap:wrap">${out.join('')}</div>` : '';
  }

  function hourlyTable(s) {
    const h = s.hourly;
    if (!h || !(h.p || []).some(Boolean)) return '';
    return `<div class="tbl-wrap"><table class="tbl price-tbl"><thead><tr><th>시간제</th>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
      <tr><td><b>1시간</b><div class="tiny muted">최소 ${h.min}시간 · ${esc(h.hrs || '')}</div></td>${[0, 1, 2, 3].map((i) => ((h.p || [])[i] ? `<td class="num">${SP.won(h.p[i])}</td>` : '<td class="na">-</td>')).join('')}</tr>
      </tbody></table></div>${h.note ? `<p class="small muted" style="margin-top:8px">${esc(h.note)}</p>` : ''}`;
  }
  function priceTable(s) {
    const pk = s.pkgs || [];
    const hr = hourlyTable(s);
    const own = ways(s).length > 0;
    if (!pk.length && !hr) return `<p class="muted">${own ? '요금은 예약할 때 호스트에게 확인해 주세요.' : '요금은 네이버 예약 화면에서 확인해 주세요.'}</p>`;
    const anyDefault = pk.some((p) => p.hd);
    const pkHtml = pk.length ? `<div class="tbl-wrap"><table class="tbl price-tbl"><thead><tr><th>패키지</th>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
      ${pk.map((p) => `<tr><td><b>${esc(p.label)}</b><div class="tiny muted">${esc(p.hrs || '')}</div></td>${[0, 1, 2, 3].map((i) => (p.p[i] ? `<td class="num">${SP.won(p.p[i])}</td>` : '<td class="na">-</td>')).join('')}</tr>`).join('')}
      </tbody></table></div>` : '';
    return `${hr}${hr && pkHtml ? '<div style="height:12px"></div>' : ''}${pkHtml}
      <p class="small muted" style="margin-top:10px">기준 ${s.base || '-'}명 요금이에요. 넘는 인원은 ${esc(s.addFeeLabel || '1인당 추가 요금')}이 붙어요. ${anyDefault ? '시간이 따로 적히지 않은 패키지는 쏘플 공통 기준 시간으로 표시했어요. 정확한 시간은 네이버 예약 화면을 따라 주세요.' : own ? '최종 금액과 빈 시간은 호스트의 예약 안내가 기준이에요.' : ''}</p>`;
  }

  function amenities(s) {
    const f = s.feat || {};
    const items = [];
    const add = (ic, label, sub, on = true) => items.push(`<div class="${on ? '' : 'off'}">${icon(ic)}<div>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`);
    add('mic', '노래방', f.karaoke?.on ? f.karaoke.note : '없음', !!f.karaoke?.on);
    add('flame', '바베큐', f.bbq?.on ? f.bbq.note : '없음', !!f.bbq?.on);
    add('paw', '애견 동반', f.pet?.on ? (f.pet.note || '가능') : '불가', !!f.pet?.on);
    const consoleName = (f.games || []).find((g) => /닌텐도|스위치|플레이스테이션|PS[45]|엑스박스|xbox/i.test(g)) || '';
    if (f.tv) add('tv', 'TV', f.console ? '게임기 연결' : '');
    if (f.console) add('game', '게임기', consoleName);
    if (f.projector) add('projector', '빔프로젝터', '');
    if (f.cook) add('pot', '취사', f.cook, f.cook !== '취사 불가');
    if (f.fridge) add('fridge', '냉장고', '');
    if (f.aircon) add('snow', f.aircon, '');
    if (f.heating) add('heat', '바닥 난방', '');
    if (f.elevator != null || f.floor) add('elevator', f.elevator ? '엘리베이터 있음' : f.elevator === false ? '계단 이용' : '층수', [f.floor, f.floorNote].filter(Boolean).join(' · '), true);
    if (f.toilet) add('door', '화장실', f.toilet);
    (f.zones || []).forEach((z) => add('umbrella', z, ''));
    const games = (f.games || []).length ? `<details style="margin-top:16px"><summary class="btn btn-soft btn-sm" style="display:inline-flex">${icon('dice', 'sm')}보드게임·게임 ${f.games.length}가지 보기</summary><p class="muted small" style="margin-top:10px;line-height:1.8">${f.games.map(esc).join(', ')}</p></details>` : '';
    return `<div class="amen">${items.join('')}</div>${games}${facsView(s.facs)}<p class="tiny faint" style="margin-top:12px">비품과 시설은 지점 사정에 따라 바뀔 수 있어요.</p>`;
  }

  function rules(s) {
    const i = s.info || {};
    const rows = [];
    if (i.sameday) rows.push(['당일 예약', i.sameday]);
    if (i.tour) rows.push(['사전 답사', i.tour]);
    rows.push(['미성년자', i.minors || '미성년자끼리는 낮·올데이 패키지만 이용할 수 있고, 전원 보호자 동의서가 필요해요.']);
    if (i.noise) rows.push(['소음', i.noise]);
    rows.push(['숙박', '파티·모임을 위한 공간이라 숙박 목적으로는 이용할 수 없어요.']);
    const b = s.booking || {};
    if (ways(s).length && b.confirm) rows.push(['예약 확정', SP.CONFIRM_KINDS[b.confirm]]);
    if (b.cancel) rows.push(['취소·환불', b.cancel]);
    const care = String(s.care || '').split('\n').map((x) => x.trim()).filter(Boolean);
    return `${care.length ? `<ul class="care-list">${care.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
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
    if (ways(s).length && !sel) {
      area.innerHTML = `<p class="small muted" style="margin-top:14px">날짜를 누르면 그 요일 요금이 보여요. 예약은 아래 방법 중 편한 것으로 하세요.</p>${waysList(s)}`;
      $('#mbLabel').textContent = '날짜를 골라 주세요';
      return;
    }
    if (!sel) {
      const linked = (s.pkgs || []).filter((p) => p.url);
      const fb = fallback(s);
      area.innerHTML = `<p class="small muted" style="margin-top:14px">날짜를 누르면 그 요일 요금을 보고 네이버 예약으로 바로 이어져요. 예약 가능 여부는 네이버 예약 화면이 기준이에요.${linked.length ? ' 네이버에서 날짜를 고르려면 아래 패키지를 누르세요.' : ''}</p>
        ${linked.length ? `<div class="qbook">${linked.map((p) => `<a href="${esc(SP.naverHref(p.url))}" target="_blank" rel="noopener" data-track="${s.code}|book|${p.k}|"><span><b>${esc(p.label)}</b><small>${esc(p.hrs || '')}</small></span><span class="go">네이버 예약${icon('ext', 'sm')}</span></a>`).join('')}</div>` : ''}
        ${s.book ? `<a class="btn ${linked.length ? 'btn-line' : 'btn-naver'} btn-block" style="margin-top:12px" href="${esc(s.book)}" target="_blank" rel="noopener" data-track="${s.code}|book">${icon('ext')}네이버 예약 페이지 열기</a>`
          : !linked.length && fb ? `<a class="btn btn-naver btn-block" style="margin-top:12px" href="${esc(fb.href)}" target="_blank" rel="noopener" data-track="${s.code}|${fb.kind}">${icon('ext')}${esc(fb.label)}</a>` : ''}`;
      $('#mbLabel').textContent = '날짜를 골라 주세요';
      return;
    }
    const pi = SP.priceIdx(sel);
    const list = (s.pkgs || []).map((p) => ({ p, price: p.p[pi], st: pkgStatus(p) })).filter((x) => x.price);
    const wl = ways(s, sel);
    const h = s.hourly;
    const hp = h && (h.p || [])[pi];
    let html = `<h3 class="h4" style="margin-top:18px">${SP.mdwLong(sel)}</h3>`;
    const hst = hp && !(s.pkgs || []).length ? pkgStatus({ k: 'hour' }) : 'o';
    if (hp) html += `<div class="pkg hour${hst === 'b' || hst === 'c' ? ' is-b' : ''}"><div><h3>시간제 ${hst === 'b' ? '<span class="badge mute">마감</span>' : hst === 'c' ? '<span class="badge mute">지난 시간</span>' : ''}</h3><div class="hrs">최소 ${h.min}시간 · ${esc(h.hrs || '')}${h.note ? ` · ${esc(h.note)}` : ''}</div></div><div class="pr">${SP.won(hp)}<small>/1시간</small></div></div>`;
    html += '<div class="pkg-list">';
    if (!list.length && !hp) html += `<p class="muted small">${wl.length ? '이 요일 요금은 호스트에게 확인해 주세요.' : '이 요일에는 운영하는 패키지가 없어요.'}</p>`;
    // 호스트 예약 방식이 있거나 상품 링크가 하나도 없는 지점은 버튼을 패키지마다 반복하지 않고 아래에 한 번만 둔다
    const oneBtn = wl.length ? { ways: true } : list.length && !list.some((x) => x.p.url) ? fallback(s) : null;
    list.forEach(({ p, price, st }) => {
      const booked = st === 'b';   // 마감 칸은 확실한 정보라 데이터가 오래됐어도 보여 준다 (비어 있음은 최신일 때만)
      const past = st === 'c';
      const badge = past ? '<span class="badge mute">지난 시간</span>' : booked ? '<span class="badge mute">마감</span>' : live ? '<span class="badge ok">예약 가능</span>' : '';
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
    if (oneBtn && oneBtn.ways) {
      html += `<div style="margin-top:12px">${waysList(s, sel)}</div><p class="tiny faint" style="margin-top:8px">${esc(SP.mdw(sel))} 날짜로 예약하고 싶다고 알려 주시면 돼요.</p>`;
    } else if (oneBtn && list.some((x) => x.st !== 'c')) {
      html += `<a class="btn btn-naver btn-block" style="margin-top:12px" href="${esc(oneBtn.href)}" target="_blank" rel="noopener" data-track="${s.code}|${oneBtn.kind}||${sel}">${icon('ext')}${esc(oneBtn.label)}</a>
        <p class="tiny faint" style="margin-top:8px">이 지점은 네이버 예약 페이지에서 ${esc(SP.mdw(sel))} 날짜와 패키지를 골라 주세요.</p>`;
    }
    const allBooked = live && list.length && list.every((x) => x.st === 'b' || x.st === 'c');
    if (allBooked) html += '<div id="altBox" style="margin-top:16px"><h3 class="h4">같은 날 예약할 수 있는 근처 지점</h3><div class="alt-list" id="altList"><p class="small muted" style="padding:8px 0">찾는 중…</p></div></div>';
    area.innerHTML = html;
    const minToday = list.filter((x) => x.st !== 'b' && x.st !== 'c').map((x) => x.price);
    if (hp) minToday.push(hp * (h.min || 1));
    $('#mbLabel').textContent = SP.mdw(sel);
    $('#mbPrice').textContent = minToday.length ? SP.won(Math.min(...minToday)) + '부터' : '이날은 마감';
    if (!wl.length) $('#mbBtn').textContent = '패키지 고르기';
    if (allBooked) alternatives();
  }

  async function alternatives() {
    const all = await SP.spaces();
    const sp = space;
    const cands = all.filter((x) => x.code !== sp.code).map((x) => ({ x, w: x.area === sp.area ? 0 : x.region === sp.region ? 1 : 2 }))
      .filter((o) => o.w < 2).sort((a, b) => a.w - b.w || SP.rnd(a.x.code) - SP.rnd(b.x.code)).slice(0, 12).map((o) => o.x);
    const a = await SP.avail(sel, 1, cands.map((x) => x.code));
    const open = cands.filter((x) => { const c = a.spaces && a.spaces[x.code]; return c && (c[0] === 'o' || c[1] === 'o'); }).slice(0, 5);
    const el = $('#altList');
    if (!el) return;
    el.innerHTML = open.length ? open.map((x) => { const c = a.spaces[x.code]; return `<a href="/room/${x.code}?date=${sel}"><span><b>${esc(x.name)}</b><br><span class="tiny muted">${esc(x.area)} · 최대 ${x.max}명</span></span>${SP.dn(c[0], c[1], { live: true })}</a>`; }).join('')
      : `<p class="small muted" style="padding:8px 0">근처도 대부분 마감이에요. <a class="link" href="/rooms?date=${sel}&open=1">이날 다른 지점 보기</a></p>`;
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
  async function loadHostNews() {
    try {
      const d = await SP.get(`/api/posts?board=host&code=${code}&size=3`);
      if (!d.items || !d.items.length) return;
      $('#hnList').innerHTML = d.items.map(SP.postRow).join('');
      $('#hostNews').hidden = false;
      const nav = $('#roomNav');
      if (nav && !nav.querySelector('[href="#hostNews"]')) {
        const prev = ['#r-detail', '#r-photos', '#r-book', '#r-intro'].map((h) => nav.querySelector(`[href="${h}"]`)).find(Boolean);
        if (prev) prev.insertAdjacentHTML('afterend', '<a href="#hostNews">소식</a>'); else nav.insertAdjacentHTML('afterbegin', '<a href="#hostNews">소식</a>');
        if (spyIO) spyIO.observe($('#hostNews'));
      }
    } catch { /* 소식은 없어도 돼요 */ }
  }
  async function loadQna() {
    const el = $('#qaList');
    if (!el) return;
    try {
      const d = await SP.get(`/api/posts?board=qna&code=${code}&size=4`);
      el.innerHTML = d.items.length ? d.items.map(SP.postRow).join('') + `<a class="btn btn-soft btn-sm" style="margin-top:12px" href="/community?b=qna&code=${code}">문의 전체 보기</a>`
        : `<div class="empty" style="padding:22px 18px"><h3>아직 남겨진 문의가 없어요</h3><p>"접시가 몇 개 있나요?", "풍선을 천장에 붙여도 되나요?" 같은 질문을 남겨 보세요.</p></div>`;
    } catch { el.innerHTML = '<p class="muted small">문의를 불러오지 못했어요.</p>'; }
  }
  function drawSocial() {
    const box = $('#socialBox');
    if (box && SP.socialView) box.innerHTML = SP.socialView(space, SP.settings);
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
      if (e.target.closest('#rpMore')) { $('#rpGrid').classList.remove('fold'); e.target.closest('#rpMore').remove(); return; }
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
    $('#mbBtn').addEventListener('click', (e) => { if ($('#mbBtn').dataset.way) return; e.preventDefault(); $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    const toBook = $('[data-tobook]');
    if (toBook) toBook.addEventListener('click', (e) => { e.preventDefault(); $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    spy();
  }
  /* 바로가기 — 지금 보고 있는 부분 표시 */
  function spy() {
    const nav = $('#roomNav');
    if (!nav || !('IntersectionObserver' in window)) return;
    spyIO = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
        const on = nav.querySelector('a.on');
        if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: Math.max(0, on.offsetLeft - 16) });
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    nav.querySelectorAll('a').forEach((a) => { const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) spyIO.observe(t); });
  }

  (async function init() {
    if (!/^S-\d{4}$/.test(code)) { notFound(); return; }
    const pre = window.__SSR__ && window.__SSR__.space && window.__SSR__.space.code === code ? window.__SSR__.space : null;
    try {
      if (pre) {
        space = pre;
        SP.get('/api/spaces/' + code).then((d) => { near = d.near || []; reviewStat = d.reviews || reviewStat; drawNear(); loadReviews(); loadHostNews(); loadQna(); }).catch(() => {});
      } else {
        const d = await SP.get('/api/spaces/' + code);
        space = d.space; near = d.near || []; reviewStat = d.reviews || reviewStat;
      }
    } catch (e) { notFound(e.status === 404 ? '' : e.message); return; }
    // 서버가 정한 제목(지점명 파티룸 — 지역 동네 | 쏘플파티룸)과 같은 모양으로
    document.title = `${String(space.name).replace(/\s*파티룸$/, '')} 파티룸 — ${space.region} ${space.area} | 쏘플파티룸`;
    render();
    // 지점 화면을 연 수 (호스트 성과 보기) — 호스트 본인·자동 브라우저는 세지 않아요
    if (!navigator.webdriver) SP.me().then((m) => { const u = m && m.user; if (!(u && (u.hostCodes || []).includes(space.code))) SP.track(space.code, 'view'); }).catch(() => {});
    av = await SP.avail(today, DAYS, [code], true);
    drawCal();
    drawPkgs();
    if (!pre) { loadReviews(); loadHostNews(); loadQna(); drawNear(); }
    SP.site().then(({ settings }) => { SP.settings = SP.settings || settings; drawSocial(); }).catch(() => {});
  })();
})();
