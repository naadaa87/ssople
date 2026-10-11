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
    $('#locLead').textContent = `${regs.join(', ')}에 ${spaces.length}곳이 있어요. 지점 이름을 누르면 요금과 날짜별 빈 방이 나와요.`;
    let cur = SP.qs().region && by[SP.qs().region] ? SP.qs().region : '';
    const draw = () => {
      $('#locTabs').innerHTML = `<button type="button" class="chip${!cur ? ' on' : ''}" data-r="">전체</button>` + regs.map((r) => `<button type="button" class="chip${cur === r ? ' on' : ''}" data-r="${esc(r)}">${esc(r)}</button>`).join('');
      const show = cur ? [cur] : regs;
      $('#locList').innerHTML = show.map((r) => `<section style="margin-top:30px"><h2 class="h2" style="margin-bottom:6px">${esc(r)}</h2>
        ${Object.entries(by[r]).map(([a, list]) => `<div style="margin-top:18px"><h3 class="h4" style="color:var(--graphite)">${esc(a)}</h3>
          <div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><tbody>${list.map((s) => `<tr>
            <td style="width:34%"><a class="link b" href="/room/${s.code}">${esc(s.name)}</a><div class="tiny muted">최대 ${s.max}명</div></td>
            <td>${esc(s.addr || '')} ${s.addr ? `<button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(s.addr)}" aria-label="주소 복사">${icon('copy', 'sm')}</button>` : ''}</td>
            <td class="r" style="white-space:nowrap">${s.place ? `<a class="btn btn-line btn-sm" href="${esc(s.place)}" target="_blank" rel="noopener" data-track="${s.code}|place">${icon('map', 'sm')}지도</a>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}</section>`).join('');
    };
    draw();
    $('#locTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { cur = b.dataset.r; SP.setQs({ region: cur }); draw(); } });
    $('#locList').addEventListener('click', (e) => { const c = e.target.closest('[data-copy]'); if (c) SP.copy(c.dataset.copy, '주소를 복사했어요.'); });
  })();
})();
