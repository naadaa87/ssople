/* ============================================================
   기존 마케팅 페이지를 실제 데이터에 연결합니다.
   디자인과 마크업은 그대로 두고 데모 데이터만 갈아끼웁니다.
   ============================================================ */

(function () {
  const page = location.pathname.split('/').pop() || 'index.html';

  document.addEventListener('DOMContentLoaded', async () => {
    const me = await whoami();
    wireHeader(me);
    if (page === 'rooms.html') wireRooms();
    if (page === 'room-detail.html') wireDetail();
    if (page === 'mypage.html') wireMypage(me);
    if (page === 'reviews.html') wireReviews();
    if (page === 'event.html') wireEvents();
    if (page === 'locations.html') wireLocations();
  });

  /* ---------- 헤더 ---------- */
  function wireHeader(me) {
    document.querySelectorAll('a[href$="mypage.html"]').forEach((a) => {
      const t = (a.textContent || '').trim();
      if (t === '로그인') {
        if (me.authenticated) { a.textContent = me.name + '님'; a.href = '/mypage.html'; }
        else a.href = '/login.html';
      }
      if (t.includes('로그인 · 예약조회')) a.href = me.authenticated ? '/mypage.html' : '/login.html';
    });
  }

  /* ==========================================================
     공간 찾기 — 날짜를 고르면 그날 가능한 지점만 남습니다
     ========================================================== */
  async function wireRooms() {
    const grid = document.getElementById('grid');
    if (!grid) return;

    const region = document.getElementById('sbRegion');
    const date   = document.getElementById('sbDate');
    const people = document.getElementById('sbPeople');
    const sort   = document.getElementById('sortSel');
    const count  = document.getElementById('rCount');
    const empty  = document.getElementById('empty');

    const url = new URLSearchParams(location.search);
    if (url.get('region') && region) region.value = url.get('region');
    if (date) { date.min = todayStr(); if (url.get('date')) date.value = url.get('date'); }

    const SORT = { rec: 'recommend', rate: 'recommend', rev: 'review', low: 'price', cap: 'recommend' };

    async function load() {
      grid.innerHTML = `<div style="grid-column:1/-1">${loading('공간을 불러오고 있습니다')}</div>`;
      if (empty) empty.style.display = 'none';

      const q = new URLSearchParams();
      if (region?.value) q.set('region', region.value);
      if (date?.value) q.set('date', date.value);
      if (people?.value) q.set('people', people.value);
      if (url.get('purpose')) q.set('purpose', url.get('purpose'));
      q.set('sort', SORT[sort?.value] || 'recommend');

      let d;
      try { d = await API.get('/api/branches?' + q, { silent: true }); }
      catch {
        grid.innerHTML = `<div style="grid-column:1/-1">${emptyState('공간을 불러오지 못했습니다', '잠시 후 다시 시도해 주세요.')}</div>`;
        return;
      }

      if (count) count.textContent = d.count;
      if (!d.branches.length) {
        grid.innerHTML = '';
        if (empty) empty.style.display = '';
        else grid.innerHTML = `<div style="grid-column:1/-1">${emptyState('조건에 맞는 공간이 없습니다', '날짜나 인원을 조금 넓혀보세요.')}</div>`;
        return;
      }
      grid.innerHTML = d.branches.map((b) => card(b, date?.value)).join('');
    }

    [region, date, people, sort].forEach((el) => el && el.addEventListener('change', load));
    window.applyFilters = load;   /* 기존 페이지의 데모 필터 무력화 */
    load();
  }

  function card(b, date) {
    const q = new URLSearchParams({ id: b.id });
    if (date) q.set('date', date);
    const href = '/room-detail.html?' + q;
    const tag = (b.tags || [])[0] || '';
    const soon = b.freeSlots && b.freeSlots.length === 1;
    return `
    <div class="space">
      <a href="${href}" class="space-img">
        ${b.photo ? `<img src="${esc(b.photo)}" alt="${esc(b.name)}" loading="lazy"
             style="width:100%;height:100%;object-fit:cover">`
                  : `<div class="ph" style="background:${grad(b.id)}"></div>`}
        ${soon ? '<div class="space-badges"><span class="badge badge-clay">한 타임 남음</span></div>' : ''}
      </a>
      <a href="${href}">
        <div class="space-loc">📍 ${esc(b.region || '')} ${esc(b.address || '').split(' ').slice(1, 3).join(' ')}</div>
        <div class="space-nm">${esc(b.name)}</div>
        <div class="space-meta">
          ${b.rating ? `<span class="rating"><span class="star">★</span>${b.rating}<span class="cnt">(${b.reviewCount})</span></span>`
                     : '<span class="cnt" style="color:var(--muted)">후기 준비 중</span>'}
          <span>· 기본 ${b.basePeople}명 / 최대 ${b.maxPeople}명</span>
        </div>
        <div class="space-foot">
          <span class="space-price">${b.minPrice ? '₩' + num(b.minPrice) : '요금 문의'}<small> ~/타임</small></span>
          ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
        </div>
      </a>
    </div>`;
  }

  /* ==========================================================
     공간 상세 — 예약 위젯을 실제 가용 타임에 연결
     ========================================================== */
  async function wireDetail() {
    const url = new URLSearchParams(location.search);
    const id = Number(url.get('id'));
    const book = document.querySelector('.book');
    if (!book) return;
    if (!id) { book.innerHTML = emptyState('공간을 찾을 수 없습니다', '공간 찾기에서 다시 골라주세요.'); return; }

    let b;
    try { b = (await API.get('/api/branches/' + id, { silent: true })).branch; }
    catch { book.innerHTML = emptyState('공간 정보를 불러오지 못했습니다', ''); return; }

    set('cbName', b.name); set('dName', b.name);
    set('dArea', `${b.region || ''} ${b.address || ''}`.trim());
    set('dCap', b.maxPeople);
    set('dDesc', b.intro || '');
    set('dRate', b.rating || '-');
    set('dRev', b.reviewCount ? `(${b.reviewCount}개 후기)` : '(후기 준비 중)');
    set('rvNum', b.rating || '-');
    set('rvCnt', b.reviewCount ? `${b.reviewCount}개의 후기` : '아직 후기가 없습니다');
    const tl = document.getElementById('dTag');
    if (tl) tl.textContent = (b.tags || []).join(' · ');
    document.title = `${b.name} — 쏘플파티룸`;

    const amen = document.getElementById('dAmen');
    if (amen) amen.innerHTML = (b.amenities || []).map((t) => `<span class="amen-i">${esc(t)}</span>`).join('')
      || '<span class="muted">등록된 편의시설이 없습니다</span>';

    /* 사진 */
    if (b.photos?.length) {
      const main = document.getElementById('gMain');
      if (main) main.style.cssText =
        `background-image:url('${b.photos[0]}');background-size:cover;background-position:center`;
      ['gS1', 'gS2'].forEach((idn, i) => {
        const el = document.getElementById(idn);
        if (el && b.photos[i + 1]) el.style.cssText =
          `background-image:url('${b.photos[i + 1]}');background-size:cover;background-position:center`;
      });
    }

    /* 이용 안내 */
    const guideBox = document.querySelector('.dt-sec:last-of-type');
    if (b.guideText || b.parkingText) {
      const sec = document.createElement('div');
      sec.className = 'dt-sec';
      sec.innerHTML = `<h3>이용 안내</h3><p class="dt-desc">${
        [b.guideText, b.parkingText ? '주차 — ' + b.parkingText : ''].filter(Boolean).map(esc).join('<br>')
      }</p>`;
      guideBox?.parentNode?.insertBefore(sec, guideBox.nextSibling);
    }

    /* 후기 */
    const rvList = document.getElementById('dReviews');
    if (rvList) {
      try {
        const r = await API.get(`/api/branches/${id}/reviews`, { silent: true });
        rvList.innerHTML = r.reviews.length
          ? r.reviews.slice(0, 6).map((v) => `
            <div class="rv">
              <div class="rv-h"><b>${esc(v.author)}</b>
                <span class="star">${'★'.repeat(v.rating)}</span>
                <span class="muted" style="font-size:12px">${esc((v.createdAt || '').slice(0, 10))}</span></div>
              <p>${esc(v.content)}</p>
              ${v.reply ? `<p style="margin-top:8px;padding:10px 12px;background:var(--paper-2);
                border-radius:10px;font-size:13px"><b>사장님</b> ${esc(v.reply)}</p>` : ''}
            </div>`).join('')
          : `<p class="muted" style="font-size:14px">첫 후기를 기다리고 있습니다.</p>`;
      } catch {}
    }

    /* ---------- 예약 위젯 ---------- */
    const st = { date: url.get('date') || todayStr(1), slot: null, people: b.basePeople, data: null };

    book.innerHTML = `
      <div class="bk-price" id="bkPrice">타임을 골라주세요</div>
      <div class="muted" style="font-size:13px;margin-bottom:14px">
        기본 ${b.basePeople}명 · 초과 1인당 ${num(b.extraPrice)}원</div>
      <div class="field"><label for="bkDate">이용 날짜</label>
        <input class="input" type="date" id="bkDate" value="${st.date}" min="${todayStr()}"></div>
      <div class="field"><label>타임</label><div class="slotpick" id="bkSlots"></div></div>
      <div class="field"><label for="bkPeople">인원</label>
        <select class="input" id="bkPeople">${
          Array.from({ length: b.maxPeople }, (_, i) => i + 1)
            .map((n) => `<option value="${n}"${n === b.basePeople ? ' selected' : ''}>${n}명${
              n > b.basePeople ? ` (추가 ${n - b.basePeople}명)` : ''}</option>`).join('')
        }</select></div>
      <div id="bkPay"></div>
      <button class="btn btn-clay btn-block" id="bkGo" disabled style="margin-top:16px">타임을 골라주세요</button>
      <div style="text-align:center;margin-top:10px;font-size:12px;color:var(--muted)">
        이용 7일 전까지 취소하면 예약금 전액을 돌려드립니다</div>`;

    const $date = document.getElementById('bkDate');
    const $slots = document.getElementById('bkSlots');
    const $people = document.getElementById('bkPeople');
    const $pay = document.getElementById('bkPay');
    const $go = document.getElementById('bkGo');
    const $price = document.getElementById('bkPrice');

    async function loadSlots() {
      $slots.innerHTML = `<div class="skel" style="height:96px"></div><div class="skel" style="height:96px"></div>`;
      try {
        st.data = await API.get(
          `/api/branches/${id}/availability?date=${st.date}&people=${st.people}`, { silent: true });
      } catch {
        $slots.innerHTML = `<div style="grid-column:1/-1;color:var(--muted);font-size:13px">타임을 불러오지 못했습니다</div>`;
        return;
      }
      if (st.slot && !st.data.slots.find((s) => s.slot === st.slot && s.available)) st.slot = null;

      if (st.data.closedAllDay) {
        $slots.innerHTML = `<div style="grid-column:1/-1;padding:18px;text-align:center;color:var(--muted);font-size:13.5px">이 날은 쉬는 날입니다</div>`;
      } else {
        $slots.innerHTML = st.data.slots.map((s) => `
          <button type="button" class="slotcard${st.slot === s.slot ? ' sel' : ''}"
                  data-s="${s.slot}"${s.available ? '' : ' disabled'}>
            <div class="sn">${s.label}</div>
            <div class="st">${esc(s.time)}</div>
            <div class="sp">${won(s.totalAmount)}</div>
            ${s.extraAmount ? `<div class="sx">추가 인원 ${won(s.extraAmount)} 포함</div>` : ''}
            ${!s.available ? '<div class="sx" style="color:var(--muted)">예약 마감</div>' : ''}
          </button>`).join('');
        $slots.querySelectorAll('[data-s]').forEach((el) =>
          el.addEventListener('click', () => { st.slot = el.dataset.s; paint(); }));
      }
      paint();
    }

    function paint() {
      $slots.querySelectorAll('[data-s]').forEach((el) =>
        el.classList.toggle('sel', el.dataset.s === st.slot));

      const s = st.data?.slots.find((x) => x.slot === st.slot);
      if (!s) {
        $price.textContent = '타임을 골라주세요';
        $pay.innerHTML = '';
        $go.disabled = true;
        $go.textContent = '타임을 골라주세요';
        return;
      }
      $price.innerHTML = `${won(s.totalAmount)} <small>· ${s.label}</small>`;
      $pay.innerHTML = `
        <div class="paybox">
          <div class="pr"><span class="k">${s.label} 요금</span><span>${won(s.baseAmount)}</span></div>
          ${s.peopleExtra ? `<div class="pr"><span class="k">추가 인원 ${s.peopleExtra}명</span><span>${won(s.extraAmount)}</span></div>` : ''}
          <div class="pr"><span class="k">지금 결제할 예약금</span><span style="font-weight:700">${won(s.deposit)}</span></div>
          <div class="pt"><span>현장 잔금</span><span class="v">${won(s.balance)}</span></div>
        </div>`;
      $go.disabled = false;
      $go.textContent = `예약금 ${won(s.deposit)} 결제하기`;
    }

    $date.addEventListener('change', () => { st.date = $date.value; loadSlots(); });
    $people.addEventListener('change', () => { st.people = Number($people.value); loadSlots(); });
    $go.addEventListener('click', () => {
      location.href = `/booking.html?branch=${id}&date=${st.date}&slot=${st.slot}&people=${st.people}`;
    });

    loadSlots();
  }

  /* ==========================================================
     마이페이지
     ========================================================== */
  async function wireMypage(me) {
    const loginView = document.getElementById('loginView');
    const dashView = document.getElementById('dashView');

    if (!me.authenticated) {
      if (loginView) {
        loginView.innerHTML = `
          <div class="wrap-s" style="padding:80px 20px;text-align:center">
            <h1 style="font-size:24px;font-weight:900;margin-bottom:10px">로그인이 필요합니다</h1>
            <p style="color:var(--muted);margin-bottom:26px">예약 내역과 등급 혜택을 보시려면 로그인해 주세요.</p>
            <div style="display:flex;gap:10px;max-width:320px;margin:0 auto">
              <a class="btn btn-line" style="flex:1" href="/signup.html">회원가입</a>
              <a class="btn btn-clay" style="flex:1" href="/login.html">로그인</a>
            </div>
            <p style="margin-top:22px;font-size:13.5px;color:var(--muted)">
              비회원으로 예약하셨다면 <a href="/lookup.html" style="color:var(--clay);font-weight:700">예약 조회</a>를 이용해 주세요.
            </p>
          </div>`;
        loginView.style.display = '';
      }
      if (dashView) dashView.style.display = 'none';
      return;
    }

    if (loginView) loginView.style.display = 'none';
    if (dashView) dashView.style.display = '';

    const pane = document.getElementById('pane-book');
    if (!pane) return;
    pane.innerHTML = loading('예약 내역을 불러오고 있습니다');

    let d;
    try { d = await API.get('/api/reservations/me', { silent: true }); }
    catch { pane.innerHTML = emptyState('예약 내역을 불러오지 못했습니다', ''); return; }

    const sec = (title, list, kind) => list.length
      ? `<h3 style="font-size:15px;font-weight:800;margin:22px 0 12px">${title} ${list.length}건</h3>`
        + list.map((r) => resCard(r, kind)).join('')
      : '';

    const html = sec('다가오는 예약', d.upcoming, 'up')
      + sec('지난 이용', d.past, 'past')
      + sec('취소한 예약', d.cancelled, 'cancel');

    pane.innerHTML = html || (emptyState('아직 예약이 없습니다', '마음에 드는 공간을 찾아보세요.')
      + `<div style="text-align:center;margin-top:16px"><a class="btn btn-clay" href="/rooms.html">공간 찾기</a></div>`);

    pane.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => askCancel(b)));
    pane.querySelectorAll('[data-review]').forEach((b) => b.addEventListener('click', () =>
      (location.href = '/review-write.html?res=' + b.dataset.review)));
  }

  function resCard(r, kind) {
    return `
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div style="min-width:0">
          <div style="font-weight:800;font-size:15.5px">${esc(r.branchName)}</div>
          <div style="color:var(--muted);font-size:13.5px;margin-top:4px">
            ${dateLabel(r.useDate)} · ${esc(r.slotLabel)} ${esc(r.slotTime || '')} · ${r.people}명</div>
          <div style="color:var(--muted);font-size:12.5px;margin-top:2px">예약번호 ${esc(r.code)}</div>
        </div>
        <div style="text-align:right;flex:none">
          ${statusBadge(r.status)}
          <div style="font-weight:800;margin-top:6px">${won(r.totalAmount)}</div>
          <div style="font-size:12px;color:var(--muted)">예약금 ${won(r.deposit)} · 잔금 ${won(r.balance)}</div>
        </div>
      </div>
      ${r.accessInfo ? `<div class="note note-ok" style="margin-top:14px">
        <b>오늘 이용하시는 예약입니다.</b><br>${esc(r.accessInfo)}</div>` : ''}
      ${kind === 'up' && r.refund ? `
        <div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px;
                    display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:13px;color:var(--muted)">${esc(r.refund.label)}</span>
          <button class="btn btn-line btn-xs" data-cancel="${r.id}"
            data-dep="${r.deposit}" data-ref="${r.refund.refundAmount}"
            data-lbl="${esc(r.refund.label)}" data-code="${esc(r.code)}">예약 취소</button>
        </div>` : ''}
      ${r.canReview ? `
        <div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px;text-align:right">
          <button class="btn btn-clay btn-xs" data-review="${r.id}">후기 쓰기</button>
        </div>` : ''}
    </div>`;
  }

  function askCancel(b) {
    const ref = Number(b.dataset.ref), dep = Number(b.dataset.dep);
    modal({
      title: '예약을 취소할까요?',
      body: `
        <p style="font-size:14.5px;color:var(--text);line-height:1.7;margin-bottom:14px">
          ${esc(b.dataset.code)} 예약을 취소합니다.</p>
        <div style="background:var(--paper-2);border-radius:12px;padding:16px">
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px">
            <span style="color:var(--muted)">결제하신 예약금</span><span>${won(dep)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px">
            <span style="color:var(--muted)">적용 규정</span><span>${esc(b.dataset.lbl)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0 0;margin-top:8px;
                      border-top:1px solid var(--line-2);font-weight:800">
            <span>환불 금액</span>
            <span style="color:${ref > 0 ? 'var(--ok)' : 'var(--bad)'};font-size:17px">${won(ref)}</span></div>
        </div>
        ${ref <= 0 ? `<div class="note note-warn" style="margin-top:14px">
          환불 대상이 아닙니다. 그래도 취소하시겠습니까?</div>` : ''}`,
      confirmText: '취소하기', danger: true,
      onConfirm: async () => {
        await API.post(`/api/reservations/${b.dataset.cancel}/cancel`, { confirm: true });
        toast('예약을 취소했습니다.', 'ok');
        setTimeout(() => location.reload(), 700);
      },
    });
  }

  /* ---------- 이용후기 ---------- */
  async function wireReviews() {
    const list = document.querySelector('.rvlist, #reviewList, .review-grid');
    if (!list) return;
    list.innerHTML = loading();
    try {
      const d = await API.get('/api/reviews/recent?limit=40', { silent: true });
      list.innerHTML = d.reviews.length ? d.reviews.map((v) => `
        <div class="rv card" style="margin-bottom:12px">
          <div class="rv-h" style="display:flex;gap:8px;align-items:center">
            <b>${esc(v.author)}</b>
            <span class="star" style="color:var(--gold)">${'★'.repeat(v.rating)}</span>
            <span class="muted" style="font-size:12px">${esc(v.branch)}</span>
            <span class="muted" style="font-size:12px;margin-left:auto">${esc((v.createdAt || '').slice(0, 10))}</span>
          </div>
          <p style="margin-top:8px;font-size:14px;line-height:1.7">${esc(v.content)}</p>
          ${v.reply ? `<p style="margin-top:10px;padding:11px 13px;background:var(--paper-2);
            border-radius:10px;font-size:13px"><b>사장님</b> ${esc(v.reply)}</p>` : ''}
        </div>`).join('') : emptyState('아직 후기가 없습니다', '첫 후기를 남겨주세요.');
    } catch { list.innerHTML = emptyState('후기를 불러오지 못했습니다', ''); }
  }

  /* ---------- 이벤트·공지 ---------- */
  async function wireEvents() {
    const list = document.querySelector('#eventList, .event-grid, .ev-list');
    if (!list) return;
    try {
      const d = await API.get('/api/events', { silent: true });
      if (!d.events.length) return;
      list.innerHTML = d.events.map((e) => `
        <article class="card" style="margin-bottom:14px">
          ${e.pinned ? '<span class="badge badge-clay">공지</span>' : ''}
          <h3 style="margin-top:8px">${esc(e.title)}</h3>
          <p style="color:var(--muted);font-size:14px;margin-top:6px">${esc(e.summary || '')}</p>
          ${e.body ? `<p style="margin-top:10px;font-size:14px;line-height:1.7">${esc(e.body)}</p>` : ''}
        </article>`).join('');
    } catch {}
  }

  /* ---------- 지점 안내 ---------- */
  async function wireLocations() {
    const list = document.querySelector('#branchList, .loc-grid, .locations-grid');
    if (!list) return;
    try {
      const d = await API.get('/api/branches', { silent: true });
      if (!d.branches.length) return;
      list.innerHTML = d.branches.map((b) => `
        <a class="card" href="/room-detail.html?id=${b.id}" style="display:block;margin-bottom:12px">
          <div style="font-weight:800;font-size:15.5px">${esc(b.name)}</div>
          <div style="color:var(--muted);font-size:13.5px;margin-top:4px">${esc(b.address || '')}</div>
          <div style="margin-top:8px;font-size:13px">
            낮타임 ${won(b.dayPrice)} · 밤타임 ${won(b.nightPrice)}</div>
        </a>`).join('');
    } catch {}
  }

  /* ---------- 유틸 ---------- */
  function set(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  function grad(n) {
    const g = ['linear-gradient(150deg,#3a2a2f,#c65f47)', 'linear-gradient(150deg,#2a1f2c,#8a5a7a)',
      'linear-gradient(150deg,#232840,#5a6aa0)', 'linear-gradient(150deg,#2b3a30,#5f8a6a)',
      'linear-gradient(150deg,#3a3226,#a8895a)', 'linear-gradient(150deg,#2c2a3a,#6a5f9c)'];
    return g[n % g.length];
  }
})();
