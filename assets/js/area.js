/* 지역별 파티룸 — 서버가 채운 목록 밑에 이번 주 빈 방 카드와 다른 지역 칩을 더 보여 준다 */
(function () {
  const { $, esc } = SP;
  const ssr = window.__SSR__ && window.__SSR__.area;
  const order = ['서울', '경기', '인천', '대전', '부산', '전주'];
  SP.spaces().then(async (spaces) => {
    const regions = [...new Set(spaces.map((s) => s.region))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    const chips = regions.map((r) => `<a class="chip${ssr && ssr.kind === 'region' && ssr.name === r ? ' on' : ''}" href="/area/${encodeURIComponent(r)}">${esc(r)} 전체</a>`);
    for (const r of regions) {
      for (const a of [...new Set(spaces.filter((s) => s.region === r).map((s) => s.area))]) {
        if (a === r) continue;
        chips.push(`<a class="chip${ssr && ssr.kind === 'area' && ssr.name === a ? ' on' : ''}" href="/area/${encodeURIComponent(a)}">${esc(a)}</a>`);
      }
    }
    $('#areaChips').innerHTML = chips.join('');
    if (!ssr) return;
    const mine = spaces.filter((s) => ssr.codes.includes(s.code));
    if (!mine.length) return;
    const today = SP.today();
    const av = await SP.avail(today, 7, mine.map((s) => s.code));
    const live = !!(av && av.live);
    $('#areaRooms').innerHTML = mine.map((s) => {
      const c = av && av.spaces && av.spaces[s.code];
      return SP.roomCard(s, { avail: c, from: today, live });
    }).join('');
    $('#areaLive').hidden = false;
  }).catch(() => {});
})();
