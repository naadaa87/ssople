/* 호스트센터 · 내 공간 관리 — 공간 등록 신청(6단계), 신청 현황, 손님 문의 답변, 지점 소식, 소개·사진·시설·비품·이용 안내·SNS 후기·요금·예약 방식 고치기 */
(function () {
  const { $, $$, esc, icon } = SP;
  const root = $('#hsRoot');
  const qs = SP.qs();
  let spaces = [];
  let apps = [];
  let me = null;
  let openQs = [];
  const LT = { managed: '쏘플 위탁운영', host: '호스트 운영', direct: '쏘플 직영' };
  const ZN = { premium: '프리미엄존', plus: '플러스존' };
  const AST = { draft: ['mute', '작성 중'], submitted: ['warn', '검수 중'], rejected: ['red', '보완 요청'], approved: ['ok', '승인'] };
  const REGIONS = ['서울', '경기', '인천', '대전', '부산', '전주', '대구', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  const COLS = ['월~목', '금', '토', '일'];
  const PK = [['day', '낮'], ['night', '밤'], ['allday', '올데이'], ['tonight', '투나잇'], ['morning', '오전'], ['hour3', '3시간'], ['full', '풀패키지']];
  const WAY = [
    ['naver', '네이버 예약', '네이버 예약(스마트플레이스) 상품 주소', 'https://booking.naver.com/booking/12/bizes/…', 'url'],
    ['link', '다른 예약 링크', '스페이스클라우드·아워플레이스·자체 홈페이지 같은 예약 페이지 주소 (https://)', 'https://', 'url'],
    ['phone', '전화 예약', '손님이 바로 거는 전화번호 — 손님 화면에 그대로 보여요', '010-0000-0000', 'tel'],
    ['kakao', '카카오톡 채널', '카카오톡 채널(pf.kakao.com) 또는 오픈채팅 주소', 'https://pf.kakao.com/_xxxx/chat', 'url'],
    ['sms', '문자 예약', '문자를 받을 번호 — 손님 화면에 그대로 보여요', '010-0000-0000', 'tel'],
    ['form', '쏘플 문의로 예약 요청', '손님이 쏘플 지점 화면 「지점에 물어보기」에 남기면 호스트가 답해요. 번호가 필요 없어요', '', ''],
  ];

  /* ---------- 작은 도구 ---------- */
  const tx = (id, label, v, max, ph = '', help = '') => `<div class="field full"><label class="label" for="${id}">${label}</label><textarea class="textarea" id="${id}" maxlength="${max}" style="min-height:76px" placeholder="${esc(ph)}">${esc(v ?? '')}</textarea>${help ? `<p class="help">${help}</p>` : ''}</div>`;
  const ip = (id, label, v, max, ph = '', type = 'text', cls = '', help = '') => `<div class="field ${cls}"><label class="label" for="${id}">${label}</label><input class="input" id="${id}" type="${type}" ${type === 'text' || type === 'url' || type === 'tel' ? `maxlength="${max || 200}"` : ''} value="${esc(v ?? '')}" placeholder="${esc(ph)}">${help ? `<p class="help">${help}</p>` : ''}</div>`;
  const hm = (min) => (min == null || min === '' ? '' : `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
  const t2m = (v) => { if (!v) return null; const [h, mi] = v.split(':').map(Number); return h * 60 + (mi || 0); };
  const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const num = (v) => (v === '' || v == null ? '' : v);
  const val = (r, id) => { const el = r.querySelector('#' + id); return el ? el.value.trim() : ''; };
  const chk = (r, id) => { const el = r.querySelector('#' + id); return !!(el && el.checked); };
  const hasPrice = (s) => (s.pkgs || []).some((p) => (p.p || []).some(Boolean)) || !!(s.hourly && (s.hourly.p || []).some(Boolean));
  const hasWays = (s) => !!(s.booking && (s.booking.ways || []).length) || !!s.book || (s.pkgs || []).some((p) => p.url);

  /* ---------- 들어가기 ---------- */
  async function init() {
    me = await SP.needLogin('호스트 로그인이 필요해요.');
    if (!me) return;
    await reload();
    if (qs.new === '1' || qs.app) {
      const a = qs.app ? apps.find((x) => String(x.id) === String(qs.app)) : null;
      if (a && (a.status === 'draft' || a.status === 'rejected')) { wizard(a); return; }
      if (!a) { await startApp(); return; }
    }
    if (!spaces.length && !apps.length) { landing(); return; }
    draw();
    const h = location.hash.match(/^#(edit|items|social|price|book)-(S-\d{4})$/);
    if (h) { const s = spaces.find((x) => x.code === h[2]); if (s) edit(s, h[1] === 'edit' ? 'base' : h[1]); }
  }
  async function reload() {
    try { apps = (await SP.get('/api/host/apps')).apps || []; } catch { apps = []; }
    try { spaces = (await SP.get('/api/host/spaces')).spaces || []; } catch { spaces = []; }
    await loadOpen();
  }
  const codes = () => spaces.slice(0, 20).map((s) => s.code).join(',');
  async function loadOpen() {
    if (!spaces.length) { openQs = []; return; }
    try { openQs = (await SP.get(`/api/posts?board=qna&codes=${codes()}&open=1&size=20`)).items || []; } catch { openQs = []; }
  }
  async function startApp() {
    try {
      const r = await SP.post('/api/host/apps', { data: {} });
      apps = (await SP.get('/api/host/apps')).apps || [];
      const a = apps.find((x) => x.id === r.id);
      if (a) wizard(a); else draw();
    } catch (e) { SP.fail(e); draw(); }
  }

  /* ---------- 지점도 신청서도 없을 때 ---------- */
  function landing() {
    root.innerHTML = `<div class="hs-land">
      <div class="hs-land-copy">
        <span class="eyebrow">호스트센터</span>
        <h2 class="h2">내 파티룸을 쏘플에 올려 보세요</h2>
        <p>공간 정보를 적고 제출하면 운영팀이 확인한 뒤 손님 화면에 열어 드려요. 예약은 네이버 예약·전화·카카오톡 등 편한 방법으로 받고, 요금은 시간제나 패키지로 정할 수 있어요. 중간에 저장되니 한 번에 다 쓰지 않아도 돼요.</p>
        <ol class="hs-land-steps">
          <li><b>공간 정보 적기</b><span>이름·주소·인원·사진·소개·시설 — 6단계, 10분이면 돼요</span></li>
          <li><b>요금과 예약 방식 정하기</b><span>시간제 / 패키지, 네이버 예약·전화·카카오톡·문자·쏘플 문의</span></li>
          <li><b>제출 → 운영팀 검수</b><span>보통 1~3일 안에 확인하고 알림으로 알려 드려요</span></li>
          <li><b>승인되면 바로 관리</b><span>이 화면에서 소개·사진·요금·소식·문의 답변까지 직접</span></li>
        </ol>
        <div class="row wrap-ok" style="gap:8px">
          <button class="btn btn-red btn-lg" type="button" id="hsStart">${icon('plus')}첫 공간 등록 시작하기</button>
          <a class="btn btn-line btn-lg" href="/hostcenter">호스트센터 안내 보기</a>
        </div>
        <p class="tiny faint" style="margin-top:12px">이미 운영 중인 쏘플 지점의 호스트라면 <a class="link" href="/hostcenter#start">지점 연결 요청</a>을 먼저 해 주세요. 등록 요금(1·3·6·12개월)은 <a class="link" href="/host#plans">호스트 모집</a>에서 볼 수 있고, 결제는 승인 안내 때 따로 알려 드려요.</p>
      </div>
    </div>`;
    $('#hsStart').onclick = startApp;
  }

  /* ---------- 첫 화면 ---------- */
  function draw() {
    const nOpen = openQs.length;
    const live = apps.filter((a) => a.status !== 'approved');
    root.innerHTML = `
      <div class="hs-sum">
        <a class="hs-stat${nOpen ? ' hot' : ''}" href="#hsInbox"><small>답변 기다리는 문의</small><b>${nOpen}개</b><span>${nOpen ? '손님이 기다리고 있어요' : '모두 답했어요'}</span></a>
        <div class="hs-stat"><small>내 지점</small><b>${spaces.length}곳</b><span>${spaces.filter((s) => s.visible).length}곳 공개 중</span></div>
        <a class="hs-stat${live.some((a) => a.status === 'rejected') ? ' hot' : ''}" href="#hsApps"><small>공간 등록 신청</small><b>${live.length}건</b><span>${live.some((a) => a.status === 'rejected') ? '보완 요청이 있어요' : live.length ? '진행 중' : '새 공간을 등록해 보세요'}</span></a>
        <a class="hs-stat" href="/write?b=host${spaces.length === 1 ? '&code=' + spaces[0].code : ''}"><small>지점 소식</small><b>${icon('megaphone')}</b><span>공지·소식·이벤트 올리기</span></a>
      </div>
      <section id="hsApps" class="hs-sec">
        <div class="between" style="margin-bottom:10px"><h2 class="h3">공간 등록 신청</h2><button class="btn btn-red btn-sm" type="button" id="hsNew">${icon('plus', 'sm')}새 공간 등록</button></div>
        ${apps.length ? `<div class="grid g3">${apps.map(appCard).join('')}</div>` : `<p class="small muted">내 파티룸을 쏘플에 더 올리려면 「새 공간 등록」을 눌러 주세요. 6단계로 적고 제출하면 운영팀이 검수해요.</p>`}
      </section>
      ${spaces.length ? `<section id="hsInbox" class="hs-sec">
        <div class="between" style="margin-bottom:10px"><h2 class="h3">답변 기다리는 문의</h2><a class="sec-more" href="/community?b=qna">질문 게시판</a></div>
        ${nOpen ? `<div>${openQs.map((p) => `<a class="post-row" href="/c/${p.id}"><div style="min-width:0"><h3><span class="badge warn">답변 대기</span><span class="badge mute">${esc(p.spaceName || '')}</span>${esc(p.title)}</h3><p class="clamp2">${esc(p.excerpt)}</p><div class="post-meta"><span>${esc(p.author ? p.author.nick : '')}</span><span>${SP.ago(p.created_at)}</span></div></div></a>`).join('')}</div>`
          : `<div class="empty" style="padding:26px">${icon('check-c')}<h3>새 문의가 없어요</h3><p>손님이 지점 화면에서 "지점에 물어보기"로 남긴 질문이 여기에 모여요. 답을 달면 손님에게 알림이 가요.</p></div>`}
      </section>
      <section class="hs-sec">
        <h2 class="h3" style="margin-bottom:12px">내 지점</h2>
        <div class="grid g3" id="hsList">${spaces.map(spaceCard).join('')}</div>
      </section>` : ''}
      <div class="box fog hs-sec"><h3 class="h4">호스트가 할 수 있는 일</h3><ul class="checks" style="margin-top:8px;font-size:14.5px">
        <li>공간 등록 신청 — 새 파티룸을 6단계로 적어 제출하면 운영팀 검수 뒤 손님 화면에 열려요</li>
        <li>예약 방식 — 네이버 예약 · 다른 예약 링크 · 전화 · 카카오톡 채널 · 문자 · 쏘플 문의 중 골라서, 첫 번째가 대표 버튼이 돼요</li>
        <li>요금 — 시간제(요일별 시간당 요금 · 최소 시간 · 운영 시간)와 패키지(낮·밤·올데이 등 이름·시간·요일별 요금) 중 하나 또는 둘 다</li>
        <li>손님 문의에 답하기 — 답을 달면 "답변 완료"로 바뀌고 손님에게 알림이 가요</li>
        <li>지점 소식 올리기 — 공지·소식·이벤트로 나눠 지점 화면 맨 위쪽과 커뮤니티에 보여요</li>
        <li>소개·지점 공지·태그·사진(40장)·시설·비품·이용 안내·SNS 후기 고치기</li></ul>
        <p class="tiny faint" style="margin-top:10px">도어락 번호, 와이파이 비밀번호, 계좌번호는 손님 화면에 그대로 보이니 절대 적지 마세요. 입실 안내 문자로만 보내 주세요. 예약 방식에 넣은 전화번호만 손님에게 보여요.</p></div>
      <section id="hsPosts" class="hs-sec"></section>`;
    $('#hsNew').onclick = startApp;
    $('#hsApps').addEventListener('click', onAppClick);
    const hl = $('#hsList');
    if (hl) hl.addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) edit(spaces.find((s) => s.code === b.dataset.edit), b.dataset.tab); });
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
      <p class="small muted">${esc(sub)}${d.max ? ` · 최대 ${d.max}명` : ''}</p>
      ${a.status === 'rejected' && a.note ? `<div class="callout red small"><div><b>운영팀 보완 요청</b><br>${esc(a.note)}</div></div>` : ''}
      ${a.status === 'submitted' ? '<p class="small muted">운영팀이 확인하고 있어요. 보통 1~3일 안에 알림으로 알려 드려요.</p>' : ''}
      ${a.status === 'approved' ? '<p class="small muted">승인됐어요. 아래 「내 지점」 카드에서 계속 관리해요.</p>' : ''}
      <div class="row wrap-ok" style="gap:6px;margin-top:auto">${acts}</div></div>`;
  }
  async function onAppClick(e) {
    const b = e.target.closest('[data-app]'); if (!b) return;
    const a = apps.find((x) => String(x.id) === b.dataset.app); if (!a) return;
    const act = b.dataset.act;
    if (act === 'edit') { wizard(a); return; }
    if (act === 'view') { wizard(a, { readOnly: true }); return; }
    if (act === 'del') {
      if (!(await SP.confirm(`「${a.name || '이름 없는 신청서'}」를 지울까요? 적은 내용이 모두 사라져요.`, { ok: '지우기', danger: true }))) return;
      try { await SP.api('/api/host/apps/' + a.id, { method: 'DELETE' }); SP.toast('신청서를 지웠어요.'); await reload(); draw(); } catch (er) { SP.fail(er); }
    }
    if (act === 'withdraw') {
      if (!(await SP.confirm('검수를 취소하면 다시 「작성 중」이 돼요. 고친 뒤 다시 제출해 주세요.', { ok: '검수 취소' }))) return;
      try { await SP.post(`/api/host/apps/${a.id}/withdraw`); await reload(); const n = apps.find((x) => x.id === a.id); if (n) wizard(n); else draw(); } catch (er) { SP.fail(er); }
    }
  }
  function spaceCard(s) {
    const l = s.listing || {};
    const own = l.type === 'host';
    const nq = openQs.filter((p) => p.code === s.code).length;
    const nItems = (s.items || []).length;
    const nLinks = ((s.social && s.social.links) || []).length;
    const nWays = (s.booking && s.booking.ways || []).length;
    return `<div class="box hs-card">
      <div class="row between"><span class="badge ${l.zone === 'premium' ? 'red' : 'mute'}">${ZN[l.zone] || LT[l.type] || '쏘플 위탁운영'}</span><span class="tiny muted">${s.code}${s.visible ? '' : ' · 비공개'}</span></div>
      <h3 class="h3">${esc(s.name)}</h3>
      <p class="small muted">${esc(s.addr || `${s.region} ${s.area}`)}${l.until ? ` · 노출 ${esc(l.until)}까지` : ''}</p>
      <ul class="hs-check">
        <li class="${(s.photos || []).length >= 5 ? 'ok' : ''}">사진 ${(s.photos || []).length}장${(s.photos || []).length < 5 ? ' · 5장 이상 권장' : ''}</li>
        <li class="${s.intro ? 'ok' : ''}">소개 글 ${s.intro ? '있음' : '없음'}</li>
        ${own ? `<li class="${hasPrice(s) ? 'ok' : ''}">요금 ${s.hourly && (s.pkgs || []).length ? '시간제 · 패키지' : s.hourly ? '시간제' : (s.pkgs || []).length ? '패키지' : '아직 없음'}</li>
        <li class="${hasWays(s) ? 'ok' : ''}">예약 방식 ${nWays ? nWays + '개' : s.book || (s.pkgs || []).some((p) => p.url) ? '네이버 예약' : '아직 없음'}</li>` : ''}
        <li class="${nItems ? 'ok' : ''}">비품 목록 ${nItems ? nItems + '개' : '아직 없음'}</li>
        <li class="${nLinks ? 'ok' : ''}">고른 후기 ${nLinks}개</li>
        ${nq ? `<li class="warn">답변 대기 문의 ${nq}개</li>` : ''}
      </ul>
      <div class="row wrap-ok" style="gap:6px;margin-top:auto">
        <button class="btn btn-red btn-sm" type="button" data-edit="${s.code}" data-tab="base">${icon('edit', 'sm')}정보 고치기</button>
        ${own ? `<button class="btn btn-line btn-sm" type="button" data-edit="${s.code}" data-tab="price">${icon('won', 'sm')}요금</button><button class="btn btn-line btn-sm" type="button" data-edit="${s.code}" data-tab="book">${icon('calendar', 'sm')}예약 방식</button>` : ''}
        <button class="btn btn-line btn-sm" type="button" data-edit="${s.code}" data-tab="items">${icon('list', 'sm')}비품</button>
        <button class="btn btn-line btn-sm" type="button" data-edit="${s.code}" data-tab="social">${icon('instagram', 'sm')}후기 연결</button>
        <a class="btn btn-line btn-sm" href="/write?b=host&code=${s.code}">${icon('megaphone', 'sm')}소식 쓰기</a>
        <a class="btn btn-ghost btn-sm" href="/room/${s.code}" target="_blank" rel="noopener">${icon('ext', 'sm')}고객 화면</a>
      </div></div>`;
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

  /* ---------- 공용 편집기 — 사진 · 시설 · 요금 · 예약 방식 (신청서와 정보 고치기에서 같이 써요) ---------- */
  function photoEditor(host, initial, { urls = [] } = {}) {
    let photos = (initial || []).map((p, i) => ({ k: typeof p === 'string' ? p : p.k, url: urls[i] || (typeof p === 'string' && /^https?:/.test(p) ? p : '') }));
    const draw = () => {
      host.innerHTML = `<div class="img-pick">${photos.map((p, i) => `<div class="pk"><img src="${esc(p.url)}" alt="사진 ${i + 1}">${i === 0 ? '<span class="pk-main">대표</span>' : ''}<button type="button" data-rm="${i}" aria-label="빼기">${icon('x', 'sm')}</button>${i ? `<button type="button" data-up="${i}" aria-label="앞으로" style="right:auto;left:4px">${icon('chev-l', 'sm')}</button>` : ''}</div>`).join('')}
        ${photos.length < 40 ? `<button type="button" class="add" data-add>${icon('camera')}<br>사진 추가</button>` : ''}</div>
        <p class="tiny muted" style="margin-top:8px">${photos.length}/40장 · 첫 장이 대표 사진이에요. 가로 사진이 잘 어울리고, 한 장에 5MB까지예요.</p>`;
    };
    draw();
    host.addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-rm]'); if (rm) { photos.splice(Number(rm.dataset.rm), 1); draw(); return; }
      const up = e.target.closest('[data-up]'); if (up) { const i = Number(up.dataset.up); [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]]; draw(); return; }
      if (e.target.closest('[data-add]')) {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
        inp.onchange = async () => {
          for (const file of Array.from(inp.files).slice(0, 40 - photos.length)) {
            try { const r = await SP.upload(file, 2000); photos.push({ k: r.key, url: r.url }); draw(); } catch (er) { SP.fail(er); }
          }
        };
        inp.click();
      }
    });
    return { read: () => photos.map((p) => p.k), count: () => photos.length };
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
        <div class="field"><label class="label">화장실</label><input class="input" data-f="toilet" maxlength="60" value="${esc(f.toilet || '')}" placeholder="실내 1개"></div>
        <div class="field"><label class="label">특별한 공간 (쉼표)</label><input class="input" data-f="zones" maxlength="120" value="${esc((f.zones || []).join(', '))}" placeholder="루프탑, 테라스"></div>
        <div class="field"><label class="label">보드게임·게임 (쉼표)</label><input class="input" data-f="games" maxlength="600" value="${esc((f.games || []).join(', '))}" placeholder="할리갈리, 루미큐브, 닌텐도 스위치"></div>
      </div>`;
    const g = (sel) => host.querySelector(sel);
    return {
      read: () => ({
        karaoke: { on: g('[data-ft=karaoke]').checked, note: g('[data-fn=karaoke]').value.trim() }, bbq: { on: g('[data-ft=bbq]').checked, note: g('[data-fn=bbq]').value.trim() }, pet: { on: g('[data-ft=pet]').checked, note: g('[data-fn=pet]').value.trim() },
        tv: g('[data-fb=tv]').checked, console: g('[data-fb=console]').checked, projector: g('[data-fb=projector]').checked, fridge: g('[data-fb=fridge]').checked, heating: g('[data-fb=heating]').checked,
        aircon: g('[data-f=aircon]').value.trim(), cook: g('[data-f=cook]').value.trim(), floor: g('[data-f=floor]').value.trim(), toilet: g('[data-f=toilet]').value.trim(), zones: list(g('[data-f=zones]').value), games: list(g('[data-f=games]').value),
      }),
    };
  }
  /** 요금 — 시간제 / 패키지 / 둘 다 */
  function priceEditor(host, s) {
    let mode = s.hourly && (s.pkgs || []).length ? 'both' : s.hourly ? 'hour' : (s.pkgs || []).length ? 'pkg' : '';
    const h = s.hourly || { min: 2, open: 600, close: 1440, p: [null, null, null, null], note: '' };
    let pkgs = (s.pkgs || []).map((p) => ({ ...p, p: (p.p || [null, null, null, null]).slice() }));
    const drawMode = () => {
      host.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
      host.querySelector('[data-hour]').hidden = !(mode === 'hour' || mode === 'both');
      host.querySelector('[data-pkg]').hidden = !(mode === 'pkg' || mode === 'both');
      host.querySelector('[data-none]').hidden = !!mode;
    };
    host.innerHTML = `<div class="field full"><span class="label">요금 방식</span><div class="chips" style="margin-top:6px">
        <button type="button" class="chip" data-mode="hour">시간제</button><button type="button" class="chip" data-mode="pkg">패키지</button><button type="button" class="chip" data-mode="both">시간제 + 패키지</button></div>
        <p class="help">시간제는 "1시간에 얼마, 최소 몇 시간"으로, 패키지는 "낮 12~17시 8만원"처럼 묶어서 팔 때 써요. 둘 다 쓰면 손님 화면에 두 표가 같이 보여요.</p></div>
      <p class="small muted" data-none>요금 방식을 골라 주세요.</p>
      <div data-hour hidden><h3 class="h4" style="margin:10px 0 8px">시간제 요금</h3><div class="form-grid">
        <div class="field"><label class="label">최소 이용 시간</label><input class="input" type="number" min="1" max="24" data-h="min" value="${h.min}"></div>
        <div class="field"><label class="label">운영 시간 (시작 ~ 끝)</label><div class="row"><input class="input" type="time" data-h="open" value="${hm(h.open)}"><span>~</span><input class="input" type="time" data-h="close" value="${hm(h.close)}"></div></div>
        ${COLS.map((d, j) => `<div class="field"><label class="label">${d} · 1시간 (원)</label><input class="input" type="number" min="0" data-h="p${j}" value="${num(h.p[j])}" placeholder="20000"></div>`).join('')}
        <div class="field full"><label class="label">안내 한 줄 <span class="opt">선택</span></label><input class="input" data-h="note" maxlength="120" value="${esc(h.note || '')}" placeholder="예) 2시간부터, 30분 단위 연장 가능"></div>
      </div></div>
      <div data-pkg hidden><h3 class="h4" style="margin:16px 0 8px">패키지 요금</h3><p class="small muted" style="margin-bottom:8px">요일별(월~목·금·토·일) 요금이고, 비우면 그 요일엔 팔지 않는 걸로 보여요. 끝 시각이 시작보다 이르면 다음 날로 계산해요.</p><div data-pkgs></div><button class="btn btn-soft btn-sm" type="button" data-pkadd style="margin-top:10px">${icon('plus', 'sm')}패키지 추가</button></div>`;
    const drawPkgs = () => {
      host.querySelector('[data-pkgs]').innerHTML = pkgs.map((p, i) => `<div class="box" style="padding:14px;margin-bottom:10px"><div class="form-grid">
        <div class="field"><label class="label">종류</label><select class="select input-sm" data-pk="${i}" data-f="k">${PK.map(([k, l]) => `<option value="${k}"${(p.k || 'day') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="label">이름 (손님에게 보여요)</label><input class="input input-sm" data-pk="${i}" data-f="label" maxlength="12" value="${esc(p.label || '')}" placeholder="낮 / 밤 / 올데이"></div>
        <div class="field full"><label class="label">시간 (시작 ~ 끝)</label><div class="row"><input class="input input-sm" type="time" data-pk="${i}" data-f="s" value="${hm(p.s)}"><span>~</span><input class="input input-sm" type="time" data-pk="${i}" data-f="e" value="${hm(p.e)}"></div></div>
        ${COLS.map((d, j) => `<div class="field"><label class="label">${d} 요금(원)</label><input class="input input-sm" type="number" min="0" data-pk="${i}" data-f="p${j}" value="${num(p.p[j])}"></div>`).join('')}
        <div class="field full"><label class="label">이 패키지의 네이버 예약 주소 <span class="opt">선택</span></label><input class="input input-sm" data-pk="${i}" data-f="url" value="${esc(p.url || '')}" placeholder="https://booking.naver.com/booking/12/bizes/.../items/..."></div>
        </div><button class="btn btn-ghost btn-sm" type="button" data-pkrm="${i}" style="margin-top:6px">이 패키지 빼기</button></div>`).join('') || '<p class="small muted">아직 패키지가 없어요. 「패키지 추가」를 눌러 주세요.</p>';
    };
    const readPkgs = () => {
      host.querySelectorAll('[data-pk]').forEach((inp) => {
        const p = pkgs[Number(inp.dataset.pk)]; const k = inp.dataset.f;
        if (k === 's' || k === 'e') p[k] = t2m(inp.value);
        else if (/^p\d$/.test(k)) p.p[Number(k[1])] = inp.value === '' ? null : Number(inp.value);
        else p[k] = inp.value.trim();
      });
    };
    drawPkgs(); drawMode();
    host.addEventListener('click', (e) => {
      const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; drawMode(); return; }
      if (e.target.closest('[data-pkadd]')) { readPkgs(); pkgs.push({ k: 'day', label: '', s: 720, e: 1020, p: [null, null, null, null], url: '' }); drawPkgs(); return; }
      const rm = e.target.closest('[data-pkrm]'); if (rm) { readPkgs(); pkgs.splice(Number(rm.dataset.pkrm), 1); drawPkgs(); }
    });
    const hv = (k) => host.querySelector(`[data-h="${k}"]`).value;
    return {
      read: () => {
        readPkgs();
        const useH = mode === 'hour' || mode === 'both', useP = mode === 'pkg' || mode === 'both';
        if (useP && pkgs.some((p) => p.s == null || p.e == null)) throw new Error('패키지 시작·끝 시각을 넣어 주세요.');
        return {
          hourly: useH ? { min: hv('min'), open: t2m(hv('open')), close: t2m(hv('close')), p: [0, 1, 2, 3].map((j) => (hv('p' + j) === '' ? null : Number(hv('p' + j)))), note: hv('note').trim() } : null,
          pkgs: useP ? pkgs.map((p) => ({ k: p.k || 'day', label: p.label, s: p.s, e: p.e, p: p.p, url: p.url })) : [],
        };
      },
    };
  }
  /** 예약 방식 — 여러 개 고르고 순서를 정해요. 첫 번째가 손님 화면의 대표 버튼 */
  function waysEditor(host, b = {}, { legacyBook = '' } = {}) {
    let ways = (b.ways || []).map((w) => ({ ...w }));
    if (!ways.length && legacyBook) ways = [{ k: 'naver', v: legacyBook, label: '', note: '' }];
    const draw = () => {
      const on = new Set(ways.map((w) => w.k));
      host.querySelector('[data-ways]').innerHTML = `
        <div class="hs-ways">${ways.map((w, i) => { const def = WAY.find((x) => x[0] === w.k) || WAY[0]; return `<div class="hs-way${i === 0 ? ' main' : ''}">
          <div class="hs-way-hd"><b>${i === 0 ? '<span class="badge red">대표</span>' : `<span class="badge mute">${i + 1}</span>`}${def[1]}</b>
            <span class="row" style="gap:4px">${i ? `<button class="ibtn sm" type="button" data-wup="${i}" aria-label="앞으로">${icon('chev-l', 'sm')}</button>` : ''}<button class="ibtn sm" type="button" data-wrm="${i}" aria-label="빼기">${icon('x', 'sm')}</button></span></div>
          ${def[4] ? `<input class="input input-sm" type="${def[4]}" data-w="${i}" data-f="v" value="${esc(w.v || '')}" placeholder="${esc(def[3])}" inputmode="${def[4] === 'tel' ? 'tel' : 'url'}">` : ''}
          <p class="help">${def[2]}</p>
          <div class="row" style="gap:6px"><input class="input input-sm" data-w="${i}" data-f="label" maxlength="20" value="${esc(w.label || '')}" placeholder="버튼 이름 (선택)"><input class="input input-sm" data-w="${i}" data-f="note" maxlength="60" value="${esc(w.note || '')}" placeholder="한 줄 안내 (선택) 예) 평일 10~19시"></div>
        </div>`; }).join('') || '<p class="small muted">아직 고른 예약 방식이 없어요. 아래에서 하나 이상 더해 주세요.</p>'}</div>
        <div class="chips" style="margin-top:10px">${WAY.filter(([k]) => !on.has(k)).map(([k, l]) => `<button type="button" class="chip" data-wadd="${k}">${icon('plus', 'sm')}${l}</button>`).join('')}</div>`;
    };
    host.innerHTML = `<p class="small muted" style="margin-bottom:8px">손님이 예약하는 방법이에요. 여러 개 넣을 수 있고, <b>첫 번째가 지점 화면의 대표 버튼</b>(휴대폰 아래 고정 버튼)이 돼요. 쏘플은 결제를 받지 않고 손님을 이 방법으로 이어 줘요.</p>
      <div data-ways></div>
      <div class="form-grid" style="margin-top:16px">
        <div class="field"><span class="label">예약 확정 방식</span><div class="chips" style="margin-top:6px"><button type="button" class="chip" data-cf="instant">바로 확정</button><button type="button" class="chip" data-cf="approve">호스트 확인 뒤 확정</button></div></div>
        ${ip('w_hours', '예약 받는 시간 (선택)', b.hours, 60, '예) 매일 10:00~22:00')}
        ${tx('w_cancel', '취소·환불 규정', b.cancel, 600, '예) 이용 3일 전까지 전액 환불, 이후 환불 없음', '손님 화면 「이용 전에 확인해 주세요」에 그대로 보여요. 전화번호는 자동으로 가려져요.')}
      </div>`;
    let confirm = b.confirm || '';
    const drawCf = () => host.querySelectorAll('[data-cf]').forEach((x) => x.classList.toggle('on', x.dataset.cf === confirm));
    const read = () => { host.querySelectorAll('[data-w]').forEach((inp) => { ways[Number(inp.dataset.w)][inp.dataset.f] = inp.value.trim(); }); };
    draw(); drawCf();
    host.addEventListener('click', (e) => {
      const cf = e.target.closest('[data-cf]'); if (cf) { confirm = confirm === cf.dataset.cf ? '' : cf.dataset.cf; drawCf(); return; }
      const add = e.target.closest('[data-wadd]'); if (add) { read(); ways.push({ k: add.dataset.wadd, v: '', label: '', note: '' }); draw(); return; }
      const up = e.target.closest('[data-wup]'); if (up) { read(); const i = Number(up.dataset.wup); [ways[i - 1], ways[i]] = [ways[i], ways[i - 1]]; draw(); return; }
      const rm = e.target.closest('[data-wrm]'); if (rm) { read(); ways.splice(Number(rm.dataset.wrm), 1); draw(); }
    });
    return { read: () => { read(); return { ways: ways.map((w) => ({ k: w.k, v: w.v, label: w.label, note: w.note })), confirm, hours: val(host, 'w_hours'), cancel: val(host, 'w_cancel') }; } };
  }

  /* ---------- 정보 고치기 (승인된 지점) ---------- */
  function edit(s, tab = 'base') {
    const inf = s.info || {};
    const own = s.listing && s.listing.type === 'host';
    const TABS = [['base', '소개·공지'], ['photo', '사진'], ['feat', '시설'], ['items', '비품'], ['info', '이용 안내'], ['social', 'SNS·후기']].concat(own ? [['price', '요금'], ['book', '예약 방식']] : []);
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
        ${own ? ip('h_addr', '주소', s.addr, 120, '서울 성동구 …', 'text', 'full') : ''}
        ${ip('h_place', '네이버 지도 주소', s.place, 300, 'https://naver.me/...', 'url', 'full')}
      </div></div>
      <div data-p="photo" hidden><div id="hsPhotos"></div></div>
      <div data-p="feat" hidden><div id="hsFeat"></div>${tx('h_facs', '시설 목록 — 한 줄에 "분류: 항목, 항목"', s.facs, 800, '주방: 싱크대, 전자레인지, 전기포트')}</div>
      <div data-p="items" hidden><div id="hsItems"></div></div>
      <div data-p="info" hidden><div class="form-grid">${tx('i_size', '평수 · 크기', inf.size, 300, '약 25평')}${tx('i_parking', '주차', inf.parking, 300)}${tx('i_route', '찾아오는 길', inf.route, 300)}${tx('i_noise', '소음 기준', inf.noise, 300)}${tx('i_minors', '미성년자 이용', inf.minors, 300)}${tx('i_sameday', '당일 예약', inf.sameday, 300)}${tx('i_tour', '사전 방문', inf.tour, 300)}${tx('h_care', '지점 이용 안내 — 한 줄에 하나씩', s.care, 1000, '내부에선 구비된 실내화로 갈아신어 주세요.')}</div></div>
      <div data-p="social" hidden><div id="hsSocial"></div></div>
      ${own ? `<div data-p="price" hidden><div class="form-grid" style="margin-bottom:14px">${ip('h_base', '기준 인원', s.base, 0, '', 'number')}${ip('h_max', '최대 인원', s.max, 0, '', 'number')}${ip('h_addFee', '인원 추가 요금 (원, 계산용)', s.addFee, 0, '10000', 'number')}</div><div id="hsPrice"></div></div>
      <div data-p="book" hidden><div id="hsWays"></div></div>` : ''}
      <div class="form-err" id="hsErr" hidden></div>`,
      foot: `<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="hsSave">저장</button>`,
    });
    const P = (id) => m.$('#' + id);
    const showTab = (t) => { m.$$('#hsTabs button').forEach((x) => x.classList.toggle('on', x.dataset.t === t)); m.$$('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== t; }); };
    m.$('#hsTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) showTab(b.dataset.t); });
    showTab(tab);
    const photosEd = photoEditor(P('hsPhotos'), s.photos || [], { urls: s.photoUrls || [] });
    const featEd = featEditor(P('hsFeat'), s.feat || {});
    const itemsEd = SP.itemsEditor(P('hsItems'), s.items || []);
    const socialEd = SP.socialEditor(P('hsSocial'), s.social || {});
    const priceEd = own ? priceEditor(P('hsPrice'), s) : null;
    const waysEd = own ? waysEditor(P('hsWays'), s.booking || {}, { legacyBook: s.book || '' }) : null;
    P('hsSave').onclick = async () => {
      const err = P('hsErr'); err.hidden = true;
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
          Object.assign(body, { base: P('h_base').value, max: P('h_max').value, addFee: P('h_addFee').value, addr: P('h_addr').value.trim(), hourly: pr.hourly, pkgs: pr.pkgs, booking: bk, book: naver ? naver.v : '' });
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

  /* ---------- 공간 등록 신청서 — 6단계 ---------- */
  const STEPS = [['기본 정보', '이름 · 지역 · 주소 · 인원'], ['사진', '대표 사진과 공간 사진'], ['소개 · 시설', '소개 글 · 태그 · 편의시설'], ['요금', '시간제 · 패키지'], ['예약 방식 · 규정', '예약 채널 · 확정 · 취소'], ['확인 · 제출', '호스트 정보 · 동의']];
  function wizard(a, { readOnly = false } = {}) {
    let step = Math.min(6, Math.max(1, readOnly ? 6 : a.step || 1));
    let d = a.data || {};
    let contact = a.contact || '';
    let missing = null;
    const eds = {};
    const dirty = { v: false };
    const bar = () => `<ol class="hs-wz-bar">${STEPS.map(([t], i) => `<li class="${i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}"><button type="button" data-go="${i + 1}" ${readOnly || i + 1 > (a.step || 1) + 0 && i + 1 > step ? 'disabled' : ''}><b>${i + 1}</b><span>${t}</span></button></li>`).join('')}</ol>`;
    const body = () => {
      const inf = d.info || {}, bk = d.booking || {};
      if (step === 1) return `<div class="form-grid">
        ${ip('a_name', '공간 이름', d.name, 40, '예) 성수 루프탑 파티룸', 'text', 'full', '손님 화면과 검색 결과에 보이는 이름이에요. 동네 이름을 앞에 넣으면 검색에 유리하고, 뒤의 "파티룸"은 화면 제목에 자동으로 붙어요.')}
        <div class="field"><label class="label" for="a_region">지역 (권역)</label><select class="select" id="a_region">${REGIONS.map((r) => `<option value="${r}"${d.region === r ? ' selected' : ''}>${r}</option>`).join('')}<option value="__etc"${d.region && !REGIONS.includes(d.region) ? ' selected' : ''}>직접 입력</option></select><input class="input" id="a_region2" maxlength="10" value="${esc(d.region && !REGIONS.includes(d.region) ? d.region : '')}" placeholder="예) 경남" style="margin-top:6px" ${d.region && !REGIONS.includes(d.region) ? '' : 'hidden'}></div>
        ${ip('a_area', '동네', d.area, 20, '예) 성수, 홍대, 수원', 'text', '', '지역별 지점 화면과 "동네 파티룸" 검색에 쓰여요.')}
        ${ip('a_addr', '주소', d.addr, 120, '서울 성동구 성수동2가 …', 'text', 'full', '손님 화면에 그대로 보여요. 상세 호수는 예약 뒤 문자로 안내해도 돼요.')}
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
      const miss = missing || [];
      return `<div class="hs-wz-sum">
        <div class="form-grid">
          ${ip('a_hostName', '호스트 표시 이름', d.hostName, 30, '예) 성수 호스트, OO스튜디오', 'text', '', '지점 화면에 "호스트 운영 · 이름"으로 보여요.')}
          <div class="field"><span class="label">사업자 등록</span><div class="chips" style="margin-top:6px"><button type="button" class="chip${d.biz === 'yes' ? ' on' : ''}" data-biz="yes">사업자예요</button><button type="button" class="chip${d.biz === 'no' ? ' on' : ''}" data-biz="no">아직 없어요</button></div><p class="help">세금계산서 발행과 결제 안내에 참고해요.</p></div>
          ${ip('a_contact', '운영팀이 연락할 번호 또는 이메일', contact, 60, '010-0000-0000', 'text', 'full', '손님에게는 보이지 않고 검수·승인 안내에만 써요.')}
        </div>
        <div class="box fog" style="margin-top:16px"><h3 class="h4">제출 전 확인</h3>
          <ul class="hs-check" style="border:0;padding-top:8px">
            <li class="${d.name && d.addr && d.base && d.max ? 'ok' : ''}">기본 정보 — ${esc(d.name || '이름 없음')} · ${esc([d.region, d.area].filter(Boolean).join(' ') || '지역 미정')} · 기준 ${d.base || '-'}명 / 최대 ${d.max || '-'}명</li>
            <li class="${(d.photos || []).length >= 1 ? 'ok' : ''}">사진 ${(d.photos || []).length}장${(d.photos || []).length < 5 ? ' (5장 이상 권장)' : ''}</li>
            <li class="${d.intro && d.intro.length >= 20 ? 'ok' : ''}">소개 ${d.intro ? d.intro.length + '자' : '없음'}</li>
            <li class="${hasPrice(d) ? 'ok' : ''}">요금 — ${d.hourly && (d.pkgs || []).length ? '시간제 + 패키지' : d.hourly ? '시간제' : (d.pkgs || []).length ? `패키지 ${d.pkgs.length}개` : '아직 없음'}</li>
            <li class="${(bk.ways || []).length ? 'ok' : ''}">예약 방식 — ${(bk.ways || []).map((w) => SP.BOOK_KINDS[w.k]).join(' · ') || '아직 없음'}${bk.confirm ? ` · ${SP.CONFIRM_KINDS[bk.confirm]}` : ''}</li>
          </ul>
          ${miss.length ? `<p class="small" style="color:var(--red-deep);font-weight:700;margin-top:6px">아직 빠진 항목: ${miss.map(esc).join(', ')}</p>` : '<p class="small muted" style="margin-top:6px">제출하면 운영팀이 확인하고 알림으로 알려 드려요. 보완할 점이 있으면 사유와 함께 돌려 드리고, 고쳐서 다시 제출할 수 있어요.</p>'}
        </div>
        <label class="check" style="margin-top:14px;align-items:flex-start"><input type="checkbox" id="a_agree"${d.agree ? ' checked' : ''}><span>적은 정보가 실제 공간과 같고, 손님에게 보이는 내용(주소·요금·예약 방식·전화번호)을 공개하는 데 동의해요. 등록 요금과 기간(1·3·6·12개월)은 <a class="link" href="/host#plans" target="_blank" rel="noopener">호스트 모집</a> 기준이고, 결제 방법은 승인 안내 때 따로 받아요.</span></label>
      </div>`;
    };
    const render = () => {
      root.innerHTML = `<div class="hs-wz">
        <div class="between" style="margin-bottom:14px"><div><span class="eyebrow">공간 등록 신청${readOnly ? ' · 검수 중' : ''}</span><h2 class="h2">${esc(d.name || '새 공간')}</h2></div><button class="btn btn-ghost btn-sm" type="button" id="wzBack">${icon('chev-l', 'sm')}내 공간 관리로</button></div>
        ${a.status === 'rejected' && a.note ? `<div class="callout red" style="margin-bottom:14px">${icon('alert')}<div><b>운영팀 보완 요청</b><br>${esc(a.note)}</div></div>` : ''}
        ${bar()}
        <div class="box hs-wz-body"><h3 class="h3" style="margin-bottom:4px">${step}. ${STEPS[step - 1][0]}</h3><p class="small muted" style="margin-bottom:16px">${STEPS[step - 1][1]}</p>${body()}<div class="form-err" id="wzErr" hidden></div></div>
        <div class="hs-wz-foot">${step > 1 ? `<button class="btn btn-soft" type="button" id="wzPrev">${icon('chev-l', 'sm')}이전</button>` : '<span></span>'}
          <div class="row" style="gap:8px">${readOnly ? '' : '<button class="btn btn-line" type="button" id="wzSave">저장만 하기</button>'}${step < 6 ? `<button class="btn btn-red" type="button" id="wzNext">저장하고 다음${icon('chev-r', 'sm')}</button>` : readOnly ? '' : '<button class="btn btn-red btn-lg" type="button" id="wzSubmit">검수 요청 (제출)</button>'}</div></div>
      </div>`;
      if (step === 2) eds.photos = photoEditor($('#a_photos'), d.photos || [], { urls: a.photoUrls || [] });
      if (step === 3) eds.feat = featEditor($('#a_feat'), d.feat || {});
      if (step === 4) eds.price = priceEditor($('#a_price'), d);
      if (step === 5) eds.ways = waysEditor($('#a_ways'), d.booking || {});
      if (step === 1) { const sel = $('#a_region'); sel.onchange = () => { $('#a_region2').hidden = sel.value !== '__etc'; }; }
      if (step === 6) $$('[data-biz]').forEach((b) => { b.onclick = () => { d.biz = b.dataset.biz; $$('[data-biz]').forEach((x) => x.classList.toggle('on', x === b)); }; });
      if (readOnly) $$('.hs-wz-body input, .hs-wz-body textarea, .hs-wz-body select, .hs-wz-body button').forEach((el) => { el.disabled = true; });
      $('#wzBack').onclick = async () => { await reload(); draw(); window.scrollTo(0, 0); };
      const prev = $('#wzPrev'); if (prev) prev.onclick = () => { step--; render(); };
      $$('[data-go]').forEach((b) => { b.onclick = () => { const n = Number(b.dataset.go); if (n === step) return; if (readOnly) { step = n; render(); return; } save(n).catch(SP.fail); }; });
      const nx = $('#wzNext'); if (nx) nx.onclick = () => save(step + 1).catch(SP.fail);
      const sv = $('#wzSave'); if (sv) sv.onclick = () => save(step, { stay: true }).catch(SP.fail);
      const sb = $('#wzSubmit'); if (sb) sb.onclick = submit;
      if (!readOnly) root.querySelectorAll('input, textarea, select').forEach((el) => el.addEventListener('input', () => { dirty.v = true; }));
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
      return { hostName: val(r, 'a_hostName'), biz: d.biz || '', agree: chk(r, 'a_agree') };
    };
    async function save(next, { stay = false } = {}) {
      const err = $('#wzErr'); if (err) err.hidden = true;
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
        dirty.v = false;
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
      if (missing && missing.length) { const el = $('#wzErr'); el.textContent = '아직 빠진 항목이 있어요: ' + missing.join(', '); el.hidden = false; return; }
      if (!(await SP.confirm('운영팀에 검수를 요청할까요? 검수 중에는 내용을 고칠 수 없어요(「검수 취소」로 되돌릴 수 있어요).', { ok: '검수 요청' }))) return;
      const btn = $('#wzSubmit'); SP.busy(btn, true, '보내는 중');
      try {
        await SP.post(`/api/host/apps/${a.id}/submit`);
        SP.toast('검수를 요청했어요. 확인되면 알림으로 알려 드릴게요.');
        await reload(); draw(); window.scrollTo(0, 0);
      } catch (e) { SP.busy(btn, false); const el = $('#wzErr'); el.textContent = e.message; el.hidden = false; }
    }
    render();
  }

  init().catch((e) => console.error(e));
})();
