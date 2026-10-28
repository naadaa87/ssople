/* 메인 화면 — 인기 지점, 지역, 같이 놀기, 후기, 클럽 */
(function () {
  const { $, esc, icon } = SP;
  const today = SP.today();

  async function init() {
    const [spaces, av] = await Promise.all([SP.spaces().catch(() => []), SP.avail(today, 7)]);
    const site = await SP.site();
    const s = site.settings || {};
    if (s['hero.title']) $('#heroTitle').innerHTML = esc(s['hero.title']).replace(/,\s*/, ',<br>').replace('쏘플', '<em>쏘플</em>');
    if (s['hero.sub']) $('#heroSub').textContent = s['hero.sub'];
    const stR = $('#stRegions');
    if (stR && spaces.length) stR.textContent = new Set(spaces.map((x) => x.region)).size;
    popular(spaces, av);
    regions(spaces);
    passes(s);
    feed();
    const dateIn = $('#hDate');
    dateIn.min = today;
    $('#heroForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new URLSearchParams();
      if ($('#hRegion').value) q.set('region', $('#hRegion').value);
      if (dateIn.value) q.set('date', dateIn.value);
      if ($('#hPeople').value) q.set('people', $('#hPeople').value);
      location.href = '/rooms' + (q.toString() ? '?' + q : '');
    });
  }

  /* ---------- 지금 가장 사랑받는 지점 — 들어올 때마다 랜덤 8곳 (관리자가 고른 첫 화면 지점이 있으면 그 지점들을 먼저, 순서는 랜덤) ---------- */
  function popular(spaces, av) {
    const featured = (SP.settings && SP.settings['home.featured'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    const mix = SP.shuffle(spaces);
    const list = mix.filter((s) => featured.includes(s.code)).concat(mix.filter((s) => !featured.includes(s.code))).slice(0, 8);
    const live = !!(av && av.live);
    $('#popRooms').innerHTML = list.map((sp) => {
      const c = av && av.spaces && av.spaces[sp.code];
      return SP.roomCard(sp, { avail: c, from: today, live });
    }).join('');
  }

  /* ---------- 지역 ---------- */
  const REGION_PHOTO = { 서울: 'neon-night', 경기: 'orange-room', 인천: 'terrace-night', 대전: 'moroccan', 부산: 'rooftop', 전주: 'welcome' };
  function regions(spaces) {
    const by = {};
    // 지역·동네 정식 주소(/area/seoul) — 서버가 지점 정보에 실어 보낸 값, 없으면 한글 주소
    const rp = {}, ap = {};
    spaces.forEach((s) => { (by[s.region] = by[s.region] || {}); by[s.region][s.area] = (by[s.region][s.area] || 0) + 1; rp[s.region] = s.rp || rp[s.region]; ap[s.area] = s.ap || ap[s.area]; });
    const rHref = (r) => rp[r] || '/area/' + encodeURIComponent(r);
    const aHref = (a) => ap[a] || '/area/' + encodeURIComponent(a);
    const order = ['서울', '경기', '인천', '대전', '부산', '전주'];
    const regs = Object.keys(by).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    $('#regionSub').textContent = `${regs.join('·')}. 권역을 누르면 그 지역 지점을 모아 보여 드려요.`;
    $('#regionTiles').innerHTML = regs.map((r) => {
      const n = Object.values(by[r]).reduce((a, b) => a + b, 0);
      const ph = REGION_PHOTO[r] || 'entrance';
      return `<a class="region" href="${esc(rHref(r))}" style="--pp:url('/assets/img/photo/${ph}-s.webp')"><b>${esc(r)}</b><span>${n}개 지점</span></a>`;
    }).join('') + '<a class="region all" href="/locations"><b>전체 지점 안내</b><span>전국 지점 주소·지도</span></a>';
    const areas = [];
    for (const r of regs) for (const [a, n] of Object.entries(by[r]).sort((x, y) => y[1] - x[1])) if (a !== r || regs.length === 1) areas.push([a, n]);
    $('#areaList').innerHTML = `<span class="area-chips-lb">동네별</span>` + areas.map(([a, n]) => `<a class="chip" href="${esc(aHref(a))}">${esc(a)} <span class="n">${n}</span></a>`).join('');
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
    if (d.events.length) {
      const e = d.events[0];
      $('#homeBanner').href = '/e/' + e.id;
      $('#homeBanner').querySelector('.badge').textContent = '다가오는 행사';
      $('#bannerTitle').textContent = e.title;
      $('#bannerSub').textContent = `${SP.mdw(e.d || '')}${e.t1 ? ' ' + SP.hm(e.t1) : ''}${e.spaceName ? ' · ' + e.spaceName : ''}${e.summary ? ' — ' + e.summary : ''}`;
      $('#bannerBtn').innerHTML = `행사 보기${icon('arrow-r', 'sm')}`;
    }
    const rv = d.reviews || [];
    if (rv.length) {
      const avg = rv.reduce((a, r) => a + (r.rating || 0), 0) / rv.length;
      $('#reviewSum').innerHTML = `<span class="stars" style="vertical-align:-2px">${icon('star-f')}</span> <b>${avg.toFixed(1)}</b> · 최근 후기 ${rv.length}개 · 방문 인증을 받은 후기는 따로 표시돼요.`;
    }
    $('#homeReviews').innerHTML = rv.length ? rv.slice(0, 3).map((r) => `<a class="quote" href="/c/${r.id}">
        <span class="quote-mark" aria-hidden="true">“</span>
        <p class="quote-text">${esc(r.excerpt || r.title)}</p>
        ${r.img ? `<div class="quote-img"><img src="${esc(r.img)}" alt="" loading="lazy"></div>` : ''}
        <div class="quote-foot">${SP.avatar(r.author.avatar, 'sm')}<div><b>${esc(r.author.nick)}</b><small>${esc(r.spaceName || '')}${r.spaceName ? ' · ' : ''}${SP.ago(r.created_at)}</small></div><div class="quote-rate">${SP.stars(r.rating || 0)}${r.verified ? '<span class="badge ok">방문 인증</span>' : ''}</div></div></a>`).join('')
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
