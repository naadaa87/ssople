/* 파티팀 모집글 — 신청, 수락/거절, 오픈채팅 공개 */
(function () {
  const { $, esc, icon } = SP;
  const id = Number((location.pathname.match(/\/t\/(\d+)/) || [])[1] || SP.qs().id);
  let D = null;
  const ST = { open: ['red', '모집 중'], closed: ['mute', '모집 완료'], done: ['mute', '지난 파티'], hidden: ['warn', '가려진 글'] };

  async function load() {
    if (!id) return notFound();
    try { D = await SP.api('/api/crews/' + id, { loginRedirect: false }); } catch (e) { return notFound(e.message); }
    document.title = `${D.crew.title} | 쏘플파티룸 파티팀`;
    render();
  }
  function notFound(msg) {
    $('#crRoot').innerHTML = `<div class="empty" style="margin-top:40px">${icon('users')}<h3>모집글을 찾을 수 없어요</h3><p>${esc(msg || '')}</p><a class="btn btn-ink" href="/crew">파티팀 목록</a></div>`;
  }

  function applyBox() {
    const c = D.crew, me = D.me;
    if (me.owner) return '';
    if (me.app) {
      const s = me.app.status;
      if (s === 'accepted') return `<div class="callout">${icon('check-c')}<div><b>함께하기로 했어요!</b><br><span class="small">오픈채팅에서 인사 나눠 보세요.</span></div></div><button class="btn btn-soft btn-block" type="button" style="margin-top:10px" data-act="cancel">참여 취소</button>`;
      if (s === 'pending') return `<div class="callout warn">${icon('clock')}<div><b>신청했어요</b><br><span class="small">글쓴이가 수락하면 알림으로 알려 드려요.</span></div></div><button class="btn btn-soft btn-block" type="button" style="margin-top:10px" data-act="cancel">신청 취소</button>`;
      if (s === 'rejected') return '<p class="muted small">이번 모집에는 함께하지 못하게 됐어요.</p>';
    }
    if (c.status !== 'open') return `<p class="muted small">${c.status === 'done' ? '이미 지난 파티예요.' : '모집이 끝났어요.'}</p>`;
    return `<form id="apForm"><label class="label" for="apMsg">한 줄 소개</label><textarea class="textarea" id="apMsg" maxlength="200" style="min-height:90px" placeholder="예) 보드게임 좋아하는 29살 직장인이에요. 술은 조금만!"></textarea>
      <button class="btn btn-red btn-block btn-lg" type="submit" style="margin-top:12px">같이 할래요</button><p class="tiny faint" style="margin-top:8px">만 19세 이상만 신청할 수 있어요.</p></form>`;
  }

  function render() {
    const c = D.crew, me = D.me;
    const [bc, bt] = ST[c.status] || ST.open;
    const slots = Array.from({ length: Math.min(c.need, 20) }, (_, i) => `<i class="${i < c.accepted ? 'on' : ''}"></i>`).join('');
    $('#crRoot').innerHTML = `
      <nav class="crumb"><a href="/crew">파티팀 모집</a>${icon('chev-r', 'sm')}<span>${esc(c.region || '')}</span></nav>
      <div class="room-layout" style="margin-top:6px">
        <div>
          <div class="row wrap-ok"><span class="badge ${bc}">${bt}</span><span class="badge mute">${esc(c.region || '')}</span></div>
          <h1 class="h1" style="margin-top:10px">${esc(c.title)}</h1>
          <div class="row muted small" style="margin-top:10px;gap:10px">${SP.avatar(c.owner.avatar, 'sm')}<span>${esc(c.owner.nick)}</span><span>${SP.ago(c.created_at)}</span></div>
          <dl class="kv" style="margin-top:22px">
            <dt>파티 날짜</dt><dd>${SP.mdwLong(c.d)}${c.t ? ' · ' + esc(c.t) : ''}</dd>
            <dt>지점</dt><dd>${c.code ? `<a class="link" href="/room/${c.code}?date=${c.d}">${esc(c.spaceName || c.code)}</a>` : '아직 안 정했어요'}</dd>
            <dt>모집 인원</dt><dd><b>${c.accepted}/${c.need}명</b> 모였어요<div class="slots" style="justify-content:flex-start;margin-top:6px">${slots}</div></dd>
            ${c.cost ? `<dt>1인 예상 비용</dt><dd>${esc(c.cost)}</dd>` : ''}
            ${c.cond ? `<dt>이런 분이면 좋아요</dt><dd>${esc(c.cond)}</dd>` : ''}
          </dl>
          <section class="room-sec"><h2>하고 싶은 것</h2><div class="prose prewrap">${esc(c.body)}</div></section>
          ${me.owner ? ownerPanel() : (D.apps.length ? `<section class="room-sec"><h2>함께하는 사람</h2><div class="row wrap-ok">${D.apps.map((a) => `<span class="chip" style="cursor:default">${SP.avatar(a.avatar, 'sm')}${esc(a.nick)}</span>`).join('')}</div></section>` : '')}
        </div>
        <aside class="book">
          <h2>${me.owner ? '내 모집글' : '참여하기'}</h2>
          <div style="margin-top:14px">${applyBox()}</div>
          ${c.chat_url ? `<a class="btn btn-kakao btn-block" style="margin-top:12px" href="${esc(c.chat_url)}" target="_blank" rel="noopener">${icon('kakao', 'fill')}오픈채팅 들어가기</a>` : c.hasChat && !me.owner ? '<p class="tiny faint" style="margin-top:10px">오픈채팅 주소는 수락된 사람에게만 보여요.</p>' : ''}
          <div class="row" style="margin-top:14px;flex-wrap:wrap">
            ${c.code ? `<a class="btn btn-soft btn-sm" href="/room/${c.code}?date=${c.d}">${icon('calendar', 'sm')}그날 빈 방 보기</a>` : ''}
            <a class="btn btn-soft btn-sm" href="/planner#nbbang">${icon('won', 'sm')}N빵 계산기</a>
            <button class="btn btn-ghost btn-sm" type="button" data-act="share">${icon('share', 'sm')}공유</button>
            ${!me.owner ? `<button class="btn btn-ghost btn-sm" type="button" data-act="report">${icon('flag', 'sm')}신고</button>` : ''}
          </div>
        </aside>
      </div>`;
    const f = $('#apForm');
    if (f) f.addEventListener('submit', apply);
  }

  function ownerPanel() {
    const c = D.crew;
    const pend = D.apps.filter((a) => a.status === 'pending'), acc = D.apps.filter((a) => a.status === 'accepted');
    const row = (a, btns) => `<div><div class="row" style="min-width:0">${SP.avatar(a.avatar, 'sm')}<div style="min-width:0"><b>${esc(a.nick)}</b>${a.intro ? `<div class="tiny faint">${esc(a.intro)}</div>` : ''}<div class="small muted">${esc(a.msg || '')}</div></div></div><div class="row">${btns}</div></div>`;
    return `<section class="room-sec"><div class="between" style="flex-wrap:wrap;gap:10px"><h2 style="margin:0;white-space:nowrap">신청한 사람 ${pend.length}명</h2><div class="row wrap-ok"><button class="btn btn-line btn-sm" type="button" data-act="edit">${icon('edit', 'sm')}고치기</button><button class="btn btn-line btn-sm" type="button" data-act="toggle">${c.status === 'open' ? '모집 닫기' : c.status === 'closed' ? '다시 모집하기' : ''}</button><button class="btn btn-ghost btn-sm" type="button" data-act="del">${icon('trash', 'sm')}글 지우기</button></div></div>
      <div class="list-plain" style="margin-top:10px">${pend.length ? pend.map((a) => row(a, `<button class="btn btn-ink btn-sm" type="button" data-app="accept" data-uid="${a.id}">수락</button><button class="btn btn-soft btn-sm" type="button" data-app="reject" data-uid="${a.id}">거절</button>`)).join('') : '<p class="muted small">아직 신청한 사람이 없어요. 공유 버튼으로 친구들에게도 알려 보세요.</p>'}</div>
      ${acc.length ? `<h3 class="h4" style="margin-top:22px">함께하는 사람 ${acc.length}명</h3><div class="list-plain" style="margin-top:6px">${acc.map((a) => row(a, `<button class="btn btn-ghost btn-sm" type="button" data-app="reject" data-uid="${a.id}">취소</button>`)).join('')}</div>` : ''}
      ${!c.chat_url ? '<div class="callout warn" style="margin-top:16px">오픈채팅 주소가 없어요. 수락한 사람과 연락하려면 글 수정에서 주소를 넣어 주세요.</div>' : ''}
    </section>`;
  }

  async function edit() {
    const c = D.crew;
    const spaces = await SP.spaces();
    const m = SP.modal({
      title: '모집글 고치기', wide: true,
      body: `<form class="form-grid" id="ef">
        <div class="field full"><label class="label" for="e1">제목</label><input class="input" id="e1" name="title" maxlength="50" value="${esc(c.title)}"></div>
        <div class="field"><label class="label" for="e2">파티 날짜</label><input class="input" id="e2" name="d" type="date" min="${SP.today()}" value="${esc(c.d)}"></div>
        <div class="field"><label class="label" for="e3">시간</label><input class="input" id="e3" name="t" maxlength="20" value="${esc(c.t || '')}"></div>
        <div class="field"><label class="label" for="e4">지점</label><select class="select" id="e4" name="code">${SP.spaceOptions(spaces, c.code || '', '아직 안 정했어요')}</select></div>
        <div class="field"><label class="label" for="e5">모집 인원</label><input class="input" id="e5" name="need" type="number" min="${Math.max(1, c.accepted)}" max="30" value="${c.need}"></div>
        <div class="field"><label class="label" for="e6">1인 예상 비용</label><input class="input" id="e6" name="cost" maxlength="60" value="${esc(c.cost || '')}"></div>
        <div class="field"><label class="label" for="e7">이런 분이면 좋아요</label><input class="input" id="e7" name="cond" maxlength="200" value="${esc(c.cond || '')}"></div>
        <div class="field full"><label class="label" for="e8">하고 싶은 것</label><textarea class="textarea" id="e8" name="body" maxlength="2000">${esc(c.body)}</textarea></div>
        <div class="field full"><label class="label" for="e9">오픈채팅 주소</label><input class="input" id="e9" name="chat_url" value="${esc(c.chat_url || '')}" placeholder="https://open.kakao.com/..."></div>
      </form>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-ink" id="eGo">저장</button>',
    });
    m.$('#eGo').onclick = async () => {
      const f = SP.formData(m.$('#ef'));
      try { await SP.patch('/api/crews/' + id, { ...f, need: Number(f.need), code: f.code || null }); m.close(); SP.toast('저장했어요.'); load(); } catch (er) { SP.fail(er); }
    };
  }

  async function apply(e) {
    e.preventDefault();
    const me = await SP.needLogin('로그인하고 신청해 주세요.');
    if (!me) return;
    if (!me.adult) { SP.toast('만 19세 이상만 신청할 수 있어요.', true); return; }
    const msg = $('#apMsg').value.trim();
    if (!msg) { SP.toast('한 줄 소개를 적어 주세요.'); return; }
    try { await SP.post(`/api/crews/${id}/apply`, { msg }); SP.toast('신청했어요. 글쓴이에게 알림이 갔어요.'); load(); } catch (er) { SP.fail(er); }
  }

  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'cancel') {
        if (!(await SP.confirm('참여 신청을 취소할까요?', { ok: '취소하기', danger: true }))) return;
        try { await SP.post(`/api/crews/${id}/cancel`); load(); } catch (er) { SP.fail(er); }
      } else if (act === 'share') SP.share({ title: D.crew.title, text: `${SP.mdw(D.crew.d)} · ${D.crew.accepted}/${D.crew.need}명`, url: location.origin + '/t/' + id });
      else if (act === 'report') SP.report('crew', id);
      else if (act === 'edit') edit();
      else if (act === 'toggle') { try { await SP.patch('/api/crews/' + id, { status: D.crew.status === 'open' ? 'closed' : 'open' }); load(); } catch (er) { SP.fail(er); } }
      else if (act === 'del') {
        if (!(await SP.confirm('모집글을 지울까요? 신청한 사람에게 취소 알림이 가요.', { ok: '지우기', danger: true }))) return;
        try { await SP.del('/api/crews/' + id); location.href = '/crew'; } catch (er) { SP.fail(er); }
      }
      return;
    }
    const ap = e.target.closest('[data-app]');
    if (ap) { try { await SP.post(`/api/crews/${id}/apps/${ap.dataset.uid}`, { action: ap.dataset.app }); load(); } catch (er) { SP.fail(er); } }
  });
  load();
})();
