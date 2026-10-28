/* 기업·단체 행사 — 큰 지점 목록 + 문의 */
(function () {
  const { $ } = SP;
  (async function () {
    const spaces = await SP.spaces().catch(() => []);
    // 20명 넘게 쓰는 지점 중에서 들어올 때마다 랜덤 6곳
    const big = SP.shuffle(spaces.filter((s) => (s.max || 0) >= 20)).slice(0, 6);
    const av = await SP.avail(SP.today(), 7, big.map((s) => s.code));
    $('#bigRooms').innerHTML = big.map((s) => SP.roomCard(s, { avail: av.spaces && av.spaces[s.code], from: SP.today(), live: !!av.live })).join('');
  })();
  $('#b5').min = SP.today();
  $('#bForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = SP.formData($('#bForm'));
    const err = $('#bErr');
    err.hidden = true;
    if (!f.name || !f.contact || f.body.length < 10) { err.textContent = '담당자, 연락처, 행사 내용(10자 이상)을 적어 주세요.'; err.hidden = false; return; }
    if (!f.agree) { err.textContent = '개인정보 수집·이용에 동의해 주세요.'; err.hidden = false; return; }
    const body = `[단체 문의] 인원 ${f.people || '미정'}명 · 희망일 ${f.date || '미정'} · 지역 ${f.region || '무관'}\n\n${f.body}`;
    const btn = $('#bForm button[type=submit]');
    SP.busy(btn, true, '보내는 중');
    try { await SP.post('/api/contact', { kind: 'corporate', name: f.name, org: f.org, contact: f.contact, body, agree: true }); $('#bForm').reset(); SP.toast('문의를 보냈어요. 담당자가 연락드릴게요.'); }
    catch (er) { err.textContent = er.message; err.hidden = false; }
    SP.busy(btn, false);
  });
})();
