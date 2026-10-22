/* 커뮤니티 글 — 본문, 좋아요·저장·공유·신고, 댓글 */
(function () {
  const { $, $$, esc, icon } = SP;
  const id = Number((location.pathname.match(/\/c\/(\d+)/) || [])[1] || SP.qs().id);
  let post = null, me = null, canAnswer = false;

  async function init() {
    if (!id) return notFound();
    let d;
    try { d = await SP.api('/api/posts/' + id, { loginRedirect: false }); } catch (e) { return notFound(e.message); }
    post = d.post;
    canAnswer = !!d.canAnswer;
    me = (await SP.me()).user;
    document.title = `${post.title} | 쏘플파티룸`;
    const boardName = post.board === 'qna' && post.code ? '지점 문의' : (SP.BOARD[post.board] || '커뮤니티');
    const back = post.board === 'mb' ? `/m/${post.scope}` : `/community${post.board === 'all' ? '' : '?b=' + post.board}`;
    $('#postRoot').innerHTML = `<article class="article">
      <nav class="crumb"><a href="${back}">${post.board === 'mb' ? '모임 게시판' : '커뮤니티'}</a>${icon('chev-r', 'sm')}<span>${esc(boardName)}</span></nav>
      ${post.hidden ? '<div class="callout red" style="margin-bottom:14px">신고가 쌓여 다른 사람에게는 가려진 글이에요. 운영진이 확인하고 있어요.</div>' : ''}
      ${post.board === 'host' || (post.board === 'qna' && post.code) ? `<div class="row" style="gap:6px;margin-bottom:10px;flex-wrap:wrap">${SP.boardBadge(post)}</div>` : ''}
      <h1>${esc(post.title)}</h1>
      <div class="row" style="margin-top:14px;gap:10px">${SP.avatar(post.author.avatar)}<div><b style="font-size:15px">${esc(post.author.nick)}</b><div class="tiny faint">${SP.ago(post.created_at)}${post.updated_at && post.updated_at !== post.created_at ? ' · 수정됨' : ''} · 조회 ${post.views}</div></div></div>
      ${post.board === 'review' ? `<div class="box fog" style="margin-top:18px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div>${SP.stars(post.rating || 0)} <b style="margin-left:6px">${post.rating}.0</b>${post.verified ? ' <span class="badge ok" style="margin-left:6px">방문 인증</span>' : ''}</div>${post.space ? `<a class="btn btn-line btn-sm" href="/room/${post.space.code}">${icon('pin', 'sm')}${esc(post.space.name)}</a>` : ''}</div>` : ''}
      ${post.board !== 'review' && post.space ? `<a class="btn btn-soft btn-sm" style="margin-top:14px" href="/room/${post.space.code}">${icon('pin', 'sm')}${esc(post.space.name)} 지점 보기</a>` : ''}
      ${d.canAnswer && !post.answered ? `<div class="callout" style="margin-top:14px">${icon('chat', 'sm')}<span>이 지점의 호스트로 로그인돼 있어요. 아래 댓글로 답하면 "답변 완료"로 바뀌고 손님에게 알림이 가요.</span></div>` : ''}
      <div class="body">${linkify(post.body)}</div>
      ${post.imgs.length ? `<div class="imgs">${post.imgs.map((u, i) => `<img src="${esc(u)}" alt="첨부 사진 ${i + 1}" data-i="${i}" loading="lazy">`).join('')}</div>` : ''}
      <div class="act-bar">
        <button class="btn btn-line btn-sm" type="button" id="likeBtn" aria-pressed="${d.liked}">${icon('heart', 'sm')}<span>좋아요 ${post.likes}</span></button>
        <button class="btn btn-line btn-sm" type="button" id="saveBtn" aria-pressed="${d.saved}">${icon('bookmark', 'sm')}<span>${d.saved ? '저장됨' : '저장'}</span></button>
        <button class="btn btn-line btn-sm" type="button" id="shareBtn">${icon('share', 'sm')}공유</button>
        <div class="grow"></div>
        ${d.canEdit ? `<a class="btn btn-ghost btn-sm" href="/write?edit=${post.id}">${icon('edit', 'sm')}수정</a><button class="btn btn-ghost btn-sm" type="button" id="delBtn">${icon('trash', 'sm')}삭제</button>` : ''}
        ${!d.mine ? `<button class="btn btn-ghost btn-sm" type="button" id="repBtn">${icon('flag', 'sm')}신고</button>` : ''}
      </div></article>`;
    paintToggles(d.liked, d.saved);
    bind();
    $('#cmtSec').hidden = false;
    if (me && d.canAnswer && $('#cmtBody')) {
      $('#cmtBody').placeholder = '손님에게 답변을 남겨 주세요. 비품 수량, 반입 가능 여부처럼 정확하게 적어 주면 좋아요.';
      const sb = $('#cmtForm button[type=submit]'); if (sb) sb.textContent = '답변 남기기';
    }
    if (!me) $('#cmtForm').innerHTML = `<div class="box fog" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span class="muted">로그인하면 댓글을 남길 수 있어요.</span><a class="btn btn-ink btn-sm" href="/login?next=${encodeURIComponent(location.pathname)}">로그인</a></div>`;
    loadComments();
  }

  function linkify(t) {
    return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a class="link" href="$1" target="_blank" rel="noopener nofollow">$1</a>');
  }
  function notFound(msg) {
    $('#postRoot').innerHTML = `<div class="empty" style="margin-top:40px">${icon('chat')}<h3>글을 볼 수 없어요</h3><p>${esc(msg || '지워졌거나 주소가 바뀐 글이에요.')}</p><a class="btn btn-ink" href="/community">커뮤니티로 가기</a></div>`;
  }
  function paintToggles(liked, saved) {
    const l = $('#likeBtn'), s = $('#saveBtn');
    if (l) { l.classList.toggle('btn-ink', liked); l.classList.toggle('btn-line', !liked); }
    if (s) { s.classList.toggle('btn-ink', saved); s.classList.toggle('btn-line', !saved); }
  }

  function bind() {
    $('#likeBtn').addEventListener('click', async (e) => {
      if (!(await SP.needLogin('로그인하면 좋아요를 누를 수 있어요.'))) return;
      try { const r = await SP.post(`/api/posts/${id}/like`); e.currentTarget.querySelector('span').textContent = `좋아요 ${r.likes}`; paintToggles(r.on, $('#saveBtn').getAttribute('aria-pressed') === 'true'); $('#likeBtn').setAttribute('aria-pressed', r.on); } catch (er) { SP.fail(er); }
    });
    $('#saveBtn').addEventListener('click', async () => {
      if (!(await SP.needLogin('로그인하면 글을 저장할 수 있어요.'))) return;
      try { const r = await SP.post(`/api/posts/${id}/bookmark`); $('#saveBtn').setAttribute('aria-pressed', r.on); $('#saveBtn span').textContent = r.on ? '저장됨' : '저장'; paintToggles($('#likeBtn').getAttribute('aria-pressed') === 'true', r.on); SP.toast(r.on ? '마이페이지 저장한 글에 담았어요.' : '저장을 취소했어요.'); } catch (er) { SP.fail(er); }
    });
    $('#shareBtn').addEventListener('click', () => SP.share({ title: post.title, url: location.origin + '/c/' + id }));
    const del = $('#delBtn');
    if (del) del.addEventListener('click', async () => {
      if (!(await SP.confirm('이 글을 지울까요? 댓글도 함께 지워져요.', { ok: '지우기', danger: true }))) return;
      try { await SP.del('/api/posts/' + id); SP.toast('글을 지웠어요.'); setTimeout(() => { location.href = post.board === 'mb' ? `/m/${post.scope}` : '/community'; }, 500); } catch (er) { SP.fail(er); }
    });
    const rep = $('#repBtn');
    if (rep) rep.addEventListener('click', () => SP.report('post', id));
    $('#postRoot').addEventListener('click', (e) => { const im = e.target.closest('.imgs img'); if (im) SP.lightbox(post.imgs, Number(im.dataset.i)); });
  }

  /* ---------- 댓글 ---------- */
  let replyTo = null;
  async function loadComments() {
    try {
      const d = await SP.get(`/api/posts/${id}/comments`);
      const items = d.items;
      $('#cmtHead').textContent = `댓글 ${items.filter((c) => c.state === 'ok').length}`;
      const roots = items.filter((c) => !c.parent_id);
      const kids = (pid) => items.filter((c) => c.parent_id === pid);
      const one = (c, reply) => `<div class="cmt${reply ? ' reply' : ''}" id="cmt-${c.id}" data-cid="${c.id}">
        ${c.state === 'ok' ? `<div class="cmt-hd">${SP.avatar(c.author.avatar, 'sm')}<b>${esc(c.author.nick)}</b>${c.isHost ? '<span class="badge red">호스트</span>' : c.isStaff ? '<span class="badge ink">쏘플</span>' : ''}${c.isWriter ? '<span class="badge mute">글쓴이</span>' : ''}<time>${SP.ago(c.created_at)}</time></div><div class="cmt-body">${linkify(c.body)}</div>
          <div class="cmt-act">${!reply && me ? `<button type="button" data-reply="${c.id}">답글</button>` : ''}${c.mine ? `<button type="button" data-cdel="${c.id}">삭제</button>` : me ? `<button type="button" data-crep="${c.id}">신고</button>` : ''}</div>`
        : `<div class="cmt-body faint">${c.state === 'deleted' ? '지워진 댓글이에요.' : '신고로 가려진 댓글이에요.'}</div>`}
        </div>${kids(c.id).map((k) => one(k, true)).join('')}`;
      $('#cmtList').innerHTML = roots.length ? roots.map((c) => one(c, false)).join('') : '<p class="muted small" style="padding:16px 0">첫 댓글을 남겨 주세요.</p>';
      const want = /^#cmt-\d+$/.test(location.hash) && document.getElementById(location.hash.slice(1));
      if (want && !want.dataset.seen) { want.dataset.seen = '1'; want.classList.add('hl'); want.scrollIntoView({ block: 'center' }); }
    } catch (e) { $('#cmtList').innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
  }
  $('#cmtSec').addEventListener('click', async (e) => {
    const r = e.target.closest('[data-reply]');
    if (r) {
      replyTo = Number(r.dataset.reply);
      const box = $('#cmtBody');
      box.placeholder = '답글을 남겨 주세요';
      box.focus();
      if (!$('#replyNote')) $('#cmtForm').insertAdjacentHTML('afterbegin', `<div class="tiny muted" id="replyNote" style="margin-bottom:6px">답글 쓰는 중 <button type="button" class="link" id="replyOff">취소</button></div>`);
      return;
    }
    if (e.target.closest('#replyOff')) { replyTo = null; $('#replyNote').remove(); $('#cmtBody').placeholder = canAnswer ? '손님에게 답변을 남겨 주세요.' : '따뜻한 댓글을 남겨 주세요'; return; }
    const d = e.target.closest('[data-cdel]');
    if (d) {
      if (!(await SP.confirm('댓글을 지울까요?', { ok: '지우기', danger: true }))) return;
      try { await SP.del('/api/comments/' + d.dataset.cdel); loadComments(); } catch (er) { SP.fail(er); }
      return;
    }
    const rp = e.target.closest('[data-crep]');
    if (rp) SP.report('comment', Number(rp.dataset.crep));
  });
  $('#cmtForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $('#cmtBody') && $('#cmtBody').value.trim();
    if (!body) { SP.toast('댓글 내용을 적어 주세요.'); return; }
    const btn = $('#cmtForm button[type=submit]');
    SP.busy(btn, true, '남기는 중');
    try {
      await SP.post(`/api/posts/${id}/comments`, { body, parent_id: replyTo || undefined });
      $('#cmtBody').value = '';
      replyTo = null; if ($('#replyNote')) $('#replyNote').remove();
      loadComments();
    } catch (er) { SP.fail(er); } finally { SP.busy(btn, false); }
  });

  init();
})();
