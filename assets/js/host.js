/* 호스트 모집 — 공간 등록·위탁운영·창업 신청 폼 */
(function () {
  const { $, $$ } = SP;
  let kind = 'host_listing';
  const q = SP.qs();
  if (['host_listing', 'host_managed', 'startup'].includes(q.k)) kind = q.k;
  function setKind(k) {
    kind = k;
    $$('#hKinds [data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    $$('#hForm [data-for]').forEach((f) => { f.hidden = !f.dataset.for.split(' ').includes(k); });
    $('#h3').previousElementSibling.textContent = k === 'startup' ? '공간 이름 (있으면)' : '공간 이름';
    $('#h4').previousElementSibling.textContent = k === 'startup' ? '희망 지역 또는 보유 공간 주소' : '주소 (동네까지)';
  }
  $('#hKinds').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) setKind(b.dataset.k); });
  setKind(kind);

  /* 공간 등록 요금표는 data-set="host.day1" 같은 칸이라, 관리자 설정 값이 있으면 app.js 가 그 숫자로 바꿔 보여 줘요 */
  if (location.hash === '#apply') setTimeout(() => $('#apply').scrollIntoView({ block: 'start' }), 200);

  $('#hForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = SP.formData($('#hForm'));
    const err = $('#hErr');
    err.hidden = true;
    if (!f.name || !f.contact) { err.textContent = '이름과 연락처를 적어 주세요.'; err.hidden = false; return; }
    if (kind !== 'startup' && !f.space) { err.textContent = '공간 이름을 적어 주세요.'; err.hidden = false; return; }
    if (!f.agree) { err.textContent = '개인정보 수집·이용에 동의해 주세요.'; err.hidden = false; return; }
    const L = { host_listing: '01 공간 등록', host_managed: '02 위탁운영', startup: '03 창업 상담' };
    const lines = [`[신청 종류] ${L[kind]}`, f.space ? `[공간 이름] ${f.space}` : '', f.addr ? `[주소·지역] ${f.addr}` : ''];
    if (kind !== 'startup') {
      lines.push(`[운영 상태] ${f.state}`);
      if (kind === 'host_listing') lines.push(`[희망 이용 기간] ${f.plan}`);
      if (f.naver) lines.push(`[네이버 예약 주소] ${f.naver}`);
      if (f.size) lines.push(`[크기·인원] ${f.size}`);
      if (f.feat) lines.push(`[주요 시설] ${f.feat}`);
    } else {
      lines.push(`[보유 공간] ${f.space_state}`, `[투자 예산] ${f.budget}`);
    }
    if (f.body) lines.push('', f.body);
    const btn = $('#hForm button[type=submit]');
    SP.busy(btn, true, '보내는 중');
    try {
      await SP.post('/api/contact', { kind, name: f.name, contact: f.contact, org: f.space || '', body: lines.filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n'), agree: true });
      $('#hForm').reset();
      setKind(kind);
      SP.toast('신청을 받았어요. 영업일 기준 1~2일 안에 연락드릴게요.');
    } catch (er) { err.textContent = er.message; err.hidden = false; }
    SP.busy(btn, false);
  });
})();
