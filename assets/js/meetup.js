/* 모임 상세 — 가입, 정모 일정·참석, 멤버 관리, 멤버 게시판 */
(function () {
  const { $, $$, esc, icon } = SP;
  const id = Number((location.pathname.match(/\/m\/(\d+)/) || [])[1] || SP.qs().id);
  let D = null, tab = location.hash.replace('#', '') || 'about';
  if (!['about', 'plans', 'members', 'board'].includes(tab)) tab = 'about';

  async function load() {
    if (!id) return notFound();
    try { D = await SP.api('/api/meetups/' + id, { loginRedirect: false }); } catch (e) { return notFound(e.message); }
    document.title = `${D.meetup.title} | 쏘플파티룸 모임`;
    render();
  }
  function notFound(msg) {
    $('#mtRoot').innerHTML = `<div class="empty" style="margin-top:40px">${icon('users')}<h3>모임을 찾을 수 없어요</h3><p>${esc(msg || '')}</p><a class="btn btn-ink" href="/meetups">모임 목록</a></div>`;
  }

  function actionBtns() {
    const me = D.me, m = D.meetup;
    if (me.owner) return `<button class="btn btn-line" type="button" data-act="edit">${icon('edit', 'sm')}모임 정보 고치기</button>`;
    if (me.joined) return `<button class="btn btn-soft" type="button" data-act="leave">모임 나가기</button>`;
    if (me.status === 'pending') return `<button class="btn btn-soft" type="button" data-act="leave">가입 신청 취소</button>`;
    if (m.status !== 'active') return '<span class="badge mute">지금은 가입을 받지 않아요</span>';
    if (m.members >= m.cap) return '<span class="badge mute">정원이 찼어요</span>';
    return `<button class="btn btn-red" type="button" data-act="join">${m.join_mode === 'open' ? '모임 가입하기' : '가입 신청하기'}</button>`;
  }

  function render() {
    const m = D.meetup;
    $('#mtRoot').innerHTML = `
      <nav class="crumb"><a href="/meetups">모임</a>${icon('chev-r', 'sm')}<span>${esc(m.cat)}</span></nav>
      <div class="meet-cover" style="border-radius:22px;aspect-ratio:16/6">${m.cover ? `<img src="${esc(m.cover)}" alt="">` : `<div class="cover-art" aria-hidden="true" style="--ca:url('/assets/img/photo/${({ 보드게임: 'game-lounge-2', 와인: 'party-table', 영화: 'theater', 파티: 'birthday-2', 운동: 'rooftop', 음악: 'neon-night', 사진: 'photowall', 스터디: 'workshop' })[m.cat] || 'welcome'}.webp')"><span class="ca-area" style="font-size:54px">${esc(m.cat)}</span></div>`}</div>
      <div class="between" style="margin-top:20px;align-items:flex-end;flex-wrap:wrap">
        <div><div class="row wrap-ok"><span class="badge ink">${esc(m.cat)}</span><span class="badge mute">${esc(m.region)}</span><span class="badge mute">${m.join_mode === 'open' ? '바로 가입' : '승인 후 가입'}</span>${m.status === 'closed' ? '<span class="badge warn">모집 닫힘</span>' : ''}</div>
          <h1 class="h1" style="margin-top:10px">${esc(m.title)}</h1>
          <div class="row muted small" style="margin-top:8px;gap:14px">${SP.avatar(m.owner.avatar, 'sm')}<span>모임장 ${esc(m.owner.nick)}</span><span>${icon('users', 'sm')} ${m.members}/${m.cap}명</span></div></div>
        <div class="row wrap-ok">${actionBtns()}<button class="btn btn-ghost btn-sm" type="button" data-act="share">${icon('share', 'sm')}공유</button>${!D.me.owner ? `<button class="btn btn-ghost btn-sm" type="button" data-act="report">${icon('flag', 'sm')}신고</button>` : ''}</div>
      </div>
      ${D.me.status === 'pending' ? '<div class="callout warn" style="margin-top:16px">가입 신청을 보냈어요. 모임장이 승인하면 알림으로 알려 드려요.</div>' : ''}
      <div class="tabs" style="margin-top:26px" role="tablist">
        <button type="button" data-tab="about">소개</button>
        <button type="button" data-tab="plans">정모 일정 <span class="faint">${D.plans.filter((p) => !p.past).length}</span></button>
        <button type="button" data-tab="members">멤버 <span class="faint">${D.members.length}</span>${D.me.manage && D.pendingCount ? ` <span class="badge red">${D.pendingCount}</span>` : ''}</button>
        <button type="button" data-tab="board">멤버 게시판</button>
      </div>
      <div id="tabBody" style="padding-top:22px"></div>`;
    drawTab();
  }

  function drawTab() {
    $$('.tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    history.replaceState(null, '', '#' + tab);
    const m = D.meetup, me = D.me, el = $('#tabBody');
    if (tab === 'about') {
      el.innerHTML = `<div class="prose prewrap">${esc(m.intro)}</div>
        ${m.rules ? `<div class="box fog" style="margin-top:22px"><h2 class="h4">모임 규칙</h2><div class="prose prewrap small" style="margin-top:6px">${esc(m.rules)}</div></div>` : ''}
        ${m.hasChat ? (m.chat_url ? `<a class="btn btn-kakao" style="margin-top:20px" href="${esc(m.chat_url)}" target="_blank" rel="noopener">${icon('kakao', 'fill')}오픈채팅 들어가기</a>` : '<p class="small muted" style="margin-top:18px">오픈채팅 주소는 멤버가 되면 보여요.</p>') : ''}`;
    } else if (tab === 'plans') {
      const up = D.plans.filter((p) => !p.past), past = D.plans.filter((p) => p.past);
      el.innerHTML = `${me.manage ? `<button class="btn btn-ink btn-sm" type="button" data-act="plan">${icon('plus', 'sm')}일정 추가</button>` : ''}
        <div class="stack" style="margin-top:14px">${up.length ? up.map(planRow).join('') : '<div class="empty" style="padding:30px">아직 잡힌 정모가 없어요.</div>'}</div>
        ${past.length ? `<h3 class="h4" style="margin-top:28px;color:var(--graphite)">지난 일정</h3><div class="stack" style="margin-top:10px">${past.map(planRow).join('')}</div>` : ''}`;
    } else if (tab === 'members') {
      el.innerHTML = `${me.manage && D.pending.length ? `<div class="box" style="margin-bottom:20px"><h2 class="h4">가입 신청 ${D.pending.length}명</h2><div class="list-plain" style="margin-top:8px">${D.pending.map((p) => `<div><div class="row">${SP.avatar(p.avatar, 'sm')}<div><b>${esc(p.nick)}</b>${p.intro ? `<div class="tiny faint">${esc(p.intro)}</div>` : ''}<div class="small muted">${esc(p.msg || '인사말 없음')}</div></div></div><div class="row"><button class="btn btn-ink btn-sm" type="button" data-mem="approve" data-uid="${p.id}">승인</button><button class="btn btn-soft btn-sm" type="button" data-mem="reject" data-uid="${p.id}">거절</button></div></div>`).join('')}</div></div>` : ''}
        <div class="list-plain">${D.members.map((x) => `<div><div class="row">${SP.avatar(x.avatar, 'sm')}<b>${esc(x.nick)}</b>${x.role === 'owner' ? '<span class="badge red">모임장</span>' : x.role === 'staff' ? '<span class="badge ink">운영진</span>' : ''}</div>${me.owner && x.role !== 'owner' ? `<div class="row"><button class="btn btn-ghost btn-sm" type="button" data-mem="${x.role === 'staff' ? 'unstaff' : 'staff'}" data-uid="${x.id}">${x.role === 'staff' ? '운영진 해제' : '운영진 지정'}</button><button class="btn btn-ghost btn-sm" type="button" data-mem="kick" data-uid="${x.id}">내보내기</button></div>` : ''}</div>`).join('')}</div>`;
    } else if (tab === 'board') {
      if (!me.joined && !me.owner) { el.innerHTML = `<div class="empty">${icon('lock')}<h3>멤버만 볼 수 있어요</h3><p>모임에 들어오면 멤버끼리 글을 나눌 수 있어요.</p></div>`; return; }
      el.innerHTML = `<div class="between"><h2 class="h4">멤버 게시판</h2><a class="btn btn-ink btn-sm" href="/write?b=mb&scope=${id}">${icon('edit', 'sm')}글쓰기</a></div><div id="mbList" style="margin-top:6px"><div class="skel" style="height:80px;margin-top:10px"></div></div>`;
      SP.get(`/api/posts?board=mb&scope=${id}&size=30`).then((d) => {
        $('#mbList').innerHTML = d.items.length ? d.items.map(SP.postRow).join('') : '<p class="muted small" style="padding:18px 0">첫 글을 남겨 보세요. 정모 후기, 다음에 할 게임 추천 같은 거요.</p>';
      }).catch((e) => { $('#mbList').innerHTML = `<p class="muted small">${esc(e.message)}</p>`; });
    }
  }

  function planRow(p) {
    const can = D.me.joined && !p.past;
    const opts = [['yes', '갈게요'], ['maybe', '아직 몰라요'], ['no', '못 가요']];
    return `<div class="box" style="padding:16px 18px">
      <div class="between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div><div class="row wrap-ok"><b style="font-size:16.5px">${esc(p.title)}</b>${p.past ? '<span class="badge mute">지난 일정</span>' : ''}</div>
          <div class="post-meta" style="margin-top:6px;font-size:14px;color:var(--graphite)"><span>${icon('calendar', 'sm')}${SP.mdwLong(p.d)}${p.t ? ' ' + esc(p.t) : ''}</span>${p.spaceName ? `<span>${icon('pin', 'sm')}<a class="link" href="/room/${p.code}?date=${p.d}">${esc(p.spaceName)}</a></span>` : p.place ? `<span>${icon('pin', 'sm')}${esc(p.place)}</span>` : ''}<span>${icon('users', 'sm')}${p.yes}명 참석${p.cap ? ` / ${p.cap}명` : ''}</span></div>
          ${p.memo ? `<p class="small muted prewrap" style="margin-top:8px">${esc(p.memo)}</p>` : ''}</div>
        ${D.me.manage ? `<button class="btn btn-ghost btn-sm" type="button" data-pdel="${p.id}">${icon('trash', 'sm')}</button>` : ''}
      </div>
      ${can ? `<div class="chips" style="margin-top:12px">${opts.map(([v, l]) => `<button type="button" class="chip${p.mine === v ? ' on' : ''}" data-rsvp="${v}" data-pid="${p.id}">${l}</button>`).join('')}</div>` : ''}
    </div>`;
  }

  async function join() {
    const me = await SP.needLogin('로그인하고 가입해 주세요.');
    if (!me) return;
    if (!me.adult) { SP.toast('모임은 만 19세 이상 회원만 들어갈 수 있어요.', true); return; }
    const md = SP.modal({
      title: D.meetup.join_mode === 'open' ? '모임 가입하기' : '가입 신청하기',
      body: `<label class="label" for="jMsg">가입 인사 <span class="opt">선택</span></label><textarea class="textarea" id="jMsg" maxlength="200" style="min-height:90px" placeholder="간단한 자기소개나 인사를 남겨 주세요."></textarea>${D.meetup.rules ? `<div class="box fog small" style="margin-top:12px"><b>모임 규칙</b><div class="prewrap muted" style="margin-top:4px">${esc(D.meetup.rules)}</div></div>` : ''}`,
      foot: `<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" id="jGo">${D.meetup.join_mode === 'open' ? '가입하기' : '신청 보내기'}</button>`,
    });
    md.$('#jGo').onclick = async () => {
      try { const r = await SP.post(`/api/meetups/${id}/join`, { msg: md.$('#jMsg').value.trim() }); md.close(); SP.toast(r.status === 'joined' ? '모임에 들어왔어요!' : '가입 신청을 보냈어요.'); load(); } catch (e) { SP.fail(e); }
    };
  }

  async function addPlan() {
    const spaces = await SP.spaces();
    const md = SP.modal({
      title: '정모 일정 추가',
      body: `<form class="form-grid" id="pf">
        <div class="field full"><label class="label" for="p1">일정 이름</label><input class="input" id="p1" name="title" maxlength="40" placeholder="예) 10월 정모"></div>
        <div class="field"><label class="label" for="p2">날짜</label><input class="input" id="p2" name="d" type="date" min="${SP.today()}"></div>
        <div class="field"><label class="label" for="p3">시간</label><input class="input" id="p3" name="t" maxlength="20" placeholder="예) 19:00 또는 밤 패키지"></div>
        <div class="field full"><label class="label" for="p4">쏘플 지점</label><select class="select" id="p4" name="code">${SP.spaceOptions(spaces, '', '지점이 아닌 곳에서 만나요')}</select></div>
        <div class="field full"><label class="label" for="p5">다른 장소 <span class="opt">지점이 아니라면</span></label><input class="input" id="p5" name="place" maxlength="60"></div>
        <div class="field"><label class="label" for="p6">정원 <span class="opt">선택</span></label><input class="input" id="p6" name="cap" type="number" min="1" max="300"></div>
        <div class="field full"><label class="label" for="p7">메모 <span class="opt">멤버에게만 보여요</span></label><textarea class="textarea" id="p7" name="memo" maxlength="500" style="min-height:80px" placeholder="회비, 준비물, 만나는 곳 등"></textarea></div>
      </form><p class="tiny faint" style="margin-top:8px">지점은 일정을 만든 뒤 네이버 예약으로 직접 잡아 주세요. 지점 이름을 누르면 그날 빈 방을 볼 수 있어요.</p>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" id="pGo">일정 올리기</button>',
    });
    md.$('#pGo').onclick = async () => {
      const f = SP.formData(md.$('#pf'));
      if (!f.title || !f.d) { SP.toast('일정 이름과 날짜를 적어 주세요.', true); return; }
      try { await SP.post(`/api/meetups/${id}/plans`, { ...f, cap: f.cap ? Number(f.cap) : null, code: f.code || null }); md.close(); SP.toast('일정을 올렸어요. 멤버에게 알림이 갔어요.'); tab = 'plans'; load(); } catch (e) { SP.fail(e); }
    };
  }

  function edit() {
    const m = D.meetup;
    const md = SP.modal({
      title: '모임 정보 고치기', wide: true,
      body: `<form class="form-grid" id="ef">
        <div class="field full"><label class="label" for="e1">모임 이름</label><input class="input" id="e1" name="title" maxlength="40" value="${esc(m.title)}"></div>
        <div class="field full"><label class="label" for="e2">소개</label><textarea class="textarea" id="e2" name="intro" maxlength="2000">${esc(m.intro)}</textarea></div>
        <div class="field full"><label class="label" for="e3">규칙</label><textarea class="textarea" id="e3" name="rules" maxlength="800" style="min-height:90px">${esc(m.rules || '')}</textarea></div>
        <div class="field"><label class="label" for="e4">정원</label><input class="input" id="e4" name="cap" type="number" min="${m.members}" max="300" value="${m.cap}"></div>
        <div class="field"><label class="label" for="e5">가입 방식</label><select class="select" id="e5" name="join_mode"><option value="approve"${m.join_mode === 'approve' ? ' selected' : ''}>승인 후 가입</option><option value="open"${m.join_mode === 'open' ? ' selected' : ''}>바로 가입</option></select></div>
        <div class="field full"><label class="label" for="e6">오픈채팅 주소</label><input class="input" id="e6" name="chat_url" value="${esc(m.chat_url || '')}" placeholder="https://open.kakao.com/..."></div>
        <div class="field full"><label class="label" for="e7">모집 상태</label><select class="select" id="e7" name="status"><option value="active"${m.status === 'active' ? ' selected' : ''}>모집 중</option><option value="closed"${m.status === 'closed' ? ' selected' : ''}>모집 닫기</option></select></div>
      </form>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-ink" id="eGo">저장</button>',
    });
    md.$('#eGo').onclick = async () => {
      const f = SP.formData(md.$('#ef'));
      try { await SP.patch('/api/meetups/' + id, { ...f, cap: Number(f.cap) }); md.close(); SP.toast('저장했어요.'); load(); } catch (e) { SP.fail(e); }
    };
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; drawTab(); return; }
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'join') join();
      else if (act === 'leave') {
        if (!(await SP.confirm(D.me.status === 'pending' ? '가입 신청을 취소할까요?' : '모임에서 나갈까요?', { ok: '확인', danger: true }))) return;
        try { await SP.post(`/api/meetups/${id}/leave`); load(); } catch (er) { SP.fail(er); }
      } else if (act === 'plan') addPlan();
      else if (act === 'edit') edit();
      else if (act === 'share') SP.share({ title: D.meetup.title, text: `${D.meetup.cat} 모임 · ${D.meetup.region}`, url: location.origin + '/m/' + id });
      else if (act === 'report') SP.report('meetup', id);
      return;
    }
    const mem = e.target.closest('[data-mem]');
    if (mem) {
      if (mem.dataset.mem === 'kick' && !(await SP.confirm('이 멤버를 내보낼까요? 다시 가입할 수 없게 돼요.', { ok: '내보내기', danger: true }))) return;
      try { await SP.post(`/api/meetups/${id}/members/${mem.dataset.uid}`, { action: mem.dataset.mem }); load(); } catch (er) { SP.fail(er); }
      return;
    }
    const rv = e.target.closest('[data-rsvp]');
    if (rv) { try { await SP.post(`/api/plans/${rv.dataset.pid}/rsvp`, { status: rv.dataset.rsvp }); load(); } catch (er) { SP.fail(er); } return; }
    const pd = e.target.closest('[data-pdel]');
    if (pd) {
      if (!(await SP.confirm('이 일정을 지울까요?', { ok: '지우기', danger: true }))) return;
      try { await SP.del('/api/plans/' + pd.dataset.pdel); load(); } catch (er) { SP.fail(er); }
    }
  });
  load();
})();
