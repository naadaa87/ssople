/* ============================================================
   기존 마케팅 페이지를 실제 데이터에 연결합니다.
   디자인과 마크업은 그대로 두고 데모 데이터만 갈아끼웁니다.
   ============================================================ */

(function () {
  const page = location.pathname.split('/').pop() || 'index.html';

  document.addEventListener('DOMContentLoaded', async () => {
    const me = await whoami();
    wireHeader(me);
    if (page === 'index.html') wireHome();
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
     홈 — 오늘·내일 빈 타임 + 실제 지점 수 · 인기 공간 · 권역 수
     API가 없거나 지점이 비어 있으면 데모 화면을 그대로 둡니다
     ========================================================== */
  async function wireHome() {
    /* 오늘 · 내일 바로 예약 */
    try {
      const t = await API.get('/api/today', { silent: true });
      const sec = document.getElementById('todaySec');
      const sc = document.getElementById('todayScroll');
      if (t.items?.length && sec && sc) {
        sc.innerHTML = t.items.map(todayCard).join('');
        sec.style.display = '';
      }
    } catch { /* 조용히 통과 */ }

    /* 지점 실데이터 */
    let d;
    try { d = await API.get('/api/branches?sort=review', { silent: true }); }
    catch { return; }
    if (!d.branches?.length) return;

    const n = d.count || d.branches.length;
    const net = document.getElementById('hqNet');
    if (net) net.textContent = `전국 ${n}개 지점`;
    const total = document.getElementById('regionTotal');
    if (total) total.textContent = `전국 ${n}개 →`;

    /* 인기 공간 상위 8 */
    const pg = document.getElementById('popGrid');
    if (pg) pg.innerHTML = d.branches.slice(0, 8)
      .map((b) => card(b).replace('class="space"', 'class="space reveal in"')).join('');

    /* 권역별 지점 수 */
    const cnt = {};
    d.branches.forEach((b) => { const r = b.region || '기타'; cnt[r] = (cnt[r] || 0) + 1; });
    document.querySelectorAll('[data-region-count]').forEach((el) => {
      const c = el.dataset.regionCount.split('|').reduce((s, k) => s + (cnt[k] || 0), 0);
      if (c) el.textContent = `${c}개 지점`;
    });

    /* 후기 합계 · 평균 */
    let sum = 0, count = 0;
    d.branches.forEach((b) => { if (b.reviewCount) { count += b.reviewCount; sum += (b.rating || 0) * b.reviewCount; } });
    if (count) {
      const r = document.getElementById('hqRating'), c = document.getElementById('hqReviews');
      if (r) r.textContent = (sum / count).toFixed(1);
      if (c) c.textContent = `누적 후기 ${num(count)}+`;
    }
  }

  function todayCard(it) {
    const href = `/room-detail.html?id=${it.branchId}&date=${it.date}&slot=${it.slot}`;
    const loc = [it.region, it.area].filter(Boolean).join(' · ');
    return `
    <a class="tday" href="${href}">
      <span class="td-when${it.dateLabel === '내일' ? ' tm' : ''}">${it.dateLabel === '오늘' ? '🔥 오늘' : '🗓️ 내일'} ${it.slotLabel}</span>
      <div class="td-nm">${esc(it.name)}</div>
      <div class="td-loc">📍 ${esc(loc || '')}${it.rating ? ` · ★${it.rating}` : ''}</div>
      <div class="td-foot">
        <span class="td-slot">${esc(it.time)}<small>기본 ${it.basePeople}명 / 최대 ${it.maxPeople}명</small></span>
        <span class="td-price">₩${num(it.price)}</span>
      </div>
    </a>`;
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
    const regChecks = [...document.querySelectorAll('.fRegion')];
    const purChecks = [...document.querySelectorAll('.fPurpose')];
    const featChecks = [...document.querySelectorAll('.fFeat')];
    const capRadios = [...document.querySelectorAll('input[name=cap]')];

    const url = new URLSearchParams(location.search);
    if (url.get('region') && region) region.value = url.get('region');
    if (date) { date.min = todayStr(); if (url.get('date')) date.value = url.get('date'); }
    const urlPurpose = url.get('purpose');
    purChecks.forEach((c) => { if (c.value === urlPurpose) c.checked = true; });

    const SORT = { rec: 'recommend', rate: 'recommend', rev: 'review', low: 'price', cap: 'recommend' };

    /* 지역: 검색바 셀렉트와 사이드바 체크박스를 하나로 (단일 선택) */
    function syncRegion(from) {
      const v = from === 'select' ? region.value
              : (regChecks.find((c) => c.checked && c !== syncRegion.last)?.value
                 || regChecks.find((c) => c.checked)?.value || '');
      if (region) region.value = v;
      regChecks.forEach((c) => { c.checked = c.value === v; if (c.checked) syncRegion.last = c; });
      return v;
    }
    if (region?.value) syncRegion('select');

    /* 권역별 지점 수 — 전체 목록 1회로 채웁니다 */
    (async () => {
      try {
        const all = await API.get('/api/branches', { silent: true });
        const cnt = {};
        all.branches.forEach((b) => { const r = b.region || '기타'; cnt[r] = (cnt[r] || 0) + 1; });
        document.querySelectorAll('[data-fcount]').forEach((el) => {
          el.textContent = cnt[el.dataset.fcount] || 0;
        });
      } catch {}
    })();

    async function load() {
      grid.innerHTML = `<div style="grid-column:1/-1">${loading('공간을 불러오고 있습니다')}</div>`;
      if (empty) empty.style.display = 'none';

      const purposes = purChecks.filter((c) => c.checked).map((c) => c.value);
      if (!purposes.length && urlPurpose) purposes.push(urlPurpose);

      const q = new URLSearchParams();
      if (region?.value) q.set('region', region.value);
      if (date?.value) q.set('date', date.value);
      const cap = capRadios.find((r) => r.checked)?.value || people?.value;
      if (cap) q.set('people', cap);
      if (purposes.length === 1) q.set('purpose', purposes[0]);
      featChecks.forEach((c) => { if (c.checked) q.set(c.value, '1'); });
      q.set('sort', SORT[sort?.value] || 'recommend');

      let d;
      try { d = await API.get('/api/branches?' + q, { silent: true }); }
      catch {
        grid.innerHTML = `<div style="grid-column:1/-1">${emptyState('공간을 불러오지 못했습니다', '잠시 후 다시 시도해 주세요.')}</div>`;
        return;
      }

      let list = d.branches;
      /* 목적을 여러 개 고르면 남은 조건은 화면에서 거릅니다 */
      if (purposes.length > 1)
        list = list.filter((b) => purposes.every((p) => (b.tags || []).includes(p)));

      if (count) count.textContent = list.length;
      if (!list.length) {
        grid.innerHTML = '';
        if (empty) empty.style.display = '';
        else grid.innerHTML = `<div style="grid-column:1/-1">${emptyState('조건에 맞는 공간이 없습니다', '날짜나 인원을 조금 넓혀보세요.')}</div>`;
        return;
      }
      grid.innerHTML = list.map((b) => card(b, date?.value)).join('');
    }

    region?.addEventListener('change', () => { syncRegion('select'); load(); });
    regChecks.forEach((c) => c.addEventListener('change', () => { syncRegion('check'); load(); }));
    [date, people, sort].forEach((el) => el && el.addEventListener('change', load));
    window.applyFilters = load;   /* 기존 페이지의 데모 필터 무력화 */
    window.toggleRegion = () => { syncRegion('check'); load(); };
    load();
  }

  function card(b, date) {
    const q = new URLSearchParams({ id: b.id });
    if (date) q.set('date', date);
    const href = '/room-detail.html?' + q;
    const tag = (b.tags || []).find((t) => t !== '생일') || '';
    const soon = b.freeSlots && b.freeSlots.length === 1;
    const feats = [b.karaokeOk && '🎤', b.bbqOk && '🍖', b.petOk && '🐶'].filter(Boolean).join(' ');
    return `
    <div class="space">
      <a href="${href}" class="space-img">
        ${b.photo ? `<img src="${esc(b.photo)}" alt="${esc(b.name)}" loading="lazy"
             style="width:100%;height:100%;object-fit:cover">`
                  : `<div class="ph" style="background:${grad(b.id)}"></div>`}
        <div class="space-badges">
          ${b.mgmtType === 'direct' ? '<span class="badge badge-paper">직영</span>' : ''}
          ${soon ? '<span class="badge badge-clay">한 타임 남음</span>' : ''}
        </div>
      </a>
      <a href="${href}">
        <div class="space-loc">📍 ${esc([b.region, b.area].filter(Boolean).join(' · ') || '')}${feats ? ` <span style="letter-spacing:2px">${feats}</span>` : ''}</div>
        <div class="space-nm">${esc(b.name)}</div>
        <div class="space-meta">
          ${b.rating ? `<span class="rating"><span class="star">★</span>${b.rating}<span class="cnt">(${b.reviewCount})</span></span>`
                     : '<span class="cnt" style="color:var(--muted)">후기 준비 중</span>'}
          <span>· 기본 ${b.basePeople}명 / 최대 ${b.maxPeople}명</span>
        </div>
        <div class="space-foot">
          <span class="space-price">${b.minPrice ? '₩' + num(b.minPrice) : '요금 문의'}<small> ~/타임</small></span>
          ${tag ? `<span class="tag">#${esc(tag)}</span>` : ''}
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
    set('dArea', `${[b.region, b.area].filter(Boolean).join(' · ')} — ${b.address || ''}`.trim());
    set('dCap', b.maxPeople);
    set('dDesc', b.intro || '');
    set('dRate', b.rating || '-');
    set('dRev', b.reviewCount ? `(${b.reviewCount}개 후기)` : '(후기 준비 중)');
    set('rvNum', b.rating || '-');
    set('rvCnt', b.reviewCount ? `${b.reviewCount}개의 후기` : '아직 후기가 없습니다');
    const tl = document.getElementById('dTag');
    if (tl) {
      const feats = [
        b.mgmtType === 'direct' ? '직영' : '',
        b.karaokeOk ? '🎤 노래방' : '', b.bbqOk ? '🍖 바베큐' : '', b.petOk ? '🐶 애견 동반' : '',
        ...(b.features || []),
      ].filter(Boolean);
      tl.innerHTML = feats.length
        ? feats.map((f) => `<span class="amen-i" style="background:var(--clay-50);color:var(--clay-deep);border:none">${esc(f)}</span>`).join(' ')
        : esc((b.tags || []).join(' · '));
    }
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

    /* 요일 차등 요금표 — 규칙이 있는 지점만 */
    if (b.priceRules && guideBox) {
      const row = (label, r) => r ? `
        <tr><th>${label}</th>
          <td>${won(r.base)}</td><td>${won(r.fri ?? r.base)}</td>
          <td>${won(r.sat ?? r.base)}</td><td>${won(r.sun ?? r.base)}</td></tr>` : '';
      const sec = document.createElement('div');
      sec.className = 'dt-sec';
      sec.innerHTML = `<h3>요일별 요금</h3>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13.5px;min-width:420px">
          <thead><tr style="color:var(--muted);font-size:12px">
            <th style="text-align:left;padding:8px 6px"></th><th>월–목</th><th>금</th><th>토</th><th>일</th></tr></thead>
          <tbody style="text-align:center">${row('낮타임', b.priceRules.day)}${row('밤타임', b.priceRules.night)}</tbody>
        </table></div>
        <p class="muted" style="font-size:12.5px;margin-top:8px">날짜를 고르면 해당 요일 요금으로 자동 계산됩니다. 보증금 ${won(b.deposit)}은 이용 후 이상이 없으면 전액 환급됩니다.</p>`;
      sec.querySelectorAll('td,th').forEach((c) => c.style.padding = '9px 6px');
      sec.querySelectorAll('tbody tr').forEach((r) => r.style.borderTop = '1px solid var(--line)');
      guideBox?.parentNode?.insertBefore(sec, guideBox.nextSibling);
    }

    /* 후기 (사진 후기 우선) */
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
              ${v.photos?.length ? `<div style="display:flex;gap:8px;margin:8px 0;overflow-x:auto">${
                v.photos.slice(0, 4).map((p) => `<img src="${esc(p)}" alt="후기 사진" loading="lazy"
                  style="width:92px;height:92px;object-fit:cover;border-radius:10px;flex:0 0 auto">`).join('')}</div>` : ''}
              <p>${esc(v.content)}</p>
              ${v.reply ? `<p style="margin-top:8px;padding:10px 12px;background:var(--paper-2);
                border-radius:10px;font-size:13px"><b>사장님</b> ${esc(v.reply)}</p>` : ''}
            </div>`).join('')
          : `<p class="muted" style="font-size:14px">첫 후기를 기다리고 있습니다.</p>`;
      } catch {}
    }

    /* ---------- 예약 위젯 ---------- */
    const st = {
      date: url.get('date') || todayStr(1),
      slot: ['day', 'night'].includes(url.get('slot')) ? url.get('slot') : null,
      people: b.basePeople, data: null,
    };

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

    /* ---------- 지갑 · 등급 · 요약 ---------- */
    const GRADE_KO = { WELCOME: '웰컴', SILVER: '실버', GOLD: '골드' };
    API.get('/api/me/wallet', { silent: true }).then((w) => {
      const nm = w.name || me.name || '회원';
      set('mName', `${nm}님`);
      const av = document.getElementById('mAv');
      if (av) av.textContent = nm.slice(0, 1);
      set('mGrade', `⭐ ${GRADE_KO[w.grade] || w.grade} 등급 · ${w.earnRate}% 적립`);
      set('mUp', w.stats.upcoming);
      set('mDone', w.stats.done);
      set('mPts', num(w.points) + 'P');
      set('mCpn', w.coupons.length);
      renderPoints(w);
      renderCoupons(w);
    }).catch(() => {
      set('mName', `${me.name || '회원'}님`);
      const pt = document.getElementById('ptList'), cp = document.getElementById('cpList');
      if (pt) pt.innerHTML = emptyState('포인트 내역을 불러오지 못했습니다', '');
      if (cp) cp.innerHTML = emptyState('쿠폰을 불러오지 못했습니다', '');
    });

    /* ---------- 예약 내역 ---------- */
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
    pane.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () =>
      openResDetail(b.dataset.detail)));
    pane.querySelectorAll('[data-gcopy]').forEach((b) => b.addEventListener('click', async () => {
      const link = `${location.origin}/guest.html?t=${b.dataset.gcopy}`;
      try { await navigator.clipboard.writeText(link); } catch {}
      toast('참석자 안내 링크를 복사했습니다');
    }));
  }

  function renderPoints(w) {
    const head = document.getElementById('ptHead');
    const list = document.getElementById('ptList');
    if (head) head.innerHTML = `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div><div style="font-size:13px;color:var(--muted)">사용 가능한 포인트</div>
          <div style="font-size:26px;font-weight:900;color:var(--clay)">${num(w.points)}<small style="font-size:15px">P</small></div></div>
        <div style="text-align:right;font-size:12.5px;color:var(--muted)">
          결제액의 ${w.earnRate}%가 이용 완료 후 적립됩니다<br>사진 후기를 남기면 추가 적립 · 유효기간 1년</div>
      </div>`;
    if (!list) return;
    const R = { earn: '적립', review_photo: '사진후기 적립', use: '사용', refund: '취소 복원', expire: '소멸', admin: '조정' };
    list.innerHTML = w.pointHistory.length ? w.pointHistory.map((h) => `
      <div class="pt-row">
        <div><b>${esc(R[h.reason] || h.reason)}</b>
          <div style="color:var(--muted);font-size:13px">${esc(h.memo || '')}
            <span style="margin-left:6px">${esc((h.at || '').slice(0, 10))}</span></div></div>
        <span class="pp${h.amount > 0 ? ' plus' : ''}">${h.amount > 0 ? '+' : ''}${num(h.amount)}P</span>
      </div>`).join('')
      : `<p class="muted" style="font-size:14px">아직 포인트 내역이 없습니다. 예약을 이용 완료하면 결제액의 ${w.earnRate}%가 쌓여요.</p>`;
  }

  function renderCoupons(w) {
    const list = document.getElementById('cpList');
    if (!list) return;
    list.innerHTML = w.coupons.length ? w.coupons.map((c) => `
      <div class="cpn">
        <div class="cv">${c.kind === 'percent' ? c.value + '%' : num(c.value)}</div>
        <div><div class="cn">${esc(c.title)}</div>
          <div class="cd">${c.expiresAt ? '~ ' + esc(c.expiresAt.slice(0, 10)) : '기한 없음'}${
            c.minAmount ? ` · ${num(c.minAmount)}원 이상` : ''}</div></div>
        <a class="btn btn-line btn-sm cbtn" href="rooms.html">사용하기</a>
      </div>`).join('')
      : `<p class="muted" style="font-size:14px">지금 쓸 수 있는 쿠폰이 없습니다. 예약을 이용하시면 재예약 쿠폰이 도착해요.</p>`;
  }

  function resCard(r, kind) {
    const full = r.payMode === 'FULL';
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
          <div style="font-size:12px;color:var(--muted)">${full
            ? `보증금 ${won(r.deposit)} 포함 결제`
            : `예약금 ${won(r.deposit)} · 잔금 ${won(r.balance)}`}</div>
        </div>
      </div>
      ${r.accessInfo ? `<div class="note note-ok" style="margin-top:14px">
        <b>오늘 이용하시는 예약입니다.</b><br>${esc(r.accessInfo)}</div>` : ''}
      <div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px;
                  display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:13px;color:var(--muted)">${
          kind === 'up' && r.refund ? esc(r.refund.label) : ''}</span>
        <span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          ${kind === 'up' && r.guestToken
            ? `<button class="btn btn-line btn-xs" data-gcopy="${esc(r.guestToken)}">👥 참석자 링크</button>` : ''}
          <button class="btn btn-line btn-xs" data-detail="${r.id}">상세 · 보증금</button>
          ${kind === 'up' && r.refund ? `
            <button class="btn btn-line btn-xs" data-cancel="${r.id}"
              data-dep="${r.deposit}" data-ref="${r.refund.refundAmount}"
              data-depback="${r.refund.depositBack || 0}" data-mode="${r.payMode}"
              data-lbl="${esc(r.refund.label)}" data-code="${esc(r.code)}">예약 취소</button>` : ''}
          ${kind === 'past' && r.status === 'completed'
            ? `<a class="btn btn-line btn-xs" href="/room-detail.html?id=${r.branchId}">다시 예약</a>` : ''}
          ${r.canReview ? `<button class="btn btn-clay btn-xs" data-review="${r.id}">후기 쓰기</button>` : ''}
        </span>
      </div>
    </div>`;
  }

  /* ---------- 예약 상세 — 타임라인 · 보증금 · 차감 ---------- */
  const INC_LABEL = { clean: '청소 미이행', damage: '파손·분실', noise: '소음·민원',
    over: '인원 초과', smoke: '실내 흡연', noshow: '노쇼', etc: '기타' };
  /* 상태 이름은 본사 대시보드(분쟁·보증금)와 같은 값을 씁니다 */
  const INC_STATUS = {
    PROPOSED:  ['차감 청구', 'var(--warn, #b07514)'],
    DISPUTED:  ['이의 검토 중', 'var(--clay)'],
    CONFIRMED: ['차감 확정', 'var(--bad, #c62912)'],
    WITHDRAWN: ['차감 철회', 'var(--muted)'],
  };

  async function openResDetail(id) {
    let d;
    try { d = await API.get(`/api/reservations/${id}/detail`, { silent: true }); }
    catch (e) { toast(e.message || '상세를 불러오지 못했습니다', 'bad'); return; }
    const r = d.reservation, dep = d.depositView;
    const today = todayStr();
    const done = r.status === 'completed';
    const canceled = r.status === 'canceled';
    const used = done || (r.status === 'confirmed' && r.useDate < today);

    const steps = [
      ['결제 완료', d.payment?.approvedAt ? (d.payment.approvedAt || '').slice(0, 10) : '', true],
      ['예약 확정', '', !canceled || true],
      canceled
        ? ['예약 취소', '', true]
        : [`이용 ${r.useDate.slice(5)} ${r.slotLabel}`, r.slotTime, used || done],
      ...(canceled ? [] : [['이용 완료', '', done]]),
      ...(canceled || r.payMode !== 'FULL' ? [] : [[
        dep.returned ? '보증금 반환 완료' : '보증금 반환',
        dep.returned ? `${won(dep.returned.amount)} · ${(dep.returned.at || '').slice(0, 10)}` : '이용 후 영업일 3일 내',
        !!dep.returned]]),
    ];
    const timeline = `
      <div style="display:flex;flex-direction:column;gap:0;margin:4px 0 18px">
        ${steps.map(([t, sub, on], i) => `
        <div style="display:flex;gap:12px">
          <div style="display:flex;flex-direction:column;align-items:center">
            <div style="width:22px;height:22px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
                        font-size:12px;font-weight:800;${on
              ? 'background:var(--clay);color:#fff' : 'background:var(--paper-2);color:var(--muted);border:1.5px solid var(--line-2)'}">
              ${on ? '✓' : i + 1}</div>
            ${i < steps.length - 1 ? `<div style="width:2px;flex:1;min-height:16px;background:${on ? 'var(--clay)' : 'var(--line)'}"></div>` : ''}
          </div>
          <div style="padding-bottom:14px">
            <div style="font-weight:700;font-size:14px;${on ? '' : 'color:var(--muted)'}">${t}</div>
            ${sub ? `<div style="font-size:12.5px;color:var(--muted)">${esc(sub)}</div>` : ''}
          </div>
        </div>`).join('')}
      </div>`;

    const money = `
      <div style="background:var(--paper-2);border-radius:12px;padding:14px 16px;font-size:14px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:var(--muted)">대관료</span><span>${won(r.totalAmount)}</span></div>
        ${r.couponDiscount ? `<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:var(--muted)">쿠폰 할인</span><span style="color:var(--clay)">− ${won(r.couponDiscount)}</span></div>` : ''}
        ${r.pointUsed ? `<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:var(--muted)">포인트 사용</span><span style="color:var(--clay)">− ${won(r.pointUsed)}</span></div>` : ''}
        ${r.payMode === 'FULL'
          ? `<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:var(--muted)">보증금</span><span>${won(r.deposit)}</span></div>
             <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px dashed var(--line);font-weight:800"><span>결제 금액</span><span>${won(d.payment?.amount ?? 0)}</span></div>`
          : `<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:var(--muted)">예약금 결제</span><span>${won(r.deposit)}</span></div>
             <div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:var(--muted)">현장 잔금</span><span>${won(r.balance)}</span></div>`}
        ${d.refunds.length ? d.refunds.map((f) => `
          <div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--ok,#1a7f4e)">
            <span>환불 (${esc(f.ruleLabel || f.reason || '')})</span><span>${won(f.amount)}</span></div>`).join('') : ''}
      </div>`;

    const depositBox = canceled || r.payMode !== 'FULL' ? '' : `
      <h4 style="font-size:14.5px;font-weight:800;margin:0 0 10px">보증금 ${won(dep.amount)}</h4>
      ${d.incidents.length ? d.incidents.map((i) => `
        <div style="border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
            <b style="font-size:14px">${esc(INC_LABEL[i.type] || i.type)} − ${won(i.amount)}</b>
            <span style="font-size:12px;font-weight:700;color:${(INC_STATUS[i.status] || ['', 'var(--muted)'])[1]}">${(INC_STATUS[i.status] || [i.status])[0]}</span>
          </div>
          ${i.note ? `<p style="font-size:13px;color:var(--text);margin-top:6px">${esc(i.note)}</p>` : ''}
          ${i.photos?.length ? `<div style="display:flex;gap:6px;margin-top:8px;overflow-x:auto">${
            i.photos.slice(0, 4).map((p) => `<img src="${esc(p)}" alt="증빙" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex:none">`).join('')}</div>` : ''}
          ${i.objectionNote ? `<p style="font-size:12.5px;color:var(--muted);margin-top:8px">내 이의: ${esc(i.objectionNote)}</p>` : ''}
          ${i.status === 'PROPOSED' ? `
            <button class="btn btn-line btn-xs" style="margin-top:10px" data-object="${esc(i.id)}">이의제기</button>
            ${i.disputeUntil ? `<span class="muted" style="font-size:12px;margin-left:8px">${esc(i.disputeUntil)}까지</span>` : ''}` : ''}
        </div>`).join('')
        + `<p style="font-size:13px;color:var(--muted)">예상 반환액 <b style="color:var(--ink)">${won(dep.expectedReturn)}</b>${dep.returned ? '' : ' · 검토가 끝나면 순차 환급됩니다'}</p>`
      : dep.returned
        ? `<p style="font-size:13.5px;color:var(--ok,#1a7f4e)">✓ ${(dep.returned.at || '').slice(0, 10)} · ${won(dep.returned.amount)} 반환 완료</p>`
        : `<p style="font-size:13.5px;color:var(--muted)">${used ? '이상 접수된 내역이 없습니다. 영업일 3일 내 전액 환급됩니다.' : '이용 후 이상이 없으면 전액 환급됩니다.'}</p>`}`;

    const guest = r.guestToken && !canceled ? `
      <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">
        <b style="font-size:14px">👥 참석자 안내 링크</b>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input class="input" readonly value="${location.origin}/guest.html?t=${esc(r.guestToken)}"
                 style="flex:1;font-size:12px;padding:9px 11px" onclick="this.select()">
          <button class="btn btn-clay btn-xs" id="dGCopy">복사</button>
        </div>
      </div>` : '';

    const m = modal({
      title: `${r.branchName} · ${esc(r.code)}`,
      body: timeline + money + depositBox + guest,
      cancelText: '닫기',
    });
    m.el.querySelector('#dGCopy')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`${location.origin}/guest.html?t=${r.guestToken}`); } catch {}
      toast('링크를 복사했습니다');
    });
    m.el.querySelectorAll('[data-object]').forEach((b) => b.addEventListener('click', () => {
      const m2 = modal({
        title: '차감에 대한 이의를 남깁니다',
        body: `<p style="font-size:13.5px;color:var(--text);margin-bottom:10px">상황을 구체적으로 적어주시면 본사가 증빙과 함께 검토합니다.</p>
          <textarea class="input" id="objNote" style="min-height:110px" placeholder="예: 퇴실 전 정리를 마쳤고, 사진의 오염은 입실 전부터 있었습니다."></textarea>`,
        confirmText: '이의 제출',
        onConfirm: async () => {
          const note = document.getElementById('objNote').value.trim();
          await API.post(`/api/incidents/${b.dataset.object}/object`, { note });
          toast('이의를 접수했습니다. 검토 후 알려드릴게요.', 'ok');
          m2.close?.(); m.close?.();
        },
      });
    }));
  }

  function askCancel(b) {
    const ref = Number(b.dataset.ref), dep = Number(b.dataset.dep);
    const depBack = Number(b.dataset.depback || 0);
    const full = b.dataset.mode === 'FULL';
    modal({
      title: '예약을 취소할까요?',
      body: `
        <p style="font-size:14.5px;color:var(--text);line-height:1.7;margin-bottom:14px">
          ${esc(b.dataset.code)} 예약을 취소합니다.</p>
        <div style="background:var(--paper-2);border-radius:12px;padding:16px">
          ${full ? `
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px">
            <span style="color:var(--muted)">대관료 환불</span><span>${won(ref - depBack)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px">
            <span style="color:var(--muted)">보증금 환급</span><span>${won(depBack)}</span></div>` : `
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px">
            <span style="color:var(--muted)">결제하신 예약금</span><span>${won(dep)}</span></div>`}
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:14px">
            <span style="color:var(--muted)">적용 규정</span><span>${esc(b.dataset.lbl)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0 0;margin-top:8px;
                      border-top:1px solid var(--line-2);font-weight:800">
            <span>환불 금액</span>
            <span style="color:${ref > 0 ? 'var(--ok)' : 'var(--bad)'};font-size:17px">${won(ref)}</span></div>
        </div>
        ${ref <= 0 ? `<div class="note note-warn" style="margin-top:14px">
          환불 대상이 아닙니다. 그래도 취소하시겠습니까?</div>` : ''}
        ${full && ref > 0 && ref - depBack <= 0 ? `<div class="note note-warn" style="margin-top:14px">
          이용일이 가까워 대관료는 환불 규정상 반환되지 않고, 보증금만 환급됩니다.</div>` : ''}`,
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
    const grid = document.getElementById('locGrid')
      || document.querySelector('#branchList, .loc-grid, .locations-grid');
    if (!grid) return;
    try {
      const d = await API.get('/api/branches', { silent: true });
      if (!d.branches.length) return;

      /* 요약 숫자 */
      set('locTotal', d.branches.length);
      set('locHeroN', d.branches.length);
      const regions = new Set(d.branches.map((b) => b.region).filter(Boolean));
      set('locRegions', regions.size);
      let sum = 0, cnt = 0;
      d.branches.forEach((b) => { if (b.reviewCount) { cnt += b.reviewCount; sum += (b.rating || 0) * b.reviewCount; } });
      if (cnt) set('locAvg', (sum / cnt).toFixed(1));

      /* 지점 카드 — 페이지의 지역 칩·검색 필터가 그대로 동작하도록
         data-region / data-q 규격을 맞춰서 그립니다 */
      const order = ['서울', '경기', '인천', '부산', '대전', '전주'];
      const list = [...d.branches].sort((a, b) =>
        (order.indexOf(a.region) - order.indexOf(b.region))
        || (a.area || '').localeCompare(b.area || '', 'ko')
        || a.name.localeCompare(b.name, 'ko'));

      grid.innerHTML = list.map((b) => {
        const tags = [
          b.karaokeOk ? '노래방' : '', b.bbqOk ? '바베큐' : '', b.petOk ? '애견 동반' : '',
          ...(b.features || []).slice(0, 2),
        ].filter(Boolean).slice(0, 3);
        return `
        <a class="loc-c" href="/room-detail.html?id=${b.id}"
           data-region="${esc(b.region || '')}" data-q="${esc([b.name, b.area, b.address].filter(Boolean).join(' '))}">
          <div class="lh">${b.photo
            ? `<img src="${esc(b.photo)}" alt="${esc(b.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`
            : `<div class="ph" style="background:${grad(b.id)}"></div>`}
            <span class="badge badge-clay lreg">${esc(b.region || '')}</span></div>
          <div class="lb"><div class="ln">${esc(b.name)}${b.mgmtType === 'direct' ? ' <span class="badge badge-paper" style="font-size:10.5px;vertical-align:2px">직영</span>' : ''}</div>
            <div class="la">${esc(b.address || '')}</div>
            <div class="lm"><span>👥 기본 ${b.basePeople} · 최대 ${b.maxPeople}명</span><span>💰 ₩${num(b.minPrice || 0)}~</span>${b.rating ? `<span>⭐ ${b.rating}</span>` : ''}</div>
            ${tags.length ? `<div class="ltags">${tags.map((t) => `<span class="lt">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
        </a>`;
      }).join('');

      if (typeof window.filterLoc === 'function') window.filterLoc();
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
