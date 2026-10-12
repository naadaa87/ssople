/* 메인 화면 — 이번 주 빈 방 보드, 주말 지점, 지역, 같이 놀기, 후기, 클럽 */
(function () {
  const { $, esc, icon } = SP;
  const today = SP.today();

  /* 이번 주 첫 토요일 (오늘이 토·일이면 오늘) */
  function weekendDay() {
    const w = SP.wdi(today);
    if (w === 6 || w === 0) return today;
    return SP.addDays(today, 6 - w);
  }

  async function init() {
    const [spaces, av] = await Promise.all([SP.spaces().catch(() => []), SP.avail(today, 7)]);
    const site = await SP.site();
    const s = site.settings || {};
    if (s['hero.title']) $('#heroTitle').innerHTML = esc(s['hero.title']).replace(/,\s*/, ',<br>');
    if (s['hero.sub']) $('#heroSub').textContent = s['hero.sub'];
    if (spaces.length) { $('#stSpaces').textContent = spaces.length; $('#stRegions').textContent = new Set(spaces.map((x) => x.region)).size; }
    board(spaces, av);
    weekend(spaces, av);
    regions(spaces);
    passes(s);
    feed();
    $('#heroForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new URLSearchParams();
      if ($('#hRegion').value) q.set('region', $('#hRegion').value);
      if ($('#hPeople').value) q.set('people', $('#hPeople').value);
      location.href = '/rooms' + (q.toString() ? '?' + q : '');
    });
  }

  /* ---------- 보드 ---------- */
  function board(spaces, av) {
    const rows = $('#boardRows');
    if (!av || av.show === false || !av.spaces) {
      $('#board').classList.add('unknown');
      $('#boardAsOf').textContent = '';
    }
    const live = !!(av && av.live);
    const total = { d: 0, n: 0 };
    let html = '';
    const bars = [];
    for (let i = 0; i < 7; i++) {
      const d = SP.addDays(today, i);
      let dOpen = 0, nOpen = 0, dRun = 0, nRun = 0;
      spaces.forEach((sp) => {
        const c = av && av.spaces && av.spaces[sp.code];
        if (!c) return;
        const a = c[i * 2], b = c[i * 2 + 1];
        if (a !== '-') dRun++;
        if (b !== '-') nRun++;
        if (a === 'o') dOpen++;
        if (b === 'o') nOpen++;
      });
      total.d = Math.max(total.d, dRun); total.n = Math.max(total.n, nRun);
      const we = SP.isWeekend(d);
      const label = i === 0 ? '오늘' : i === 1 ? '내일' : SP.wd(d) + '요일';
      const dTxt = live ? (dOpen ? `낮 ${dOpen}곳` : '낮 마감') : `낮 ${dRun}곳 운영`;
      const nTxt = live ? (nOpen ? `밤 ${nOpen}곳` : '밤 마감') : `밤 ${nRun}곳 운영`;
      bars.push({ d: live ? dOpen / Math.max(1, dRun) : 0, n: live ? nOpen / Math.max(1, nRun) : 0 });
      html += `<div class="board-row">
        <div class="board-date${we ? ' we' : ''}"><b>${label}</b><small>${Number(d.slice(5, 7))}/${Number(d.slice(8))}</small></div>
        <a class="bar d${live && !dOpen ? ' zero' : ''}" href="/rooms?date=${d}&slot=day" aria-label="${SP.mdw(d)} ${dTxt}"><span class="lb">${icon('sun')}${dTxt}</span><span class="fill" aria-hidden="true"><span class="in">${icon('sun')}${dTxt}</span></span></a>
        <a class="bar n${live && !nOpen ? ' zero' : ''}" href="/rooms?date=${d}&slot=night" aria-label="${SP.mdw(d)} ${nTxt}"><span class="lb">${icon('moon')}${nTxt}</span><span class="fill" aria-hidden="true"><span class="in">${icon('moon')}${nTxt}</span></span></a>
      </div>`;
    }
    rows.innerHTML = html;
    // 한 번만 차오르는 움직임
    requestAnimationFrame(() => requestAnimationFrame(() => {
      SP.$$('.board-row', rows).forEach((r, i) => {
        const [a, b] = SP.$$('.fill', r);
        a.style.transitionDelay = (i * 60) + 'ms';
        b.style.transitionDelay = (i * 60 + 30) + 'ms';
        a.style.width = Math.round(bars[i].d * 100) + '%';
        b.style.width = Math.round(bars[i].n * 100) + '%';
      });
    }));
    if (live) {
      $('#boardAsOf').textContent = av.asOf ? `${SP.ago(av.asOf)} 기준` : '';
      $('#boardNote').textContent = '최종 확인은 네이버 예약 화면에서';
    } else {
      $('#boardAsOf').textContent = '예약 현황 연결 준비 중';
      $('#boardNote').textContent = '빈 방 여부는 네이버 예약에서 확인해 주세요';
    }
  }

  /* ---------- 주말 지점 ---------- */
  function weekend(spaces, av) {
    const wd = weekendDay();
    const idx = SP.dayDiff(today, wd);
    const live = !!(av && av.live);
    const label = wd === today ? '오늘' : SP.wd(wd) + '요일';
    let list = spaces.slice();
    if (live && av.spaces) {
      list = list.filter((s) => { const c = av.spaces[s.code]; return c && (c[idx * 2] === 'o' || c[idx * 2 + 1] === 'o'); });
      $('#wkTitle').textContent = wd === today ? '오늘 바로 잡을 수 있는 방' : '이번 주말 바로 잡을 수 있는 방';
      $('#wkSub').textContent = `${SP.mdw(wd)}에 낮이나 밤이 비어 있는 지점이에요.`;
    } else {
      $('#wkTitle').textContent = '많이 찾는 지점';
      $('#wkSub').textContent = '지점을 누르면 날짜별 예약 상황과 네이버 예약 버튼이 보여요.';
    }
    const featured = (SP.settings && SP.settings['home.featured'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    list.sort((a, b) => {
      const fa = featured.indexOf(a.code), fb = featured.indexOf(b.code);
      if (fa !== fb) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb);
      return (b.reviews?.n || 0) - (a.reviews?.n || 0) || a.sort - b.sort;
    });
    list = list.slice(0, 4);
    $('#wkMore').href = live ? `/rooms?date=${wd}` : '/rooms';
    $('#wkRooms').innerHTML = list.length
      ? list.map((s) => {
        const c = av && av.spaces && av.spaces[s.code];
        return SP.roomCard(s, { avail: c, from: today, live, date: live ? wd : '', dayState: live && c ? [c[idx * 2], c[idx * 2 + 1]] : null });
      }).join('')
      : `<div class="empty" style="grid-column:1/-1">${icon('calendar')}<h3>${label}은 빈 방이 거의 없어요</h3><p>다른 날짜를 골라 보면 더 많이 보여요.</p><a class="btn btn-ink" href="/rooms">날짜 바꿔서 찾기</a></div>`;
  }

  /* ---------- 지역 ---------- */
  function regions(spaces) {
    const by = {};
    spaces.forEach((s) => { (by[s.region] = by[s.region] || {}); by[s.region][s.area] = (by[s.region][s.area] || 0) + 1; });
    const order = ['서울', '경기', '인천', '대전', '부산', '전주'];
    const regs = Object.keys(by).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    $('#regionSub').textContent = `${regs.length}개 권역 ${spaces.length}곳. 가까운 동네부터 찾아보세요.`;
    let cur = regs[0];
    const draw = () => {
      $('#regionTabs').innerHTML = regs.map((r) => `<button class="chip${r === cur ? ' on' : ''}" type="button" data-r="${esc(r)}">${esc(r)} <span class="n">${Object.values(by[r]).reduce((a, b) => a + b, 0)}</span></button>`).join('');
      $('#areaList').innerHTML = Object.entries(by[cur]).sort((a, b) => b[1] - a[1])
        .map(([a, n]) => `<a class="area-item" href="/area/${encodeURIComponent(a)}"><b>${esc(a)}</b><small>${n}곳</small></a>`).join('');
    };
    draw();
    $('#regionTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { cur = b.dataset.r; draw(); } });
  }

  /* ---------- 클럽 패스 ---------- */
  function passes(s) {
    const ben = s['club.benefits'] || {};
    const silver = s['club.silver'] || 2, gold = s['club.gold'] || 4;
    const card = (cls, name, cond, items) => `<div class="pass ${cls}"><div class="tier">${name}</div><div class="cond">${cond}</div><ul>${(items || []).map((x) => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('')}</ul></div>`;
    $('#homePasses').innerHTML = card('', '웰컴', '가입하면 바로', ben.welcome) + card('silver', '실버', `최근 1년 방문 인증 ${silver}번`, ben.silver) + card('gold', '골드', `최근 1년 방문 인증 ${gold}번`, ben.gold);
  }

  /* ---------- 행사 · 파티팀 · 모임 · 후기 · 제휴 ---------- */
  async function feed() {
    let d;
    try { d = await SP.get('/api/home'); } catch { d = { events: [], crews: [], meetups: [], reviews: [], partners: [] }; }
    $('#homeEvents').innerHTML = d.events.length ? d.events.slice(0, 3).map((e) => SP.ticket({ ...e, status: 'open' })).join('')
      : `<div class="empty">${icon('ticket')}<h3>다음 행사를 준비하고 있어요</h3><p>열고 싶은 파티가 있다면 행사 개설을 신청해 보세요.</p><a class="btn btn-line btn-sm" href="/event#propose">행사 열자고 제안하기</a></div>`;
    $('#homeCrews').innerHTML = d.crews.length ? d.crews.slice(0, 4).map((c) => SP.band({ ...c, status: 'open' })).join('')
      : `<div class="empty">${icon('users')}<h3>지금 모집 중인 파티팀이 없어요</h3><p>같이 파티룸 빌릴 사람을 먼저 모아 보세요.</p><a class="btn btn-line btn-sm" href="/crew#new">모집글 쓰기</a></div>`;
    $('#homeMeetups').innerHTML = d.meetups.length ? d.meetups.slice(0, 3).map(SP.meet).join('')
      : `<div class="empty" style="grid-column:1/-1">${icon('smile')}<h3>아직 열린 모임이 없어요</h3><p>보드게임, 와인, 영화처럼 좋아하는 걸 같이 할 사람을 모아 보세요.</p><a class="btn btn-line btn-sm" href="/meetups#new">모임 만들기</a></div>`;
    $('#homeReviews').innerHTML = d.reviews.length ? d.reviews.slice(0, 3).map((r) => `<a class="review-card" href="/c/${r.id}">
        ${r.img ? `<div class="rc-img"><img src="${esc(r.img)}" alt="" loading="lazy"></div>` : `<div class="rc-img rc-text"><p>${esc(r.excerpt)}</p></div>`}
        <div class="rc-body"><div class="between">${SP.stars(r.rating || 0)}${r.verified ? '<span class="badge ok">방문 인증</span>' : ''}</div>
        <h3 class="clamp2">${esc(r.title)}</h3>${r.img ? `<p class="clamp2">${esc(r.excerpt)}</p>` : ''}
        <div class="post-meta"><span>${esc(r.spaceName || '')}</span><span>${esc(r.author.nick)}</span><span>${SP.ago(r.created_at)}</span></div></div></a>`).join('')
      : `<div class="empty" style="grid-column:1/-1">${icon('star')}<h3>첫 후기를 기다려요</h3><p>다녀온 지점의 후기를 남겨 주세요. 방문 인증을 하면 후기에 표시돼요.</p><a class="btn btn-line btn-sm" href="/write?b=review">후기 쓰기</a></div>`;
    const ps = d.partners || [];
    $('#homePartners').innerHTML = ps.length
      ? `<div class="between" style="margin-bottom:12px"><h3 class="h3">제휴 혜택</h3><a class="sec-more" href="/partners">전체 보기</a></div><div class="grid g4">${ps.slice(0, 4).map(partnerCard).join('')}</div>`
      : `<div class="box fog" style="display:flex;gap:16px;justify-content:space-between;align-items:center;flex-wrap:wrap"><div><h3 class="h3">함께할 제휴 파트너를 찾고 있어요</h3><p class="muted" style="margin-top:4px">케이크, 꽃, 풍선 장식, 출장 사진, 케이터링처럼 파티에 필요한 걸 하신다면 연락 주세요.</p></div><a class="btn btn-line" href="/partners#form">제휴 문의</a></div>`;
  }
  function partnerCard(p) {
    return `<div class="partner"><div class="p-img">${p.img ? `<img src="${esc(p.img)}" alt="">` : esc((p.name || '?').slice(0, 1))}</div><div><h3>${esc(p.name)}</h3><div class="benefit">${esc(p.benefit)}</div>${p.tier && p.tier !== 'all' ? `<span class="badge mute" style="margin-top:6px">${p.tier === 'gold' ? '골드' : '실버'} 이상</span>` : ''}</div></div>`;
  }

  init().catch((e) => console.error(e));
})();
