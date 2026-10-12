/* 모임 목록 + 모임 만들기 */
(function () {
  const { $, $$, esc, icon } = SP;
  const st = { cat: '', region: '', q: '', page: 1 };
  let cats = [];

  async function load(reset) {
    if (reset) st.page = 1;
    const p = new URLSearchParams({ page: String(st.page) });
    if (st.cat) p.set('cat', st.cat);
    if (st.region) p.set('region', st.region);
    if (st.q) p.set('q', st.q);
    try {
      const d = await SP.get('/api/meetups?' + p);
      if (!cats.length) {
        cats = d.cats;
        $('#catChips').innerHTML = `<button type="button" class="chip on" data-c="">전체</button>` + cats.map((c) => `<button type="button" class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('');
        $('#mRegion').innerHTML = '<option value="">모든 지역</option>' + d.regions.map((r) => `<option>${esc(r)}</option>`).join('');
      }
      const html = d.items.map(SP.meet).join('');
      if (reset) $('#mList').innerHTML = html || `<div class="empty" style="grid-column:1/-1">${icon('smile')}<h3>${st.cat || st.region || st.q ? '조건에 맞는 모임이 없어요' : '아직 열린 모임이 없어요'}</h3><p>좋아하는 걸 같이 할 사람을 직접 모아 보세요. 모임장이 되면 배지도 받아요.</p><button class="btn btn-ink" type="button" data-new>모임 만들기</button></div>`;
      else $('#mList').insertAdjacentHTML('beforeend', html);
      $('#mMore').hidden = !d.more;
    } catch (e) { $('#mList').innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>모임을 불러오지 못했어요</h3><p>${esc(e.message)}</p></div>`; }
  }

  async function create() {
    const me = await SP.needLogin('로그인하고 모임을 만들어 주세요.');
    if (!me) return;
    if (!me.adult) { SP.toast('모임은 만 19세 이상 회원만 만들 수 있어요.', true); return; }
    if (!cats.length) await load(true);
    const m = SP.modal({
      title: '모임 만들기', wide: true,
      body: `<form class="form-grid" id="mf">
        <div class="field full"><label class="label" for="f1">모임 이름</label><input class="input" id="f1" name="title" maxlength="40" placeholder="예) 금요일 밤 보드게임"></div>
        <div class="field"><label class="label" for="f2">분야</label><select class="select" id="f2" name="cat">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="f3">지역</label><select class="select" id="f3" name="region">${SP.REGIONS.map((r) => `<option>${r}</option>`).join('')}</select></div>
        <div class="field full"><label class="label" for="f4">어떤 모임인가요?</label><textarea class="textarea" id="f4" name="intro" maxlength="2000" placeholder="얼마나 자주, 주로 뭘 하는지, 어떤 사람이면 좋은지 적어 주세요."></textarea></div>
        <div class="field full"><label class="label" for="f5">모임 규칙 <span class="opt">선택</span></label><textarea class="textarea" id="f5" name="rules" maxlength="800" style="min-height:90px" placeholder="예) 정모 2회 연속 불참하면 자동 탈퇴, 회비는 그날 N빵"></textarea></div>
        <div class="field"><label class="label" for="f6">정원</label><input class="input" id="f6" name="cap" type="number" min="2" max="300" value="20"></div>
        <div class="field"><span class="label">가입 방식</span><div class="seg" id="jm"><button type="button" data-v="approve" class="on">승인 후 가입</button><button type="button" data-v="open">바로 가입</button></div><input type="hidden" name="join_mode" value="approve"></div>
        <div class="field full"><label class="label" for="f7">오픈채팅 주소 <span class="opt">선택 · 멤버에게만 보여요</span></label><input class="input" id="f7" name="chat_url" placeholder="https://open.kakao.com/..."></div>
        <div class="field full"><span class="label">대표 사진 <span class="opt">선택</span></span><div id="coverWrap"></div></div>
      </form><div class="form-err" id="mErr" hidden></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" id="mGo">모임 열기</button>',
    });
    SP.coverPicker(m.$('#coverWrap'));
    m.$('#jm').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; m.$$('#jm button').forEach((x) => x.classList.toggle('on', x === b)); m.$('[name=join_mode]').value = b.dataset.v; });
    m.$('#mGo').onclick = async () => {
      const f = SP.formData(m.$('#mf'));
      const err = m.$('#mErr');
      if (!f.title || f.intro.length < 10) { err.textContent = '모임 이름과 소개(10자 이상)를 적어 주세요.'; err.hidden = false; return; }
      try {
        const r = await SP.post('/api/meetups', { ...f, cap: Number(f.cap) || 20, cover: f.cover || null });
        location.href = '/m/' + r.id;
      } catch (e) { err.textContent = e.message; err.hidden = false; }
    };
  }

  $('#catChips').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; st.cat = b.dataset.c; $$('#catChips .chip').forEach((x) => x.classList.toggle('on', x === b)); load(true); });
  $('#mRegion').addEventListener('change', (e) => { st.region = e.target.value; load(true); });
  $('#mQForm').addEventListener('submit', (e) => { e.preventDefault(); st.q = $('#mQ').value.trim(); load(true); });
  $('#mMore').addEventListener('click', () => { st.page++; load(false); });
  document.addEventListener('click', (e) => { if (e.target.closest('#newBtn, [data-new]')) create(); });
  load(true).then(() => { if (location.hash === '#new') create(); });
})();
