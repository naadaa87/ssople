/* 행사 목록 + 행사 개설 제안 */
(function () {
  const { $, esc, icon } = SP;
  async function load() {
    const [up, past] = await Promise.all([SP.get('/api/evt?scope=upcoming').catch(() => ({ items: [] })), SP.get('/api/evt?scope=past').catch(() => ({ items: [] }))]);
    $('#upList').innerHTML = up.items.length ? up.items.map(SP.ticket).join('')
      : `<div class="empty" style="grid-column:1/-1">${icon('ticket')}<h3>다음 행사를 준비하고 있어요</h3><p>열어 줬으면 하는 파티가 있다면 제안해 주세요. 반응이 좋으면 실제로 열어요.</p><button class="btn btn-ink" type="button" data-propose>행사 제안하기</button></div>`;
    if (past.items.length) { $('#pastWrap').hidden = false; $('#pastList').innerHTML = past.items.slice(0, 10).map(SP.ticket).join(''); }
  }

  async function propose() {
    const me = await SP.needLogin('로그인하고 제안해 주세요.');
    if (!me) return;
    const spaces = await SP.spaces();
    const min = SP.addDays(SP.today(), 1);
    const m = SP.modal({
      title: '행사 열자고 제안하기', wide: true,
      body: `<p class="muted small" style="margin-bottom:16px">보내 주신 내용은 운영진이 확인한 뒤 공개해요. 공개되면 알림으로 알려 드릴게요.</p>
      <form class="form-grid" id="pf">
        <div class="field full"><label class="label" for="p1">행사 이름</label><input class="input" id="p1" name="title" maxlength="60" placeholder="예) 보드게임 처음 해 보는 사람들의 밤"></div>
        <div class="field full"><label class="label" for="p2">한 줄 소개</label><input class="input" id="p2" name="summary" maxlength="120" placeholder="어떤 행사인지 한 문장으로"></div>
        <div class="field"><label class="label" for="p3">날짜</label><input class="input" id="p3" name="d" type="date" min="${min}"></div>
        <div class="field"><label class="label" for="p4">시간 <span class="opt">선택</span></label><div class="row"><input class="input" id="p4" name="t1" type="time"><span>~</span><input class="input" name="t2" type="time" aria-label="끝나는 시간"></div></div>
        <div class="field"><label class="label" for="p5">지점</label><select class="select" id="p5" name="code">${SP.spaceOptions(spaces, '', '아직 못 정했어요')}</select></div>
        <div class="field"><label class="label" for="p6">정원 <span class="opt">선택</span></label><input class="input" id="p6" name="cap" type="number" min="1" max="500" placeholder="예) 20"></div>
        <div class="field full"><label class="label" for="p7">어떻게 진행하고 싶은지</label><textarea class="textarea" id="p7" name="body" maxlength="5000" placeholder="진행 순서, 준비물, 참가비 생각 등을 자유롭게 적어 주세요."></textarea></div>
      </form><div class="form-err" hidden id="pErr"></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" id="pGo">제안 보내기</button>',
    });
    m.$('#pGo').onclick = async () => {
      const f = SP.formData(m.$('#pf'));
      const err = m.$('#pErr');
      if (!f.title || !f.d) { err.textContent = '행사 이름과 날짜는 꼭 적어 주세요.'; err.hidden = false; return; }
      try {
        await SP.post('/api/evt', { ...f, cap: f.cap ? Number(f.cap) : null, mode: 'info' });
        m.close();
        SP.toast('제안을 보냈어요. 확인 후 알려 드릴게요.');
      } catch (e) { err.textContent = e.message; err.hidden = false; }
    };
  }
  document.addEventListener('click', (e) => { if (e.target.closest('#proposeBtn, [data-propose]')) propose(); });
  if (location.hash === '#propose') setTimeout(propose, 300);
  load();
})();
