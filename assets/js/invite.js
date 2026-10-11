/* 초대장 만들기 · 고치기 · 내 초대장 */
(function () {
  const { $, $$, esc, icon } = SP;
  const q = SP.qs();
  const editId = q.edit || '';
  let spaces = [];

  function val() { return SP.formData($('#ivForm')); }
  function preview() {
    const f = val();
    const sp = spaces.find((s) => s.code === f.code);
    $('#preview').innerHTML = SP.invCard({ ...f, spaceName: sp ? sp.name : '' });
  }
  function drawThemes(cur) {
    $('#themes').innerHTML = SP.THEMES.map(([k, n, c]) => `<button type="button" data-th="${k}" class="${k === cur ? 'on' : ''}" style="background:${c}" aria-label="${n}" title="${n}"></button>`).join('');
    $('[name=theme]').value = cur;
  }

  async function loadMine() {
    const me = (await SP.me()).user;
    if (!me) return;
    try {
      const d = await SP.get('/api/me/activity?tab=invites');
      $('#myList').innerHTML = d.items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>초대장</th><th>날짜</th><th class="r">온대요</th><th class="r">응답</th><th></th></tr></thead><tbody>${d.items.map((r) => `<tr><td><a class="link b" href="/i/${r.id}">${esc(r.title)}</a>${r.spaceName ? `<div class="tiny muted">${esc(r.spaceName)}</div>` : ''}</td><td>${r.d ? SP.mdw(r.d) : '-'}</td><td class="r num">${r.yes}명</td><td class="r num">${r.replies}</td><td class="r"><button class="btn btn-ghost btn-sm" type="button" data-copy="${r.id}">${icon('link', 'sm')}링크</button><a class="btn btn-ghost btn-sm" href="/invite?edit=${r.id}">고치기</a></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">아직 만든 초대장이 없어요.</p>';
    } catch (e) { $('#myList').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  }

  function shared(id) {
    const url = location.origin + '/i/' + id;
    SP.modal({
      title: '초대장이 만들어졌어요',
      body: `<p class="muted">아래 링크를 카톡이나 문자로 보내 주세요. 받은 사람은 가입 없이 답할 수 있어요.</p>
        <div class="row" style="margin-top:14px"><input class="input" readonly value="${esc(url)}" id="shUrl"><button class="btn btn-ink" type="button" id="shCopy">복사</button></div>`,
      foot: `<a class="btn btn-soft" href="/i/${id}">초대장 보기</a><button class="btn btn-red" type="button" id="shShare">${icon('share')}바로 보내기</button>`,
      onOpen: (m) => {
        m.$('#shCopy').onclick = () => SP.copy(url, '링크를 복사했어요.');
        m.$('#shShare').onclick = () => SP.share({ title: val().title, text: `${val().host || ''} 초대장이 도착했어요. 올 수 있는지 알려 줘!`, url });
      },
    });
  }

  (async function init() {
    spaces = await SP.spaces().catch(() => []);
    $('#i6').innerHTML = SP.spaceOptions(spaces, q.code || '', '쏘플 지점이 아니에요');
    $('#i4').min = SP.today();
    $('#i3').min = SP.today();
    drawThemes('confetti');
    const me = (await SP.me()).user;
    if (me && !$('#i2').value) $('#i2').value = me.nick;
    if (editId) {
      try {
        const d = await SP.get('/api/invites/' + editId);
        if (!d.owner) { SP.toast('내가 만든 초대장만 고칠 수 있어요.', true); }
        else {
          const iv = d.invite;
          $('#i1').value = iv.title; $('#i2').value = iv.host || ''; $('#i3').value = iv.deadline || ''; $('#i4').value = iv.d || ''; $('#i5').value = iv.t || '';
          $('#i6').value = iv.code || ''; $('#i7').value = iv.place || ''; $('#i8').value = iv.msg || '';
          $('[name=show_list]').checked = iv.show_list;
          drawThemes(iv.theme || 'confetti');
          $('#ivHead').textContent = '초대장 고치기';
          $('#ivGo').textContent = '고친 내용 저장';
          $('#ivReset').hidden = false;
        }
      } catch (e) { SP.fail(e); }
    }
    preview();
    loadMine();
  })();

  $('#ivForm').addEventListener('input', preview);
  $('#ivForm').addEventListener('change', preview);
  $('#themes').addEventListener('click', (e) => { const b = e.target.closest('[data-th]'); if (!b) return; drawThemes(b.dataset.th); preview(); });
  $('#ivReset').addEventListener('click', () => { location.href = '/invite'; });
  $('#myList').addEventListener('click', (e) => { const c = e.target.closest('[data-copy]'); if (c) SP.copy(location.origin + '/i/' + c.dataset.copy, '링크를 복사했어요.'); });
  $('#ivForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const me = await SP.needLogin('초대장을 만들려면 로그인이 필요해요. 받는 사람은 가입하지 않아도 돼요.');
    if (!me) return;
    const f = val();
    const err = $('#ivErr');
    err.hidden = true;
    if (!f.title) { err.textContent = '제목을 적어 주세요.'; err.hidden = false; return; }
    const body = { ...f, code: f.code || null, show_list: !!f.show_list };
    const btn = $('#ivGo');
    SP.busy(btn, true, '만드는 중');
    try {
      if (editId) { await SP.patch('/api/invites/' + editId, body); SP.toast('저장했어요.'); location.href = '/i/' + editId; return; }
      const r = await SP.post('/api/invites', body);
      shared(r.id);
      loadMine();
    } catch (er) { err.textContent = er.message; err.hidden = false; }
    SP.busy(btn, false);
  });
})();
