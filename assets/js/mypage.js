/* 마이 — 알림, 내 활동, 계정 설정 */
(function () {
  const { $, $$, esc, icon } = SP;
  const TIER = { welcome: '웰컴', silver: '실버', gold: '골드' };
  const AVATARS = ['🎉', '🎈', '🥳', '🎂', '🍰', '🍕', '🍻', '🎤', '🎲', '🎮', '🌙', '⭐', '🐶', '🐱', '🦊', '🐻', '🐰', '🌷', '🍀', '🔥'];
  let me = null, info = null;
  const loaded = {};

  /* ---------------- 머리 ---------------- */
  function head() {
    const t = info.tier || { tier: 'welcome', n: 0 };
    const joined = me.created_at ? new Date(Date.parse(me.created_at) + 9 * 3600e3).toISOString().slice(0, 10) : '';
    const since = !joined ? '' : joined === SP.today() ? '오늘' : joined.replace(/-/g, '.');
    $('#meHead').innerHTML = `${SP.avatar(me.avatar, 'lg')}
      <div class="grow"><h1>${esc(me.nick)}</h1>
        <div class="row wrap-ok small muted" style="gap:8px;margin-top:4px"><span class="badge ${t.tier === 'gold' ? 'sun' : t.tier === 'silver' ? 'moon' : 'mute'}">쏘플 클럽 ${TIER[t.tier]}</span>${me.region ? `<span>${esc(me.region)}</span>` : ''}${since ? `<span>${esc(since)} 가입</span>` : ''}</div>
        ${me.intro ? `<p class="small" style="margin-top:6px">${esc(me.intro)}</p>` : ''}</div>
      <div class="row wrap-ok">${me.admin ? `<a class="btn btn-soft btn-sm" href="/admin">${icon('sliders', 'sm')}관리자 화면</a>` : ''}${(me.hostCodes || []).length ? `<a class="btn btn-red btn-sm" href="/myspace">${icon('key', 'sm')}내 공간 관리</a>` : ''}<button class="btn btn-line btn-sm" type="button" data-go-tab="account">${icon('edit', 'sm')}프로필 고치기</button></div>`;
    const next = t.tier === 'gold' ? '가장 높은 등급이에요' : `${t.tier === 'welcome' ? '실버' : '골드'}까지 ${t.toNext}번`;
    $('#meQuick').innerHTML = `
      <a class="mq" href="/membership"><span class="mq-k">방문 인증</span><b>${t.n}번</b><small>${esc(next)}</small></a>
      <button class="mq" type="button" data-go-tab="noti"><span class="mq-k">안 읽은 알림</span><b>${info.unread || 0}개</b><small>모임·파티팀·행사 소식</small></button>
      <a class="mq" href="/invite"><span class="mq-k">초대장</span><b>${icon('send')}</b><small>링크 하나로 참석 받기</small></a>
      <a class="mq" href="/rooms"><span class="mq-k">지점 찾기</span><b>${icon('search')}</b><small>날짜만 고르면 돼요</small></a>
      <div class="how-links me-links"><a href="/planner">준비물 · N빵</a><a href="/games">파티게임</a><a href="/play">팀 나누기 · 룰렛</a><a href="/write?b=review">후기 쓰기</a><a href="/community?b=qna">지점 문의</a><a href="/magazine">파티 가이드</a></div>`;
    $('#meQuick').hidden = false;
  }

  /* ---------------- 탭 ---------------- */
  function show(tab) {
    if (!['noti', 'act', 'account'].includes(tab)) tab = 'noti';
    $$('#meTabs [data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    if (location.hash.replace('#', '').split('-')[0] !== tab) history.replaceState(null, '', '#' + tab);
    if (tab === 'noti' && !loaded.noti) notis();
    if (tab === 'act' && !loaded.act) { const a = (location.hash.split('-')[1]) || 'posts'; act(a); }
    if (tab === 'account' && !loaded.account) account();
  }

  /* ---------------- 알림 ---------------- */
  const NK = { meetup: 'users', crew: 'flag', event: 'ticket', club: 'badge', anniv: 'cake', comment: 'chat', like: 'heart', invite: 'send', system: 'info', report: 'alert' };
  async function notis() {
    loaded.noti = true;
    const el = $('#notiList');
    el.innerHTML = '<div class="skel" style="height:64px"></div><div class="skel" style="height:64px;margin-top:8px"></div>';
    try {
      const d = await SP.get('/api/me/notis');
      el.innerHTML = d.items.length
        ? d.items.map((n) => `<a class="noti-row${n.read ? '' : ' unread'}" href="${esc(n.link || '#')}" data-id="${n.id}"><span class="noti-ic">${icon(NK[n.kind] || 'bell', 'sm')}</span><span class="grow">${esc(n.text)}<time>${SP.ago(n.created_at)}</time></span></a>`).join('')
        : `<div class="empty">${icon('bell')}<h3>아직 알림이 없어요</h3><p>모임 가입, 파티팀 수락, 행사 확정, 방문 인증 결과를 여기서 알려 드려요.</p></div>`;
    } catch (e) { el.innerHTML = `<div class="empty"><h3>알림을 불러오지 못했어요</h3><p>${esc(e.message)}</p></div>`; }
  }
  $('#notiList').addEventListener('click', (e) => {
    const a = e.target.closest('.noti-row[data-id]');
    if (!a) return;
    if (a.classList.contains('unread')) SP.post('/api/me/notis/read', { id: Number(a.dataset.id) }).catch(() => {});
    if (a.getAttribute('href') === '#') e.preventDefault();
  });
  $('#readAll').addEventListener('click', async () => {
    try {
      await SP.post('/api/me/notis/read', {});
      $$('.noti-row.unread').forEach((x) => x.classList.remove('unread'));
      const dot = $('#bellBtn .dot'); if (dot) dot.remove();
      info.unread = 0; head();
      SP.toast('모두 읽음으로 바꿨어요.');
    } catch (e) { SP.fail(e); }
  });

  /* ---------------- 내 활동 ---------------- */
  const EMPTY = {
    posts: ['edit', '아직 쓴 글이 없어요', '다녀온 지점 후기나 파티 꿀팁을 나눠 주세요.', '/write', '글쓰기'],
    bookmarks: ['bookmark', '저장한 글이 없어요', '마음에 드는 글에서 저장 버튼을 누르면 여기 모여요.', '/community', '커뮤니티 둘러보기'],
    comments: ['chat', '아직 단 댓글이 없어요', '궁금한 글에 댓글로 물어보세요.', '/community', '커뮤니티 둘러보기'],
    meetups: ['users', '들어간 모임이 없어요', '좋아하는 걸 같이 할 사람들을 찾아보세요.', '/meetups', '모임 둘러보기'],
    crews: ['flag', '파티팀 기록이 없어요', '같이 빌리면 1인 비용이 확 줄어요.', '/crew', '파티팀 보러 가기'],
    events: ['ticket', '신청한 행사가 없어요', '쏘플이 여는 파티와 원데이 클래스를 확인해 보세요.', '/event', '행사 보기'],
    invites: ['send', '만든 초대장이 없어요', '날짜와 장소를 넣으면 링크 하나로 참석 여부를 모을 수 있어요.', '/invite', '초대장 만들기'],
  };
  const empty = (k) => { const [ic, h, p, href, btn] = EMPTY[k]; return `<div class="empty">${icon(ic)}<h3>${h}</h3><p>${p}</p><a class="btn btn-ink" href="${href}">${btn}</a></div>`; };
  const ROLE = { owner: ['red', '모임장'], staff: ['ink', '운영진'], member: ['mute', '멤버'] };
  const APP = { pending: ['warn', '수락 기다리는 중'], accepted: ['ok', '함께해요'], rejected: ['mute', '이번엔 어려워요'] };
  const RSVP = { going: ['ok', '참가 확정'], wait: ['warn', '대기 중'] };
  const PROP = { pending: ['warn', '검토 중'], open: ['ok', '공개됨'], closed: ['mute', '신청 마감'], rejected: ['mute', '이번엔 보류'], hidden: ['mute', '가려짐'], draft: ['mute', '준비 중'], done: ['mute', '지난 행사'] };
  const bdg = (m, k) => (m[k] ? `<span class="badge ${m[k][0]}">${m[k][1]}</span>` : '');

  async function act(k) {
    if (!EMPTY[k]) k = 'posts';
    loaded.act = true;
    $$('#actTabs [data-a]').forEach((b) => b.classList.toggle('on', b.dataset.a === k));
    history.replaceState(null, '', '#act-' + k);
    const el = $('#actBody');
    el.innerHTML = '<div class="skel" style="height:90px"></div><div class="skel" style="height:90px;margin-top:10px"></div>';
    try {
      const d = await SP.get('/api/me/activity?tab=' + k);
      let h = '';
      if (k === 'posts' || k === 'bookmarks') {
        h = d.items.length ? `<div class="posts">${d.items.map(SP.postRow).join('')}</div>` : empty(k);
      } else if (k === 'comments') {
        h = d.items.length ? `<div class="list-plain">${d.items.map((c) => `<a href="/c/${c.post_id}#cmt-${c.id}"><span style="min-width:0"><span class="clamp2">${esc(c.body)}</span><span class="tiny muted">${esc(c.title)} · ${SP.ago(c.created_at)}</span></span>${icon('chev-r', 'sm')}</a>`).join('')}</div>` : empty(k);
      } else if (k === 'meetups') {
        h = d.items.length ? `<div class="list-plain">${d.items.map((m) => `<a href="/m/${m.id}"><span class="row" style="min-width:0">${m.cover ? `<span class="thumb"><img src="${esc(m.cover)}" alt="" loading="lazy"></span>` : `<span class="thumb word">${esc((m.cat || '모임').slice(0, 2))}</span>`}<span style="min-width:0"><b class="clamp2">${esc(m.title)}</b><span class="tiny muted">${esc(m.cat)} · ${esc(m.region)} · ${m.members}/${m.cap}명</span></span></span><span class="row">${m.status === 'pending' ? '<span class="badge warn">승인 기다리는 중</span>' : bdg(ROLE, m.role)}</span></a>`).join('')}</div>` : empty(k);
      } else if (k === 'crews') {
        const row = (c, badge) => `<a href="/t/${c.id}"><span style="min-width:0"><b class="clamp2">${esc(c.title)}</b><span class="tiny muted">${SP.mdw(c.d)}${c.t ? ' ' + esc(c.t) : ''} · ${esc(c.spaceName || '지점 미정')} · ${c.accepted}/${c.need}명</span></span><span class="row">${c.done ? '<span class="badge mute">지난 파티</span>' : badge}</span></a>`;
        const mine = d.mine.map((c) => row(c, c.status === 'closed' ? '<span class="badge mute">모집 완료</span>' : '<span class="badge red">모집 중</span>')).join('');
        const app = d.applied.map((c) => row(c, bdg(APP, c.app))).join('');
        h = mine || app
          ? `${mine ? `<h3 class="h4">내가 모집한 파티팀</h3><div class="list-plain" style="margin:6px 0 24px">${mine}</div>` : ''}${app ? `<h3 class="h4">함께하겠다고 한 파티팀</h3><div class="list-plain" style="margin-top:6px">${app}</div>` : ''}`
          : empty(k);
      } else if (k === 'events') {
        const ev = d.items.map((e) => `<a href="/e/${e.id}"><span style="min-width:0"><b class="clamp2">${esc(e.title)}</b><span class="tiny muted">${SP.mdw(e.d)}${e.t1 ? ' ' + SP.hm(e.t1) : ''} · ${esc(e.spaceName || e.place || '')}${e.n > 1 ? ` · ${e.n}명` : ''}</span></span><span class="row">${e.done ? '<span class="badge mute">지난 행사</span>' : bdg(RSVP, e.status)}</span></a>`).join('');
        const pr = (d.proposed || []).map((e) => `<a href="/e/${e.id}"><span style="min-width:0"><b class="clamp2">${esc(e.title)}</b><span class="tiny muted">${e.d ? SP.mdw(e.d) : '날짜 미정'}</span></span>${bdg(PROP, e.status)}</a>`).join('');
        h = ev || pr
          ? `${ev ? `<h3 class="h4">신청한 행사</h3><div class="list-plain" style="margin:6px 0 24px">${ev}</div>` : ''}${pr ? `<h3 class="h4">내가 제안한 행사</h3><div class="list-plain" style="margin-top:6px">${pr}</div>` : ''}`
          : empty(k);
      } else if (k === 'invites') {
        h = d.items.length ? `<div class="list-plain">${d.items.map((i) => `<div><a href="/i/${i.id}" style="min-width:0;flex:1"><b class="clamp2">${esc(i.title)}</b><span class="tiny muted">${i.d ? SP.mdw(i.d) : '날짜 미정'}${i.spaceName ? ' · ' + esc(i.spaceName) : ''} · 온대요 ${i.yes}명 · 응답 ${i.replies}</span></a><span class="row"><button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(i.id)}">${icon('link', 'sm')}링크</button><a class="btn btn-ghost btn-sm" href="/invite?edit=${esc(i.id)}">고치기</a></span></div>`).join('')}</div>` : empty(k);
      }
      el.innerHTML = h;
    } catch (e) { el.innerHTML = `<div class="empty"><h3>불러오지 못했어요</h3><p>${esc(e.message)}</p></div>`; }
  }
  $('#actTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a); });
  $('#actBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) SP.copy(location.origin + '/i/' + b.dataset.copy, '초대장 링크를 복사했어요.');
  });

  /* ---------------- 계정 설정 ---------------- */
  function account() {
    loaded.account = true;
    let av = me.avatar || AVATARS[0];
    const pick = $('#avPick');
    const drawPick = () => { pick.innerHTML = AVATARS.map((a) => `<button type="button" class="${a === av ? 'on' : ''}" data-av="${a}" aria-label="프로필 그림 ${a}" aria-pressed="${a === av}">${a}</button>`).join(''); };
    drawPick();
    pick.addEventListener('click', (e) => { const b = e.target.closest('[data-av]'); if (!b) return; av = b.dataset.av; drawPick(); });
    $('#pRegion').innerHTML = '<option value="">고르지 않음</option>' + SP.REGIONS.map((r) => `<option${r === me.region ? ' selected' : ''}>${r}</option>`).join('');
    $('#pNick').value = me.nick;
    $('#pIntro').value = me.intro || '';
    $('#mkSwitch').checked = !!me.marketing;

    const nickHelp = $('#pNickHelp');
    const checkNick = SP.debounce(async () => {
      const v = $('#pNick').value.trim();
      if (v === me.nick) { nickHelp.textContent = '한글·영문·숫자 2~12자'; nickHelp.className = 'help'; return; }
      if (!/^[가-힣a-zA-Z0-9_]{2,12}$/.test(v)) { nickHelp.textContent = '한글·영문·숫자 2~12자로 정해 주세요.'; nickHelp.className = 'err'; return; }
      try { const r = await SP.get('/api/account/check?nick=' + encodeURIComponent(v)); nickHelp.textContent = r.available ? '쓸 수 있는 닉네임이에요.' : '이미 쓰고 있는 닉네임이에요.'; nickHelp.className = r.available ? 'help' : 'err'; } catch { /* 무시 */ }
    }, 350);
    $('#pNick').addEventListener('input', checkNick);

    $('#profForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#pErr'); err.hidden = true;
      const btn = e.submitter || $('#profForm button[type=submit]');
      SP.busy(btn, true, '저장하는 중…');
      try {
        await SP.patch('/api/me', { nick: $('#pNick').value.trim(), region: $('#pRegion').value, intro: $('#pIntro').value.trim(), avatar: av });
        const fresh = await SP.me(true);
        me = fresh.user; info = fresh;
        head();
        const hu = $('#hdUser'); if (hu) hu.innerHTML = `<a class="hd-user" href="/mypage">${SP.avatar(me.avatar, 'sm')}<span>${esc(me.nick)}</span></a>`;
        SP.toast('프로필을 저장했어요.');
      } catch (er) { err.textContent = er.message; err.hidden = false; }
      SP.busy(btn, false);
    });

    $('#mkSwitch').addEventListener('change', async (e) => {
      const on = e.target.checked;
      try { await SP.patch('/api/me', { marketing: on }); me.marketing = on; SP.toast(on ? '소식 받기를 켰어요.' : '소식 받기를 껐어요.'); }
      catch (er) { e.target.checked = !on; SP.fail(er); }
    });

    $('#pwGo').addEventListener('click', async () => {
      const err = $('#pwErr'); err.hidden = true;
      const o = $('#pwOld').value, n = $('#pwNew').value, n2 = $('#pwNew2').value;
      const bad = !o ? '지금 비밀번호를 넣어 주세요.' : n.length < 8 || !/[A-Za-z]/.test(n) || !/\d/.test(n) ? '새 비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.' : n !== n2 ? '새 비밀번호 두 칸이 서로 달라요.' : n === o ? '지금과 다른 비밀번호로 정해 주세요.' : '';
      if (bad) { err.textContent = bad; err.hidden = false; return; }
      const btn = $('#pwGo');
      SP.busy(btn, true, '바꾸는 중…');
      try { await SP.post('/api/me/password', { old: o, pw: n }); $('#pwOld').value = $('#pwNew').value = $('#pwNew2').value = ''; SP.toast('비밀번호를 바꿨어요.'); }
      catch (er) { err.textContent = er.message; err.hidden = false; }
      SP.busy(btn, false);
    });

    const birth = me.birth ? `${me.birth.slice(0, 4)}년 ${Number(me.birth.slice(5, 7))}월 ${Number(me.birth.slice(8, 10))}일` : '-';
    $('#joinInfo').innerHTML = `<dt>이메일</dt><dd>${esc(me.email)}</dd><dt>생년월일</dt><dd>${esc(birth)}${me.adult ? '' : ' <span class="tiny muted">(모임·파티팀·성인 행사는 만 19세부터)</span>'}</dd><dt>가입일</dt><dd>${me.created_at ? esc(me.created_at.slice(0, 10).replace(/-/g, '.')) : '-'}</dd>`;

    $('#leaveBtn').addEventListener('click', leave);
  }

  function leave() {
    const m = SP.modal({
      title: '회원 탈퇴',
      body: `<div class="callout warn">${icon('alert')}<div>탈퇴하면 쏘플 클럽 등급과 방문 기록, 배지, 기념일이 모두 사라지고 되돌릴 수 없어요. 쓴 글과 댓글은 지워지지 않고 '탈퇴한 회원'으로 남아요. 지우고 싶은 글은 탈퇴 전에 먼저 지워 주세요.</div></div>
        <p class="small muted" style="margin-top:14px">네이버 예약 내역은 쏘플 회원 탈퇴와 상관없이 네이버에 남아요.</p>
        <div class="field" style="margin-top:16px"><label class="label" for="lvPw">비밀번호 확인</label><input class="input" id="lvPw" type="password" autocomplete="current-password"></div>
        <label class="check" style="margin-top:14px"><input type="checkbox" id="lvOk"><span>위 내용을 확인했고 탈퇴할게요.</span></label>
        <div class="form-err" id="lvErr" hidden></div>`,
      foot: '<button class="btn btn-soft" data-x>그만두기</button><button class="btn btn-red" id="lvGo">탈퇴하기</button>',
    });
    m.$('#lvGo').onclick = async () => {
      const err = m.$('#lvErr');
      if (!m.$('#lvOk').checked) { err.textContent = '안내를 확인했다고 체크해 주세요.'; err.hidden = false; return; }
      try {
        await SP.post('/api/me/leave', { pw: m.$('#lvPw').value });
        try { sessionStorage.clear(); } catch { /* 무시 */ }
        m.close();
        SP.toast('탈퇴가 끝났어요. 그동안 고마웠어요.');
        setTimeout(() => { location.href = '/'; }, 900);
      } catch (e) { err.textContent = e.message; err.hidden = false; }
    };
  }

  /* ---------------- 시작 ---------------- */
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-go-tab]'); if (!b) return; show(b.dataset.goTab); window.scrollTo({ top: $('#meTabs').offsetTop - 80, behavior: 'smooth' }); });
  $('#meTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
  window.addEventListener('hashchange', () => show(location.hash.replace('#', '').split('-')[0]));

  (async function init() {
    info = await SP.me(true);
    me = info.user;
    if (!me) { location.replace('/login?next=' + encodeURIComponent('/mypage' + location.hash)); return; }
    head();
    show((location.hash.replace('#', '').split('-')[0]) || 'noti');
  })();
})();
