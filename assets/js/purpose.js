/* 목적별 추천 — 조건에 맞는 지점 고르기 */
(function () {
  const { $, esc, icon } = SP;
  const today = SP.today();
  const zone = (s, re) => (s.feat?.zones || []).some((z) => re.test(z));
  const sizeN = (s) => Number(String(s.info?.size || '').replace(/\D/g, '')) || 0;
  const RULE = {
    birthday: { f: (s) => s.feat?.karaoke?.on, w: (s) => (s.reviews?.n || 0) * 2 + (s.feat?.projector ? 1 : 0) },
    bridal: { f: (s) => zone(s, /테라스|루프탑|베란다|파우더/) || ((s.max || 0) <= 15 && (s.base || 9) <= 6), w: (s) => (zone(s, /테라스|루프탑/) ? 3 : 0) + (s.reviews?.n || 0) },
    yearend: { f: (s) => (s.max || 0) >= 20, w: (s) => (s.max || 0) / 10 + (s.feat?.bbq?.on ? 2 : 0) + (s.feat?.karaoke?.on ? 1 : 0) },
    workshop: { f: (s) => s.feat?.projector, w: (s) => ((s.tags || []).includes('주차') ? 2 : 0) + (s.max || 0) / 15 },
    filming: { f: (s) => sizeN(s) >= 25 || zone(s, /테라스|루프탑/), w: (s) => sizeN(s) / 10 + (zone(s, /루프탑/) ? 3 : zone(s, /테라스/) ? 2 : 0) },
    reunion: { f: (s) => (s.feat?.games || []).length >= 5 || s.feat?.console, w: (s) => (s.feat?.games || []).length / 3 + (s.feat?.console ? 2 : 0) + (s.feat?.karaoke?.on ? 1 : 0) },
  };
  (async function () {
    const k = $('#purpose').dataset.k;
    const r = RULE[k];
    let spaces = [];
    try { spaces = await SP.spaces(); } catch { return; }
    const list = spaces.filter(r.f).sort((a, b) => r.w(b) - r.w(a)).slice(0, 6);
    const av = await SP.avail(today, 7, list.map((s) => s.code));
    $('#pRooms').innerHTML = list.length ? list.map((s) => SP.roomCard(s, { avail: av.spaces && av.spaces[s.code], from: today, live: !!av.live })).join('')
      : `<div class="empty" style="grid-column:1/-1">${icon('search')}<h3>조건에 딱 맞는 지점을 찾지 못했어요</h3><p>지점 찾기에서 조건을 바꿔 보세요.</p><a class="btn btn-ink" href="/rooms">지점 찾기</a></div>`;
  })();
})();
