/* 파티팀 모집 목록 + 모집글 쓰기 */
(function () {
  const { $, $$, esc, icon } = SP;
  const st = { status: 'open', region: '', page: 1 };

  async function load(reset) {
    if (reset) st.page = 1;
    const p = new URLSearchParams({ status: st.status, page: String(st.page) });
    if (st.region) p.set('region', st.region);
    try {
      const d = await SP.get('/api/crews?' + p);
      if (!$('#cRegion').children.length) $('#cRegion').innerHTML = `<button type="button" class="chip on" data-r="">모든 지역</button>` + d.regions.map((r) => `<button type="button" class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join('');
      const html = d.items.map(SP.band).join('');
      if (reset) $('#cList').innerHTML = html || `<div class="empty" style="grid-column:1/-1">${icon('users')}<h3>${st.status === 'open' ? '지금 모집 중인 파티팀이 없어요' : '아직 모집글이 없어요'}</h3><p>날짜와 지점을 정해 같이 갈 사람을 모아 보세요. 같이 빌리면 1인 비용이 확 줄어요.</p><button class="btn btn-ink" type="button" data-new>모집글 쓰기</button></div>`;
      else $('#cList').insertAdjacentHTML('beforeend', html);
      $('#cMore').hidden = !d.more;
    } catch (e) { $('#cList').innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>불러오지 못했어요</h3><p>${esc(e.message)}</p></div>`; }
  }

  async function create() {
    const me = await SP.needLogin('로그인하고 모집글을 써 주세요.');
    if (!me) return;
    if (!me.adult) { SP.toast('파티팀은 만 19세 이상 회원만 모집할 수 있어요.', true); return; }
    const spaces = await SP.spaces();
    const m = SP.modal({
      title: '파티팀 모집글 쓰기', wide: true,
      body: `<form class="form-grid" id="cf">
        <div class="field full"><label class="label" for="c1">제목</label><input class="input" id="c1" name="title" maxlength="50" placeholder="예) 토요일 밤 건대에서 보드게임 파티 같이 해요"></div>
        <div class="field"><label class="label" for="c2">파티 날짜</label><input class="input" id="c2" name="d" type="date" min="${SP.today()}" max="${SP.addDays(SP.today(), 120)}"></div>
        <div class="field"><label class="label" for="c3">시간</label><input class="input" id="c3" name="t" maxlength="20" placeholder="예) 밤 패키지, 19:00"></div>
        <div class="field"><label class="label" for="c4">지점</label><select class="select" id="c4" name="code">${SP.spaceOptions(spaces, '', '아직 안 정했어요')}</select></div>
        <div class="field"><label class="label" for="c5">지역</label><select class="select" id="c5" name="region">${SP.REGIONS.map((r) => `<option>${r}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="c6">더 모을 인원</label><input class="input" id="c6" name="need" type="number" min="1" max="30" value="4"></div>
        <div class="field"><label class="label" for="c7">1인 예상 비용 <span class="opt">선택</span></label><input class="input" id="c7" name="cost" maxlength="60" placeholder="예) 2만원 정도 (N빵)"></div>
        <div class="field full"><label class="label" for="c8">이런 분이면 좋아요 <span class="opt">선택</span></label><input class="input" id="c8" name="cond" maxlength="200" placeholder="예) 보드게임 좋아하는 20~30대, 처음 와도 환영"></div>
        <div class="field full"><label class="label" for="c9">하고 싶은 것</label><textarea class="textarea" id="c9" name="body" maxlength="2000" placeholder="어떤 파티를 하고 싶은지, 지금 몇 명이 모였는지 적어 주세요."></textarea></div>
        <div class="field full"><label class="label" for="c10">오픈채팅 주소 <span class="opt">수락한 사람에게만 보여요</span></label><input class="input" id="c10" name="chat_url" placeholder="https://open.kakao.com/..."></div>
      </form><div class="form-err" id="cErr" hidden></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" id="cGo">모집 시작</button>',
    });
    m.$('#c4').addEventListener('change', (e) => { const s = spaces.find((x) => x.code === e.target.value); if (s) m.$('#c5').value = s.region; });
    m.$('#cGo').onclick = async () => {
      const f = SP.formData(m.$('#cf'));
      const err = m.$('#cErr');
      if (!f.title || !f.d || f.body.length < 10) { err.textContent = '제목, 날짜, 하고 싶은 것(10자 이상)을 적어 주세요.'; err.hidden = false; return; }
      try { const r = await SP.post('/api/crews', { ...f, need: Number(f.need) || 4, code: f.code || null }); location.href = '/t/' + r.id; }
      catch (e) { err.textContent = e.message; err.hidden = false; }
    };
  }

  $('#cStatus').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; st.status = b.dataset.v; $$('#cStatus button').forEach((x) => x.classList.toggle('on', x === b)); load(true); });
  $('#cRegion').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; st.region = b.dataset.r; $$('#cRegion .chip').forEach((x) => x.classList.toggle('on', x === b)); load(true); });
  $('#cMore').addEventListener('click', () => { st.page++; load(false); });
  document.addEventListener('click', (e) => { if (e.target.closest('#newBtn, [data-new]')) create(); });
  load(true).then(() => { if (location.hash === '#new') create(); });
})();
