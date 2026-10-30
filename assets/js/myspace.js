/* 호스트센터 · 내 공간 관리
   공간 등록 신청(6단계) · 운영 중인 지점 연결 요청 · 신청 현황 · 결제·노출 기간 안내
   손님 문의 바로 답하기 · 지점 소식 · 소개·사진·시설·비품·이용 안내·SNS 후기·요금·예약 방식·사업자 정보 고치기
   성과 보기(조회·예약 버튼) · 마감·휴무 표시 · 노출 잠시 쉬기 */
(function () {
  const { $, $$, esc, icon } = SP;
  const root = $('#hsRoot');
  const qs = SP.qs();
  let spaces = [];
  let apps = [];
  let me = null;
  let openQs = [];
  let payNote = '';
  let applyOpen = true;
  const LT = { managed: '쏘플 위탁운영', host: '호스트 운영', direct: '쏘플 직영' };
  const ZN = { premium: '프리미엄존', plus: '플러스존' };
  const AST = { draft: ['mute', '작성 중'], submitted: ['warn', '검수 중'], rejected: ['red', '보완 요청'], approved: ['ok', '승인'] };
  const LST = { submitted: ['warn', '확인 중'], rejected: ['red', '확인 못 함'], approved: ['ok', '연결 완료'], draft: ['mute', '확인 중'] };
  const ROLE = { owner: '대표 · 점주', manager: '매니저', staff: '직원' };
  const PLANS = [['1', '1개월'], ['3', '3개월'], ['6', '6개월'], ['12', '12개월']];
  const REGIONS = ['서울', '경기', '인천', '대전', '부산', '전주', '대구', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  const KIND_LABEL = { book: '네이버 예약(패키지)', naver: '네이버 예약', place: '네이버 지도', phone: '전화', call: '전화', kakao: '카카오톡', talk: '네이버 톡톡', insta: '인스타그램', sms: '문자', link: '예약 링크', form: '쏘플 문의', share: '공유' };

  /* ---------- 작은 도구 ---------- */
  const tx = (id, label, v, max, ph = '', help = '') => `<div class="field full"><label class="label" for="${id}">${label}</label><textarea class="textarea" id="${id}" maxlength="${max}" style="min-height:76px" placeholder="${esc(ph)}">${esc(v ?? '')}</textarea>${help ? `<p class="help">${help}</p>` : ''}</div>`;
  const ip = (id, label, v, max, ph = '', type = 'text', cls = '', help = '') => `<div class="field ${cls}"><label class="label" for="${id}">${label}</label><input class="input" id="${id}" type="${type}" ${type === 'text' || type === 'url' || type === 'tel' ? `maxlength="${max || 200}"` : ''} value="${esc(v ?? '')}" placeholder="${esc(ph)}">${help ? `<p class="help">${help}</p>` : ''}</div>`;
  const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const val = (r, id) => { const el = r.querySelector('#' + id); return el ? el.value.trim() : ''; };
  const chk = (r, id) => { const el = r.querySelector('#' + id); return !!(el && el.checked); };
  const hasPrice = (s) => (s.pkgs || []).some((p) => (p.p || []).some(Boolean)) || !!(s.hourly && (s.hourly.p || []).some(Boolean));
  const hasWays = (s) => !!(s.booking && (s.booking.ways || []).length) || !!s.book || (s.pkgs || []).some((p) => p.url);
  const isOwn = (s) => !!(s.listing && s.listing.type === 'host');
  const daysLeft = (ymd) => (ymd ? SP.dayDiff(SP.today(), ymd) : null);
  const priceText = (n, st) => { const d = st[`host.day${n}`], m = st[`host.mon${n}`]; return d && m ? `하루 ${d} · ${m}` : ''; };

  /* ---------- 들어가기 ---------- */
  async function init() {
    me = await SP.needLogin('호스트 로그인이 필요해요.');
    if (!me) return;
    await reload();
    if (qs.app) {
      const a = apps.find((x) => String(x.id) === String(qs.app));
      if (a && a.kind === 'new' && (a.status === 'draft' || a.status === 'rejected')) { wizard(a); return; }
      if (a && a.kind === 'new' && a.status === 'submitted') { wizard(a, { readOnly: true }); return; }
    }
    if (qs.new === '1') { await startApp(); return; }
    if (!spaces.length && !apps.length) landing(); else draw();
    if (qs.link === '1') { linkModal(); return; }
    const h = location.hash.match(/^#(edit|items|social|price|book|biz|stats|closed)-(S-\d{4})$/);
    if (h) {
      const s = spaces.find((x) => x.code === h[2]);
      if (s) { if (h[1] === 'stats') statsModal(s); else if (h[1] === 'closed') closedModal(s); else edit(s, h[1] === 'edit' ? 'base' : h[1]); }
    }
  }
  async function reload() {
    try { const d = await SP.get('/api/host/apps'); apps = d.apps || []; payNote = d.payNote || ''; applyOpen = d.open !== false; } catch { apps = []; }
    try { spaces = (await SP.get('/api/host/spaces')).spaces || []; } catch { spaces = []; }
    await loadOpen();
  }
  const codes = () => spaces.slice(0, 20).map((s) => s.code).join(',');
  async function loadOpen() {
    if (!spaces.length) { openQs = []; return; }
    try { openQs = (await SP.get(`/api/posts?board=qna&codes=${codes()}&open=1&size=20`)).items || []; } catch { openQs = []; }
  }
  /** 새 신청서 — 빈 작성 중 신청서가 있으면 그걸 이어서 써요 (주소창으로 다시 들어와도 신청서가 계속 생기지 않게) */
  async function startApp({ copyFrom } = {}) {
    if (!applyOpen) { SP.toast('지금은 새 공간 등록 신청을 잠시 받지 않고 있어요.', true); if (spaces.length || apps.length) draw(); else landing(); return; }
    try {
      const blank = !copyFrom && apps.find((a) => a.kind === 'new' && a.status === 'draft' && !a.name && (a.step || 1) === 1);
      let id = blank && blank.id;
      if (!id) {
        const r = await SP.post('/api/host/apps', { data: {}, ref: SP.ref(), copyFrom: copyFrom || undefined });
        id = r.id;
        SP.ga('host_apply_start', { method: copyFrom ? 'copy' : 'new' });
      }
      try { history.replaceState(null, '', '/myspace?app=' + id); } catch { /* 무시 */ }
      apps = (await SP.get('/api/host/apps')).apps || [];
      const a = apps.find((x) => x.id === id);
      if (a) wizard(a); else draw();
    } catch (e) { SP.fail(e); if (spaces.length || apps.length) draw(); else landing(); }
  }
  /** 「새 공간 등록」 — 전에 쓴 신청서가 있으면 주소·예약 방식·규정을 불러와 시작할 수 있어요 */
  function newApp() {
    const src = apps.filter((a) => a.kind === 'new' && a.name);
    if (!src.length) { startApp(); return; }
    const m = SP.modal({
      title: '새 공간 등록',
      body: `<p class="small muted" style="margin-bottom:12px">여러 공간을 운영하면 전에 쓴 신청서에서 주소·예약 방식·취소 규정·사업자 정보 같은 공통 내용을 불러와 시작할 수 있어요. 사진·소개·요금은 새로 넣어요.</p>
        <div class="hs-pick"><button type="button" class="hs-pick-i" data-cp="">${icon('plus')}<span><b>빈 신청서로 시작</b><small>처음부터 6단계로 적어요</small></span></button>
        ${src.slice(0, 6).map((a) => `<button type="button" class="hs-pick-i" data-cp="${a.id}">${icon('copy')}<span><b>「${esc(a.name)}」에서 불러오기</b><small>${esc([a.region, a.area].filter(Boolean).join(' '))} · ${AST[a.status][1]}</small></span></button>`).join('')}</div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button>',
    });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-cp]'); if (!b) return; m.close(); startApp({ copyFrom: b.dataset.cp ? Number(b.dataset.cp) : undefined }); });
  }

  /* ---------- 지점도 신청서도 없을 때 ---------- */
  function landing() {
    root.innerHTML = `<div class="hs-land">
      <div class="hs-land-copy">
        <span class="eyebrow">호스트센터</span>
        <h2 class="h2">어떤 걸 하러 오셨나요?</h2>
        <div class="hs-choice">
          <button type="button" class="hs-choice-i main" id="hsStart" ${applyOpen ? '' : 'disabled'}>${icon('plus')}<span><b>새 공간 등록 신청</b><small>운영 중이거나 준비 중인 파티룸을 쏘플에 올려요. 6단계, 10분이면 돼요.</small></span>${icon('chev-r', 'sm')}</button>
          <button type="button" class="hs-choice-i" id="hsLink">${icon('key')}<span><b>운영 중인 쏘플 지점 연결</b><small>이미 쏘플에 있는 지점의 점주·매니저라면 내 계정에 지점을 연결해요.</small></span>${icon('chev-r', 'sm')}</button>
        </div>
        ${applyOpen ? '' : '<p class="callout small" style="margin:12px 0 0">지금은 새 공간 등록 신청을 잠시 받지 않고 있어요. 쏘플 카카오톡 채널로 문의해 주세요.</p>'}
        <h3 class="h4" style="margin:26px 0 10px">새 공간 등록은 이렇게 진행돼요</h3>
        <ol class="hs-land-steps">
          <li><b>공간 정보 적기</b><span>이름·주소(검색)·인원·사진·소개·시설 — 중간에 저장되니 나눠서 써도 돼요</span></li>
          <li><b>요금과 예약 방식 정하기</b><span>시간제 / 패키지, 네이버 예약·전화·카카오톡·톡톡·인스타그램·문자·쏘플 문의</span></li>
          <li><b>이용 기간 고르고 제출</b><span>1·3·6·12개월 중 고르고, 손님 화면 미리보기로 확인한 뒤 제출해요</span></li>
          <li><b>운영팀 검수 → 승인</b><span>보통 1~3일 안에 알림으로 알려 드려요. 승인되면 이 화면에서 바로 관리해요</span></li>
        </ol>
        <p class="tiny faint" style="margin-top:12px">등록 요금은 <a class="link" href="/host#plans">호스트 모집</a>에서 볼 수 있고, 월 요금 외 수수료는 없어요. 결제 방법은 승인 안내 때 알려 드려요.</p>
      </div>
    </div>`;
    $('#hsStart').onclick = startApp;
    $('#hsLink').onclick = linkModal;
  }

  /* ---------- 첫 화면 ---------- */
  function draw() {
    const nOpen = openQs.length;
    const newApps = apps.filter((a) => a.kind === 'new');
    const links = apps.filter((a) => a.kind === 'link' && a.status !== 'approved');
    const live = newApps.filter((a) => a.status !== 'approved');
    const own = spaces.filter(isOwn);
    root.innerHTML = `
      <div class="hs-sum">
        <a class="hs-stat${nOpen ? ' hot' : ''}" href="#hsInbox"><small>답변 기다리는 문의</small><b>${nOpen}개</b><span>${nOpen ? '손님이 기다리고 있어요' : '모두 답했어요'}</span></a>
        <a class="hs-stat" href="#hsSpaces"><small>내 지점</small><b>${spaces.length}곳</b><span>${spaces.filter((s) => s.visible && !s.hostPaused).length}곳 손님 화면에 보여요</span></a>
        <a class="hs-stat${live.some((a) => a.status === 'rejected') ? ' hot' : ''}" href="#hsApps"><small>공간 등록 신청</small><b>${live.length}건</b><span>${live.some((a) => a.status === 'rejected') ? '보완 요청이 있어요' : live.length ? '진행 중' : '새 공간을 등록해 보세요'}</span></a>
        <a class="hs-stat" href="/write?b=host${spaces.length === 1 ? '&code=' + spaces[0].code : ''}"><small>지점 소식</small><b>${icon('megaphone')}</b><span>공지·소식·이벤트 올리기</span></a>
      </div>
      ${payNote && (own.length || newApps.some((a) => a.status === 'approved')) ? `<div class="callout hs-pay">${icon('won')}<div><b>결제 · 노출 기간 안내</b><p class="prewrap">${esc(payNote)}</p></div></div>` : ''}
      <section id="hsApps" class="hs-sec">
        <div class="between" style="margin-bottom:10px;gap:8px;flex-wrap:wrap"><h2 class="h3">공간 등록 · 지점 연결</h2>
          <div class="row" style="gap:6px"><button class="btn btn-line btn-sm" type="button" id="hsLinkBtn">${icon('key', 'sm')}운영 중인 지점 연결</button><button class="btn btn-red btn-sm" type="button" id="hsNew" ${applyOpen ? '' : 'disabled'}>${icon('plus', 'sm')}새 공간 등록</button></div></div>
        ${newApps.length || links.length ? `<div class="grid g3">${links.map(linkCard).join('')}${newApps.map(appCard).join('')}</div>` : `<p class="small muted">내 파티룸을 쏘플에 더 올리려면 「새 공간 등록」을, 이미 쏘플에 있는 지점이면 「운영 중인 지점 연결」을 눌러 주세요.</p>`}
      </section>
      ${spaces.length ? `<section id="hsInbox" class="hs-sec">
        <div class="between" style="margin-bottom:10px"><h2 class="h3">답변 기다리는 문의</h2><a class="sec-more" href="/community?b=qna">질문 게시판</a></div>
        ${nOpen ? `<div class="hs-inbox">${openQs.map((p) => `<div class="hs-q" data-q="${p.id}">
            <a class="post-row" href="/c/${p.id}"><div style="min-width:0"><h3><span class="badge warn">답변 대기</span><span class="badge mute">${esc(p.spaceName || '')}</span>${esc(p.title)}</h3><p class="clamp2">${esc(p.excerpt)}</p><div class="post-meta"><span>${esc(p.author ? p.author.nick : '')}</span><span>${SP.ago(p.created_at)}</span></div></div></a>
            <div class="hs-q-ans"><textarea class="textarea" maxlength="1000" placeholder="여기에 바로 답을 적어요. 모두가 보는 답변이라 연락처·계좌는 적지 마세요." rows="2"></textarea><button class="btn btn-ink btn-sm" type="button" data-ans="${p.id}">답변 올리기</button></div>
          </div>`).join('')}</div>`
          : `<div class="empty" style="padding:26px">${icon('check-c')}<h3>새 문의가 없어요</h3><p>손님이 지점 화면에서 "지점에 물어보기"로 남긴 질문이 여기에 모여요. 답을 달면 손님에게 알림이 가요.</p></div>`}
      </section>
      <section class="hs-sec" id="hsSpaces">
        <h2 class="h3" style="margin-bottom:12px">내 지점</h2>
        <div class="grid g3" id="hsList">${spaces.map(spaceCard).join('')}</div>
      </section>` : ''}
      <div class="box fog hs-sec"><h3 class="h4">호스트가 할 수 있는 일</h3><ul class="checks" style="margin-top:8px;font-size:14.5px">
        <li>공간 등록 신청 — 새 파티룸을 6단계로 적어 제출하면 운영팀 검수 뒤 손님 화면에 열려요</li>
        <li>운영 중인 지점 연결 — 이미 쏘플에 있는 지점이면 화면에서 바로 연결을 요청해요</li>
        <li>예약 방식 — 네이버 예약 · 전화 · 카카오톡 · 네이버 톡톡 · 인스타그램 DM · 문자 · 다른 예약 링크 · 쏘플 문의 중 골라서, 첫 번째가 대표 버튼이 돼요</li>
        <li>요금 — 시간제(요일별 1시간 요금 · 최소 시간 · 운영 시간)와 패키지(낮·밤·올데이 등) 중 하나 또는 둘 다</li>
        <li>마감·휴무 표시 · 노출 잠시 쉬기 · 성과 보기(지점 화면 조회와 예약 버튼 누른 수)</li>
        <li>손님 문의에 바로 답하기 · 지점 소식(공지·소식·이벤트) 올리기 · 소개·사진(40장)·시설·비품·이용 안내·SNS 후기 고치기</li></ul>
        <p class="tiny faint" style="margin-top:10px">도어락 번호, 와이파이 비밀번호, 계좌번호는 손님 화면에 그대로 보이니 절대 적지 마세요. 입실 안내는 예약 확정 뒤 문자로만 보내 주세요. 예약 방식에 넣은 전화번호만 손님에게 보여요.</p></div>
      <section id="hsPosts" class="hs-sec"></section>`;
    $('#hsNew').onclick = newApp;
    $('#hsLinkBtn').onclick = linkModal;
    $('#hsApps').addEventListener('click', onAppClick);
    const hl = $('#hsList');
    if (hl) hl.addEventListener('click', onSpaceClick);
    const ib = root.querySelector('.hs-inbox');
    if (ib) ib.addEventListener('click', onAnswer);
    posts();
  }
  function appCard(a) {
    const [cls, label] = AST[a.status] || AST.draft;
    const d = a.data || {};
    const sub = [a.region, a.area].filter(Boolean).join(' ') || '지역 미정';
    const acts = a.status === 'draft' ? `<button class="btn btn-red btn-sm" type="button" data-app="${a.id}" data-act="edit">${icon('edit', 'sm')}이어서 쓰기 (${a.step}/6)</button><button class="btn btn-ghost btn-sm" type="button" data-app="${a.id}" data-act="del">지우기</button>`
      : a.status === 'submitted' ? `<button class="btn btn-line btn-sm" type="button" data-app="${a.id}" data-act="view">내용 보기</button><button class="btn btn-ghost btn-sm" type="button" data-app="${a.id}" data-act="withdraw">검수 취소하고 고치기</button>`
        : a.status === 'rejected' ? `<button class="btn btn-red btn-sm" type="button" data-app="${a.id}" data-act="edit">${icon('edit', 'sm')}고쳐서 다시 제출</button><button class="btn btn-ghost btn-sm" type="button" data-app="${a.id}" data-act="del">지우기</button>`
          : `<a class="btn btn-line btn-sm" href="/room/${esc(a.code)}" target="_blank" rel="noopener">${icon('ext', 'sm')}고객 화면</a>`;
    return `<div class="box hs-card">
      <div class="row between"><span class="badge ${cls}">${label}</span><span class="tiny muted">${a.status === 'approved' && a.code ? a.code : SP.ago(a.updated_at)}</span></div>
      <h3 class="h3">${esc(a.name || '이름 없는 신청서')}</h3>
      <p class="small muted">${esc(sub)}${d.max ? ` · 최대 ${d.max}명` : ''}${d.plan ? ` · ${d.plan === 'ask' ? '기간 상담' : d.plan + '개월'}` : ''}</p>
      ${a.status === 'rejected' && a.note ? `<div class="callout red small"><div><b>운영팀 보완 요청</b><br>${esc(a.note)}</div></div>` : ''}
      ${a.status === 'submitted' ? '<p class="small muted">운영팀이 확인하고 있어요. 보통 1~3일 안에 알림으로 알려 드려요.</p>' : ''}
      ${a.status === 'approved' ? '<p class="small muted">승인됐어요. 아래 「내 지점」 카드에서 계속 관리해요.</p>' : ''}
      <div class="row wrap-ok" style="gap:6px;margin-top:auto">${acts}</div></div>`;
  }
  function linkCard(a) {
    const [cls, label] = LST[a.status] || LST.submitted;
    const d = a.data || {};
    return `<div class="box hs-card">
      <div class="row between"><span class="badge ${cls}">지점 연결 · ${label}</span><span class="tiny muted">${SP.ago(a.updated_at)}</span></div>
      <h3 class="h3">${esc(a.name || '지점')}</h3>
      <p class="small muted">${esc((d.names || []).join(', '))} · ${esc(ROLE[d.role] || '')}</p>
      ${a.status === 'rejected' && a.note ? `<div class="callout red small"><div><b>운영팀 안내</b><br>${esc(a.note)}</div></div>` : '<p class="small muted">운영팀이 점주 확인 뒤 연결해 드려요. 연결되면 알림이 가요.</p>'}
      <div class="row wrap-ok" style="gap:6px;margin-top:auto"><button class="btn btn-ghost btn-sm" type="button" data-app="${a.id}" data-act="del">요청 지우기</button></div></div>`;
  }
  async function onAppClick(e) {
    const b = e.target.closest('[data-app]'); if (!b) return;
    const a = apps.find((x) => String(x.id) === b.dataset.app); if (!a) return;
    const act = b.dataset.act;
    if (act === 'edit') { try { history.replaceState(null, '', '/myspace?app=' + a.id); } catch { /* 무시 */ } wizard(a); return; }
    if (act === 'view') { wizard(a, { readOnly: true }); return; }
    if (act === 'del') {
      if (!(await SP.confirm(`「${a.name || '이름 없는 신청서'}」를 지울까요? ${a.kind === 'link' ? '' : '적은 내용이 모두 사라져요.'}`, { ok: '지우기', danger: true }))) return;
      try { await SP.api('/api/host/apps/' + a.id, { method: 'DELETE' }); SP.toast('지웠어요.'); await reload(); if (spaces.length || apps.length) draw(); else landing(); } catch (er) { SP.fail(er); }
    }
    if (act === 'withdraw') {
      if (!(await SP.confirm('검수를 취소하면 다시 「작성 중」이 돼요. 고친 뒤 다시 제출해 주세요.', { ok: '검수 취소' }))) return;
      try { await SP.post(`/api/host/apps/${a.id}/withdraw`); await reload(); const n = apps.find((x) => x.id === a.id); if (n) wizard(n); else draw(); } catch (er) { SP.fail(er); }
    }
  }
  function spaceCard(s) {
    const l = s.listing || {};
    const own = isOwn(s);
    const nq = openQs.filter((p) => p.code === s.code).length;
    const nItems = (s.items || []).length;
    const nLinks = ((s.social && s.social.links) || []).length;
    const nWays = (s.booking && s.booking.ways || []).length;
    const left = daysLeft(l.until);
    const exp = l.until ? (left < 0 ? `<li class="warn">노출 기간이 지났어요 (${esc(l.until)}) · 연장은 운영팀에 알려 주세요</li>` : left <= 14 ? `<li class="warn">노출 ${esc(l.until)}까지 · ${left}일 남았어요</li>` : `<li class="ok">노출 ${esc(l.until)}까지</li>`) : '';
    const state = !s.visible ? '<span class="badge mute">운영팀 확인 중 · 비공개</span>' : s.hostPaused ? '<span class="badge warn">잠시 쉬는 중</span>' : '<span class="badge ok">손님 화면에 보여요</span>';
    return `<div class="box hs-card">
      <div class="row between"><span class="badge ${l.zone === 'premium' ? 'red' : 'mute'}">${ZN[l.zone] || LT[l.type] || '쏘플 위탁운영'}</span><span class="tiny muted">${s.code}</span></div>
      <h3 class="h3">${esc(s.name)}</h3>
      <p class="small muted">${esc(s.addr || `${s.region} ${s.area}`)}</p>
      <div>${state}</div>
      <ul class="hs-check">
        ${exp}
        <li class="${(s.photos || []).length >= 5 ? 'ok' : ''}">사진 ${(s.photos || []).length}장${(s.photos || []).length < 5 ? ' · 5장 이상 권장' : ''}</li>
        <li class="${s.intro ? 'ok' : ''}">소개 글 ${s.intro ? '있음' : '없음'}</li>
        ${own ? `<li class="${hasPrice(s) ? 'ok' : ''}">요금 ${s.hourly && (s.pkgs || []).length ? '시간제 · 패키지' : s.hourly ? '시간제' : (s.pkgs || []).length ? '패키지' : '아직 없음'}</li>
        <li class="${hasWays(s) ? 'ok' : ''}">예약 방식 ${nWays ? nWays + '개' : s.book || (s.pkgs || []).some((p) => p.url) ? '네이버 예약' : '아직 없음'}</li>` : ''}
        <li class="${nItems ? 'ok' : ''}">비품 목록 ${nItems ? nItems + '개' : '아직 없음'}</li>
        <li class="${nLinks ? 'ok' : ''}">고른 후기 ${nLinks}개</li>
        ${nq ? `<li class="warn">답변 대기 문의 ${nq}개</li>` : ''}
      </ul>
      <div class="hs-acts">
        <button class="btn btn-red btn-sm" type="button" data-edit="${s.code}" data-tab="base">${icon('edit', 'sm')}정보 고치기</button>
        ${own ? `<button class="btn btn-line btn-sm" type="button" data-edit="${s.code}" data-tab="price">${icon('won', 'sm')}요금</button><button class="btn btn-line btn-sm" type="button" data-edit="${s.code}" data-tab="book">${icon('calendar', 'sm')}예약 방식</button><button class="btn btn-line btn-sm" type="button" data-closed="${s.code}">${icon('lock', 'sm')}마감·휴무</button>` : ''}
        <button class="btn btn-line btn-sm" type="button" data-stats="${s.code}">${icon('chart', 'sm')}성과</button>
        <button class="btn btn-line btn-sm" type="button" data-edit="${s.code}" data-tab="items">${icon('list', 'sm')}비품</button>
        <button class="btn btn-line btn-sm" type="button" data-edit="${s.code}" data-tab="social">${icon('instagram', 'sm')}후기 연결</button>
        <a class="btn btn-line btn-sm" href="/write?b=host&code=${s.code}">${icon('megaphone', 'sm')}소식 쓰기</a>
        ${own && s.visible ? `<button class="btn btn-ghost btn-sm" type="button" data-pause="${s.code}">${s.hostPaused ? `${icon('eye', 'sm')}다시 보이기` : `${icon('pause', 'sm')}잠시 쉬기`}</button>` : ''}
        <a class="btn btn-ghost btn-sm" href="/room/${s.code}" target="_blank" rel="noopener">${icon('ext', 'sm')}고객 화면</a>
      </div></div>`;
  }
  async function onSpaceClick(e) {
    const ed = e.target.closest('[data-edit]'); if (ed) { edit(spaces.find((s) => s.code === ed.dataset.edit), ed.dataset.tab); return; }
    const st = e.target.closest('[data-stats]'); if (st) { statsModal(spaces.find((s) => s.code === st.dataset.stats)); return; }
    const cl = e.target.closest('[data-closed]'); if (cl) { closedModal(spaces.find((s) => s.code === cl.dataset.closed)); return; }
    const pz = e.target.closest('[data-pause]');
    if (pz) {
      const s = spaces.find((x) => x.code === pz.dataset.pause);
      const to = !s.hostPaused;
      if (!(await SP.confirm(to ? `「${s.name}」을 손님 화면에서 잠시 내릴까요? 지점 목록·검색·지점 화면에서 안 보이고, 「다시 보이기」를 누르면 바로 돌아와요. 공사·휴업처럼 한동안 예약을 못 받을 때 써요.` : `「${s.name}」을 다시 손님 화면에 보이게 할까요?`, { ok: to ? '잠시 쉬기' : '다시 보이기' }))) return;
      try { await SP.put('/api/host/spaces/' + s.code, { hostPaused: to }); SP.toast(to ? '손님 화면에서 내렸어요. 1분 안에 반영돼요.' : '다시 보이게 했어요. 1분 안에 반영돼요.'); await reload(); draw(); } catch (er) { SP.fail(er); }
    }
  }
  /* 손님 문의 — 내 공간 관리에서 바로 답하기 */
  async function onAnswer(e) {
    const b = e.target.closest('[data-ans]'); if (!b) return;
    const box = b.closest('.hs-q');
    const ta = box.querySelector('textarea');
    const body = ta.value.trim();
    if (body.length < 2) { ta.focus(); SP.toast('답변을 적어 주세요.', true); return; }
    SP.busy(b, true, '올리는 중');
    try {
      await SP.post(`/api/posts/${b.dataset.ans}/comments`, { body });
      SP.toast('답변을 올렸어요. 손님에게 알림이 가요.');
      await loadOpen(); draw();
    } catch (er) { SP.busy(b, false); SP.fail(er); }
  }

  async function posts() {
    const el = $('#hsPosts');
    if (!el || !spaces.length) { if (el) el.innerHTML = ''; return; }
    try {
      const d = await SP.get(`/api/posts?board=host&codes=${codes()}&size=10`);
      el.innerHTML = `<div class="between" style="margin-bottom:10px"><h2 class="h3">내가 올린 지점 소식</h2><a class="sec-more" href="/community?b=host">커뮤니티에서 보기</a></div>`
        + (d.items.length ? `<div>${d.items.map(SP.postRow).join('')}</div>` : `<div class="empty">${icon('megaphone')}<h3>아직 올린 소식이 없어요</h3><p>이달의 꾸밈, 새로 들인 장비, 평일 할인, 손님께 드리는 안내를 올려 보세요. 사진을 같이 올리면 검색에도 더 잘 잡혀요.</p><a class="btn btn-line btn-sm" href="/write?b=host${spaces.length === 1 ? '&code=' + spaces[0].code : ''}">첫 소식 쓰기</a></div>`);
    } catch { el.innerHTML = ''; }
  }

  /* ---------- 운영 중인 쏘플 지점 연결 요청 ---------- */
  async function linkModal() {
    let all = [];
    try { all = await SP.spaces(); } catch { all = []; }
    const have = new Set((me && me.hostCodes) || []);
    const pick = new Set();
    let role = 'owner';
    const m = SP.modal({
      title: '운영 중인 쏘플 지점 연결', wide: true,
      body: `<p class="small muted" style="margin-bottom:12px">이미 쏘플에 있는 지점의 점주·매니저라면 내 계정에 지점을 연결해 직접 관리할 수 있어요. 운영팀이 점주 확인(전화 또는 카카오톡) 뒤 연결해 드려요. 새로 올리는 공간이면 「새 공간 등록」을 써 주세요.</p>
        <div class="field"><label class="label" for="lkQ">지점 찾기</label><input class="input" id="lkQ" placeholder="지점 이름이나 동네로 찾기 — 예) 홍대, 건대 캐치볼"></div>
        <div class="hs-lk-list" id="lkList"></div>
        <p class="small" id="lkSel" style="margin:8px 0 14px;font-weight:700"></p>
        <div class="form-grid">
          <div class="field"><span class="label">내 역할</span><div class="chips" id="lkRole" style="margin-top:6px">${Object.entries(ROLE).map(([k, l]) => `<button type="button" class="chip${k === role ? ' on' : ''}" data-r="${k}">${l}</button>`).join('')}</div></div>
          ${ip('lkC', '운영팀이 확인 연락할 번호', '', 60, '010-0000-0000', 'tel')}
          ${tx('lkN', '남길 말 (선택)', '', 400, '예) 네이버 예약에 등록된 대표자 이름은 ○○○이에요.')}
        </div>
        <div class="form-err" id="lkErr" hidden></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="lkGo">연결 요청 보내기</button>',
    });
    const drawList = () => {
      const q = m.$('#lkQ').value.trim().replace(/\s/g, '');
      const rows = all.filter((s) => !q || (s.name + s.area + s.region + (s.addr || '')).replace(/\s/g, '').includes(q)).slice(0, q ? 40 : 12);
      m.$('#lkList').innerHTML = rows.map((s) => `<label class="hs-lk${have.has(s.code) ? ' off' : ''}"><input type="checkbox" value="${s.code}" ${pick.has(s.code) ? 'checked' : ''} ${have.has(s.code) ? 'disabled' : ''}><span><b>${esc(s.name)}</b><small>${esc(s.region)} ${esc(s.area)}${have.has(s.code) ? ' · 이미 연결됨' : ''}</small></span></label>`).join('')
        + (q ? '' : `<p class="tiny muted" style="padding:6px 2px">${all.length}곳 중 일부만 보여요. 위에서 지점 이름이나 동네를 찾아 주세요.</p>`)
        || '<p class="small muted" style="padding:10px 2px">찾는 지점이 없어요. 이름을 다르게 적어 보세요.</p>';
      m.$('#lkSel').textContent = pick.size ? `고른 지점 ${pick.size}곳 — ${[...pick].map((c) => (all.find((s) => s.code === c) || {}).name || c).join(', ')}` : '';
    };
    drawList();
    m.$('#lkQ').addEventListener('input', SP.debounce ? SP.debounce(drawList, 150) : drawList);
    m.$('#lkList').addEventListener('change', (e) => { const c = e.target.closest('input[type=checkbox]'); if (!c) return; if (c.checked) pick.add(c.value); else pick.delete(c.value); drawList(); });
    m.$('#lkRole').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; role = b.dataset.r; m.$$('#lkRole [data-r]').forEach((x) => x.classList.toggle('on', x === b)); });
    m.$('#lkGo').onclick = async () => {
      const err = m.$('#lkErr'); err.hidden = true;
      if (!pick.size) { err.textContent = '연결할 지점을 하나 이상 골라 주세요.'; err.hidden = false; return; }
      const btn = m.$('#lkGo'); SP.busy(btn, true, '보내는 중');
      try {
        await SP.post('/api/host/links', { codes: [...pick], role, contact: m.$('#lkC').value.trim(), note: m.$('#lkN').value.trim(), ref: SP.ref() });
        SP.ga('host_link_request', { count: pick.size });
        m.close(); SP.toast('연결 요청을 보냈어요. 운영팀이 확인한 뒤 알림으로 알려 드려요.');
        try { history.replaceState(null, '', '/myspace'); } catch { /* 무시 */ }
        await reload(); draw();
      } catch (er) { SP.busy(btn, false); err.textContent = er.message; err.hidden = false; }
    };
  }

  /* ---------- 성과 보기 ---------- */
  async function statsModal(s) {
    if (!s) return;
    const m = SP.modal({ title: `${s.name} 성과 · 최근 30일`, wide: true, body: '<div class="skel" style="height:260px"></div>', foot: '<button class="btn btn-soft" data-x>닫기</button>' });
    let d;
    try { d = await SP.get(`/api/host/stats?code=${s.code}&days=30`); } catch (e) { m.$('.modal-body').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    const t = d.total;
    const rate = t.view ? Math.round((t.book / t.view) * 1000) / 10 : null;
    const max = Math.max(1, ...d.series.map((x) => x.view + x.book));
    const kinds = Object.entries(d.kinds).sort((a, b) => b[1] - a[1]);
    m.$('.modal-body').innerHTML = `
      <div class="hs-kpi">
        <div><small>지점 화면 조회</small><b>${t.view.toLocaleString()}</b></div>
        <div><small>예약 버튼 누름</small><b>${t.book.toLocaleString()}</b></div>
        <div><small>조회 → 예약 버튼</small><b>${rate == null ? '-' : rate + '%'}</b></div>
        <div><small>새 문의</small><b>${d.qna}</b>${d.qnaOpen ? `<span class="badge warn">답변 대기 ${d.qnaOpen}</span>` : ''}</div>
        <div><small>후기</small><b>${d.reviews.n}</b>${d.reviews.avg ? `<span class="small muted">★ ${d.reviews.avg}</span>` : ''}</div>
      </div>
      <div class="hs-bars" role="img" aria-label="최근 30일 날짜별 조회와 예약 버튼 수">${d.series.map((x) => `<div class="hs-bar" title="${SP.md(x.d)} · 조회 ${x.view} · 예약 버튼 ${x.book}"><span class="v" style="height:${(x.view / max) * 100}%"></span><span class="b" style="height:${(x.book / max) * 100}%"></span></div>`).join('')}</div>
      <div class="between tiny muted" style="margin-top:4px"><span>${SP.md(d.from)}</span><span><i class="hs-dot v"></i>조회 <i class="hs-dot b"></i>예약 버튼</span><span>오늘</span></div>
      <h3 class="h4" style="margin:18px 0 8px">어떤 예약 버튼을 눌렀나요</h3>
      ${kinds.length ? `<ul class="hs-kinds">${kinds.map(([k, n]) => `<li><span>${esc(KIND_LABEL[k] || k)}</span><b>${n}</b></li>`).join('')}</ul>` : '<p class="small muted">아직 기록이 없어요.</p>'}
      <p class="tiny faint" style="margin-top:14px">조회는 같은 사람이 하루에 여러 번 열어도 한 번만 세고, 호스트 본인이 본 것은 빼요. 예약 버튼은 손님이 지점 화면에서 누른 수이고 실제 예약 수와는 달라요. 손님 개인정보는 남기지 않아요.</p>`;
  }

  /* ---------- 마감 · 휴무 표시 (호스트 운영 지점) ---------- */
  async function closedModal(s) {
    if (!s) return;
    const m = SP.modal({ title: `${s.name} 마감 · 휴무 표시`, wide: true, body: '<div class="skel" style="height:300px"></div>', foot: '<button class="btn btn-soft" data-x>닫기</button>' });
    let d;
    try { d = await SP.get(`/api/host/spaces/${s.code}/occ`); } catch (e) { m.$('.modal-body').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    if (!d.hasPrice) { m.$('.modal-body').innerHTML = '<p class="muted">요금(시간제나 패키지)을 먼저 넣어야 마감을 표시할 수 있어요.</p>'; return; }
    const by = {};
    d.rows.forEach((r) => { by[r.d] = r.slot || 'all'; });
    const two = d.fams.length > 1;
    const cycle = two ? ['', 'all', 'day', 'night'] : ['', 'all'];
    const LBL = { all: two ? '하루 마감' : '마감', day: '낮 마감', night: '밤 마감' };
    const today = SP.today();
    const last = SP.addDays(today, d.days - 1);
    const start = SP.addDays(today, -SP.wdi(today));
    const draw = () => {
      let cells = ['일', '월', '화', '수', '목', '금', '토'].map((w, i) => `<div class="wd${i === 0 ? ' sun' : ''}">${w}</div>`).join('');
      for (let i = 0; i < 63; i++) {
        const ymd = SP.addDays(start, i);
        const out = ymd < today || ymd > last;
        const st = by[ymd] || '';
        cells += `<button type="button" class="hs-cd${st ? ' on ' + st : ''}${out ? ' out' : ''}" data-d="${ymd}" ${out ? 'disabled' : ''}><b>${Number(ymd.slice(8))}</b>${Number(ymd.slice(8)) === 1 || i === 0 ? `<small>${Number(ymd.slice(5, 7))}월</small>` : ''}${st ? `<em>${LBL[st]}</em>` : ''}</button>`;
      }
      m.$('#cdGrid').innerHTML = cells;
      const n = Object.keys(by).filter((k) => k >= today).length;
      m.$('#cdN').textContent = n ? `앞으로 ${n}일 표시돼 있어요.` : '표시한 날이 없어요.';
    };
    m.$('.modal-body').innerHTML = `<p class="small muted" style="margin-bottom:12px">다른 채널로 예약이 찼거나 쉬는 날을 눌러 표시해요. ${two ? '누를 때마다 하루 마감 → 낮 마감 → 밤 마감 → 해제로 바뀌어요.' : '한 번 누르면 마감, 다시 누르면 해제예요.'} 손님 화면 날짜 달력과 날짜별 요금 칸에 「마감」으로 보여요.</p>
      <div class="hs-cal" id="cdGrid"></div><p class="small" id="cdN" style="margin-top:10px;font-weight:700"></p>
      <p class="tiny faint" style="margin-top:6px">오늘부터 ${d.days}일까지 표시할 수 있어요. 비어 있는 날은 손님 화면에서 따로 표시하지 않아요.</p>`;
    draw();
    m.$('#cdGrid').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-d]'); if (!b || b.disabled) return;
      const ymd = b.dataset.d;
      const cur = by[ymd] || '';
      const nx = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
      b.disabled = true;
      try {
        await SP.post(`/api/host/spaces/${s.code}/occ`, { d: ymd, slot: nx || 'all', action: nx ? 'block' : 'clear' });
        if (nx) by[ymd] = nx; else delete by[ymd];
        draw();
      } catch (er) { SP.fail(er); b.disabled = false; }
    });
  }

  /* ---------- 공용 편집기 — 사진 · 시설 (신청서와 정보 고치기에서 같이 써요) ---------- */
  function photoEditor(host, initial, { urls = [], onChange } = {}) {
    const photos = (initial || []).map((p, i) => ({ k: typeof p === 'string' ? p : p.k, url: urls[i] || (typeof p === 'string' && /^https?:/.test(p) ? p : '') }));
    let busy = 0;
    const draw = () => {
      host.innerHTML = `<div class="img-pick">${photos.map((p, i) => `<div class="pk"><img src="${esc(p.url)}" alt="사진 ${i + 1}">${i === 0 ? '<span class="pk-main">대표</span>' : ''}<button type="button" data-rm="${i}" aria-label="빼기">${icon('x', 'sm')}</button>${i ? `<button type="button" data-up="${i}" aria-label="앞으로" style="right:auto;left:4px">${icon('chev-l', 'sm')}</button>` : ''}</div>`).join('')}
        ${photos.length < 40 ? `<button type="button" class="add" data-add>${icon('camera')}<br>사진 추가</button>` : ''}</div>
        <p class="tiny muted" style="margin-top:8px">${photos.length}/40장${busy ? ` · ${busy}장 올리는 중…` : ''} · 첫 장이 대표 사진이에요. 여러 장을 한 번에 골라도 돼요. 가로 사진이 잘 어울리고, 큰 사진은 자동으로 줄여서 올려요.</p>`;
      if (onChange) onChange();
    };
    draw();
    host.addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-rm]'); if (rm) { photos.splice(Number(rm.dataset.rm), 1); draw(); return; }
      const up = e.target.closest('[data-up]'); if (up) { const i = Number(up.dataset.up); [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]]; draw(); return; }
      if (e.target.closest('[data-add]')) {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
        inp.onchange = async () => {
          const files = Array.from(inp.files).slice(0, 40 - photos.length);
          busy += files.length; draw();
          for (const file of files) {
            try { const r = await SP.upload(file, 2000); photos.push({ k: r.key, url: r.url }); } catch (er) { SP.fail(er); }
            busy--; draw();
          }
        };
        inp.click();
      }
    });
    return { read: () => photos.map((p) => p.k), count: () => photos.length, busy: () => busy > 0 };
  }
  function featEditor(host, f = {}) {
    const ft = (k, label, ph) => `<div class="field"><label class="switch"><input type="checkbox" data-ft="${k}"${f[k] && f[k].on ? ' checked' : ''}><span>${label}</span></label><input class="input input-sm" data-fn="${k}" maxlength="80" value="${esc((f[k] && f[k].note) || '')}" placeholder="${esc(ph)}" style="margin-top:6px"></div>`;
    const ck = (k, label) => `<label class="check"><input type="checkbox" data-fb="${k}"${f[k] ? ' checked' : ''}><span>${label}</span></label>`;
    host.innerHTML = `<div class="form-grid">${ft('karaoke', '노래방', '예) TJ 노래방 · 밤 12시까지')}${ft('bbq', '바베큐', '금액도 같이 — 예) 숯 바베큐 3만원 · 당일 추가 가능')}${ft('pet', '애견 동반', '예) 애견 보증금 3만원 추가')}</div>
      <div class="row wrap-ok" style="gap:14px;margin-top:16px">${ck('tv', 'TV')}${ck('console', '게임기')}${ck('projector', '빔프로젝터')}${ck('fridge', '냉장고')}${ck('heating', '난방')}</div>
      <div class="form-grid" style="margin-top:16px">
        <div class="field"><label class="label">에어컨</label><input class="input" data-f="aircon" maxlength="60" value="${esc(f.aircon || '')}" placeholder="스탠드 1대"></div>
        <div class="field"><label class="label">조리</label><input class="input" data-f="cook" maxlength="60" value="${esc(f.cook || '')}" placeholder="인덕션, 전자레인지"></div>
        <div class="field"><label class="label">층</label><input class="input" data-f="floor" maxlength="60" value="${esc(f.floor || '')}" placeholder="3층"></div>
        <div class="field"><label class="label">엘리베이터</label><select class="select" data-f="elevator"><option value="">모름</option><option value="1"${f.elevator === true ? ' selected' : ''}>있어요</option><option value="0"${f.elevator === false ? ' selected' : ''}>없어요 (계단)</option></select></div>
        <div class="field"><label class="label">화장실</label><input class="input" data-f="toilet" maxlength="60" value="${esc(f.toilet || '')}" placeholder="실내 1개"></div>
        <div class="field"><label class="label">특별한 공간 (쉼표)</label><input class="input" data-f="zones" maxlength="120" value="${esc((f.zones || []).join(', '))}" placeholder="루프탑, 테라스"></div>
        <div class="field full"><label class="label">보드게임·게임 (쉼표)</label><input class="input" data-f="games" maxlength="600" value="${esc((f.games || []).join(', '))}" placeholder="할리갈리, 루미큐브, 닌텐도 스위치"></div>
      </div>`;
    const g = (sel) => host.querySelector(sel);
    return {
      read: () => ({
        karaoke: { on: g('[data-ft=karaoke]').checked, note: g('[data-fn=karaoke]').value.trim() }, bbq: { on: g('[data-ft=bbq]').checked, note: g('[data-fn=bbq]').value.trim() }, pet: { on: g('[data-ft=pet]').checked, note: g('[data-fn=pet]').value.trim() },
        tv: g('[data-fb=tv]').checked, console: g('[data-fb=console]').checked, projector: g('[data-fb=projector]').checked, fridge: g('[data-fb=fridge]').checked, heating: g('[data-fb=heating]').checked,
        aircon: g('[data-f=aircon]').value.trim(), cook: g('[data-f=cook]').value.trim(), floor: g('[data-f=floor]').value.trim(), toilet: g('[data-f=toilet]').value.trim(),
        elevator: g('[data-f=elevator]').value === '' ? null : g('[data-f=elevator]').value === '1',
        zones: list(g('[data-f=zones]').value), games: list(g('[data-f=games]').value),
      }),
    };
  }

  /* ---------- 정보 고치기 (연결된 지점) ---------- */
  function edit(s, tab = 'base') {
    if (!s) return;
    const inf = s.info || {};
    const own = isOwn(s);
    const TABS = [['base', '소개·공지'], ['photo', '사진'], ['feat', '시설'], ['items', '비품'], ['info', '이용 안내'], ['social', 'SNS·후기']].concat(own ? [['price', '요금'], ['book', '예약 방식'], ['biz', '사업자 정보']] : []);
    if (!TABS.some((t) => t[0] === tab)) tab = 'base';
    const m = SP.modal({
      title: `${s.name} 정보 고치기`, wide: true,
      body: `<div class="tabs" id="hsTabs" style="margin-bottom:16px">${TABS.map(([k, l]) => `<button type="button" class="${k === tab ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
      <div data-p="base"><div class="form-grid">
        ${tx('h_notice', '지점 공지 (지점 화면 맨 위 빨간 띠)', s.notice, 400, '예) 10월 한 달 동안 엘리베이터 점검이 있어요.', '휴무·점검·이벤트처럼 손님이 꼭 알아야 할 한두 줄. 비우면 띠가 사라져요.')}
        ${tx('h_intro', '소개', s.intro, 1500, '이 지점만의 분위기와 어울리는 파티를 적어 주세요.')}
        ${tx('h_detail', '공간 상세 — 줄 맨 앞에 ## 소제목 · - 목록 · > 회색 안내 상자', s.detail, 3000, '## 대형 TV & OTT\n- 넷플릭스, 유튜브 시청 가능\n> OTT는 고객님 계정으로 이용해요.')}
        ${ip('h_tags', '태그 (쉼표로 나눠요)', (s.tags || []).join(', '), 200, '생일파티, 브라이덜샤워', 'text', 'full')}
        ${ip('h_addFeeLabel', '인원 추가 요금 (보이는 글)', s.addFeeLabel, 40, '1인당 1만원')}${ip('h_depositLabel', '청소 보증금', s.depositLabel, 30, '8만원')}
        ${own ? ip('h_addr', '주소', s.addr, 120, '서울 성동구 …', 'text', 'full', '이름·권역·동네를 바꾸려면 운영팀에 알려 주세요.') : ''}
        ${ip('h_place', '네이버 지도 주소', s.place, 300, 'https://naver.me/...', 'url', 'full')}
      </div></div>
      <div data-p="photo" hidden><div id="hsPhotos"></div></div>
      <div data-p="feat" hidden><div id="hsFeat"></div><div class="form-grid" style="margin-top:12px">${tx('h_facs', '시설 목록 — 한 줄에 "분류: 항목, 항목"', s.facs, 800, '주방: 싱크대, 전자레인지, 전기포트')}</div></div>
      <div data-p="items" hidden><div id="hsItems"></div></div>
      <div data-p="info" hidden><div class="form-grid">${tx('i_size', '평수 · 크기', inf.size, 300, '약 25평')}${tx('i_parking', '주차', inf.parking, 300)}${tx('i_route', '찾아오는 길', inf.route, 300)}${tx('i_noise', '소음 기준', inf.noise, 300)}${tx('i_minors', '미성년자 이용', inf.minors, 300)}${tx('i_sameday', '당일 예약', inf.sameday, 300)}${tx('i_tour', '사전 방문', inf.tour, 300)}${tx('h_care', '지점 이용 안내 — 한 줄에 하나씩', s.care, 1000, '내부에선 구비된 실내화로 갈아신어 주세요.')}</div></div>
      <div data-p="social" hidden><div id="hsSocial"></div></div>
      ${own ? `<div data-p="price" hidden><div class="form-grid" style="margin-bottom:14px">${ip('h_base', '기준 인원', s.base, 0, '', 'number')}${ip('h_max', '최대 인원', s.max, 0, '', 'number')}${ip('h_addFee', '인원 추가 요금 (원, 계산용)', s.addFee, 0, '10000', 'number')}</div><div id="hsPrice"></div></div>
      <div data-p="book" hidden><div id="hsWays"></div></div>
      <div data-p="biz" hidden><div id="hsBiz"></div></div>` : ''}
      <div class="form-err" id="hsErr" hidden></div>`,
      foot: `<a class="btn btn-ghost" href="/room/${s.code}" target="_blank" rel="noopener" style="margin-right:auto">${icon('ext', 'sm')}고객 화면</a><button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="hsSave">저장</button>`,
    });
    const P = (id) => m.$('#' + id);
    const showTab = (t) => { m.$$('#hsTabs button').forEach((x) => x.classList.toggle('on', x.dataset.t === t)); m.$$('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== t; }); };
    m.$('#hsTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) showTab(b.dataset.t); });
    showTab(tab);
    const photosEd = photoEditor(P('hsPhotos'), s.photos || [], { urls: s.photoUrls || [] });
    const featEd = featEditor(P('hsFeat'), s.feat || {});
    const itemsEd = SP.itemsEditor(P('hsItems'), s.items || []);
    const socialEd = SP.socialEditor(P('hsSocial'), s.social || {});
    const priceEd = own ? SP.priceEditor(P('hsPrice'), s) : null;
    const waysEd = own ? SP.waysEditor(P('hsWays'), s.booking || {}, { legacyBook: s.book || '' }) : null;
    const bizEd = own ? SP.bizEditor(P('hsBiz'), s.hostBiz || {}) : null;
    P('hsSave').onclick = async () => {
      const err = P('hsErr'); err.hidden = true;
      if (photosEd.busy()) { err.textContent = '사진을 올리는 중이에요. 조금만 기다렸다가 저장해 주세요.'; err.hidden = false; return; }
      const body = {
        intro: P('h_intro').value.trim(), notice: P('h_notice').value.trim(), tags: list(P('h_tags').value),
        detail: P('h_detail').value.trim(), care: P('h_care').value.trim(), facs: P('h_facs').value.trim(),
        addFeeLabel: P('h_addFeeLabel').value.trim(), depositLabel: P('h_depositLabel').value.trim(), place: P('h_place').value.trim(),
        photos: photosEd.read(), feat: featEd.read(),
        info: { size: P('i_size').value.trim(), parking: P('i_parking').value.trim(), route: P('i_route').value.trim(), noise: P('i_noise').value.trim(), minors: P('i_minors').value.trim(), sameday: P('i_sameday').value.trim(), tour: P('i_tour').value.trim() },
        items: itemsEd.read(), social: socialEd.read(),
      };
      if (own) {
        try {
          const pr = priceEd.read();
          const bk = waysEd.read();
          const naver = bk.ways.find((w) => w.k === 'naver');
          Object.assign(body, { base: P('h_base').value, max: P('h_max').value, addFee: P('h_addFee').value, addr: P('h_addr').value.trim(), hourly: pr.hourly, pkgs: pr.pkgs, booking: bk, book: naver ? naver.v : '', hostBiz: bizEd.read() });
        } catch (e) { err.textContent = e.message; err.hidden = false; showTab('price'); return; }
      }
      const btn = P('hsSave'); SP.busy(btn, true, '저장하는 중');
      try {
        await SP.put('/api/host/spaces/' + s.code, body);
        m.close(); SP.toast('저장했어요. 고객 화면에는 1분 안에 바뀌어요.');
        await reload(); draw();
      } catch (e) { err.textContent = e.message; err.hidden = false; SP.busy(btn, false); }
    };
  }

  /* ---------- 주소 검색 (다음 우편번호 서비스) — 주소를 고르면 권역·동네를 자동으로 채워요 ---------- */
  let postcodeP = null;
  const loadPostcode = () => {
    if (window.daum && window.daum.Postcode) return Promise.resolve();
    if (!postcodeP) postcodeP = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      sc.onload = () => (window.daum && window.daum.Postcode ? res() : rej(new Error('주소 검색을 불러오지 못했어요.')));
      sc.onerror = () => { postcodeP = null; rej(new Error('주소 검색을 불러오지 못했어요. 주소를 직접 적어 주세요.')); };
      document.head.appendChild(sc);
    });
    return postcodeP;
  };
  const SIDO = { 서울특별시: '서울', 서울: '서울', 경기도: '경기', 경기: '경기', 인천광역시: '인천', 인천: '인천', 대전광역시: '대전', 대전: '대전', 부산광역시: '부산', 부산: '부산', 대구광역시: '대구', 대구: '대구', 광주광역시: '광주', 광주: '광주', 울산광역시: '울산', 울산: '울산', 세종특별자치시: '세종', 세종: '세종', 강원도: '강원', 강원특별자치도: '강원', 강원: '강원', 충청북도: '충북', 충북: '충북', 충청남도: '충남', 충남: '충남', 전라북도: '전북', 전북특별자치도: '전북', 전북: '전북', 전라남도: '전남', 전남: '전남', 경상북도: '경북', 경북: '경북', 경상남도: '경남', 경남: '경남', 제주특별자치도: '제주', 제주: '제주' };
  async function knownAreas(region) {
    try { return [...new Set((await SP.spaces()).filter((s) => s.region === region).map((s) => s.area))]; } catch { return []; }
  }
  async function guessPlace(data) {
    const sigungu = String(data.sigungu || '');
    let region = SIDO[data.sido] || String(data.sido || '').slice(0, 2);
    if (/^전주/.test(sigungu)) region = '전주';
    const full = [data.address, data.roadAddress, data.jibunAddress, data.bname, sigungu].join(' ');
    const known = await knownAreas(region);
    let area = known.find((a) => a.length >= 2 && full.includes(a)) || '';
    if (!area) {
      const metro = ['서울', '부산', '대구', '인천', '광주', '대전', '울산'].includes(region);
      if (metro && data.bname) area = String(data.bname).replace(/\d*가$/, '').replace(/(동|가|로)$/, '');
      else area = (sigungu.split(' ')[0] || '').replace(/(특례)?시$|군$/, '');
    }
    return { region, area: area.slice(0, 20) };
  }
  function addrSearch(onPick) {
    const m = SP.modal({ title: '주소 검색', wide: true, body: '<div id="pcBox" style="height:470px"><p class="muted small">주소 검색을 불러오는 중…</p></div>', foot: '<button class="btn btn-soft" data-x>닫기</button>' });
    loadPostcode().then(() => {
      m.$('#pcBox').innerHTML = '';
      new window.daum.Postcode({
        width: '100%', height: '100%',
        oncomplete: async (data) => { m.close(); onPick(data, await guessPlace(data)); },
      }).embed(m.$('#pcBox'));
    }).catch((e) => { m.$('#pcBox').innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
  }

  /* ---------- 손님 화면 미리보기 ---------- */
  function preview(d, urls) {
    const s = { ...d, code: 'S-0000', name: d.name || '공간 이름', photos: urls || [], reviews: { n: 0 }, listing: { type: 'host', hostName: d.hostName || '' } };
    const ways = SP.bookWays(s);
    const won = (n) => (n ? SP.won(n) : '-');
    const COLS = ['월~목', '금', '토', '일'];
    const h = d.hourly;
    const tbl = (rows) => `<div class="tbl-wrap"><table class="tbl price-tbl"><thead><tr><th></th>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    const priceRows = (h && (h.p || []).some(Boolean) ? `<tr><td><b>시간제 1시간</b><div class="tiny muted">최소 ${h.min}시간</div></td>${(h.p || []).map((x) => `<td class="num">${won(x)}</td>`).join('')}</tr>` : '')
      + (d.pkgs || []).map((p) => `<tr><td><b>${esc(p.label || '')}</b><div class="tiny muted">${esc(p.hrs || '')}</div></td>${(p.p || []).map((x) => `<td class="num">${won(x)}</td>`).join('')}</tr>`).join('');
    SP.modal({
      title: '손님 화면 미리보기', wide: true,
      body: `<p class="small muted" style="margin-bottom:14px">지점 찾기 목록의 카드와 지점 화면의 예약·요금 칸이 이렇게 보여요. 승인 뒤 실제 화면은 조금 다를 수 있어요.</p>
        <div class="hs-pv"><div class="hs-pv-card rooms">${SP.roomCard(s, {})}</div>
        <div><h3 class="h4">예약하기</h3>${ways.length ? `<div class="qbook qb-ways">${ways.map((w) => `<span class="qb-row"><span><b>${esc(w.label)}</b>${w.sub ? `<small>${esc(w.sub)}</small>` : ''}</span><span class="go ${w.k}">${SP.BOOK_KINDS[w.k]}</span></span>`).join('')}</div>` : '<p class="small muted">예약 방식을 아직 고르지 않았어요.</p>'}
          ${d.booking && d.booking.confirm ? `<p class="small muted" style="margin-top:8px">${esc(SP.CONFIRM_KINDS[d.booking.confirm])}${d.booking.cancel ? ' · 취소·환불: ' + esc(d.booking.cancel) : ''}</p>` : ''}
          <h3 class="h4" style="margin-top:18px">요금</h3>${priceRows ? tbl(priceRows) : '<p class="small muted">요금을 아직 넣지 않았어요.</p>'}
          <p class="small muted" style="margin-top:8px">기준 ${d.base || '-'}명 · 최대 ${d.max || '-'}명${d.addFeeLabel ? ` · 넘는 인원 ${esc(d.addFeeLabel)}` : ''}</p></div></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button>',
      onOpen: (api) => { api.el.querySelectorAll('.hs-pv-card a').forEach((x) => x.addEventListener('click', (e) => e.preventDefault())); },
    });
  }

  /* ---------- 공간 등록 신청서 — 6단계 ---------- */
  const STEPS = [['기본 정보', '이름 · 주소 · 지역 · 인원'], ['사진', '대표 사진과 공간 사진'], ['소개 · 시설', '소개 글 · 태그 · 편의시설'], ['요금', '시간제 · 패키지'], ['예약 방식 · 규정', '예약 채널 · 확정 · 취소'], ['확인 · 제출', '이용 기간 · 호스트 정보 · 미리보기']];
  function wizard(a, { readOnly = false } = {}) {
    let step = Math.min(6, Math.max(1, readOnly ? 6 : a.step || 1));
    let d = a.data || {};
    let contact = a.contact || '';
    let missing = null;
    let site = {};
    const eds = {};
    let dirty = false;
    const leave = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    const stop = () => window.removeEventListener('beforeunload', leave);
    SP.site().then((x) => { site = (x && x.settings) || {}; if (step === 6) render(); }).catch(() => {});
    const bar = () => `<ol class="hs-wz-bar">${STEPS.map(([t], i) => `<li class="${i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}"><button type="button" data-go="${i + 1}" ${!readOnly && i + 1 > Math.max(a.step || 1, step) ? 'disabled' : ''}><b>${i + 1}</b><span>${t}</span></button></li>`).join('')}</ol>`;
    const body = () => {
      const inf = d.info || {}, bk = d.booking || {};
      if (step === 1) return `<div class="form-grid">
        ${ip('a_name', '공간 이름', d.name, 40, '예) 성수 루프탑 파티룸', 'text', 'full', '손님 화면과 검색 결과에 보이는 이름이에요. 동네 이름을 앞에 넣으면 검색에 유리하고, 뒤의 "파티룸"은 화면 제목에 자동으로 붙어요.')}
        <div class="field full"><label class="label" for="a_addr">주소</label><div class="row" style="gap:6px"><input class="input" id="a_addr" maxlength="120" value="${esc(d.addr || '')}" placeholder="주소 검색을 누르거나 직접 적어요" style="flex:1"><button class="btn btn-ink" type="button" id="a_find">${icon('search', 'sm')}주소 검색</button></div><p class="help">주소를 검색해서 고르면 아래 권역·동네가 자동으로 채워져요. 손님 화면에 그대로 보이니, 상세 호수는 예약 뒤 문자로 안내해도 돼요.</p></div>
        <div class="field"><label class="label" for="a_region">지역 (권역)</label><select class="select" id="a_region">${REGIONS.map((r) => `<option value="${r}"${d.region === r ? ' selected' : ''}>${r}</option>`).join('')}<option value="__etc"${d.region && !REGIONS.includes(d.region) ? ' selected' : ''}>직접 입력</option></select><input class="input" id="a_region2" maxlength="10" value="${esc(d.region && !REGIONS.includes(d.region) ? d.region : '')}" placeholder="예) 경남" style="margin-top:6px" ${d.region && !REGIONS.includes(d.region) ? '' : 'hidden'}></div>
        <div class="field"><label class="label" for="a_area">동네</label><input class="input" id="a_area" maxlength="20" value="${esc(d.area || '')}" placeholder="예) 성수, 홍대, 수원"><div class="chips hs-areas" id="a_areas"></div><p class="help">지역별 지점 화면과 "동네 파티룸" 검색에 쓰여요. 이미 쏘플에서 쓰는 동네 이름이 있으면 눌러서 맞춰 주세요.</p></div>
        ${ip('a_base', '기준 인원', d.base, 0, '4', 'number')}${ip('a_max', '최대 인원', d.max, 0, '10', 'number')}
        ${ip('a_size', '평수 · 크기', inf.size, 300, '약 25평')}
        ${ip('a_place', '네이버 지도 주소 (선택)', d.place, 300, 'https://naver.me/...', 'url', 'full', '손님 화면 「네이버 지도에서 위치 보기」 버튼이 돼요.')}
      </div>`;
      if (step === 2) return `<p class="small muted" style="margin-bottom:10px">사진이 많을수록 예약으로 더 잘 이어져요. 공간 전체 · 입구 · 시설 사진을 포함해 5장 이상을 권해요. 합성하거나 다른 공간 사진은 올리지 마세요.</p><div id="a_photos"></div>`;
      if (step === 3) return `<div class="form-grid">
        ${tx('a_intro', '소개', d.intro, 1500, '성수역 3분, 루프탑이 있는 20명 파티룸이에요. 생일파티와 브라이덜샤워에 잘 맞아요.', '첫 문장은 검색 결과에도 쓰여요. "역·동네에서 몇 분 · 최대 인원 · 대표 시설 · 어울리는 모임" 순서가 잘 읽혀요. 20자 이상.')}
        ${ip('a_tags', '태그 (쉼표로 나눠요)', (d.tags || []).join(', '), 200, '생일파티, 브라이덜샤워, 루프탑', 'text', 'full')}
        ${tx('a_detail', '공간 상세 (선택) — 줄 맨 앞에 ## 소제목 · - 목록 · > 안내 상자', d.detail, 3000, '## 대형 TV & OTT\n- 넷플릭스, 유튜브 시청 가능\n> OTT는 고객님 계정으로 이용해요.')}
      </div><h3 class="h4" style="margin:18px 0 8px">편의시설</h3><div id="a_feat"></div>
      <div class="form-grid" style="margin-top:12px">${tx('a_facs', '시설 목록 (선택) — 한 줄에 "분류: 항목, 항목"', d.facs, 800, '주방: 싱크대, 전자레인지, 전기포트')}</div>`;
      if (step === 4) return `<div class="form-grid" style="margin-bottom:14px">
        ${ip('a_addFeeLabel', '인원 추가 요금 (보이는 글)', d.addFeeLabel, 40, '1인당 1만원')}${ip('a_addFee', '인원 추가 요금 (원, 계산용)', d.addFee, 0, '10000', 'number')}${ip('a_depositLabel', '청소 보증금 (선택)', d.depositLabel, 30, '5만원')}
      </div><div id="a_price"></div>`;
      if (step === 5) return `<div id="a_ways"></div><h3 class="h4" style="margin:22px 0 8px">이용 규정 (선택)</h3><div class="form-grid">
        ${tx('a_noise', '소음 기준', inf.noise, 300, '예) 밤 10시 이후 음악 소리를 줄여 주세요')}${tx('a_minors', '미성년자 이용', inf.minors, 300, '예) 보호자 동의서가 있으면 낮 패키지만')}${tx('a_sameday', '당일 예약', inf.sameday, 300, '예) 전화로 확인하면 가능')}${tx('a_parking', '주차', inf.parking, 300, '예) 건물 앞 2대, 이후 공영주차장')}${tx('a_route', '찾아오는 길', inf.route, 300, '예) 2호선 성수역 3번 출구에서 도보 3분')}
        ${tx('a_care', '지점 이용 안내 — 한 줄에 하나씩', d.care, 1000, '내부에선 구비된 실내화로 갈아신어 주세요.')}
      </div>`;
      const miss = liveMiss();
      return `<div class="hs-wz-sum">
        <div class="field"><span class="label">희망 이용 기간</span><div class="hs-plans" id="a_plans">${PLANS.map(([k, l]) => `<button type="button" class="hs-plan${d.plan === k ? ' on' : ''}" data-plan="${k}"><b>${l}</b><small>${esc(priceText(k, site) || '')}</small></button>`).join('')}<button type="button" class="hs-plan${d.plan === 'ask' ? ' on' : ''}" data-plan="ask"><b>상담 뒤 결정</b><small>운영팀과 이야기해 볼게요</small></button></div>
          <p class="help">기간이 길수록 하루 요금이 낮아지고, 월 요금 외 수수료는 없어요. 결제는 승인 뒤 안내에 따라 해요. 노출 기간은 승인한 날부터 시작해요.</p></div>
        <div class="form-grid" style="margin-top:6px">
          ${ip('a_hostName', '호스트 표시 이름', d.hostName, 30, '예) 성수 호스트, OO스튜디오', 'text', '', '지점 화면에 "호스트 운영 · 이름"으로 보여요.')}
          <div class="field"><span class="label">사업자 등록</span><div class="chips" style="margin-top:6px"><button type="button" class="chip${d.biz === 'yes' ? ' on' : ''}" data-biz="yes">사업자예요</button><button type="button" class="chip${d.biz === 'no' ? ' on' : ''}" data-biz="no">아직 없어요</button></div><p class="help">세금계산서 발행과 결제 안내에 참고해요.</p></div>
          <div class="field full" id="a_bizBox" ${d.biz === 'yes' ? '' : 'hidden'}><div id="a_biz"></div></div>
          ${ip('a_contact', '운영팀이 연락할 번호 또는 이메일', contact, 60, '010-0000-0000', 'text', 'full', '손님에게는 보이지 않고 검수·승인 안내에만 써요.')}
        </div>
        <div class="box fog" style="margin-top:16px"><div class="between" style="gap:8px;flex-wrap:wrap"><h3 class="h4">제출 전 확인</h3><button class="btn btn-line btn-sm" type="button" id="wzPreview">${icon('eye', 'sm')}손님 화면 미리보기</button></div>
          <ul class="hs-check" style="border:0;padding-top:8px">
            <li class="${d.name && d.addr && d.base && d.max ? 'ok' : ''}">기본 정보 — ${esc(d.name || '이름 없음')} · ${esc([d.region, d.area].filter(Boolean).join(' ') || '지역 미정')} · 기준 ${d.base || '-'}명 / 최대 ${d.max || '-'}명</li>
            <li class="${(d.photos || []).length >= 1 ? 'ok' : ''}">사진 ${(d.photos || []).length}장${(d.photos || []).length < 5 ? ' (5장 이상 권장)' : ''}</li>
            <li class="${d.intro && d.intro.length >= 20 ? 'ok' : ''}">소개 ${d.intro ? d.intro.length + '자' : '없음'}</li>
            <li class="${hasPrice(d) ? 'ok' : ''}">요금 — ${d.hourly && (d.pkgs || []).length ? '시간제 + 패키지' : d.hourly ? '시간제' : (d.pkgs || []).length ? `패키지 ${d.pkgs.length}개` : '아직 없음'}</li>
            <li class="${(bk.ways || []).length ? 'ok' : ''}">예약 방식 — ${(bk.ways || []).map((w) => SP.BOOK_KINDS[w.k]).join(' · ') || '아직 없음'}${bk.confirm ? ` · ${SP.CONFIRM_KINDS[bk.confirm]}` : ''}</li>
          </ul>
          <div id="wzMiss">${missHtml(miss)}</div>
        </div>
        <label class="check" style="margin-top:14px;align-items:flex-start"><input type="checkbox" id="a_agree"${d.agree ? ' checked' : ''}><span>적은 정보가 실제 공간과 같고, 손님에게 보이는 내용(주소·요금·예약 방식·전화번호·사업자 정보)을 공개하는 데 동의해요. 예약·결제·환불은 손님과 호스트 사이에서 진행되고, 등록 요금과 기간은 <a class="link" href="/host#plans" target="_blank" rel="noopener">호스트 모집</a> 기준이에요.</span></label>
      </div>`;
    };
    /** 빠진 항목 — 서버(appMissing)와 같은 기준을 화면에서 바로 따져요. 6단계 칸은 입력하는 대로 반영 */
    const liveMiss = () => {
      const c = $('#a_contact') ? val(root, 'a_contact') : contact;
      const ag = $('#a_agree') ? chk(root, 'a_agree') : !!d.agree;
      const m = [];
      if (!d.name) m.push('공간 이름');
      if (!d.region || !d.area) m.push('지역·동네');
      if (!d.addr) m.push('주소');
      if (!d.base || !d.max) m.push('기준·최대 인원'); else if (Number(d.max) < Number(d.base)) m.push('최대 인원은 기준 인원보다 많게');
      if (!(d.photos || []).length) m.push('사진 1장 이상');
      if (!d.intro || d.intro.trim().length < 20) m.push('소개 20자 이상');
      if (!hasPrice(d)) m.push('요금 (시간제 또는 패키지)');
      if (!((d.booking || {}).ways || []).length) m.push('예약 방식 1개 이상');
      if (!d.plan) m.push('희망 이용 기간');
      if (!c) m.push('운영팀 연락처');
      if (!ag) m.push('등록 안내 동의');
      return m;
    };
    const missHtml = (miss) => miss.length ? `<p class="small" style="color:var(--red-deep);font-weight:700;margin-top:6px">아직 빠진 항목: ${miss.map(esc).join(', ')}</p>` : '<p class="small muted" style="margin-top:6px">제출하면 운영팀이 확인하고 알림으로 알려 드려요. 보완할 점이 있으면 사유와 함께 돌려 드리고, 고쳐서 다시 제출할 수 있어요.</p>';
    const refreshMiss = () => { const el = $('#wzMiss'); if (el && !readOnly) el.innerHTML = missHtml(liveMiss()); };
    const render = () => {
      root.innerHTML = `<div class="hs-wz">
        <div class="between" style="margin-bottom:14px"><div><span class="eyebrow">공간 등록 신청${readOnly ? ' · 검수 중' : ''}</span><h2 class="h2">${esc(d.name || '새 공간')}</h2></div><button class="btn btn-ghost btn-sm" type="button" id="wzBack">${icon('chev-l', 'sm')}내 공간 관리로</button></div>
        ${a.status === 'rejected' && a.note ? `<div class="callout red" style="margin-bottom:14px">${icon('alert')}<div><b>운영팀 보완 요청</b><br>${esc(a.note)}</div></div>` : ''}
        ${bar()}
        <div class="box hs-wz-body"><h3 class="h3" style="margin-bottom:4px">${step}. ${STEPS[step - 1][0]}</h3><p class="small muted" style="margin-bottom:16px">${STEPS[step - 1][1]}</p>${body()}<div class="form-err" id="wzErr" hidden></div></div>
        <div class="hs-wz-foot">${step > 1 ? `<button class="btn btn-soft" type="button" id="wzPrev">${icon('chev-l', 'sm')}이전</button>` : '<span></span>'}
          <div class="row" style="gap:8px">${readOnly ? '' : '<button class="btn btn-line" type="button" id="wzSave">저장만 하기</button>'}${step < 6 ? `<button class="btn btn-red" type="button" id="wzNext">${readOnly ? '다음' : '저장하고 다음'}${icon('chev-r', 'sm')}</button>` : readOnly ? '' : '<button class="btn btn-red btn-lg" type="button" id="wzSubmit">검수 요청 (제출)</button>'}</div></div>
        <p class="tiny faint" style="margin-top:10px;text-align:right">${readOnly ? '검수 중에는 고칠 수 없어요.' : '「저장하고 다음」을 누를 때마다 저장돼요. 나갔다 와도 이어서 쓸 수 있어요.'}</p>
      </div>`;
      if (step === 1) {
        const sel = $('#a_region');
        const drawAreas = async () => {
          const r = sel.value === '__etc' ? '' : sel.value;
          const known = r ? await knownAreas(r) : [];
          $('#a_areas').innerHTML = known.slice(0, 14).map((x) => `<button type="button" class="chip sm" data-area="${esc(x)}">${esc(x)}</button>`).join('');
        };
        sel.onchange = () => { $('#a_region2').hidden = sel.value !== '__etc'; drawAreas(); };
        $('#a_areas').addEventListener('click', (e) => { const b = e.target.closest('[data-area]'); if (b) { $('#a_area').value = b.dataset.area; dirty = true; } });
        drawAreas();
        $('#a_find').onclick = () => addrSearch((data, g) => {
          $('#a_addr').value = data.roadAddress || data.address || data.jibunAddress || '';
          if (g.region) { if (REGIONS.includes(g.region)) { sel.value = g.region; $('#a_region2').hidden = true; } else { sel.value = '__etc'; $('#a_region2').hidden = false; $('#a_region2').value = g.region; } }
          if (g.area) $('#a_area').value = g.area;
          dirty = true; drawAreas();
        });
      }
      if (step === 2) eds.photos = photoEditor($('#a_photos'), d.photos || [], { urls: a.photoUrls || [], onChange: () => { if (eds.photos) dirty = true; } });
      if (step === 3) eds.feat = featEditor($('#a_feat'), d.feat || {});
      if (step === 4) eds.price = SP.priceEditor($('#a_price'), d);
      if (step === 5) eds.ways = SP.waysEditor($('#a_ways'), d.booking || {});
      if (step === 6) {
        eds.biz = SP.bizEditor($('#a_biz'), d.hostBiz || {});
        $$('[data-biz]').forEach((b) => { b.onclick = () => { d.biz = b.dataset.biz; $$('[data-biz]').forEach((x) => x.classList.toggle('on', x === b)); $('#a_bizBox').hidden = d.biz !== 'yes'; dirty = true; }; });
        $$('[data-plan]').forEach((b) => { b.onclick = () => { d.plan = b.dataset.plan; $$('[data-plan]').forEach((x) => x.classList.toggle('on', x === b)); dirty = true; refreshMiss(); }; });
        $('#a_contact').addEventListener('input', refreshMiss);
        $('#a_agree').addEventListener('change', refreshMiss);
        refreshMiss();
        $('#wzPreview').onclick = () => preview({ ...d, ...(readOnly ? {} : collect()) }, a.photoUrls);
        if (!readOnly) $('#wzPreview').disabled = false;
      }
      if (readOnly) $$('.hs-wz-body input, .hs-wz-body textarea, .hs-wz-body select, .hs-wz-body button:not(#wzPreview)').forEach((el) => { el.disabled = true; });
      $('#wzBack').onclick = async () => {
        if (dirty && !(await SP.confirm('저장하지 않은 내용이 있어요. 저장하지 않고 나갈까요?', { ok: '나가기' }))) return;
        dirty = false; stop();
        try { history.replaceState(null, '', '/myspace'); } catch { /* 무시 */ }
        await reload(); if (spaces.length || apps.length) draw(); else landing(); window.scrollTo(0, 0);
      };
      const prev = $('#wzPrev'); if (prev) prev.onclick = () => { if (readOnly) { step--; render(); return; } save(step - 1).catch(SP.fail); };
      $$('[data-go]').forEach((b) => { b.onclick = () => { const n = Number(b.dataset.go); if (n === step) return; if (readOnly) { step = n; render(); return; } save(n).catch(SP.fail); }; });
      const nx = $('#wzNext'); if (nx) nx.onclick = () => { if (readOnly) { step++; render(); return; } save(step + 1).catch(SP.fail); };
      const sv = $('#wzSave'); if (sv) sv.onclick = () => save(step, { stay: true }).catch(SP.fail);
      const sb = $('#wzSubmit'); if (sb) sb.onclick = submit;
      if (!readOnly) root.querySelectorAll('.hs-wz-body input, .hs-wz-body textarea, .hs-wz-body select').forEach((el) => el.addEventListener('input', () => { dirty = true; }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    /** 지금 단계의 값 읽기 */
    const collect = () => {
      const r = root;
      if (step === 1) {
        const region = val(r, 'a_region') === '__etc' ? val(r, 'a_region2') : val(r, 'a_region');
        return { name: val(r, 'a_name'), region, area: val(r, 'a_area'), addr: val(r, 'a_addr'), base: val(r, 'a_base'), max: val(r, 'a_max'), place: val(r, 'a_place'), info: { ...(d.info || {}), size: val(r, 'a_size') } };
      }
      if (step === 2) return { photos: eds.photos.read() };
      if (step === 3) return { intro: val(r, 'a_intro'), tags: list(val(r, 'a_tags')), detail: val(r, 'a_detail'), facs: val(r, 'a_facs'), feat: eds.feat.read() };
      if (step === 4) { const pr = eds.price.read(); return { addFeeLabel: val(r, 'a_addFeeLabel'), addFee: val(r, 'a_addFee'), depositLabel: val(r, 'a_depositLabel'), hourly: pr.hourly, pkgs: pr.pkgs }; }
      if (step === 5) return { booking: eds.ways.read(), care: val(r, 'a_care'), info: { ...(d.info || {}), noise: val(r, 'a_noise'), minors: val(r, 'a_minors'), sameday: val(r, 'a_sameday'), parking: val(r, 'a_parking'), route: val(r, 'a_route') } };
      return { hostName: val(r, 'a_hostName'), biz: d.biz || '', plan: d.plan || '', hostBiz: d.biz === 'yes' && eds.biz ? eds.biz.read() : null, agree: chk(r, 'a_agree') };
    };
    async function save(next, { stay = false } = {}) {
      const err = $('#wzErr'); if (err) err.hidden = true;
      if (step === 2 && eds.photos && eds.photos.busy()) { err.textContent = '사진을 올리는 중이에요. 다 올라간 뒤에 넘어가 주세요.'; err.hidden = false; return false; }
      let data;
      try { data = collect(); } catch (e) { if (err) { err.textContent = e.message; err.hidden = false; } return false; }
      const body = { step: Math.max(a.step || 1, next), data };
      if (step === 6) body.contact = val(root, 'a_contact');
      const btn = $('#wzNext') || $('#wzSave'); if (btn) SP.busy(btn, true, '저장하는 중');
      try {
        const r = await SP.put('/api/host/apps/' + a.id, body);
        missing = r.missing || [];
        apps = (await SP.get('/api/host/apps')).apps || [];
        const na = apps.find((x) => x.id === a.id); if (na) { a = na; d = a.data || {}; contact = a.contact || ''; }
        dirty = false;
        if (stay) { SP.toast('저장했어요.'); render(); } else { step = next; render(); }
        return true;
      } catch (e) {
        if (btn) SP.busy(btn, false);
        const el = $('#wzErr'); if (el) { el.textContent = e.message; el.hidden = false; el.scrollIntoView({ block: 'center' }); } else SP.fail(e);
        return false;
      }
    }
    async function submit() {
      if (!(await save(6, { stay: true }))) return;
      if (missing && missing.length) { const el = $('#wzErr'); el.textContent = '아직 빠진 항목이 있어요: ' + missing.join(', '); el.hidden = false; el.scrollIntoView({ block: 'center' }); return; }
      if (!(await SP.confirm('운영팀에 검수를 요청할까요? 검수 중에는 내용을 고칠 수 없어요(「검수 취소」로 되돌릴 수 있어요).', { ok: '검수 요청' }))) return;
      const btn = $('#wzSubmit'); SP.busy(btn, true, '보내는 중');
      try {
        await SP.post(`/api/host/apps/${a.id}/submit`);
        SP.ga('host_apply_submit', { plan: d.plan || '' });
        dirty = false; stop();
        SP.toast('검수를 요청했어요. 확인되면 알림으로 알려 드릴게요.');
        try { history.replaceState(null, '', '/myspace'); } catch { /* 무시 */ }
        await reload(); draw(); window.scrollTo(0, 0);
      } catch (e) { SP.busy(btn, false); const el = $('#wzErr'); el.textContent = e.message; el.hidden = false; }
    }
    render();
  }

  init().catch((e) => console.error(e));
})();
