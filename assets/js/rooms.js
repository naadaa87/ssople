/* 지점 찾기 — 조건 필터 + 날짜별 낮/밤 빈 방 */
(function () {
  const { $, $$, esc, icon } = SP;
  const today = SP.today();
  const ORDER = ['서울', '경기', '인천', '대전', '부산', '전주'];
  const q0 = SP.qs();
  const st = {
    region: q0.region || '', area: q0.area || '', date: q0.date || '', slot: q0.slot || '', open: q0.open === '1',
    people: q0.people || '', q: q0.q || '', sort: q0.sort || '', f: (q0.f || '').split(',').filter(Boolean),
  };
  if (st.date && (st.date < today || !/^\d{4}-\d{2}-\d{2}$/.test(st.date))) st.date = '';
  if (st.slot && st.date) st.open = q0.open !== '0';
  let spaces = [];
  let av = null;
  let avKey = '';

  const has = {
    karaoke: (s) => s.feat?.karaoke?.on,
    bbq: (s) => s.feat?.bbq?.on,
    pet: (s) => s.feat?.pet?.on,
    terrace: (s) => (s.feat?.zones || []).some((z) => /테라스|루프탑|베란다/.test(z)),
    projector: (s) => s.feat?.projector,
    console: (s) => s.feat?.console,
    games: (s) => (s.feat?.games || []).length > 0,
    parking: (s) => (s.tags || []).includes('주차'),
    big: (s) => (s.max || 0) >= 20,
  };

  async function loadAvail() {
    const from = st.date || today;
    const key = from;
    if (key === avKey && av) return;
    avKey = key;
    av = await SP.avail(from, 7);
  }

  function filtered() {
    const from = st.date || today;
    const live = !!(av && av.live);
    let list = spaces.filter((s) => {
      if (st.region && s.region !== st.region) return false;
      if (st.area && s.area !== st.area) return false;
      if (st.people && (s.max || 0) < Number(st.people)) return false;
      if (st.q) { const k = st.q.replace(/\s/g, ''); if (!(s.name + s.area + (s.short || '') + (s.addr || '')).replace(/\s/g, '').includes(k)) return false; }
      for (const f of st.f) if (has[f] && !has[f](s)) return false;
      if (st.date && av && av.spaces) {
        const c = av.spaces[s.code];
        if (c) {
          const d = c[0], n = c[1];
          if (st.slot === 'day' && d === '-') return false;
          if (st.slot === 'night' && n === '-') return false;
          if (st.open && live) {
            if (st.slot === 'day' && d !== 'o') return false;
            if (st.slot === 'night' && n !== 'o') return false;
            if (!st.slot && d !== 'o' && n !== 'o') return false;
          }
        }
      }
      return true;
    });
    const price = (s) => (st.date ? SP.priceOn(s, st.date) : SP.minPrice(s)) || 9e9;
    if (st.sort === 'price') list.sort((a, b) => price(a) - price(b));
    else if (st.sort === 'big') list.sort((a, b) => (b.max || 0) - (a.max || 0));
    else if (st.sort === 'review') list.sort((a, b) => (b.reviews?.n || 0) - (a.reviews?.n || 0));
    else if (st.date && live && av.spaces) {
      const score = (s) => { const c = av.spaces[s.code] || '--'; return (c[0] === 'o' ? 1 : 0) + (c[1] === 'o' ? 1 : 0); };
      list.sort((a, b) => score(b) - score(a) || a.sort - b.sort);
    }
    return { list, from, live };
  }

  function drawFilters() {
    const by = {};
    spaces.forEach((s) => { by[s.region] = (by[s.region] || 0) + 1; });
    const regs = Object.keys(by).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    $('#fRegion').innerHTML = `<button type="button" class="chip${!st.region ? ' on' : ''}" data-r="">전체 <span class="n">${spaces.length}</span></button>`
      + regs.map((r) => `<button type="button" class="chip${st.region === r ? ' on' : ''}" data-r="${esc(r)}">${esc(r)} <span class="n">${by[r]}</span></button>`).join('');
    const areas = {};
    spaces.filter((s) => s.region === st.region).forEach((s) => { areas[s.area] = (areas[s.area] || 0) + 1; });
    const fa = $('#fArea');
    fa.hidden = !st.region || Object.keys(areas).length < 2;
    fa.innerHTML = '<option value="">동네 전체</option>' + Object.entries(areas).map(([a, n]) => `<option value="${esc(a)}"${a === st.area ? ' selected' : ''}>${esc(a)} (${n})</option>`).join('');
    $('#fDate').value = st.date;
    $('#fDate').min = today;
    $('#fDate').max = SP.addDays(today, 180);
    $('#fDateWrap').classList.toggle('on', !!st.date);
    $('#fDateClear').hidden = !st.date;
    $$('#fSlot button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.slot));
    $('#fOpenWrap').hidden = !(st.date && av && av.live);
    $('#fOpen').checked = st.open;
    $('#fPeople').value = st.people;
    $('#fQ').value = st.q;
    $('#fSort').value = st.sort;
    $$('#fFeat .chip').forEach((b) => b.classList.toggle('on', st.f.includes(b.dataset.f)));
    const any = st.region || st.date || st.slot || st.people || st.q || st.f.length || st.sort;
    $('#fReset').hidden = !any;
  }

  function draw() {
    const { list, from, live } = filtered();
    drawFilters();
    SP.setQs({ region: st.region, area: st.area, date: st.date, slot: st.slot, open: st.open && st.date ? '1' : '', people: st.people, q: st.q, sort: st.sort, f: st.f.join(',') });
    const label = st.date ? `${SP.mdw(st.date)}${st.slot === 'day' ? ' 낮' : st.slot === 'night' ? ' 밤' : ''}` : '';
    $('#rCount').textContent = `${list.length}곳`;
    $('#rNote').textContent = st.date
      ? (live ? (st.open ? `${label}에 비어 있는 지점` : `${label} 기준`) : `${label} · 예약 현황 연결 전이라 빈 방 여부는 네이버에서 확인해 주세요`)
      : '날짜를 고르면 빈 방을 함께 보여 드려요';
    $('#rLegend').innerHTML = av && av.show !== false ? SP.legend(live) : '';
    if (!list.length) {
      $('#rList').innerHTML = `<div class="empty" style="grid-column:1/-1">${icon('search')}<h3>조건에 맞는 지점이 없어요</h3><p>${st.open ? '빈 방만 보기를 끄거나 다른 날짜를 골라 보세요.' : '조건을 하나씩 빼 보면 더 많이 보여요.'}</p><button class="btn btn-ink" type="button" data-reset>조건 지우기</button></div>`;
      return;
    }
    $('#rList').innerHTML = list.map((s) => {
      const c = av && av.spaces ? av.spaces[s.code] : null;
      return SP.roomCard(s, { avail: c, from, live, date: st.date, dayState: st.date && c ? [st.slot === 'night' ? '-' : c[0], st.slot === 'day' ? '-' : c[1]] : null });
    }).join('');
  }

  async function refresh() {
    if (st.date) await loadAvail();
    else { await loadAvail(); }
    draw();
  }

  function bind() {
    $('#fRegion').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; st.region = b.dataset.r; st.area = ''; draw(); });
    $('#fArea').addEventListener('change', (e) => { st.area = e.target.value; draw(); });
    $('#fDate').addEventListener('change', (e) => { st.date = e.target.value; if (st.date && av && av.live) st.open = true; refresh(); });
    $('#fDateClear').addEventListener('click', (e) => { e.preventDefault(); st.date = ''; st.open = false; refresh(); });
    $('#fSlot').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.slot = b.dataset.v; if (st.slot && !st.date) { st.date = today; st.open = true; refresh(); return; } draw(); });
    $('#fOpen').addEventListener('change', (e) => { st.open = e.target.checked; draw(); });
    $('#fPeople').addEventListener('change', (e) => { st.people = e.target.value; draw(); });
    $('#fQ').addEventListener('input', SP.debounce((e) => { st.q = e.target.value.trim(); draw(); }, 200));
    $('#fSort').addEventListener('change', (e) => { st.sort = e.target.value; draw(); });
    $('#fFeat').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.dataset.f; st.f = st.f.includes(f) ? st.f.filter((x) => x !== f) : [...st.f, f]; draw(); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#fReset, [data-reset]')) return;
      Object.assign(st, { region: '', area: '', date: '', slot: '', open: false, people: '', q: '', sort: '', f: [] });
      refresh();
    });
  }

  (async function init() {
    bind();
    try { spaces = await SP.spaces(); } catch (e) { $('#rList').innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>지점을 불러오지 못했어요</h3><p>${esc(e.message)}</p></div>`; return; }
    await refresh();
  })();
})();
