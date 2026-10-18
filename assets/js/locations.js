/* 지역별 지점 안내 — 권역 > 동네 > 지점 */
(function () {
  const { $, esc, icon } = SP;
  const ORDER = ['서울', '경기', '인천', '대전', '부산', '전주'];
  (async function () {
    let spaces = [];
    try { spaces = await SP.spaces(); } catch (e) { $('#locList').innerHTML = `<div class="empty"><h3>지점을 불러오지 못했어요</h3><p>${esc(e.message)}</p></div>`; return; }
    const by = {};
    spaces.forEach((s) => { ((by[s.region] = by[s.region] || {})[s.area] = by[s.region][s.area] || []).push(s); });
    const regs = Object.keys(by).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    $('#locLead').textContent = `${regs.join(', ')}에 있어요. 지점 이름을 누르면 요금과 네이버 예약 버튼이 나와요.`;
    const areasN = new Set(spaces.map((s) => s.area)).size;
    const bigN = spaces.filter((s) => (s.max || 0) >= 20).length;
    const outN = spaces.filter((s) => ((s.feat || {}).zones || []).some((z) => /루프탑|테라스/.test(z)) || ((s.feat || {}).bbq || {}).on).length;
    $('#locStats').innerHTML = `<div><b>${regs.length}</b><span>운영 권역</span></div><div><b>${areasN}</b><span>동네</span></div><div><b>${bigN}</b><span>20명 넘게 쓰는 지점</span></div><div><b>${outN}</b><span>루프탑·테라스·바베큐</span></div>`;
    let cur = SP.qs().region && by[SP.qs().region] ? SP.qs().region : '';
    const draw = () => {
      $('#locTabs').innerHTML = `<button type="button" class="chip${!cur ? ' on' : ''}" data-r="">전체</button>` + regs.map((r) => `<button type="button" class="chip${cur === r ? ' on' : ''}" data-r="${esc(r)}">${esc(r)}</button>`).join('');
      const show = cur ? [cur] : regs;
      const card = (s) => {
        const from = SP.minPrice(s);
        return `<div class="loc-card">
          <a class="loc-cover" href="/room/${s.code}">${SP.cover(s)}<span class="badge ink">${esc(s.region)}</span></a>
          <div class="loc-body">
            <h3><a href="/room/${s.code}">${esc(s.name)}</a></h3>
            <div class="loc-addr"><span>${esc(s.addr || `${s.region} ${s.area}`)}</span>${s.addr ? `<button type="button" data-copy="${esc(s.addr)}" aria-label="주소 복사">${icon('copy', 'sm')}</button>` : ''}</div>
            <div class="loc-facts"><span>${icon('users', 'sm')}기준 ${s.base || '-'}명 · 최대 ${s.max || '-'}명</span>${s.info && s.info.size ? `<span>${icon('size', 'sm')}${esc(s.info.size)}</span>` : ''}${from ? `<span class="b" style="color:var(--red)">${SP.won(from)}~</span>` : ''}</div>
            <div class="room-feat">${SP.featTags(s, 3)}</div>
            <div class="loc-acts">${s.place ? `<a class="btn btn-line btn-sm" href="${esc(s.place)}" target="_blank" rel="noopener" data-track="${s.code}|place">${icon('map', 'sm')}지도</a>` : '<span></span>'}<a class="btn btn-naver btn-sm" href="/room/${s.code}">${icon('calendar', 'sm')}요금·예약</a></div>
          </div></div>`;
      };
      $('#locList').innerHTML = show.map((r) => `<section style="margin-top:34px"><div class="sec-hd" style="margin-bottom:14px"><div><h2 class="h2">${esc(r)} <span class="area-count">${Object.values(by[r]).reduce((a, l) => a + l.length, 0)}곳</span></h2><p>${Object.keys(by[r]).map((a) => `<a class="link" href="/area/${encodeURIComponent(a)}">${esc(a)}</a>`).join(' · ')}</p></div><a class="sec-more" href="/area/${encodeURIComponent(r)}">${esc(r)} 파티룸 모아 보기${icon('chev-r', 'sm')}</a></div>
        <div class="loc-grid">${Object.values(by[r]).flat().map(card).join('')}</div></section>`).join('');
    };
    draw();
    $('#locTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { cur = b.dataset.r; SP.setQs({ region: cur }); draw(); } });
    $('#locList').addEventListener('click', (e) => { const c = e.target.closest('[data-copy]'); if (c) SP.copy(c.dataset.copy, '주소를 복사했어요.'); });
  })();
})();
