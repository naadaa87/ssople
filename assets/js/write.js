/* 글쓰기 · 고치기 — 게시판, 후기(지점·별점), 사진 6장 */
(function () {
  const { $, $$, esc, icon } = SP;
  const q = SP.qs();
  const editId = Number(q.edit) || 0;
  const BOARDS = [['review', '이용후기'], ['tip', '파티 꿀팁'], ['qna', '질문'], ['free', '자유']];
  const st = { board: BOARDS.some((b) => b[0] === q.b) ? q.b : (q.b === 'mb' ? 'mb' : q.b === 'host' ? 'host' : 'review'), scope: Number(q.scope) || 0, rating: 0, imgs: [], code: /^S-\d{4}$/.test(q.code || '') ? q.code : '' };
  let hostCodes = [];

  function drawBoards(admin) {
    if (st.board === 'mb') { $('#boardField').hidden = true; return; }
    let list = admin ? [...BOARDS, ['notice', '공지']] : BOARDS;
    if (hostCodes.length || admin) list = [...list, ['host', '지점 소식']];
    $('#boardPick').innerHTML = list.map(([k, n]) => `<button type="button" class="chip${st.board === k ? ' on' : ''}" role="radio" aria-checked="${st.board === k}" data-b="${k}">${n}</button>`).join('');
    $('#reviewBox').hidden = st.board !== 'review' && st.board !== 'host';
    $('#wStars').parentElement.hidden = st.board !== 'review';
    $('#wCode').previousElementSibling.textContent = st.board === 'host' ? '소식을 올릴 지점' : '다녀온 지점';
    if (st.board === 'host' && hostCodes.length && !admin) {
      $$('#wCode option').forEach((o) => { o.hidden = o.value && !hostCodes.includes(o.value); });
      if (!st.code && hostCodes.length === 1) { st.code = hostCodes[0]; $('#wCode').value = st.code; }
    } else $$('#wCode option').forEach((o) => { o.hidden = false; });
    $('#wBody').placeholder = st.board === 'review' ? '이용한 패키지, 좋았던 점, 아쉬웠던 점을 적어 주면 다른 분들께 큰 도움이 돼요.'
      : st.board === 'tip' ? '파티 준비하면서 알게 된 요령을 나눠 주세요.'
        : st.board === 'host' ? '지점의 새 소식, 이달의 꾸밈, 준비한 이벤트, 손님께 드리는 안내를 적어 주세요. 사진을 같이 올리면 더 좋아요.'
          : st.board === 'qna' ? '궁금한 점을 자세히 적을수록 답이 빨리 달려요.' : '자유롭게 이야기해 주세요.';
  }
  function drawStars() {
    $('#wStars').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${st.rating === n}" aria-label="${n}점" class="${n <= st.rating ? 'on' : ''}" data-r="${n}">${icon('star-f')}</button>`).join('') + `<span class="muted small" style="align-self:center;margin-left:8px">${st.rating ? st.rating + '점' : '눌러서 고르기'}</span>`;
  }
  function drawImgs() {
    $('#wImgs').innerHTML = st.imgs.map((im, i) => `<div class="pk"><img src="${esc(im.url)}" alt="첨부 ${i + 1}"><button type="button" data-rm="${i}" aria-label="사진 빼기">${icon('x', 'sm')}</button></div>`).join('')
      + (st.imgs.length < 6 ? `<button type="button" class="add" id="addImg">${icon('camera')}<br>사진 추가</button>` : '');
  }

  async function init() {
    const me = await SP.needLogin('글을 쓰려면 로그인이 필요해요.');
    if (!me) return;
    hostCodes = me.hostCodes || [];
    if (st.board === 'mb') $('#wCancel').href = `/m/${st.scope}`;
    const spaces = await SP.spaces();
    const byR = {};
    spaces.forEach((s) => (byR[s.region] = byR[s.region] || []).push(s));
    $('#wCode').innerHTML = '<option value="">지점을 골라 주세요</option>' + Object.entries(byR).map(([r, l]) => `<optgroup label="${esc(r)}">${l.map((s) => `<option value="${s.code}">${esc(s.name)}</option>`).join('')}</optgroup>`).join('');
    if (editId) {
      try {
        const d = await SP.get('/api/posts/' + editId);
        if (!d.canEdit) { SP.toast('내가 쓴 글만 고칠 수 있어요.', true); return; }
        const p = d.post;
        st.board = p.board; st.scope = p.scope; st.rating = p.rating || 0; st.code = p.code || '';
        st.imgs = p.imgKeys.map((k, i) => ({ key: k, url: p.imgs[i] }));
        $('#wSubject').value = p.title; $('#wBody').value = p.body;
        $('#wTitle').textContent = '글 고치기';
        $('#wSubmit').textContent = '고친 내용 저장';
        $('#wCancel').href = '/c/' + editId;
        $('#boardField').hidden = true;
        if (p.board === 'review') $('#wCode').disabled = true;
      } catch (e) { SP.fail(e); return; }
    } else if (st.board === 'review' && st.code) {
      const sp = spaces.find((s) => s.code === st.code);
      if (sp) $('#wSubject').value = `${sp.name} 이용후기`;
    }
    $('#wCode').value = st.code;
    drawBoards(!!me.admin);
    if (editId) $('#boardField').hidden = true;
    drawStars();
    drawImgs();
    count();
  }
  const count = () => { $('#wCount').textContent = `${$('#wBody').value.length} / 5000`; };

  $('#boardPick').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    st.board = b.dataset.b;
    drawBoards(!!((await SP.me()).user || {}).admin);
  });
  $('#wStars').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; st.rating = Number(b.dataset.r); drawStars(); });
  $('#wCode').addEventListener('change', (e) => {
    st.code = e.target.value;
    if (!$('#wSubject').value.trim() || / 이용후기$/.test($('#wSubject').value)) {
      const opt = e.target.selectedOptions[0];
      $('#wSubject').value = st.code ? `${opt.textContent} 이용후기` : '';
    }
  });
  $('#wBody').addEventListener('input', count);
  $('#wImgs').addEventListener('click', (e) => {
    if (e.target.closest('#addImg')) { $('#wFile').click(); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { st.imgs.splice(Number(rm.dataset.rm), 1); drawImgs(); }
  });
  $('#wFile').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).slice(0, 6 - st.imgs.length);
    e.target.value = '';
    for (const f of files) {
      const tmp = { key: null, url: URL.createObjectURL(f) };
      st.imgs.push(tmp); drawImgs();
      try { const r = await SP.upload(f); tmp.key = r.key; tmp.url = r.url; }
      catch (er) { st.imgs.splice(st.imgs.indexOf(tmp), 1); SP.fail(er); }
      drawImgs();
    }
  });

  $('#wForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#wErr');
    err.hidden = true;
    const title = $('#wSubject').value.trim(), body = $('#wBody').value.trim();
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (st.board === 'review' && !editId && !st.code) return fail('후기를 남길 지점을 골라 주세요.');
    if (st.board === 'host' && !editId && !st.code) return fail('소식을 올릴 지점을 골라 주세요.');
    if (st.board === 'review' && !st.rating) return fail('별점을 골라 주세요.');
    if (!title) return fail('제목을 적어 주세요.');
    if (body.length < 5) return fail('내용을 조금 더 적어 주세요.');
    if (st.imgs.some((x) => !x.key)) return fail('사진을 올리는 중이에요. 잠시만 기다려 주세요.');
    const btn = $('#wSubmit');
    SP.busy(btn, true, '올리는 중');
    try {
      const payload = { title, body, imgs: st.imgs.map((x) => x.key) };
      if (st.board === 'review') payload.rating = st.rating;
      if (editId) {
        await SP.patch('/api/posts/' + editId, payload);
        location.href = '/c/' + editId;
      } else {
        const r = await SP.post('/api/posts', { ...payload, board: st.board, scope: st.scope || undefined, code: st.code || undefined });
        location.href = '/c/' + r.id;
      }
    } catch (er) { fail(er.message); SP.busy(btn, false); }
  });

  init();
})();
