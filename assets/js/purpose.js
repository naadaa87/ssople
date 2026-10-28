/* 목적별 추천 — 조건에 맞는 지점 고르기 */
(function () {
  const { $, esc, icon } = SP;
  const today = SP.today();
  const zone = (s, re) => (s.feat?.zones || []).some((z) => re.test(z));
  const sizeN = (s) => Number(String(s.info?.size || '').replace(/\D/g, '')) || 0;
  const RULE = {
    birthday: { f: (s) => s.feat?.karaoke?.on },
    bridal: { f: (s) => zone(s, /테라스|루프탑|베란다|파우더/) || ((s.max || 0) <= 15 && (s.base || 9) <= 6) },
    yearend: { f: (s) => (s.max || 0) >= 20 },
    workshop: { f: (s) => s.feat?.projector },
    filming: { f: (s) => sizeN(s) >= 25 || zone(s, /테라스|루프탑/) },
    reunion: { f: (s) => (s.feat?.games || []).length >= 5 || s.feat?.console },
  };
  (async function () {
    const k = $('#purpose').dataset.k;
    const r = RULE[k];
    let spaces = [];
    try { spaces = await SP.spaces(); } catch { return; }
    // 목적에 맞는 지점 중에서 들어올 때마다 랜덤 6곳
    const list = SP.shuffle(spaces.filter(r.f)).slice(0, 6);
    const av = await SP.avail(today, 7, list.map((s) => s.code));
    $('#pRooms').innerHTML = list.length ? list.map((s) => SP.roomCard(s, { avail: av.spaces && av.spaces[s.code], from: today, live: !!av.live })).join('')
      : `<div class="empty" style="grid-column:1/-1">${icon('search')}<h3>조건에 딱 맞는 지점을 찾지 못했어요</h3><p>지점 찾기에서 조건을 바꿔 보세요.</p><a class="btn btn-ink" href="/rooms">지점 찾기</a></div>`;
  })();
})();
