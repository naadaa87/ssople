/* 커뮤니티 목록 — 게시판 탭, 정렬, 검색, 더 보기 */
(function () {
  const { $, $$, esc, icon } = SP;
  const q0 = SP.qs();
  const st = { b: ['all', 'review', 'tip', 'qna', 'free', 'host', 'notice'].includes(q0.b) ? q0.b : 'all', s: q0.s === 'hot' ? 'hot' : 'new', q: q0.q || '', code: /^S-\d{4}$/.test(q0.code || '') ? q0.code : '', page: 1 };
  const EMPTY = {
    all: ['아직 글이 없어요', '첫 글의 주인공이 되어 보세요.'],
    review: ['아직 후기가 없어요', '다녀온 지점의 후기를 남기면 다른 분들이 방을 고를 때 큰 도움이 돼요.'],
    tip: ['아직 꿀팁이 없어요', '풍선 붙이는 요령, 케이크 보관법처럼 작은 팁도 좋아요.'],
    qna: ['아직 질문이 없어요', '파티 준비하다 궁금한 걸 물어보세요.'],
    free: ['아직 글이 없어요', '파티 이야기, 사는 이야기 다 좋아요.'],
    host: ['아직 지점 소식이 없어요', '호스트가 올리는 이벤트, 휴무, 새 시설 소식이 여기에 모여요.'],
    notice: ['공지가 없어요', ''],
  };

  async function load(reset) {
    if (reset) { st.page = 1; $('#list').innerHTML = '<div class="skel" style="height:90px;margin-top:12px"></div>'; }
    SP.setQs({ b: st.b === 'all' ? '' : st.b, s: st.s === 'new' ? '' : st.s, q: st.q, code: st.code });
    $$('#boardTabs button').forEach((b) => { const on = b.dataset.b === st.b; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $$('#sortSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.s));
    $('#q').value = st.q;
    $('#writeBtn').href = '/write' + (st.b !== 'all' && st.b !== 'notice' && st.b !== 'host' ? '?b=' + st.b + (st.code ? '&code=' + st.code : '') : '');
    if (st.code) {
      const sp = (await SP.spaces()).find((x) => x.code === st.code);
      $('#codeChip').innerHTML = `<button type="button" class="chip on" id="codeOff">${esc(sp ? sp.name : st.code)} 글만 보는 중 ${icon('x', 'sm')}</button>`;
    } else $('#codeChip').innerHTML = '';
    const p = new URLSearchParams({ board: st.b, sort: st.s, page: String(st.page), size: '20' });
    if (st.q) p.set('q', st.q);
    if (st.code) p.set('code', st.code);
    try {
      const d = await SP.get('/api/posts?' + p);
      const html = d.items.map(SP.postRow).join('');
      if (reset) $('#list').innerHTML = html || `<div class="empty" style="margin-top:16px">${icon('chat')}<h3>${st.q ? '검색 결과가 없어요' : EMPTY[st.b][0]}</h3><p>${st.q ? '다른 단어로 찾아보세요.' : EMPTY[st.b][1]}</p>${st.b !== 'notice' && !st.q ? `<a class="btn btn-ink" href="${$('#writeBtn').href}">글쓰기</a>` : ''}</div>`;
      else $('#list').insertAdjacentHTML('beforeend', html);
      $('#more').hidden = !d.more;
    } catch (e) { $('#list').innerHTML = `<div class="empty"><h3>글을 불러오지 못했어요</h3><p>${esc(e.message)}</p></div>`; }
    if (reset && st.b === 'all' && st.page === 1 && !st.q) {
      SP.get('/api/posts?board=notice&size=2').then((d) => {
        $('#noticeBox').innerHTML = d.items.length ? `<div class="box fog" style="padding:6px 18px;margin-top:10px">${d.items.map((n) => `<a class="between" href="/c/${n.id}" style="padding:10px 0"><span class="row" style="min-width:0"><span class="badge red">공지</span><b class="clamp2" style="font-size:15px">${esc(n.title)}</b></span><span class="tiny faint">${SP.ago(n.created_at)}</span></a>`).join('')}</div>` : '';
      }).catch(() => {});
    } else $('#noticeBox').innerHTML = '';
  }

  $('#boardTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; st.b = b.dataset.b; if (st.b !== 'review') st.code = ''; load(true); });
  $('#sortSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; st.s = b.dataset.v; load(true); });
  $('#qForm').addEventListener('submit', (e) => { e.preventDefault(); st.q = $('#q').value.trim(); load(true); });
  $('#more').addEventListener('click', () => { st.page++; load(false); });
  document.addEventListener('click', (e) => { if (e.target.closest('#codeOff')) { st.code = ''; load(true); } });
  load(true);
})();
