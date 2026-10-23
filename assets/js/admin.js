/* =====================================================================
   쏘플파티룸 홈페이지 관리 — 운영진 화면
   한눈에 · 예약 현황(방막기) · 데이터 연결 · 지점 · 행사 · 커뮤니티 · 모임/파티팀
   · 회원 · 방문 인증 · 문의 · 제휴 · 설정
   ===================================================================== */
(function () {
  'use strict';
  const { $, $$, esc, icon } = SP;
  const main = $('#admMain');
  let LV = null;              // 'admin'(대표 관리자) | 'staff'(운영진)
  let BOUND = {};
  let SPACES = null;
  let COUNTS = {};
  const isAdmin = () => LV === 'admin';

  const NAV = [
    ['g', '운영'],
    ['overview', '한눈에', 'grid'],
    ['avail', '예약 현황 · 방막기', 'calendar'],
    ['data', '데이터 연결', 'refresh'],
    ['spaces', '지점 관리', 'building'],
    ['g', '같이 놀기'],
    ['events', '행사', 'ticket'],
    ['community', '커뮤니티 · 신고', 'chat'],
    ['groups', '모임 · 파티팀', 'users'],
    ['g', '고객'],
    ['users', '회원', 'user'],
    ['visits', '방문 인증', 'badge'],
    ['inquiries', '문의함', 'megaphone'],
    ['partners', '제휴', 'handshake'],
    ['settings', '설정', 'sliders'],
  ];
  const SLOTK = { all: '하루 전체', day: '낮', night: '밤' };
  const SRC = { host: '호스트 예약', upload: '엑셀', manual: '직접', push: '외부 수신' };
  const HOST_URL = 'host.jssystems.kr';
  const PKG = { day: '낮', night: '밤', allday: '올데이', tonight: '투나잇', morning: '오전', hour3: '3시간', full: '풀패키지' };
  const EVENT_CATS = ['파티', '원데이 클래스', '네트워킹', '시즌 이벤트', '오픈 기념', '기타'];

  /* ---------------- 작은 도구 ---------------- */
  const hd = (title, desc, acts = '') => `<div class="a-hd"><div><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div>${acts ? `<div class="row">${acts}</div>` : ''}</div>`;
  const B = (cls, t) => `<span class="badge ${cls}">${esc(t)}</span>`;
  const when = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : '-');
  const day = (iso) => (iso ? String(iso).slice(0, 10).replace(/-/g, '.') : '-');
  const errBox = (e) => `<div class="a-card"><h2>불러오지 못했어요</h2><p class="a-note" style="margin-top:6px">${esc(e.message)}</p></div>`;
  const emptyRow = (cols, msg) => `<tr><td colspan="${cols}"><div class="a-empty">${msg}</div></td></tr>`;
  /** '19:00', '19시', '1900', '7:30' → 분. 못 읽으면 null */
  const t2m = (t) => {
    const v = String(t || '').trim().replace(/\s/g, '');
    let m = /^(\d{1,2}):(\d{2})$/.exec(v) || /^(\d{1,2})시(?:(\d{1,2})분?)?$/.exec(v) || /^(\d{2})(\d{2})$/.exec(v) || /^(\d{1,2})$/.exec(v);
    if (!m) return null;
    const h = +m[1], mi = m[2] ? +m[2] : 0;
    return h <= 24 && mi < 60 ? (h % 24) * 60 + mi : null;
  };
  const m2t = (m) => (m == null ? '' : `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  const ageOf = (b) => { if (!b) return null; const t = SP.today(); let a = +t.slice(0, 4) - +b.slice(0, 4); if (t.slice(5) < b.slice(5)) a--; return a; };
  async function spaces(fresh) { if (!SPACES || fresh) SPACES = (await SP.get('/api/admin/spaces')).spaces; return SPACES; }
  const nameOf = (code) => ((SPACES || []).find((s) => s.code === code) || {}).name || code || '';
  const seg = (id, items, cur) => `<div class="seg" id="${id}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const onSeg = (root, id, fn) => { const el = root.querySelector('#' + id); if (!el) return; el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); fn(b.dataset.v); }); };

  /* ---------------- 들어가기 · 메뉴 ---------------- */
  function drawNav() {
    const cnt = { community: COUNTS.reports, inquiries: COUNTS.inquiries, events: COUNTS.eventsPending, visits: COUNTS.visitsPending };
    const cur = (location.hash.slice(1) || 'overview');
    $('#admNav').innerHTML = NAV.map((n) => (n[0] === 'g' ? `<div class="grp">${n[1]}</div>`
      : `<button type="button" data-v="${n[0]}" class="${n[0] === cur ? 'on' : ''}">${icon(n[2])}<span>${n[1]}</span>${cnt[n[0]] ? `<span class="cnt">${cnt[n[0]] > 99 ? '99+' : cnt[n[0]]}</span>` : ''}</button>`)).join('');
  }
  async function refreshCounts() {
    try { const d = await SP.get('/api/admin/overview'); COUNTS = d.counts; drawNav(); return d; } catch { return null; }
  }
  function showLogin(info) {
    $('#admApp').hidden = true;
    $('#admLogin').hidden = false;
    const err = $('#admErr');
    if (info && info.hasPassword === false) { err.textContent = '관리자 비밀번호(ADMIN_PASSWORD)가 아직 등록되지 않았어요. 배포 안내서의 "관리자 비밀번호 등록" 단계를 먼저 진행해 주세요. 운영진 권한이 있는 회원 계정으로 로그인해도 들어올 수 있어요.'; err.hidden = false; }
    setTimeout(() => $('#admPw').focus(), 30);
  }
  async function boot() {
    const r = await SP.get('/api/admin/me').catch(() => ({ level: null }));
    BOUND = r.bound || {};
    if (!r.level) { showLogin(r); return; }
    LV = r.level;
    $('#admLogin').hidden = true;
    $('#admApp').hidden = false;
    $('#admWho').textContent = isAdmin() ? '대표 관리자로 들어와 있어요' : '운영진으로 들어와 있어요';
    drawNav();
    refreshCounts();
    go(location.hash.slice(1) || 'overview');
  }
  $('#admLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#admErr'); err.hidden = true;
    const btn = e.submitter || $('#admLoginForm button[type=submit]');
    SP.busy(btn, true, '확인하는 중…');
    try { await SP.post('/api/admin/login', { password: $('#admPw').value }); $('#admPw').value = ''; await boot(); }
    catch (er) { err.textContent = er.message; err.hidden = false; }
    SP.busy(btn, false);
  });
  $('#admOut').addEventListener('click', async () => {
    try { await SP.post('/api/admin/logout'); } catch { /* 무시 */ }
    location.href = '/';
  });
  $('#admNav').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) go(b.dataset.v); });
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS[v] && !$('#admApp').hidden) go(v, false); });

  async function go(name, setHash = true) {
    if (!VIEWS[name]) name = 'overview';
    $$('#admNav [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === name));
    if (setHash && location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    main.onclick = null; main.onchange = null; main.oninput = null; main.onsubmit = null;
    main.innerHTML = '<div class="a-empty">불러오는 중…</div>';
    try { await VIEWS[name](); }
    catch (e) {
      if (e.data && e.data.needAdmin) { showLogin(); return; }
      main.innerHTML = errBox(e);
    }
  }

  /* ================= 한눈에 ================= */
  async function overview() {
    const d = await SP.get('/api/admin/overview');
    COUNTS = d.counts; drawNav();
    const c = d.counts;
    const todo = [
      ['community', '처리할 신고', c.reports, '신고가 쌓인 글·모임'],
      ['inquiries', '새 문의', c.inquiries, '제휴·단체·입점 상담'],
      ['events', '승인 기다리는 행사', c.eventsPending, '회원이 제안한 행사'],
      ['visits', '확인할 방문 인증', c.visitsPending, '예약번호 대조가 필요해요'],
    ];
    const tile = ([v, k, n, s]) => `<button type="button" class="tile ${n ? 'todo' : 'zero'}" data-go="${v}"><div class="k">${k}</div><div class="v">${n}</div><div class="s">${s}</div></button>`;
    const s = d.sync;
    let sync;
    if (!d.bound.host) sync = `<p><span class="st">호스트 예약 연결 없이 운영 중</span></p><p class="a-note" style="margin-top:6px">빈 방 표시는 <b>데이터 연결 → 엑셀로 예약 올리기</b>(네이버 예약에서 내려받은 파일)와 <b>예약 현황 · 방막기</b>로 채워요. 마감 칸은 바로 보이고, "예약 가능"은 공개 지점 전부를 최근 3일 안에 채웠을 때만 보여요. 그 전에는 "네이버에서 확인"으로 안내해요.</p>`;
    else if (!s) sync = '<p><span class="st warn">아직 한 번도 불러오지 않았어요</span></p><p class="a-note" style="margin-top:6px">오른쪽 위 "예약 지금 불러오기"를 눌러 보세요.</p>';
    else if (!s.ok) sync = `<p><span class="st bad">불러오다 문제가 생겼어요</span> <span class="small muted">${SP.ago(s.at)}</span></p><p class="a-note" style="margin-top:6px">${esc(s.error || '')}</p>`;
    else sync = `<p><span class="st ok">자동 반영 중</span> <span class="small muted">${SP.ago(s.okAt && s.okAt > s.at ? s.okAt : s.at)} 확인${s.cronAt && Date.now() - Date.parse(s.cronAt) < 40 * 60e3 ? ' · 10분마다 자동 실행' : ''}</span></p>
      <dl class="kv2" style="margin-top:10px"><dt>반영한 예약</dt><dd>${s.active}건 → 마감 ${s.blocks}칸</dd><dt>가장 늦은 이용일</dt><dd>${esc(s.latest || '-')}</dd>
      <dt>이름이 안 맞는 지점</dt><dd>${s.unmatched ? `<b class="red">${s.unmatched}곳</b> · 데이터 연결에서 짝지어 주세요` : '없어요'}</dd></dl>`;
    const occ = Object.fromEntries((d.occ || []).map((r) => [r.src, r.n]));
    const max = Math.max(1, ...d.clicks7.map((r) => r.n));
    main.innerHTML = hd('한눈에', '오늘 처리할 일과 예약 데이터 상태를 먼저 보여 줘요.', d.bound.host ? `<button class="btn btn-ink btn-sm" type="button" data-sync>${icon('refresh', 'sm')}예약 지금 불러오기</button>` : '')
      + `<div class="a-grid c4">${todo.map(tile).join('')}</div>`
      + `<div class="a-grid c4" style="margin-top:14px">
          <div class="tile"><div class="k">활동 회원</div><div class="v">${SP.fmt(c.users)}</div><div class="s">이번 주 가입 ${c.users7}명</div></div>
          <div class="tile"><div class="k">이번 주 새 글</div><div class="v">${c.posts7}</div><div class="s">후기·꿀팁·질문·자유</div></div>
          <div class="tile"><div class="k">활동 중인 모임</div><div class="v">${c.meetups}</div><div class="s">숨김·종료 제외</div></div>
          <div class="tile"><div class="k">모집 중인 파티팀</div><div class="v">${c.crews}</div><div class="s">오늘 이후 날짜</div></div></div>`
      + `<div class="a-grid c2" style="margin-top:14px">
          <div class="a-card"><div class="a-card-hd"><h2>예약 데이터</h2><button class="btn btn-ghost btn-sm" type="button" data-go="data">자세히</button></div>${sync}
            <dl class="kv2" style="margin-top:12px"><dt>앞으로 2주 마감 칸</dt><dd>호스트 ${occ.host || 0} · 엑셀 ${occ.upload || 0} · 직접 ${occ.manual || 0} · 외부 수신 ${occ.push || 0}</dd></dl></div>
          <div class="a-card"><div class="a-card-hd"><h2>최근 7일 예약 버튼</h2><span class="small muted">네이버 예약·플레이스로 넘어간 횟수</span></div>
            ${d.clicks7.length ? `<div class="bars">${d.clicks7.map((r) => `<div class="bar-row"><span>${esc(r.name)}</span><i><b style="width:${Math.max(4, Math.round((r.n / max) * 100))}%"></b></i><em>${r.n}</em></div>`).join('')}</div>` : '<p class="a-note">아직 기록이 없어요. 고객이 지점 화면에서 예약 버튼을 누르면 여기 쌓여요.</p>'}</div></div>`;
    main.onclick = async (e) => {
      const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
      const b = e.target.closest('[data-sync]'); if (b) { await runSync(b); overview(); }
    };
  }
  async function runSync(btn) {
    SP.busy(btn, true, '불러오는 중…');
    try {
      const r = await SP.post('/api/admin/sync');
      if (r.synced) SP.toast(`예약 ${r.diag.active}건을 확인했어요.${r.diag.added || r.diag.removed ? ` 새로 막힌 칸 ${r.diag.added}, 풀린 칸 ${r.diag.removed}` : ' 바뀐 칸은 없어요.'}`);
      else SP.toast(r.diag.error || '불러오지 못했어요.', true);
    } catch (e) { SP.fail(e); }
    SP.busy(btn, false);
  }

  /* ================= 예약 현황 · 방막기 ================= */
  const AV = { from: SP.today(), days: 14, region: '', q: '' };
  const STATE = { o: '예약 가능', b: '마감', c: '지난 시간', '-': '운영 안 함' };
  async function avail() {
    const d = await SP.get(`/api/admin/occ?from=${AV.from}&days=${AV.days}`);
    const ctx = { d, man: {}, src: {} };
    for (const r of d.rows) {
      const k = r.code + '|' + r.d;
      (ctx.src[k] = ctx.src[k] || new Set()).add(r.src);
      if (r.src === 'manual') (ctx.man[k] = ctx.man[k] || []).push(r);
    }
    const regions = [...new Set(d.spaces.map((s) => s.region))];
    const list = d.spaces.filter((s) => (!AV.region || s.region === AV.region) && (!AV.q || (s.name + s.area + s.code).toLowerCase().includes(AV.q.toLowerCase())));
    const dates = Array.from({ length: d.days }, (_, i) => SP.addDays(d.from, i));
    const today = SP.today();
    const head = `<tr><th class="nm">지점</th>${dates.map((x) => `<th class="${SP.isWeekend(x) || SP.wdi(x) === 5 ? 'we' : ''}${x === today ? ' today' : ''}">${Number(x.slice(5, 7))}/${Number(x.slice(8))}<small>${SP.wd(x)}</small></th>`).join('')}</tr>`;
    const mk = (code, x, half) => {
      const ms = (ctx.man[code + '|' + x] || []).filter((m) => m.slot === 'all' || m.slot === (half === 'd' ? 'day' : 'night'));
      if (!ms.length) return '';
      return `<i class="mk${ms.some((m) => m.kind === 'open') ? ' open' : ''}"></i>`;
    };
    const rows = list.map((s) => {
      const code = d.avail[s.code] || '';
      return `<tr><th class="nm${s.visible ? '' : ' off'}">${esc(s.name)}<small>${esc(s.region)} ${esc(s.area)}${s.visible ? '' : ' · 숨김'}</small></th>${dates.map((x, i) => {
        const a = code[i * 2] || '-', n = code[i * 2 + 1] || '-';
        return `<td class="c"><span class="cell"><button type="button" class="d" data-s="${a}" data-cell="${s.code}|${x}|d" title="${esc(s.name)} ${SP.mdw(x)} 낮 ${STATE[a]}">${icon('sun')}${mk(s.code, x, 'd')}</button><button type="button" class="n" data-s="${n}" data-cell="${s.code}|${x}|n" title="${esc(s.name)} ${SP.mdw(x)} 밤 ${STATE[n]}">${icon('moon')}${mk(s.code, x, 'n')}</button></span></td>`;
      }).join('')}</tr>`;
    }).join('');
    const keep = $('.cal-wrap', main); const sx = keep ? keep.scrollLeft : 0, sy = keep ? keep.scrollTop : 0;
    main.innerHTML = hd('예약 현황 · 방막기', '호스트 예약, 엑셀, 직접 막은 칸을 합쳐서 고객 화면과 똑같이 보여 줘요. 칸을 누르면 막거나 열 수 있어요.',
      `<button class="btn btn-line btn-sm" type="button" data-range>${icon('calendar', 'sm')}기간으로 막기</button>${BOUND.host ? `<button class="btn btn-ink btn-sm" type="button" data-sync>${icon('refresh', 'sm')}예약 지금 불러오기</button>` : ''}`)
      + `<div class="a-tools">
          <button class="btn btn-soft btn-sm" type="button" data-move="-7" aria-label="이전 주">${icon('chev-l', 'sm')}</button>
          <input class="input" type="date" id="avFrom" value="${AV.from}" style="min-width:0">
          <button class="btn btn-soft btn-sm" type="button" data-move="7" aria-label="다음 주">${icon('chev-r', 'sm')}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-move="0">오늘</button>
          <select class="select" id="avRegion"><option value="">모든 권역</option>${regions.map((r) => `<option${r === AV.region ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
          <input class="input" id="avQ" placeholder="지점 이름으로 찾기" value="${esc(AV.q)}">
          <span class="small muted">${list.length}곳</span></div>
        <div class="cal-wrap"><table class="cal"><thead>${head}</thead><tbody>${rows || `<tr><td colspan="${dates.length + 1}"><div class="a-empty">조건에 맞는 지점이 없어요.</div></td></tr>`}</tbody></table></div>
        <div class="cal-legend"><span><i style="background:var(--sun)"></i>낮 예약 가능</span><span><i style="background:var(--moon)"></i>밤 예약 가능</span><span><i style="background:var(--tape)"></i>마감</span><span><i style="background:#fafafa"></i>지난 시간</span><span><i style="background:#fff"></i>운영 안 함</span><span><i style="background:var(--red);border-radius:50%"></i>직접 막음</span><span><i style="background:#22a565;border-radius:50%"></i>직접 열어 둠</span></div>`;
    const w = $('.cal-wrap', main); if (w) { w.scrollLeft = sx; w.scrollTop = sy; }
    $('#avFrom').onchange = (e) => { if (e.target.value) { AV.from = e.target.value; avail(); } };
    $('#avRegion').onchange = (e) => { AV.region = e.target.value; avail(); };
    $('#avQ').oninput = SP.debounce((e) => { AV.q = e.target.value.trim(); avail().then(() => { const q = $('#avQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 300);
    main.onclick = async (e) => {
      const mv = e.target.closest('[data-move]');
      if (mv) { const n = Number(mv.dataset.move); AV.from = n ? SP.addDays(AV.from, n) : SP.today(); avail(); return; }
      const c = e.target.closest('[data-cell]');
      if (c) { const [code, x, half] = c.dataset.cell.split('|'); cellModal(ctx, code, x, half, c.dataset.s); return; }
      if (e.target.closest('[data-range]')) { rangeModal(d.spaces); return; }
      const b = e.target.closest('[data-sync]'); if (b) { await runSync(b); avail(); }
    };
  }

  function cellModal(ctx, code, x, half, st) {
    const sp = ctx.d.spaces.find((s) => s.code === code) || { name: code };
    const k = code + '|' + x;
    const srcs = [...(ctx.src[k] || [])];
    const mans = ctx.man[k] || [];
    const slot = half === 'd' ? 'day' : 'night';
    const m = SP.modal({
      title: `${sp.name} · ${SP.mdw(x)} ${half === 'd' ? '낮' : '밤'}`,
      body: `<p>지금 고객 화면에는 <b>${STATE[st] || st}</b>(으)로 보여요.</p>
        ${srcs.length ? `<p class="a-note" style="margin-top:6px">이날 들어온 기록: ${srcs.map((s) => SRC[s] || s).join(', ')}</p>` : '<p class="a-note" style="margin-top:6px">이날 들어온 예약 기록이 없어요.</p>'}
        ${mans.length ? `<div class="list-plain" style="margin-top:10px">${mans.map((r) => `<div><span>${r.kind === 'open' ? B('ok', '직접 열어 둠') : B('red', '직접 막음')} ${SLOTK[r.slot] || r.slot}${r.note ? ` · ${esc(r.note)}` : ''}</span><button class="btn btn-ghost btn-sm" type="button" data-clear="${esc(r.slot)}">지우기</button></div>`).join('')}</div>` : ''}
        <div class="field" style="margin-top:16px"><span class="label">어디까지</span>${seg('ocSlot', [[slot, half === 'd' ? '낮만' : '밤만'], ['all', '하루 전체']], slot)}</div>
        <div class="field"><label class="label" for="ocNote">메모 <span class="opt">선택 · 운영진만 봐요</span></label><input class="input" id="ocNote" maxlength="80" placeholder="예) 전화 예약, 시설 점검, 대관"></div>
        <p class="tiny faint" style="margin-top:10px">"예약 가능으로 열기"는 호스트 예약 기록이 잘못 들어왔을 때만 쓰세요. 실제 예약이 있는데 열면 겹쳐서 예약될 수 있어요.</p>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-line" type="button" data-act="open">예약 가능으로 열기</button><button class="btn btn-red" type="button" data-act="block">마감으로 막기</button>',
    });
    let pick = slot;
    onSeg(m.el, 'ocSlot', (v) => { pick = v; });
    const send = async (action, s) => {
      try { await SP.post('/api/admin/occ', { code, d: x, slot: s, action, note: m.$('#ocNote').value.trim() }); m.close(); SP.toast(action === 'clear' ? '직접 바꾼 내용을 지웠어요.' : action === 'open' ? '예약 가능으로 열었어요.' : '마감으로 막았어요.'); avail(); }
      catch (e) { SP.fail(e); }
    };
    m.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]'); if (a) { send(a.dataset.act, pick); return; }
      const c = e.target.closest('[data-clear]'); if (c) send('clear', c.dataset.clear);
    });
  }

  function rangeModal(list) {
    const m = SP.modal({
      title: '기간으로 막기',
      body: `<p class="a-note">휴무, 공사, 대관처럼 여러 날을 한 번에 막을 때 써요. 이미 직접 막은 칸은 새 내용으로 바뀌어요.</p>
        <div class="field" style="margin-top:14px"><label class="label" for="rgCode">지점</label><select class="select" id="rgCode">${SP.spaceOptions(list, '', '지점을 골라 주세요')}</select></div>
        <div class="form-grid" style="margin-top:14px"><div class="field"><label class="label" for="rgA">시작일</label><input class="input" type="date" id="rgA" value="${SP.today()}"></div><div class="field"><label class="label" for="rgB">끝나는 날</label><input class="input" type="date" id="rgB" value="${SP.addDays(SP.today(), 1)}"></div></div>
        <div class="field" style="margin-top:14px"><span class="label">어디를</span>${seg('rgSlot', [['all', '하루 전체'], ['day', '낮만'], ['night', '밤만']], 'all')}</div>
        <div class="field"><span class="label">어떻게</span>${seg('rgAct', [['block', '마감으로 막기'], ['clear', '직접 바꾼 것 지우기']], 'block')}</div>
        <div class="field"><label class="label" for="rgNote">메모 <span class="opt">선택</span></label><input class="input" id="rgNote" maxlength="80" placeholder="예) 정기 휴무"></div>
        <div class="form-err" id="rgErr" hidden></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="rgGo">적용하기</button>',
    });
    let slot = 'all', act = 'block';
    onSeg(m.el, 'rgSlot', (v) => { slot = v; });
    onSeg(m.el, 'rgAct', (v) => { act = v; });
    m.$('#rgGo').onclick = async () => {
      const code = m.$('#rgCode').value, a = m.$('#rgA').value, b = m.$('#rgB').value;
      const err = m.$('#rgErr');
      if (!code || !a || !b || b < a) { err.textContent = '지점과 기간을 확인해 주세요.'; err.hidden = false; return; }
      const n = SP.dayDiff(a, b) + 1;
      if (n > 62) { err.textContent = '한 번에 62일까지 적용할 수 있어요.'; err.hidden = false; return; }
      const btn = m.$('#rgGo');
      try {
        for (let i = 0; i < n; i++) {
          btn.textContent = `적용하는 중… ${i + 1}/${n}`; btn.disabled = true;
          await SP.post('/api/admin/occ', { code, d: SP.addDays(a, i), slot, action: act, note: m.$('#rgNote').value.trim() });
        }
        m.close(); SP.toast(`${n}일에 적용했어요.`); avail();
      } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = '적용하기'; }
    };
  }

  /* ================= 데이터 연결 ================= */
  async function data() {
    const [d] = await Promise.all([SP.get('/api/admin/sync'), spaces()]);
    const g = d.diag;
    const map = d.map || {};
    const counts = Object.fromEntries((d.counts || []).map((r) => [r.src, r.n]));
    const bound = d.bound;
    const yes = (ok, a, b) => `<span class="st ${ok ? 'ok' : 'bad'}">${ok ? a : b}</span>`;
    let diagHtml = '<p class="a-note">아직 불러온 기록이 없어요.</p>';
    if (g) {
      const col = g.col || {};
      const COLN = { code: '지점 코드', bname: '지점 이름', bid: '지점 번호', date: '이용 날짜', start: '시작 시각', end: '끝 시각', slot: '구분(낮/밤)', status: '예약 상태', resno: '예약번호', created: '등록 시각', channel: '채널', source: '경로' };
      diagHtml = `<dl class="kv2">
        <dt>시각</dt><dd>${when(g.at)} (${esc(g.reason || '')})${d.okAt && d.okAt > g.at ? ` · 마지막 확인 ${when(d.okAt)}` : ''}</dd>
        <dt>결과</dt><dd>${g.ok ? '<span class="st ok">정상</span>' : `<span class="st bad">문제 있음</span><div class="a-note" style="margin-top:4px">${esc(g.error || '')}</div>`}</dd>
        ${g.table ? `<dt>예약 표</dt><dd class="mono">${esc(g.table)}</dd>` : ''}
        ${g.branchTable ? `<dt>지점 표</dt><dd class="mono">${esc(g.branchTable)}</dd>` : ''}
        ${g.closuresTable ? `<dt>휴무 표</dt><dd class="mono">${esc(g.closuresTable)}${g.closuresError ? ` · <span class="red">${esc(g.closuresError)}</span>` : ''}</dd>` : ''}
        ${g.lastNo ? `<dt>예약 표 마지막 번호</dt><dd>${esc(g.lastNo)}</dd>` : ''}
        ${g.latest ? `<dt>가장 늦은 이용일</dt><dd>${esc(g.latest)}</dd>` : ''}
        ${g.latestCreated ? `<dt>가장 최근 등록</dt><dd>${esc(String(g.latestCreated).slice(0, 16).replace('T', ' '))}</dd>` : ''}
        ${g.window ? `<dt>살펴본 기간</dt><dd>${esc(g.window[0])} ~ ${esc(g.window[1])}</dd>` : ''}
        ${g.ok ? `<dt>반영</dt><dd>${g.rowsInWindow != null ? `기간 안 ${g.rowsInWindow}건 중 취소 뺀 ` : '취소를 뺀 예약 '}${g.active}건 → 마감 ${g.blocks}칸${g.closures ? ` (휴무 ${g.closures}칸 포함)` : ''}${g.added != null ? ` · 이번에 새로 ${g.added}칸, 풀림 ${g.removed}칸` : ''}</dd>` : ''}
        ${g.statuses && g.statuses.length ? `<dt>예약 상태 값</dt><dd>${g.statuses.map((x) => `${esc(x.s)} ${x.n}`).join(' · ')} <span class="tiny faint">(예약 지금 불러오기 때 셈)</span></dd>` : ''}
        ${Object.keys(col).length ? `<dt>찾은 칸</dt><dd>${Object.entries(col).filter(([, v]) => v).map(([k, v]) => `${COLN[k] || k} <span class="mono">${esc(v)}</span>`).join(' · ')}</dd>` : ''}
        ${g.tables && !g.ok ? `<dt>DB 안의 표</dt><dd class="mono">${esc((g.tables || []).join(', '))}</dd>` : ''}
      </dl>`;
    }
    const um = (g && g.unmatched) || [];
    const alias = map.alias || {};
    const fresh = (iso, min) => iso && Date.now() - Date.parse(iso) < min * 60e3;
    const cronOn = fresh(d.cronAt, 40);
    const uc = d.upCover || { fresh: 0, total: 0 };
    const upAll = uc.total && uc.fresh >= uc.total;
    const upState = upAll ? '<span class="st ok">전 지점 반영 중</span>' : uc.fresh ? `<span class="st warn">${uc.fresh}곳 반영 · 마감만 표시</span>` : d.upAt ? '<span class="st warn">새 파일이 필요해요</span>' : '<span class="st">아직 안 올림</span>';
    const upNote = upAll ? `${SP.ago(d.upAt)} 올림 · 공개 지점 전부가 최근 3일 안에 채워져서 고객 화면에 빈 방이 보여요.`
      : uc.fresh ? `공개 ${uc.total}곳 중 ${uc.fresh}곳만 최근 3일 안에 올렸어요. 올린 지점의 마감 칸은 고객 화면에 보이고, "예약 가능"은 전 지점을 채웠을 때만 보여요.`
        : '네이버 예약에서 예약 목록을 엑셀로 내려받아 아래에 올리면 날짜별 마감이 채워져요.';
    const badTok = d.cronBadAt && (!d.cronAt || d.cronBadAt > d.cronAt) && fresh(d.cronBadAt, 60);
    const autoState = badTok ? '<span class="st bad">토큰이 맞지 않아요</span>' : cronOn ? '<span class="st ok">10분마다 켜짐</span>' : bound.host && fresh(d.okAt, 360) ? '<span class="st warn">방문할 때 확인</span>' : '<span class="st bad">꺼짐</span>';
    const autoNote = badTok ? `${SP.ago(d.cronBadAt)} 실행기가 왔지만 SYNC_TOKEN이 홈페이지와 달라서 돌려보냈어요. 두 곳의 값을 똑같이 맞추고 Retry deployment 해 주세요.`
      : cronOn ? `${SP.ago(d.cronAt)} 자동 실행 · 바뀐 예약만 반영해요.`
        : d.cronAt ? `마지막 자동 실행이 ${SP.ago(d.cronAt)}예요. 실행기(ssople-sync)의 Cron 설정을 확인해 주세요.`
          : '지금은 고객이 홈페이지를 볼 때 10분에 한 번씩 불러와요. 아무도 안 볼 때도 돌게 하려면 켜 주세요.';
    main.innerHTML = hd('데이터 연결', bound.host ? '호스트 센터 예약을 홈페이지 빈 방 표시로 옮겨 오는 곳이에요. 고객 이름이나 전화번호는 가져오지 않고 지점·날짜·시간만 읽어요.' : '네이버 예약에서 내려받은 엑셀을 올려 빈 방 표시를 채우는 곳이에요. 고객 이름이나 전화번호는 서버로 보내지 않아요.',
      bound.host ? `<button class="btn btn-ink btn-sm" type="button" data-sync>${icon('refresh', 'sm')}예약 지금 불러오기</button>` : '')
      + `<div class="a-grid c3">
          <div class="tile"><div class="k">호스트 예약 DB (HOSTDB)</div><div style="margin-top:6px">${bound.host ? yes(true, '연결됨', '') : '<span class="st">쓰지 않음</span>'}</div><div class="s" style="margin-top:4px">${bound.host ? '읽기만 해요. 예약을 바꾸지 않아요.' : '호스트 센터를 다시 쓰게 되면 wrangler.toml에서 켤 수 있어요.'}</div></div>
          <div class="tile"><div class="k">${bound.host ? '자동 업데이트' : '엑셀로 채운 빈 방'}</div><div style="margin-top:6px">${bound.host ? autoState : upState}</div><div class="s" style="margin-top:4px">${bound.host ? autoNote : upNote}</div>
            ${bound.host ? `<button class="btn btn-line btn-sm" type="button" id="cronHow" style="margin-top:10px">${cronOn ? '설정 방법 다시 보기' : '10분마다 자동으로 켜기'}</button>` : ''}</div>
          <div class="tile"><div class="k">사진 저장소 (PHOTOS)</div><div style="margin-top:6px">${yes(bound.photos, '연결됨', '연결 안 됨')}</div><div class="s" style="margin-top:4px">지점·후기 사진 올리기에 필요해요.</div></div></div>
        ${bound.host ? `<div class="a-card" style="margin-top:14px"><div class="a-card-hd"><h2>호스트 센터와 같은 DB인지 확인</h2><button class="btn btn-ghost btn-sm" type="button" id="rcReload">${icon('refresh', 'sm')}다시 보기</button></div>
          <p class="a-note">호스트 DB에 마지막으로 등록된 예약이에요. 이름·전화번호는 읽지 않아요. 호스트 센터(${esc(HOST_URL)})의 최근 예약과 이용일·지점이 같으면 제대로 연결된 거예요. 목록이 비어 있거나 한참 전 예약만 보이면, 홈페이지가 예전 DB를 보고 있는 거라 배포 안내서의 "호스트 DB 확인" 순서대로 Database ID를 바꿔 주세요.</p>
          <div id="rcBox" style="margin-top:10px"><div class="a-empty">불러오는 중…</div></div></div>` : `<div class="a-card" style="margin-top:14px"><h2>지금은 호스트 센터 없이 운영해요</h2><p class="a-note" style="margin-top:6px">빈 방 표시는 두 가지로 채워요. ① 네이버 예약에서 예약 목록을 엑셀로 내려받아 아래 <b>엑셀로 예약 올리기</b>에 올리기(일주일에 두세 번 권해요) ② 전화 예약·내부 사용처럼 네이버에 없는 예약은 <b>예약 현황 · 방막기</b>에서 직접 막기. 고객 화면의 "예약 가능"은 공개 지점 전부가 최근 3일 안에 채워졌을 때만 보이고, 그 전에는 올린 지점의 마감 칸만 보여요. 나머지는 "네이버에서 확인"으로 안내해서 잘못 안내하지 않아요.</p></div>`}
        ${bound.host || g ? `<div class="a-card"><div class="a-card-hd"><h2>최근 불러오기 결과</h2><span class="small muted">오늘 이후 마감 칸: 호스트 ${counts.host || 0} · 엑셀 ${counts.upload || 0} · 직접 ${counts.manual || 0} · 외부 ${counts.push || 0}</span></div>${diagHtml}</div>` : ''}
        ${um.length ? `<div class="a-card"><div class="a-card-hd"><h2>이름이 안 맞는 지점 ${um.length}곳</h2><button class="btn btn-red btn-sm" type="button" id="aliasSave">짝지은 내용 저장</button></div>
          <p class="a-note" style="margin-bottom:10px">호스트 센터의 지점 이름이 홈페이지 지점 이름과 달라서 못 옮긴 예약이에요. 오른쪽에서 같은 지점을 골라 주면 다음부터 자동으로 들어와요.</p>
          <div class="a-tbl-wrap" style="max-height:none"><table class="a-tbl"><thead><tr><th>호스트 센터에 적힌 이름</th><th class="r">예약</th><th>홈페이지 지점</th></tr></thead><tbody>
          ${um.map((u, i) => `<tr><td>${esc(u.label)}</td><td class="r">${u.n}건</td><td><select class="select input-sm" data-alias="${i}">${SP.spaceOptions(SPACES, alias[u.label] || '', '고르지 않음')}</select></td></tr>`).join('')}</tbody></table></div></div>` : ''}
        <div class="a-card"><div class="a-card-hd"><h2>엑셀로 예약 올리기</h2>${counts.upload ? `<button class="btn btn-ghost btn-sm" type="button" id="upClear">${icon('trash', 'sm')}올린 엑셀 내용 모두 지우기</button>` : ''}</div>
          <p class="a-note">네이버 예약(또는 호스트 센터)에서 내려받은 엑셀(.xlsx)이나 CSV를 올리면 날짜별 마감으로 바뀌어요. 파일은 이 화면 안에서만 읽고, <b>이름·전화번호 같은 개인정보는 서버로 보내지 않아요.</b></p>
          <label class="drop" id="drop" style="display:block;margin-top:12px;cursor:pointer"><input type="file" id="upFile" accept=".xlsx,.xls,.csv" hidden>${icon('upload')}<div style="margin-top:6px;font-weight:700">파일을 끌어다 놓거나 눌러서 고르기</div><div class="tiny faint" style="margin-top:2px">한 번에 5,000줄까지</div></label>
          <div id="upArea"></div></div>
        ${bound.host ? `<div class="a-card"><details><summary class="b" style="cursor:pointer">직접 지정하기 (자동으로 못 찾을 때만)</summary>
          <p class="a-note" style="margin:10px 0">보통은 비워 두면 돼요. 호스트 DB의 표나 칸 이름을 자동으로 못 찾을 때만 정확한 이름을 적어 주세요.</p>
          <div class="map-grid"><div class="field"><label class="label" for="hmTable">예약 표 이름</label><input class="input input-sm" id="hmTable" value="${esc(map.table || '')}" placeholder="${esc((g && g.table) || 'reservations')}"></div>
          ${['code', 'bname', 'bid', 'date', 'start', 'end', 'slot', 'status', 'resno'].map((k) => `<div class="field"><label class="label" for="hm_${k}">${{ code: '지점 코드 칸', bname: '지점 이름 칸', bid: '지점 번호 칸', date: '이용 날짜 칸', start: '시작 시각 칸', end: '끝 시각 칸', slot: '낮/밤 구분 칸', status: '예약 상태 칸', resno: '예약번호 칸' }[k]}</label><input class="input input-sm" id="hm_${k}" value="${esc((map.cols || {})[k] || '')}" placeholder="${esc(((g && g.col) || {})[k] || '')}"></div>`).join('')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:12px">${isAdmin() ? '<button class="btn btn-ink btn-sm" type="button" id="hmSave">저장하고 다시 불러오기</button>' : '<span class="small muted">대표 관리자만 바꿀 수 있어요.</span>'}</div></details></div>` : ''}
        ${bound.push ? `<div class="a-card"><h2>외부 수신 주소</h2><p class="a-note" style="margin-top:6px">호스트 센터가 다른 곳(다른 계정·다른 회사 서버)에 있다면, 그쪽 프로그램이 아래 주소로 예약을 보내 주면 바로 반영돼요. 머리글에 <span class="mono">Authorization: Bearer (SYNC_TOKEN 값)</span>을 넣어 주세요. 고객 이름·전화번호는 보내지 않아도 돼요.</p><pre class="mono" style="background:var(--fog);padding:12px;border-radius:10px;margin-top:8px;white-space:pre-wrap">POST ${esc(location.origin)}/api/sync/push
{"rows":[{"code":"S-0001","d":"2026-10-12","slot":"night"}]}</pre></div>` : ''}
        <div class="a-card"><h2>기록</h2><div class="a-tbl-wrap" style="margin-top:10px;max-height:360px"><table class="a-tbl"><thead><tr><th>시각</th><th>어디서</th><th>결과</th><th>내용</th></tr></thead><tbody>
          ${(d.logs || []).map((l) => `<tr><td class="nw">${when(l.at)}</td><td>${SRC[l.src] || esc(l.src)}</td><td>${l.ok ? B('ok', '정상') : B('red', '실패')}</td><td>${esc(l.msg || '')}</td></tr>`).join('') || emptyRow(4, '아직 기록이 없어요.')}</tbody></table></div></div>`;

    const STK = { confirmed: '확정', waiting: '입금 대기', pending: '대기', canceled: '취소', cancelled: '취소', completed: '이용 완료', noshow: '노쇼', blocked: '방막기', block: '방막기' };
    const SLK = { ...PKG, all: '하루 전체' };
    const loadRecent = async () => {
      const box = $('#rcBox'); if (!box) return;
      try {
        const r = await SP.get('/api/admin/sync/recent');
        if (!r.ok) { box.innerHTML = `<div class="form-err">${esc(r.error || '읽지 못했어요.')}</div>`; return; }
        box.innerHTML = `<div class="a-tbl-wrap" style="max-height:none"><table class="a-tbl"><thead><tr><th>등록 (DB 기록 그대로)</th><th>이용일</th><th>지점</th><th>구분</th><th>상태</th><th>경로</th><th>예약번호</th></tr></thead><tbody>
          ${r.items.map((x) => `<tr${x.canceled ? ' class="off"' : ''}><td class="nw mono">${esc(x.created || '-')}</td><td class="nw">${esc(x.d)}</td><td>${x.matched ? esc(x.branch) : `<span class="red">${esc(x.branch)}</span>`}</td><td title="${esc(x.slot)}">${esc(SLK[x.slot] || x.slot)}</td><td title="${esc(x.status)}">${esc(STK[String(x.status).toLowerCase()] || x.status)}</td><td>${esc({ web: '홈페이지', external: '외부 채널', manual: '수기 등록' }[x.via] || x.via)}</td><td class="mono">${esc(x.no)}</td></tr>`).join('') || emptyRow(7, '호스트 DB의 예약 표가 비어 있어요. 호스트 센터에는 예약이 있다면 다른 DB를 보고 있는 거예요.')}</tbody></table></div>
          <p class="tiny faint" style="margin-top:8px">표 ${esc(r.table)} · 등록 시각이 세계 표준시(UTC)로 저장된 DB라면 한국 시간보다 9시간 이르게 보여요. 빨간 지점 이름은 홈페이지 지점과 아직 짝이 안 맞은 이름이에요.</p>`;
      } catch (er) { box.innerHTML = `<div class="form-err">${esc(er.message)}</div>`; }
    };
    loadRecent();

    main.onclick = async (e) => {
      const b = e.target.closest('[data-sync]'); if (b) { await runSync(b); data(); return; }
      if (e.target.closest('#rcReload')) { loadRecent(); return; }
      if (e.target.closest('#cronHow')) { cronModal(bound); return; }
      if (e.target.closest('#aliasSave')) {
        const next = { ...alias };
        $$('[data-alias]', main).forEach((s) => { const u = um[Number(s.dataset.alias)]; if (!u) return; if (s.value) next[u.label] = s.value; else delete next[u.label]; });
        try { await SP.put('/api/admin/hostmap', { ...map, alias: next }); SP.toast('저장했어요. 다시 불러올게요.'); await SP.post('/api/admin/sync'); data(); } catch (er) { SP.fail(er); }
        return;
      }
      if (e.target.closest('#hmSave')) {
        const cols = {};
        ['code', 'bname', 'bid', 'date', 'start', 'end', 'slot', 'status', 'resno'].forEach((k) => { const v = $('#hm_' + k).value.trim(); if (v) cols[k] = v; });
        try { await SP.put('/api/admin/hostmap', { table: $('#hmTable').value.trim(), cols, alias }); SP.toast('저장했어요. 다시 불러올게요.'); await SP.post('/api/admin/sync'); data(); } catch (er) { SP.fail(er); }
        return;
      }
      if (e.target.closest('#upClear')) {
        if (!(await SP.confirm('엑셀로 올린 마감 내용을 모두 지울까요? 호스트 예약과 직접 막은 칸은 그대로 남아요.', { ok: '모두 지우기', danger: true }))) return;
        try { await SP.del('/api/admin/occ/upload'); SP.toast('지웠어요.'); data(); } catch (er) { SP.fail(er); }
      }
    };
    const drop = $('#drop');
    $('#upFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) readSheet(f); };
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('on'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('on'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('on'); const f = e.dataTransfer.files[0]; if (f) readSheet(f); });
  }

  /* ---- 10분마다 자동 실행 (Cloudflare Worker · Cron) ---- */
  const workerCode = (site) => `// 쏘플파티룸 홈페이지 예약 자동 업데이트 — 10분마다 호스트 예약을 빈 방 표시에 반영해요.
// Settings → Variables and Secrets: SITE_URL(Text) = ${site}, SYNC_TOKEN(Secret) = 홈페이지와 같은 값
// Settings → Triggers → Cron Triggers: */10 * * * *
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env).then((r) => console.log(JSON.stringify(r)))); },   // 결과는 실행기 Logs에서도 볼 수 있어요
  // 주소로 접속하면 안내만 보여 줘요. 실행 결과는 홈페이지 관리자 화면 → 데이터 연결에서 확인해요.
  async fetch() {
    return new Response('ssople-sync 실행기예요. 10분마다 자동으로 홈페이지 빈 방 표시를 맞춰요.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
async function run(env) {
  const site = String(env.SITE_URL || '').replace(/\\/+$/, '');
  if (!site || !env.SYNC_TOKEN) return { ok: false, error: 'SITE_URL 또는 SYNC_TOKEN이 비어 있어요.' };
  try {
    const res = await fetch(site + '/api/sync/run', { method: 'POST', headers: { authorization: 'Bearer ' + env.SYNC_TOKEN } });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
`;
  function cronModal(bound) {
    const site = location.origin;
    const m = SP.modal({
      title: '10분마다 자동으로 불러오기', wide: true,
      body: `<p class="a-note">Cloudflare 안에 작은 실행기(Worker)를 하나 만들어 10분마다 홈페이지를 깨우는 방식이에요. 처음 한 번만 하면 되고, 10분 정도 걸려요. 메뉴 이름은 Cloudflare 화면에 따라 조금 다를 수 있어요.</p>
        <ol class="steps-ol">
          <li><b>토큰 만들기</b> — 아래 버튼을 누르면 긴 비밀값이 만들어져요. 복사해서 2번과 4번에 똑같이 넣어요. 이 창을 닫으면 다시 보이지 않으니 바로 쓰세요.
            <div class="row" style="margin-top:8px"><input class="input input-sm mono" id="tkVal" readonly placeholder="토큰 만들기를 눌러 주세요" style="flex:1;min-width:0"><button class="btn btn-ink btn-sm" type="button" id="tkMake">토큰 만들기</button><button class="btn btn-line btn-sm" type="button" id="tkCopy">복사</button></div></li>
          <li><b>홈페이지에 넣기</b> — Workers &amp; Pages → <b>ssople</b> → Settings → Variables and Secrets → + Add → Type <b>Secret</b>, Name <span class="mono">SYNC_TOKEN</span>, Value에 토큰 → Save. 그다음 Deployments → 맨 위 배포 ⋯ → <b>Retry deployment</b>.${bound.push ? ' <span class="st ok">지금 등록돼 있어요</span>' : ''}</li>
          <li><b>실행기 만들기</b> — Workers &amp; Pages → Create → Worker(Hello World) → 이름 <span class="mono">ssople-sync</span> → Deploy → <b>Edit code</b> → 원래 코드를 지우고 아래 코드를 붙여넣기 → Deploy.
            <div style="margin-top:8px"><button class="btn btn-line btn-sm" type="button" id="wkCopy">${icon('copy', 'sm')}실행기 코드 복사</button></div>
            <pre class="mono code-box" id="wkCode"></pre></li>
          <li><b>실행기 설정</b> — 만든 ssople-sync → Settings → Variables and Secrets에 두 개 추가: <span class="mono">SITE_URL</span>(Text) = <span class="mono">${esc(site)}</span>, <span class="mono">SYNC_TOKEN</span>(Secret) = 1번 토큰.</li>
          <li><b>10분마다 돌게 하기</b> — ssople-sync → Settings → Triggers(Trigger Events) → <b>Cron Triggers</b> → Add → <span class="mono">*/10 * * * *</span> 입력 → Add.</li>
          <li><b>확인</b> — 10분쯤 기다렸다가 이 화면을 새로 고쳐요. "자동 업데이트"가 <b>10분마다 켜짐</b>으로 바뀌면 성공이에요. "토큰이 맞지 않아요"가 보이면 2번과 4번의 SYNC_TOKEN 값이 같은지, 2번 뒤에 Retry deployment를 했는지 확인해 주세요.</li>
        </ol>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button>',
    });
    const code = workerCode(site);
    m.$('#wkCode').textContent = code;
    m.$('#wkCopy').onclick = () => SP.copy(code, '실행기 코드를 복사했어요.');
    m.$('#tkMake').onclick = () => {
      const a = new Uint8Array(24); crypto.getRandomValues(a);
      m.$('#tkVal').value = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
    };
    m.$('#tkCopy').onclick = () => { const v = m.$('#tkVal').value; if (!v) { SP.toast('먼저 토큰 만들기를 눌러 주세요.', true); return; } SP.copy(v, '토큰을 복사했어요.'); };
  }

  /* ---- 엑셀 읽기 (브라우저 안에서만) ---- */
  let XP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!XP) {
      XP = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => res(window.XLSX);
        s.onerror = () => { XP = null; rej(new Error('엑셀 읽기 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.')); };
        document.head.appendChild(s);
      });
    }
    return XP;
  }
  // 앞에 있는 규칙일수록 먼저 맞춰 봐요 (예: '신청일자'보다 '이용일'이 먼저)
  const GUESS = {
    name: [/지점/, /매장|업체|공간|상호/, /branch|store|shop/i],
    date: [/이용\s*(일|날짜)/, /입실\s*일|체크인/, /^(날짜|일자|date)$/i, /날짜|일자|date/i],
    start: [/이용\s*시작|시작\s*시/, /시작|입실\s*시|start/i],
    end: [/이용\s*종료|종료\s*시/, /종료|퇴실|끝|end/i],
    pkg: [/구분|패키지/, /상품|옵션|타임|item|product/i],
    status: [/예약\s*상태/, /상태|status|진행/i],
  };
  const guessHit = (h) => Object.values(GUESS).some((list) => list.some((re) => re.test(h)));
  const FIELD = { name: '지점', date: '이용 날짜', start: '시작 시각', end: '끝 시각', pkg: '패키지·구분', status: '예약 상태' };
  function normN(s) { return String(s || '').toLowerCase().replace(/쏘플|파티룸|ssople|party\s?room|[\s_\-·.()[\]]/g, ''); }
  function resolver() {
    const by = new Map();
    for (const s of SPACES) { by.set(s.code.toLowerCase(), s.code); [s.name, s.short, ...(s.aliases || [])].forEach((n) => { const k = normN(n); if (k) by.set(k, s.code); }); }
    return (v) => {
      const k = normN(v); if (!k) return null;
      if (by.has(k)) return by.get(k);
      const hit = SPACES.filter((s) => { const a = normN(s.name), b = normN(s.short); return (a && (k.includes(a) || a.includes(k))) || (b && (k.includes(b) || b.includes(k))); });
      return hit.length === 1 ? hit[0].code : null;
    };
  }
  async function decodeCsv(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); }
  }
  async function readSheet(file) {
    const area = $('#upArea');
    area.innerHTML = '<p class="a-note" style="margin-top:12px">파일을 읽는 중…</p>';
    let aoa;
    try {
      const X = await loadXLSX();
      const wb = /\.csv$/i.test(file.name) ? X.read(await decodeCsv(file), { type: 'string', raw: true }) : X.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      aoa = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter((r) => r.some((v) => String(v).trim() !== ''));
    } catch (e) { area.innerHTML = `<div class="form-err">${esc(e.message || '파일을 읽지 못했어요.')}</div>`; return; }
    if (aoa.length < 2) { area.innerHTML = '<div class="form-err">읽을 내용이 없어요. 첫 번째 시트에 예약 목록이 있는지 확인해 주세요.</div>'; return; }
    // 머리글 줄 찾기: 알아볼 수 있는 이름이 가장 많은 줄
    let hi = 0, best = -1;
    aoa.slice(0, 15).forEach((r, i) => { const n = r.filter((v) => typeof v === 'string' && v.length < 30 && guessHit(v)).length; if (n > best) { best = n; hi = i; } });
    const head = aoa[hi].map((v, i) => String(v).trim() || `${i + 1}번째 칸`);
    const body = aoa.slice(hi + 1).slice(0, 5000);
    const pick = {};
    for (const [f, list] of Object.entries(GUESS)) {
      pick[f] = -1;
      for (const re of list) {
        const i = head.findIndex((h, j) => re.test(h) && !Object.values(pick).includes(j));
        if (i >= 0) { pick[f] = i; break; }
      }
    }
    // '이용일시'처럼 날짜와 시각이 한 칸이면 시작 시각도 같은 칸에서 읽는다
    if (pick.start < 0 && pick.date >= 0 && /일시|시간/.test(head[pick.date])) pick.start = pick.date;
    const res = resolver();
    const opt = (sel) => `<option value="-1">없음</option>${head.map((h, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(h)}</option>`).join('')}`;
    area.innerHTML = `<div style="margin-top:14px"><p class="small"><b>${esc(file.name)}</b> · ${SP.fmt(body.length)}줄</p>
      <div class="map-grid" style="margin-top:10px">${Object.keys(FIELD).map((f) => `<div class="field"><label class="label" for="mp_${f}">${FIELD[f]}</label><select class="select" id="mp_${f}" data-f="${f}">${opt(pick[f])}</select></div>`).join('')}
        <div class="field"><label class="label" for="mpFix">지점 칸이 없으면</label><select class="select" id="mpFix">${SP.spaceOptions(SPACES, '', '파일에 지점 칸이 있어요')}</select></div></div>
      <div id="upPrev" style="margin-top:12px"></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="upReplace" checked><span>같은 지점·같은 기간에 예전에 올린 엑셀 내용은 이번 파일로 바꿔요</span></label>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn btn-red" type="button" id="upGo">마감으로 반영하기</button></div></div>`;
    const build = () => {
      const p = {}; $$('[data-f]', area).forEach((s) => { p[s.dataset.f] = Number(s.value); });
      const fix = $('#mpFix').value;
      const rows = []; let bad = 0, cancel = 0;
      for (const r of body) {
        const nm = p.name >= 0 ? r[p.name] : '';
        const code = fix || res(nm);
        const dv = p.date >= 0 ? r[p.date] : '';
        const stv = p.status >= 0 ? String(r[p.status] || '') : '';
        if (/취소|환불|cancel|노쇼/i.test(stv)) { cancel++; continue; }
        if (!dv || (!code && !nm)) { bad++; continue; }
        const row = { d: typeof dv === 'number' ? dv : String(dv) };
        if (code) row.code = code; else row.name = String(nm).slice(0, 60);
        if (p.start >= 0 && r[p.start] !== '') row.start = typeof r[p.start] === 'number' ? r[p.start] : String(r[p.start]);
        if (p.end >= 0 && r[p.end] !== '') row.end = typeof r[p.end] === 'number' ? r[p.end] : String(r[p.end]);
        if (p.pkg >= 0 && r[p.pkg] !== '') row.pkg = String(r[p.pkg]).slice(0, 40);
        if (stv) row.status = stv.slice(0, 20);
        rows.push(row);
      }
      return { rows, bad, cancel, p, fix };
    };
    const preview = () => {
      const { rows, bad, cancel } = build();
      const known = rows.filter((r) => r.code).length;
      const serial = (v) => new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10);
      const cell = (v) => (typeof v === 'number' ? (v > 20000 && v < 90000 ? serial(v) + (v % 1 ? ' ' + m2t(Math.round((v % 1) * 1440)) : '') : v >= 0 && v < 1 ? m2t(Math.round(v * 1440)) : v) : esc(String(v ?? '')));
      $('#upPrev').innerHTML = `<p class="a-note">반영할 예약 <b>${SP.fmt(rows.length)}건</b> (지점 확인 ${SP.fmt(known)}건${rows.length - known ? ` · 서버에서 이름으로 다시 찾을 ${SP.fmt(rows.length - known)}건` : ''}) · 취소 ${cancel}건 제외 · 날짜나 지점이 비어 ${bad}건 제외</p>
        <div class="a-tbl-wrap" style="margin-top:8px;max-height:260px"><table class="a-tbl prev-tbl"><thead><tr><th>지점</th><th>이용 날짜</th><th>시작</th><th>끝</th><th>패키지</th><th>상태</th></tr></thead><tbody>
        ${rows.slice(0, 8).map((r) => `<tr><td>${r.code ? esc(nameOf(r.code)) : `<span class="red">${esc(r.name)} (확인 필요)</span>`}</td><td>${cell(r.d)}</td><td>${cell(r.start)}</td><td>${cell(r.end)}</td><td>${esc(r.pkg || '')}</td><td>${esc(r.status || '')}</td></tr>`).join('') || emptyRow(6, '반영할 줄이 없어요. 칸 짝을 확인해 주세요.')}</tbody></table></div>`;
    };
    area.addEventListener('change', (e) => { if (e.target.closest('select')) preview(); });
    preview();
    $('#upGo').onclick = async () => {
      const { rows } = build();
      if (!rows.length) { SP.toast('반영할 예약이 없어요.', true); return; }
      const btn = $('#upGo');
      SP.busy(btn, true, '반영하는 중…');
      try {
        const r = await SP.post('/api/admin/occ/import', { rows, replace: $('#upReplace').checked, file: file.name });
        SP.toast(`${r.saved}건을 반영했어요.${r.skipped ? ` ${r.skipped}건은 지점이나 날짜를 못 읽어서 뺐어요.` : ''}`);
        data();
      } catch (e) { SP.fail(e); SP.busy(btn, false); }
    };
  }

  /* ================= 지점 관리 ================= */
  const SPF = { q: '', region: '' };
  async function spacesView() {
    const list = await spaces(true);
    const regions = [...new Set(list.map((s) => s.region))];
    const rows = list.filter((s) => (!SPF.region || s.region === SPF.region) && (!SPF.q || (s.name + s.area + s.code + (s.aliases || []).join('')).toLowerCase().includes(SPF.q.toLowerCase())));
    main.innerHTML = hd('지점 관리', '고객 화면에 보이는 지점 정보예요. 요금과 네이버 예약 주소는 네이버 예약 화면과 같게 맞춰 주세요. 도어락·와이파이·계좌 같은 내부 정보는 여기에 적지 마세요.',
      isAdmin() ? `<button class="btn btn-red btn-sm" type="button" data-new>${icon('plus', 'sm')}새 지점</button>` : '')
      + `<div class="a-tools"><input class="input" id="spQ" placeholder="지점 이름·코드로 찾기" value="${esc(SPF.q)}"><select class="select" id="spRegion"><option value="">모든 권역</option>${regions.map((r) => `<option${r === SPF.region ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select><span class="small muted">${rows.length}곳 · 공개 ${list.filter((s) => s.visible).length}곳</span></div>
      <div class="a-tbl-wrap"><table class="a-tbl"><thead><tr><th>지점</th><th>권역 · 동네</th><th class="r">인원</th><th>패키지</th><th class="r">사진</th><th>네이버</th><th>공개</th><th></th></tr></thead><tbody>
      ${rows.map((s) => `<tr><td><b>${esc(s.name)}</b><span class="sub mono">${esc(s.code)}</span></td><td>${esc(s.region)} ${esc(s.area)}</td><td class="r nw">${s.base || '-'} / ${s.max || '-'}명</td>
        <td>${(s.pkgs || []).map((p) => `<span class="tag">${esc(p.label || PKG[p.k] || p.k)}</span>`).join(' ') || '<span class="red small">없음</span>'}</td><td class="r">${(s.photos || []).length}</td>
        <td>${(s.pkgs || []).length && (s.pkgs || []).every((p) => p.url) ? B('ok', '상품별 연결') : (s.pkgs || []).some((p) => p.url) || s.book ? B('ok', '예약 연결') : B('warn', '주소 없음')}</td>
        <td><label class="switch"><input type="checkbox" data-vis="${s.code}"${s.visible ? ' checked' : ''} aria-label="${esc(s.name)} 공개"></label></td>
        <td><div class="a-acts"><a class="btn btn-ghost btn-sm" href="/room/${esc(s.code)}" target="_blank" rel="noopener">보기</a><button class="btn btn-line btn-sm" type="button" data-edit="${s.code}">고치기</button></div></td></tr>`).join('') || emptyRow(8, '조건에 맞는 지점이 없어요.')}</tbody></table></div>`;
    $('#spQ').oninput = SP.debounce((e) => { SPF.q = e.target.value.trim(); spacesView().then(() => { const q = $('#spQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 300);
    $('#spRegion').onchange = (e) => { SPF.region = e.target.value; spacesView(); };
    main.onclick = (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) { editSpace(SPACES.find((s) => s.code === ed.dataset.edit)); return; }
      if (e.target.closest('[data-new]')) newSpace();
    };
    main.onchange = async (e) => {
      const v = e.target.closest('[data-vis]'); if (!v) return;
      try { await SP.put('/api/admin/spaces/' + v.dataset.vis, { visible: v.checked }); SP.toast(v.checked ? '고객 화면에 보여요.' : '고객 화면에서 숨겼어요.'); SPACES = null; }
      catch (er) { v.checked = !v.checked; SP.fail(er); }
    };
  }

  function newSpace() {
    const m = SP.modal({
      title: '새 지점 추가',
      body: `<p class="a-note">이름과 동네만 넣고 만들면, 숨김 상태로 추가돼요. 패키지와 사진을 채운 뒤 공개로 바꿔 주세요.</p>
        <div class="form-grid" style="margin-top:14px"><div class="field"><label class="label" for="nsName">지점 이름</label><input class="input" id="nsName" maxlength="40" placeholder="예) 쏘플파티룸 성수점"></div>
        <div class="field"><label class="label" for="nsRegion">권역</label><select class="select" id="nsRegion">${['서울', '경기', '인천', '대전', '부산', '전주', '기타'].map((r) => `<option>${r}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="nsArea">동네</label><input class="input" id="nsArea" maxlength="20" placeholder="예) 성수"></div>
        <div class="field"><label class="label" for="nsAddr">주소 <span class="opt">선택</span></label><input class="input" id="nsAddr" maxlength="120"></div></div><div class="form-err" id="nsErr" hidden></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="nsGo">만들기</button>',
    });
    m.$('#nsGo').onclick = async () => {
      try {
        const r = await SP.post('/api/admin/spaces', { name: m.$('#nsName').value.trim(), region: m.$('#nsRegion').value, area: m.$('#nsArea').value.trim(), addr: m.$('#nsAddr').value.trim() });
        m.close(); SP.toast('만들었어요. 이어서 정보를 채워 주세요.');
        const list = await spaces(true);
        spacesView();
        editSpace(list.find((s) => s.code === r.code));
      } catch (e) { const er = m.$('#nsErr'); er.textContent = e.message; er.hidden = false; }
    };
  }

  function editSpace(s) {
    if (!s) return;
    const f = s.feat || {}, inf = s.info || {};
    let photos = (s.photos || []).map((p, i) => ({ k: typeof p === 'string' ? p : p.k, url: (s.photoUrls || [])[i] || '' }));
    let pkgs = (s.pkgs || []).map((p) => ({ ...p }));
    const tx = (id, label, v, max, ph = '', opt = true) => `<div class="field full"><label class="label" for="${id}">${label}${opt ? ' <span class="opt">선택</span>' : ''}</label><textarea class="textarea" id="${id}" maxlength="${max}" style="min-height:76px" placeholder="${esc(ph)}">${esc(v || '')}</textarea></div>`;
    const ip = (id, label, v, max, ph = '', type = 'text', cls = '') => `<div class="field ${cls}"><label class="label" for="${id}">${label}</label><input class="input" id="${id}" type="${type}" ${type === 'text' ? `maxlength="${max}"` : ''} value="${esc(v ?? '')}" placeholder="${esc(ph)}"></div>`;
    const ft = (k, label) => `<div class="field"><label class="switch"><input type="checkbox" id="ft_${k}"${f[k] && f[k].on ? ' checked' : ''}><span>${label}</span></label><input class="input input-sm" id="fn_${k}" maxlength="80" value="${esc((f[k] && f[k].note) || '')}" placeholder="한 줄 설명 (예: 블루투스 마이크 2개)" style="margin-top:8px"></div>`;
    const ck = (k, label) => `<label class="check"><input type="checkbox" id="fb_${k}"${f[k] ? ' checked' : ''}><span>${label}</span></label>`;
    const m = SP.modal({
      title: `${s.name} 고치기`, wide: true,
      body: `<div class="ed-tabs" id="edTabs"><button type="button" class="on" data-t="base">기본</button><button type="button" data-t="pkg">패키지 · 요금</button><button type="button" data-t="feat">시설</button><button type="button" data-t="items">비품</button><button type="button" data-t="info">이용 안내</button><button type="button" data-t="social">SNS·후기</button><button type="button" data-t="photo">사진 ${photos.length}</button></div>
      <div data-p="base"><div class="form-grid">
        ${ip('e_name', '지점 이름', s.name, 40)}${ip('e_short', '짧은 이름 (카드에 쓰여요)', s.short, 30)}
        <div class="field"><label class="label" for="e_region">권역</label><select class="select" id="e_region">${['서울', '경기', '인천', '대전', '부산', '전주', '기타'].map((r) => `<option${r === s.region ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
        ${ip('e_area', '동네', s.area, 20)}${ip('e_addr', '주소', s.addr, 120, '', 'text', 'full')}
        ${ip('e_base', '기준 인원', s.base, 0, '', 'number')}${ip('e_max', '최대 인원', s.max, 0, '', 'number')}
        ${ip('e_addFeeLabel', '인원 추가 요금 (보이는 글)', s.addFeeLabel, 40, '1인당 1만원')}${ip('e_addFee', '인원 추가 요금 (원, 계산용)', s.addFee, 0, '10000', 'number')}
        ${ip('e_depositLabel', '청소 보증금', s.depositLabel, 30, '8만원')}${ip('e_place', '네이버 지도 주소', s.place, 300, 'https://naver.me/...', 'url')}
        ${ip('e_book', '네이버 예약 페이지 (지점 전체 상품)', s.book, 500, 'https://map.naver.com/p/entry/place/...', 'url', 'full')}
        ${ip('e_tags', '태그 (쉼표로 나눠요)', (s.tags || []).join(', '), 200, '생일파티, 브라이덜샤워')}${ip('e_aliases', '다른 이름 (호스트·엑셀에 다르게 적힌 이름)', (s.aliases || []).join(', '), 400, '건대점, 건대 캐치볼')}
        ${tx('e_intro', '소개', s.intro, 1500, '이 지점만의 분위기와 어울리는 파티를 적어 주세요.')}
        ${tx('e_notice', '지점 공지 (빨간 띠로 보여요)', s.notice, 400, '예) 10월 한 달 동안 엘리베이터 점검이 있어요.')}
        <div class="field"><label class="switch"><input type="checkbox" id="e_visible"${s.visible ? ' checked' : ''}><span>고객 화면에 공개</span></label></div>
        ${ip('e_sort', '보여 주는 순서 (작을수록 앞)', s.sort, 0, '', 'number')}
        <div class="field full" style="margin-top:6px"><div class="a-note">운영 방식과 노출 존 — 호스트 센터에서 신청한 공간은 여기서 운영 방식을 정하고, 유료 노출 존은 결제 기간에 맞춰 끝 날짜를 넣어요. 끝 날짜가 지나면 존 표시가 자동으로 빠져요.</div></div>
        <div class="field"><label class="label" for="e_ltype">운영 방식</label><select class="select" id="e_ltype">${[['managed', '쏘플 위탁운영'], ['host', '호스트 운영 (공간 등록)'], ['direct', '쏘플 직영']].map(([k, l]) => `<option value="${k}"${(s.listing && s.listing.type) === k || (!s.listing && k === 'managed') ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="e_lzone">노출 존</label><select class="select" id="e_lzone">${[['', '없음'], ['plus', '플러스존'], ['premium', '프리미엄존']].map(([k, l]) => `<option value="${k}"${(s.listing && s.listing.zone || '') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        ${ip('e_luntil', '노출 끝 날짜 (결제 기간 끝)', s.listing && s.listing.until, 0, '', 'date')}${ip('e_lhost', '호스트 표시 이름 (선택)', s.listing && s.listing.hostName, 30, '예) 건대 호스트 김OO')}
      </div></div>
      <div data-p="pkg" hidden><p class="a-note" style="margin-bottom:10px">요금은 네이버 예약 화면과 같게 맞춰 주세요. 끝 시각이 시작보다 이르면 다음 날로 계산해요. 칸을 비우면 그 요일엔 팔지 않는 걸로 보여요.</p><div class="pkg-ed" id="pkgEd"></div>
        <button class="btn btn-soft btn-sm" type="button" id="pkgAdd" style="margin-top:10px">${icon('plus', 'sm')}패키지 추가</button></div>
      <div data-p="feat" hidden><div class="form-grid">${ft('karaoke', '노래방')}${ft('bbq', '바베큐 (금액까지 — 예: 숯 바베큐 3만원 · 당일 추가 가능)')}${ft('pet', '애견 동반')}</div>
        <div class="chk-grid" style="margin-top:16px">${ck('tv', 'TV')}${ck('console', '게임기')}${ck('projector', '빔프로젝터')}${ck('fridge', '냉장고')}${ck('heating', '난방')}</div>
        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label class="label" for="f_elevator">엘리베이터</label><select class="select" id="f_elevator"><option value=""${f.elevator == null ? ' selected' : ''}>모름</option><option value="1"${f.elevator === true ? ' selected' : ''}>있어요</option><option value="0"${f.elevator === false ? ' selected' : ''}>없어요</option></select></div>
          ${ip('f_aircon', '에어컨', f.aircon, 60, '스탠드 1대')}${ip('f_cook', '조리', f.cook, 60, '인덕션, 전자레인지')}${ip('f_floor', '층', f.floor, 60, '3층')}
          ${ip('f_floorNote', '층 설명', f.floorNote, 60, '계단으로만 올라가요')}${ip('f_toilet', '화장실', f.toilet, 60, '실내 1개')}
          ${ip('f_zones', '특별한 공간 (쉼표)', (f.zones || []).join(', '), 120, '루프탑, 테라스')}${ip('f_games', '보드게임 (쉼표)', (f.games || []).join(', '), 600, '할리갈리, 루미큐브')}</div></div>
      <div data-p="info" hidden><div class="form-grid">
        ${tx('i_size', '평수 · 크기', inf.size, 300, '약 25평')}${tx('i_parking', '주차', inf.parking, 300, '건물 뒤 2대, 먼저 오면 먼저 대요')}${tx('i_route', '찾아오는 길', inf.route, 300, '건대입구역 2번 출구에서 5분')}
        ${tx('i_noise', '소음 기준', inf.noise, 300, '밤 10시부터는 음악 소리를 줄여 주세요')}${tx('i_minors', '미성년자 이용', inf.minors, 300)}${tx('i_sameday', '당일 예약', inf.sameday, 300)}${tx('i_tour', '사전 방문', inf.tour, 300)}</div>
        <p class="tiny faint" style="margin-top:10px">도어락 번호, 와이파이 비밀번호, 점주 연락처, 입금 계좌는 고객 화면에 노출되니 절대 적지 마세요. 입실 안내 문자로만 보내 주세요.</p></div>
      <div data-p="items" hidden><div id="edItems"></div></div>
      <div data-p="social" hidden><div id="edSocial"></div></div>
      <div data-p="photo" hidden><p class="a-note" style="margin-bottom:10px">첫 번째 사진이 대표 사진이에요. 가로 사진이 잘 어울려요. 사진은 한 장에 5MB까지, 12장까지 올릴 수 있어요.</p><div class="ph-grid" id="phGrid"></div><input type="file" id="phFile" accept="image/*" multiple hidden></div>
      <div class="form-err" id="edErr" hidden></div>`,
      foot: `${isAdmin() ? '<button class="btn btn-ghost btn-sm" type="button" id="edReset" style="margin-right:auto">처음 데이터로 되돌리기</button>' : ''}<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="edSave">저장</button>`,
    });
    const P = (id) => m.$('#' + id);
    m.$('#edTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; m.$$('#edTabs button').forEach((x) => x.classList.toggle('on', x === b)); m.$$('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== b.dataset.t; }); });
    const itemsEd = SP.itemsEditor(P('edItems'), s.items || []);
    const socialEd = SP.socialEditor(P('edSocial'), s.social || {});

    const drawPkgs = () => {
      P('pkgEd').innerHTML = pkgs.map((p, i) => `<div class="pkg-row" data-i="${i}">
        <div class="field"><label class="label">종류</label><select class="select" data-k="k">${Object.entries(PKG).map(([k, l]) => `<option value="${k}"${p.k === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="label">이름</label><input class="input" data-k="label" maxlength="12" value="${esc(p.label || '')}"></div>
        <div class="field"><label class="label">시작 (24시)</label><input class="input" data-k="s" inputmode="numeric" maxlength="5" placeholder="19:00" value="${m2t(p.s)}"></div>
        <div class="field"><label class="label">끝 (24시)</label><input class="input" data-k="e" inputmode="numeric" maxlength="5" placeholder="10:00" value="${m2t(p.e)}"></div>
        <button class="btn btn-ghost btn-sm" type="button" data-rm="${i}" aria-label="패키지 지우기">${icon('trash', 'sm')}</button>
        <div class="prices">${['월~목', '금', '토', '일'].map((w, j) => `<div class="field"><label class="label">${w} 요금</label><input class="input" data-k="p${j}" type="number" min="0" step="1000" value="${p.p && p.p[j] != null ? p.p[j] : ''}" placeholder="안 팔아요"></div>`).join('')}</div>
        <div class="field purl"><label class="label">네이버 예약 주소</label><input class="input" data-k="url" type="url" value="${esc(p.url || '')}" placeholder="https://booking.naver.com/booking/..."></div></div>`).join('') || '<p class="a-note">패키지가 없어요. 패키지가 있어야 고객 화면에 요금과 예약 버튼이 보여요.</p>';
    };
    const readPkgs = () => {
      m.$$('.pkg-row').forEach((row) => {
        const p = pkgs[Number(row.dataset.i)];
        row.querySelectorAll('[data-k]').forEach((el) => {
          const k = el.dataset.k;
          if (k === 'k') p.k = el.value;
          else if (k === 'label') p.label = el.value.trim();
          else if (k === 's' || k === 'e') p[k] = t2m(el.value);
          else if (k === 'url') p.url = el.value.trim();
          else { p.p = p.p || [null, null, null, null]; p.p[Number(k.slice(1))] = el.value === '' ? null : Number(el.value); }
        });
      });
    };
    drawPkgs();
    P('pkgAdd').onclick = () => { readPkgs(); const last = pkgs[pkgs.length - 1]; pkgs.push({ k: 'night', label: '밤', s: 1140, e: 600, p: last ? [...(last.p || [])] : [null, null, null, null], url: last ? last.url : '' }); drawPkgs(); };
    P('pkgEd').addEventListener('click', (e) => { const r = e.target.closest('[data-rm]'); if (!r) return; readPkgs(); pkgs.splice(Number(r.dataset.rm), 1); drawPkgs(); });
    P('pkgEd').addEventListener('change', (e) => { const sel = e.target.closest('[data-k="k"]'); if (!sel) return; const row = sel.closest('.pkg-row'); const lab = row.querySelector('[data-k="label"]'); if (!lab.value.trim()) lab.value = PKG[sel.value] || ''; });

    const drawPhotos = () => {
      P('phGrid').innerHTML = photos.map((p, i) => `<div class="ph"><img src="${esc(p.url || ('/api/img/' + p.k))}" alt="">${i === 0 ? '<span class="badge ink first">대표</span>' : ''}<div class="ph-acts"><button type="button" data-mv="${i}|-1" aria-label="앞으로"${i === 0 ? ' disabled' : ''}>${icon('chev-l', 'sm')}</button><button type="button" data-del="${i}" aria-label="빼기">${icon('trash', 'sm')}</button><button type="button" data-mv="${i}|1" aria-label="뒤로"${i === photos.length - 1 ? ' disabled' : ''}>${icon('chev-r', 'sm')}</button></div></div>`).join('')
        + (photos.length < 12 ? `<button type="button" class="ph-add" id="phAdd">${icon('camera')}<span>사진 올리기</span></button>` : '');
      m.$('#edTabs [data-t="photo"]').textContent = `사진 ${photos.length}`;
    };
    drawPhotos();
    P('phGrid').addEventListener('click', (e) => {
      if (e.target.closest('#phAdd')) { if (!BOUND.photos) { SP.toast('사진 저장소(PHOTOS)가 연결돼야 올릴 수 있어요.', true); return; } P('phFile').click(); return; }
      const mv = e.target.closest('[data-mv]');
      if (mv) { const [i, d] = mv.dataset.mv.split('|').map(Number); const j = i + d; if (j < 0 || j >= photos.length) return; [photos[i], photos[j]] = [photos[j], photos[i]]; drawPhotos(); return; }
      const del = e.target.closest('[data-del]'); if (del) { photos.splice(Number(del.dataset.del), 1); drawPhotos(); }
    });
    P('phFile').onchange = async (e) => {
      const files = [...e.target.files].slice(0, 12 - photos.length); e.target.value = '';
      for (const file of files) {
        try { const r = await SP.upload(file, 2000); photos.push({ k: r.key, url: r.url }); drawPhotos(); }
        catch (er) { SP.fail(er); }
      }
    };

    const list = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);
    P('edSave').onclick = async () => {
      readPkgs();
      const err = P('edErr'); err.hidden = true;
      const body = {
        name: P('e_name').value.trim(), short: P('e_short').value.trim(), region: P('e_region').value, area: P('e_area').value.trim(), addr: P('e_addr').value.trim(),
        base: P('e_base').value, max: P('e_max').value, addFeeLabel: P('e_addFeeLabel').value.trim(), addFee: P('e_addFee').value, depositLabel: P('e_depositLabel').value.trim(),
        place: P('e_place').value.trim(), book: P('e_book').value.trim(), tags: list(P('e_tags').value), aliases: list(P('e_aliases').value), intro: P('e_intro').value.trim(), notice: P('e_notice').value.trim(),
        visible: P('e_visible').checked, sort: P('e_sort').value,
        listing: { type: P('e_ltype').value, zone: P('e_lzone').value, until: P('e_luntil').value, hostName: P('e_lhost').value.trim() },
        pkgs: pkgs.map((p) => ({ k: p.k, label: p.label, s: p.s, e: p.e, p: p.p, url: p.url })),
        feat: {
          karaoke: { on: P('ft_karaoke').checked, note: P('fn_karaoke').value.trim() }, bbq: { on: P('ft_bbq').checked, note: P('fn_bbq').value.trim() }, pet: { on: P('ft_pet').checked, note: P('fn_pet').value.trim() },
          tv: P('fb_tv').checked, console: P('fb_console').checked, projector: P('fb_projector').checked, fridge: P('fb_fridge').checked, heating: P('fb_heating').checked,
          elevator: P('f_elevator').value === '' ? null : P('f_elevator').value === '1',
          aircon: P('f_aircon').value.trim(), cook: P('f_cook').value.trim(), floor: P('f_floor').value.trim(), floorNote: P('f_floorNote').value.trim(), toilet: P('f_toilet').value.trim(),
          zones: list(P('f_zones').value), games: list(P('f_games').value),
        },
        info: { size: P('i_size').value.trim(), parking: P('i_parking').value.trim(), route: P('i_route').value.trim(), noise: P('i_noise').value.trim(), minors: P('i_minors').value.trim(), sameday: P('i_sameday').value.trim(), tour: P('i_tour').value.trim() },
        photos: photos.map((p) => p.k),
        items: itemsEd.read(), social: socialEd.read(),
      };
      if (pkgs.some((p) => p.s == null || p.e == null)) { err.textContent = '패키지 시작·끝 시각을 19:00처럼 24시간 기준으로 넣어 주세요.'; err.hidden = false; m.$('#edTabs [data-t="pkg"]').click(); return; }
      const btn = P('edSave'); SP.busy(btn, true, '저장하는 중…');
      try { await SP.put('/api/admin/spaces/' + s.code, body); m.close(); SP.toast('저장했어요. 고객 화면에는 1분 안에 바뀌어요.'); SPACES = null; if (location.hash === '#spaces') spacesView(); }
      catch (e) { err.textContent = e.message; err.hidden = false; SP.busy(btn, false); }
    };
    const rs = m.$('#edReset');
    if (rs) rs.onclick = async () => {
      if (!(await SP.confirm('패키지·요금·시설·안내를 처음 넣어 둔 데이터로 되돌릴까요? 사진과 소개 글은 그대로 남아요.', { ok: '되돌리기', danger: true }))) return;
      try { await SP.post(`/api/admin/spaces/${s.code}/reset`); m.close(); SP.toast('되돌렸어요.'); SPACES = null; spacesView(); } catch (e) { SP.fail(e); }
    };
  }

  /* ================= 행사 ================= */
  async function events() {
    const [d] = await Promise.all([SP.get('/api/admin/evt'), spaces()]);
    const ST = { open: ['ok', '공개'], closed: ['mute', '신청 마감'], done: ['mute', '지난 행사'], pending: ['warn', '승인 대기'], draft: ['mute', '준비 중'], hidden: ['mute', '숨김'], rejected: ['mute', '보류'] };
    const MODE = { rsvp: '홈페이지 신청', external: '외부 링크', info: '안내만' };
    main.innerHTML = hd('행사', '쏘플이 여는 파티·클래스와 회원이 제안한 행사를 관리해요. 회원 제안은 "공개"로 바꿔야 고객 화면에 보여요.', `<button class="btn btn-red btn-sm" type="button" data-new>${icon('plus', 'sm')}행사 만들기</button>`)
      + `<div class="a-tbl-wrap"><table class="a-tbl"><thead><tr><th>날짜</th><th>행사</th><th>상태</th><th class="r">신청</th><th>방식</th><th>제안</th><th></th></tr></thead><tbody>
      ${d.items.map((e) => { const st = ST[e.status] || ST[e.rawStatus] || ['mute', e.status]; return `<tr><td class="nw">${SP.mdw(e.d)}${e.t1 ? `<span class="sub">${SP.hm(e.t1)}</span>` : ''}</td><td><b>${esc(e.title)}</b><span class="sub">${esc(e.cat)} · ${esc(e.spaceName || e.place || '장소 미정')}</span></td>
        <td>${B(st[0], st[1])}</td><td class="r nw">${e.going || 0}${e.cap ? ` / ${e.cap}` : ''}명${e.waits ? `<span class="sub">대기 ${e.waits}</span>` : ''}</td><td>${MODE[e.mode] || ''}</td><td>${e.by ? esc(e.by) : '<span class="faint">쏘플</span>'}</td>
        <td><div class="a-acts">${e.rawStatus === 'pending' ? `<button class="btn btn-ink btn-sm" type="button" data-st="${e.id}|open">공개</button><button class="btn btn-soft btn-sm" type="button" data-st="${e.id}|rejected">보류</button>` : ''}<a class="btn btn-ghost btn-sm" href="/e/${e.id}" target="_blank" rel="noopener">보기</a><button class="btn btn-ghost btn-sm" type="button" data-rsvp="${e.id}">신청자</button><button class="btn btn-line btn-sm" type="button" data-edit="${e.id}">고치기</button></div></td></tr>`; }).join('') || emptyRow(7, '아직 행사가 없어요. 첫 행사를 만들어 보세요.')}</tbody></table></div>`;
    main.onclick = async (e) => {
      if (e.target.closest('[data-new]')) { eventForm(null); return; }
      const ed = e.target.closest('[data-edit]'); if (ed) { eventForm(d.items.find((x) => String(x.id) === ed.dataset.edit)); return; }
      const rv = e.target.closest('[data-rsvp]'); if (rv) { rsvpModal(d.items.find((x) => String(x.id) === rv.dataset.rsvp)); return; }
      const st = e.target.closest('[data-st]');
      if (st) {
        const [id, v] = st.dataset.st.split('|');
        const ev = d.items.find((x) => String(x.id) === id);
        try { await SP.put('/api/admin/evt/' + id, { ...evBody(ev), status: v }); SP.toast(v === 'open' ? '공개했어요. 제안한 회원에게 알림이 갔어요.' : '보류했어요.'); refreshCounts(); events(); } catch (er) { SP.fail(er); }
      }
    };
  }
  const evBody = (e) => ({ title: e.title, summary: e.summary, body: e.body, cat: e.cat, d: e.d, d2: e.d2, t1: e.t1, t2: e.t2, code: e.code, place: e.place, cap: e.cap, price: e.price, mode: e.mode, ext_url: e.ext_url, members_only: e.members_only, adult: e.adult, max_n: e.max_n, cover: e.cover_key });

  function eventForm(e) {
    const v = e || { mode: 'rsvp', cat: '파티', max_n: 2, rawStatus: 'open' };
    const m = SP.modal({
      title: e ? '행사 고치기' : '행사 만들기', wide: true,
      body: `<form class="form-grid" id="evf">
        <div class="field full"><label class="label" for="v1">행사 이름</label><input class="input" id="v1" name="title" maxlength="60" value="${esc(v.title || '')}" placeholder="예) 할로윈 코스튬 파티"></div>
        <div class="field full"><label class="label" for="v2">한 줄 소개 <span class="opt">목록에 보여요</span></label><input class="input" id="v2" name="summary" maxlength="120" value="${esc(v.summary || '')}"></div>
        <div class="field"><label class="label" for="v3">분류</label><select class="select" id="v3" name="cat">${EVENT_CATS.map((c) => `<option${c === v.cat ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="v4">상태</label><select class="select" id="v4" name="status">${[['open', '공개'], ['closed', '신청 마감'], ['draft', '준비 중 (안 보임)'], ['pending', '승인 대기'], ['hidden', '숨김'], ['rejected', '보류']].map(([k, l]) => `<option value="${k}"${(v.rawStatus || 'open') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="v5">날짜</label><input class="input" id="v5" name="d" type="date" value="${esc(v.d || '')}"></div>
        <div class="field"><label class="label" for="v6">끝나는 날 <span class="opt">여러 날일 때</span></label><input class="input" id="v6" name="d2" type="date" value="${esc(v.d2 || '')}"></div>
        <div class="field"><label class="label" for="v7">시작 시각</label><input class="input" id="v7" name="t1" type="time" value="${esc(v.t1 || '')}"></div>
        <div class="field"><label class="label" for="v8">끝 시각</label><input class="input" id="v8" name="t2" type="time" value="${esc(v.t2 || '')}"></div>
        <div class="field"><label class="label" for="v9">지점</label><select class="select" id="v9" name="code">${SP.spaceOptions(SPACES, v.code || '', '쏘플 지점이 아니에요')}</select></div>
        <div class="field"><label class="label" for="v10">다른 장소 <span class="opt">지점이 아닐 때</span></label><input class="input" id="v10" name="place" maxlength="80" value="${esc(v.place || '')}"></div>
        <div class="field"><label class="label" for="v11">정원 <span class="opt">비우면 제한 없음</span></label><input class="input" id="v11" name="cap" type="number" min="1" max="2000" value="${v.cap || ''}"></div>
        <div class="field"><label class="label" for="v12">참가비 안내</label><input class="input" id="v12" name="price" maxlength="60" value="${esc(v.price || '')}" placeholder="예) 1인 2만원 (현장 결제)"></div>
        <div class="field"><label class="label" for="v13">신청 방식</label><select class="select" id="v13" name="mode">${[['rsvp', '홈페이지에서 신청 받기'], ['external', '외부 신청 링크로 보내기'], ['info', '안내만 하기']].map(([k, l]) => `<option value="${k}"${v.mode === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="v14">외부 신청 링크</label><input class="input" id="v14" name="ext_url" type="url" value="${esc(v.ext_url || '')}" placeholder="https://"></div>
        <div class="field"><label class="label" for="v15">1명이 신청할 수 있는 인원</label><input class="input" id="v15" name="max_n" type="number" min="1" max="10" value="${v.max_n || 2}"></div>
        <div class="field"><span class="label">참가 조건</span><label class="check"><input type="checkbox" name="members_only"${v.members_only ? ' checked' : ''}><span>회원만</span></label><label class="check" style="margin-top:6px"><input type="checkbox" name="adult"${v.adult ? ' checked' : ''}><span>만 19세 이상만</span></label></div>
        <div class="field full"><label class="label" for="v16">상세 내용</label><textarea class="textarea" id="v16" name="body" maxlength="5000" placeholder="무엇을 하는지, 준비물, 환불 기준을 적어 주세요.">${esc(v.body || '')}</textarea></div>
        <div class="field full"><span class="label">대표 사진 <span class="opt">선택</span></span><div id="evCover"></div></div>
      </form><div class="form-err" id="evErr" hidden></div>`,
      foot: `${e ? '<button class="btn btn-ghost btn-sm" type="button" id="evDel" style="margin-right:auto">행사 지우기</button>' : ''}<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="evGo">저장</button>`,
    });
    SP.coverPicker(m.$('#evCover'), v.cover || '', v.cover_key || '');
    m.$('#evGo').onclick = async () => {
      const f = SP.formData(m.$('#evf'));
      const err = m.$('#evErr'); err.hidden = true;
      // 빈 칸은 '' 그대로 보내야 예전 값을 지울 수 있어요
      const body = { ...f, max_n: Number(f.max_n) || 2 };
      try {
        if (e) await SP.put('/api/admin/evt/' + e.id, body); else await SP.post('/api/admin/evt', body);
        m.close(); SP.toast('저장했어요.'); refreshCounts(); events();
      } catch (er) { err.textContent = er.message; err.hidden = false; }
    };
    const del = m.$('#evDel');
    if (del) del.onclick = async () => {
      if (!(await SP.confirm('이 행사를 지울까요? 신청 기록도 고객 화면에서 사라져요.', { ok: '지우기', danger: true }))) return;
      try { await SP.del('/api/admin/evt/' + e.id); m.close(); SP.toast('지웠어요.'); events(); } catch (er) { SP.fail(er); }
    };
  }
  async function rsvpModal(e) {
    const m = SP.modal({ title: `${e.title} 신청자`, wide: true, body: '<div class="a-empty">불러오는 중…</div>', foot: `<a class="btn btn-line" href="/api/admin/evt/${e.id}/rsvps?format=csv">${icon('download', 'sm')}엑셀로 받기 (CSV)</a><button class="btn btn-soft" data-x>닫기</button>` });
    try {
      const d = await SP.get(`/api/admin/evt/${e.id}/rsvps`);
      const ST = { going: ['ok', '참가'], wait: ['warn', '대기'], canceled: ['mute', '취소'] };
      const go = d.items.filter((r) => r.status === 'going').reduce((a, r) => a + r.n, 0);
      m.$('.modal-body').innerHTML = `<p class="a-note">참가 확정 ${go}명 · 대기 ${d.items.filter((r) => r.status === 'wait').length}건 · 취소 ${d.items.filter((r) => r.status === 'canceled').length}건</p>
        <div class="a-tbl-wrap" style="margin-top:10px"><table class="a-tbl"><thead><tr><th>상태</th><th>닉네임</th><th>이메일</th><th class="r">인원</th><th>남긴 말</th><th>신청</th></tr></thead><tbody>
        ${d.items.map((r) => `<tr><td>${B((ST[r.status] || ['mute'])[0], (ST[r.status] || [0, r.status])[1])}</td><td>${esc(r.nick || '탈퇴한 회원')}</td><td>${esc(r.email || '')}</td><td class="r">${r.n}</td><td>${esc(r.msg || '')}</td><td class="nw">${when(r.at)}</td></tr>`).join('') || emptyRow(6, '아직 신청자가 없어요.')}</tbody></table></div>`;
    } catch (er) { m.$('.modal-body').innerHTML = errBox(er); }
  }

  /* ================= 커뮤니티 · 신고 ================= */
  const CM = { tab: 'reports', status: 'open', board: '', hidden: false, q: '' };
  const KIND = { post: '글', comment: '댓글', meetup: '모임', crew: '파티팀', user: '회원', event: '행사' };
  async function community() {
    const top = hd('커뮤니티 · 신고', `신고가 ${SP.settings && SP.settings['community.hide_at'] ? SP.settings['community.hide_at'] : 3}건 쌓이면 자동으로 가려져요. 확인하고 되살리거나 가려 두세요.`, `<a class="btn btn-line btn-sm" href="/write?b=notice" target="_blank" rel="noopener">${icon('edit', 'sm')}공지 쓰기</a>`)
      + `<div class="a-sub">${seg('cmTab', [['reports', '신고'], ['posts', '글 관리']], CM.tab)}</div>`;
    if (CM.tab === 'reports') {
      const d = await SP.get('/api/admin/reports?status=' + CM.status);
      const link = (r) => { const t = r.target || {}; return r.kind === 'post' ? `/c/${r.targetId}` : r.kind === 'comment' ? `/c/${t.post_id}#cmt-${r.targetId}` : r.kind === 'meetup' ? `/m/${r.targetId}` : r.kind === 'crew' ? `/t/${r.targetId}` : r.kind === 'event' ? `/e/${r.targetId}` : ''; };
      const hidden = (r) => { const t = r.target || {}; return t.hidden === 1 || t.status === 'hidden' || t.status === 'banned'; };
      main.innerHTML = top + `<div class="a-tools">${seg('rpSt', [['open', '처리 전'], ['done', '처리 끝']], CM.status)}</div>
        <div class="a-card">${d.items.map((r) => { const t = r.target; const l = link(r); return `<div class="rp"><div><div class="row wrap-ok" style="gap:6px">${B('ink', KIND[r.kind] || r.kind)}${B('red', `신고 ${r.n}건`)}${t && hidden(r) ? B('mute', '지금 가려짐') : ''}<span class="small muted">${SP.ago(r.last)}</span></div>
            <div style="margin-top:6px"><b>${t ? esc(t.title || t.nick || '') : '<span class="faint">지워진 대상이에요</span>'}</b>${t && t.nick && t.title ? ` <span class="small muted">· ${esc(t.nick)}</span>` : ''}</div>
            ${t && t.body ? `<div class="q">${esc(t.body)}</div>` : ''}<p class="small muted" style="margin-top:6px">신고 이유: ${esc(r.reasons)}</p></div>
            <div class="a-acts">${l ? `<a class="btn btn-ghost btn-sm" href="${l}" target="_blank" rel="noopener">보기</a>` : ''}${t ? `<button class="btn btn-ink btn-sm" type="button" data-rp="${r.kind}|${r.targetId}|hide">${r.kind === 'user' ? '이용 정지' : '가리기'}</button>${r.kind !== 'user' ? `<button class="btn btn-line btn-sm" type="button" data-rp="${r.kind}|${r.targetId}|restore">되살리기</button>` : ''}` : ''}<button class="btn btn-soft btn-sm" type="button" data-rp="${r.kind}|${r.targetId}|dismiss">문제없음</button></div></div>`; }).join('') || `<div class="a-empty">${CM.status === 'open' ? '처리할 신고가 없어요.' : '처리한 신고가 아직 없어요.'}</div>`}</div>`;
      onSeg(main, 'rpSt', (v) => { CM.status = v; community(); });
    } else {
      const p = new URLSearchParams();
      if (CM.board) p.set('board', CM.board);
      if (CM.hidden) p.set('hidden', '1');
      if (CM.q) p.set('q', CM.q);
      const d = await SP.get('/api/admin/posts?' + p);
      main.innerHTML = top + `<div class="a-tools"><select class="select" id="pbBoard"><option value="">모든 게시판</option>${Object.entries(SP.BOARD).map(([k, l]) => `<option value="${k}"${CM.board === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="pbHidden"${CM.hidden ? ' checked' : ''}><span>가려진 글만</span></label><input class="input" id="pbQ" placeholder="제목·내용으로 찾기" value="${esc(CM.q)}"></div>
        <div class="a-tbl-wrap"><table class="a-tbl"><thead><tr><th>게시판</th><th>제목</th><th>글쓴이</th><th class="r">반응</th><th class="r">신고</th><th>쓴 날</th><th>고정</th><th>가림</th></tr></thead><tbody>
        ${d.items.map((x) => `<tr><td>${esc(SP.BOARD[x.board] || x.board)}</td><td><a class="link" href="/c/${x.id}" target="_blank" rel="noopener">${esc(x.title || '(제목 없음)')}</a></td><td>${esc(x.nick || '탈퇴한 회원')}</td><td class="r nw">♥${x.likes} · 💬${x.cmts}</td><td class="r">${x.reports ? `<b class="red">${x.reports}</b>` : 0}</td><td class="nw">${day(x.created_at)}</td>
          <td><label class="switch"><input type="checkbox" data-pin="${x.id}"${x.pinned ? ' checked' : ''} aria-label="고정"></label></td><td><label class="switch"><input type="checkbox" data-hide="${x.id}"${x.hidden ? ' checked' : ''} aria-label="가리기"></label></td></tr>`).join('') || emptyRow(8, '조건에 맞는 글이 없어요.')}</tbody></table></div>`;
      $('#pbBoard').onchange = (e) => { CM.board = e.target.value; community(); };
      $('#pbHidden').onchange = (e) => { CM.hidden = e.target.checked; community(); };
      $('#pbQ').onchange = (e) => { CM.q = e.target.value.trim(); community(); };
    }
    onSeg(main, 'cmTab', (v) => { CM.tab = v; community(); });
    main.onclick = async (e) => {
      const b = e.target.closest('[data-rp]'); if (!b) return;
      const [kind, id, action] = b.dataset.rp.split('|');
      if (action === 'hide' && kind === 'user' && !(await SP.confirm('이 회원의 이용을 정지할까요? 바로 로그아웃되고 다시 로그인할 수 없어요.', { ok: '정지', danger: true }))) return;
      try { await SP.post('/api/admin/reports', { kind, id: Number(id), action }); SP.toast(action === 'hide' ? '가렸어요.' : action === 'restore' ? '되살렸어요.' : '처리했어요.'); refreshCounts(); community(); } catch (er) { SP.fail(er); }
    };
    main.onchange = async (e) => {
      const pin = e.target.closest('[data-pin]'), hide = e.target.closest('[data-hide]');
      const el = pin || hide; if (!el) return;
      try { await SP.post('/api/admin/posts/' + el.dataset[pin ? 'pin' : 'hide'], pin ? { pinned: el.checked } : { hidden: el.checked }); SP.toast(pin ? (el.checked ? '맨 위에 고정했어요.' : '고정을 풀었어요.') : (el.checked ? '가렸어요.' : '다시 보이게 했어요.')); }
      catch (er) { el.checked = !el.checked; SP.fail(er); }
    };
  }

  /* ================= 모임 · 파티팀 ================= */
  const GR = { tab: 'meetups' };
  async function groups() {
    const d = await SP.get('/api/admin/groups');
    const MST = [['active', '활동 중'], ['closed', '모집 끝'], ['hidden', '숨김'], ['deleted', '삭제']];
    const CST = [['open', '모집 중'], ['closed', '모집 완료'], ['hidden', '숨김'], ['deleted', '삭제']];
    const sel = (kind, id, cur, opts) => `<select class="select input-sm" data-gs="${kind}|${id}" style="width:auto">${opts.map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const body = GR.tab === 'meetups'
      ? `<table class="a-tbl"><thead><tr><th>모임</th><th>분야 · 지역</th><th class="r">멤버</th><th class="r">신고</th><th>모임장</th><th>만든 날</th><th>상태</th></tr></thead><tbody>
        ${d.meetups.map((x) => `<tr><td><a class="link b" href="/m/${x.id}" target="_blank" rel="noopener">${esc(x.title)}</a></td><td>${esc(x.cat)} · ${esc(x.region)}</td><td class="r">${x.members}/${x.cap}</td><td class="r">${x.reports ? `<b class="red">${x.reports}</b>` : 0}</td><td>${esc(x.nick || '탈퇴한 회원')}</td><td class="nw">${day(x.created_at)}</td><td>${sel('meetups', x.id, x.status, MST)}</td></tr>`).join('') || emptyRow(7, '아직 모임이 없어요.')}</tbody></table>`
      : `<table class="a-tbl"><thead><tr><th>파티팀</th><th>날짜</th><th>지역</th><th class="r">모인 인원</th><th class="r">신고</th><th>모집자</th><th>상태</th></tr></thead><tbody>
        ${d.crews.map((x) => `<tr><td><a class="link b" href="/t/${x.id}" target="_blank" rel="noopener">${esc(x.title)}</a></td><td class="nw">${SP.mdw(x.d)}</td><td>${esc(x.region || '')}</td><td class="r">${x.accepted}/${x.need}</td><td class="r">${x.reports ? `<b class="red">${x.reports}</b>` : 0}</td><td>${esc(x.nick || '탈퇴한 회원')}</td><td>${sel('crews', x.id, x.status, CST)}</td></tr>`).join('') || emptyRow(7, '아직 파티팀 모집글이 없어요.')}</tbody></table>`;
    main.innerHTML = hd('모임 · 파티팀', '문제가 있는 모임이나 모집글은 숨기거나 지울 수 있어요. 숨기면 만든 사람과 운영진만 볼 수 있어요.')
      + `<div class="a-sub">${seg('grTab', [['meetups', `모임 ${d.meetups.length}`], ['crews', `파티팀 ${d.crews.length}`]], GR.tab)}</div><div class="a-tbl-wrap">${body}</div>`;
    onSeg(main, 'grTab', (v) => { GR.tab = v; groups(); });
    main.onchange = async (e) => {
      const s = e.target.closest('[data-gs]'); if (!s) return;
      const [kind, id] = s.dataset.gs.split('|');
      if (s.value === 'deleted' && !(await SP.confirm('지우면 되돌릴 수 없어요. 지울까요?', { ok: '지우기', danger: true }))) { groups(); return; }
      try { await SP.post(`/api/admin/${kind}/${id}`, { status: s.value }); SP.toast('바꿨어요.'); if (s.value === 'deleted') groups(); } catch (er) { SP.fail(er); groups(); }
    };
  }

  /* ================= 회원 ================= */
  const US = { q: '', role: '', page: 1 };
  async function users() {
    const p = new URLSearchParams({ page: String(US.page) });
    if (US.q) p.set('q', US.q);
    if (US.role) p.set('role', US.role);
    const d = await SP.get('/api/admin/users?' + p);
    const ROLE = { member: '회원', host: '호스트', staff: '운영진', admin: '대표 관리자' };
    main.innerHTML = hd('회원', `전체 ${SP.fmt(d.total)}명 (탈퇴 제외). 비밀번호는 운영진도 볼 수 없어요. 잊은 회원에게는 임시 비밀번호를 만들어 알려 주세요.`,
      isAdmin() ? `<button class="btn btn-line btn-sm" type="button" data-bc>${icon('bell', 'sm')}전체 알림 보내기</button><a class="btn btn-ghost btn-sm" href="/api/admin/users/export">${icon('download', 'sm')}소식 받기 동의 회원 (CSV)</a>` : '')
      + `<div class="a-tools"><input class="input" id="usQ" placeholder="이메일·닉네임으로 찾기" value="${esc(US.q)}"><select class="select" id="usRole"><option value="">모든 권한</option>${Object.entries(ROLE).map(([k, l]) => `<option value="${k}"${US.role === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="a-tbl-wrap"><table class="a-tbl"><thead><tr><th>닉네임</th><th>이메일</th><th class="r">나이</th><th>지역</th><th>권한</th><th>상태</th><th class="r">방문</th><th class="r">글</th><th>가입</th><th>마지막 접속</th><th></th></tr></thead><tbody>
      ${d.items.map((u) => `<tr><td><b>${esc(u.nick)}</b><span class="sub mono">#${u.id}</span></td><td>${esc(u.email)}</td><td class="r">${ageOf(u.birth) ?? '-'}</td><td>${esc(u.region || '')}</td><td>${u.role === 'member' ? '회원' : B('ink', ROLE[u.role] || u.role)}</td>
        <td>${u.status === 'banned' ? B('red', '정지') : B('ok', '활동')}${u.marketing ? ' <span class="tiny faint">소식 동의</span>' : ''}</td><td class="r">${u.visits}</td><td class="r">${u.posts}</td><td class="nw">${day(u.created_at)}</td><td class="nw">${u.last_at ? SP.ago(u.last_at) : '-'}</td>
        <td><button class="btn btn-line btn-sm" type="button" data-u="${u.id}">관리</button></td></tr>`).join('') || emptyRow(11, '조건에 맞는 회원이 없어요.')}</tbody></table></div>
      <div class="row" style="justify-content:center;margin-top:12px">${US.page > 1 ? '<button class="btn btn-soft btn-sm" type="button" data-pg="-1">이전</button>' : ''}${d.more ? '<button class="btn btn-soft btn-sm" type="button" data-pg="1">다음</button>' : ''}</div>`;
    $('#usQ').onchange = (e) => { US.q = e.target.value.trim(); US.page = 1; users(); };
    $('#usRole').onchange = (e) => { US.role = e.target.value; US.page = 1; users(); };
    main.onclick = (e) => {
      const pg = e.target.closest('[data-pg]'); if (pg) { US.page += Number(pg.dataset.pg); users(); return; }
      if (e.target.closest('[data-bc]')) { broadcast(); return; }
      const u = e.target.closest('[data-u]'); if (u) userModal(d.items.find((x) => String(x.id) === u.dataset.u));
    };
  }
  function hostCodesOf(u) { try { const a = typeof u.host_codes === 'string' ? JSON.parse(u.host_codes) : u.host_codes; return Array.isArray(a) ? a : []; } catch { return []; } }
  function userModal(u) {
    const m = SP.modal({
      title: `${u.nick} 회원`,
      body: `<dl class="kv2"><dt>이메일</dt><dd>${esc(u.email)}</dd><dt>생년월일</dt><dd>${esc(u.birth || '-')} (만 ${ageOf(u.birth) ?? '-'}세)</dd><dt>가입</dt><dd>${when(u.created_at)}</dd><dt>마지막 접속</dt><dd>${when(u.last_at)}</dd><dt>방문 인증 · 글</dt><dd>${u.visits}번 · ${u.posts}개</dd></dl>
        ${isAdmin() ? `<div class="field" style="margin-top:16px"><label class="label" for="uRole">권한</label><select class="select" id="uRole">${[['member', '회원'], ['host', '호스트 (내 지점 관리)'], ['staff', '운영진 (관리 화면 사용)'], ['admin', '대표 관리자']].map(([k, l]) => `<option value="${k}"${u.role === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field" style="margin-top:12px"><label class="label" for="uCodes">연결한 지점 코드 <span class="opt">호스트에게만 · 쉼표로 나눠요</span></label><input class="input" id="uCodes" maxlength="300" value="${esc(hostCodesOf(u).join(', '))}" placeholder="S-0012, S-0031"><div class="a-note" style="margin-top:6px">여기 적은 지점은 이 회원이 마이 → 내 공간 관리에서 소개·사진·시설·이용 안내를 직접 고치고, 지점 소식을 올릴 수 있어요.</div></div>` : ''}
        <div class="field" style="margin-top:14px"><label class="label" for="uMemo">운영 메모 <span class="opt">운영진만 봐요</span></label><input class="input" id="uMemo" maxlength="300" value="${esc(u.memo || '')}"></div>
        <div id="uTemp"></div>`,
      foot: `<button class="btn btn-ghost btn-sm" type="button" id="uPw" style="margin-right:auto">임시 비밀번호 만들기</button><button class="btn ${u.status === 'banned' ? 'btn-line' : 'btn-soft'}" type="button" id="uBan">${u.status === 'banned' ? '정지 풀기' : '이용 정지'}</button><button class="btn btn-ink" type="button" id="uSave">저장</button>`,
    });
    m.$('#uSave').onclick = async () => {
      const body = { memo: m.$('#uMemo').value.trim() };
      if (isAdmin() && m.$('#uRole').value !== u.role) body.role = m.$('#uRole').value;
      if (isAdmin()) {
        const codes = m.$('#uCodes').value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
        const bad = codes.find((x) => !/^S-\d{4}$/.test(x));
        if (bad) { SP.toast(`지점 코드 형식이 달라요: ${bad} (예: S-0012)`, true); return; }
        if (codes.join(',') !== hostCodesOf(u).join(',')) body.hostCodes = codes;
      }
      try { await SP.post('/api/admin/users/' + u.id, body); m.close(); SP.toast('저장했어요.'); users(); } catch (e) { SP.fail(e); }
    };
    m.$('#uBan').onclick = async () => {
      const ban = u.status !== 'banned';
      if (ban && !(await SP.confirm(`${u.nick}님의 이용을 정지할까요? 바로 로그아웃되고 다시 로그인할 수 없어요.`, { ok: '정지', danger: true }))) return;
      try { await SP.post('/api/admin/users/' + u.id, { status: ban ? 'banned' : 'active' }); m.close(); SP.toast(ban ? '정지했어요.' : '정지를 풀었어요.'); users(); } catch (e) { SP.fail(e); }
    };
    m.$('#uPw').onclick = async () => {
      if (!(await SP.confirm('임시 비밀번호를 만들까요? 지금 비밀번호는 바로 쓸 수 없게 되고 모든 기기에서 로그아웃돼요.', { ok: '만들기' }))) return;
      try {
        const r = await SP.post('/api/admin/users/' + u.id, { resetPw: true });
        m.$('#uTemp').innerHTML = `<div class="callout red" style="margin-top:14px">${icon('lock')}<div>임시 비밀번호: <b class="mono" style="font-size:15px">${esc(r.temp)}</b><br>이 창을 닫으면 다시 볼 수 없어요. 회원에게 알려 주고, 로그인한 뒤 마이 → 계정 설정에서 바꾸라고 안내해 주세요. <button class="btn btn-soft btn-sm" type="button" id="uCopy" style="margin-top:6px">복사</button></div></div>`;
        m.$('#uCopy').onclick = () => SP.copy(r.temp, '임시 비밀번호를 복사했어요.');
      } catch (e) { SP.fail(e); }
    };
  }
  function broadcast() {
    const m = SP.modal({
      title: '전체 알림 보내기',
      body: `<p class="a-note">회원 화면의 종 모양 알림으로 보내요. 이메일이나 문자는 보내지 않아요.</p>
        <div class="field" style="margin-top:14px"><label class="label" for="bcText">알림 내용</label><textarea class="textarea" id="bcText" maxlength="200" style="min-height:90px" placeholder="예) 11월 할로윈 파티 신청을 받고 있어요!"></textarea></div>
        <div class="field"><label class="label" for="bcLink">누르면 갈 곳 <span class="opt">선택</span></label><input class="input" id="bcLink" maxlength="200" placeholder="/event 또는 https://..."></div>
        <div class="field"><span class="label">받는 사람</span>${seg('bcTo', [['all', '활동 중인 모든 회원'], ['marketing', '소식 받기 동의한 회원만']], 'all')}</div>
        <p class="tiny faint" style="margin-top:8px">광고성 내용(할인, 이벤트 홍보)은 소식 받기에 동의한 회원에게만 보내 주세요.</p><div class="form-err" id="bcErr" hidden></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="bcGo">보내기</button>',
    });
    let to = 'all';
    onSeg(m.el, 'bcTo', (v) => { to = v; });
    m.$('#bcGo').onclick = async () => {
      const text = m.$('#bcText').value.trim();
      const err = m.$('#bcErr');
      if (text.length < 4) { err.textContent = '알림 내용을 4자 이상 적어 주세요.'; err.hidden = false; return; }
      if (!(await SP.confirm(`${to === 'all' ? '활동 중인 모든 회원' : '소식 받기에 동의한 회원'}에게 보낼까요?`, { ok: '보내기' }))) return;
      try { const r = await SP.post('/api/admin/broadcast', { text, link: m.$('#bcLink').value.trim(), target: to }); m.close(); SP.toast(r.sent != null ? `${SP.fmt(r.sent)}명에게 보냈어요.` : '보냈어요.'); } catch (e) { err.textContent = e.message; err.hidden = false; }
    };
  }

  /* ================= 방문 인증 ================= */
  const VS = { status: 'pending' };
  async function visits() {
    const d = await SP.get('/api/admin/visits?status=' + VS.status);
    const host = (SP.settings && SP.settings['link.host']) || '';
    const chk = host ? [host, '호스트 센터 열기'] : ['https://partner.booking.naver.com', '네이버 예약 관리 열기'];
    main.innerHTML = hd('방문 인증', `회원이 보낸 예약번호를 ${host ? '호스트 센터' : '네이버 예약 관리'}에서 찾아보고, 그 지점·날짜가 맞으면 승인해 주세요.`, `<a class="btn btn-line btn-sm" href="${esc(chk[0])}" target="_blank" rel="noopener">${icon('ext', 'sm')}${chk[1]}</a>`)
      + `<div class="a-tools">${seg('vsSt', [['pending', '확인 전'], ['ok', '승인'], ['rejected', '거절']], VS.status)}</div>
      <div class="a-tbl-wrap"><table class="a-tbl"><thead><tr><th>요청</th><th>회원</th><th>지점</th><th>이용일</th><th>예약번호 · 메모</th><th>확인 방법</th><th></th></tr></thead><tbody>
      ${d.items.map((v) => `<tr><td class="nw">${when(v.created_at)}</td><td><b>${esc(v.nick || '탈퇴한 회원')}</b><span class="sub">${esc(v.email || '')}</span></td><td>${esc(v.spaceName)}</td><td class="nw">${SP.mdw(v.d)}</td><td class="mono">${esc(v.note || '')}</td><td>${v.method === 'host' ? '자동' : '운영진'}</td>
        <td>${v.status === 'pending' ? `<div class="a-acts"><button class="btn btn-ink btn-sm" type="button" data-vs="${v.id}|approve">승인</button><button class="btn btn-soft btn-sm" type="button" data-vs="${v.id}|reject">거절</button></div>` : `<span class="small muted">${when(v.decided_at)}</span>`}</td></tr>`).join('') || emptyRow(7, VS.status === 'pending' ? '확인할 인증이 없어요.' : '기록이 없어요.')}</tbody></table></div>`;
    onSeg(main, 'vsSt', (v) => { VS.status = v; visits(); });
    main.onclick = async (e) => {
      const b = e.target.closest('[data-vs]'); if (!b) return;
      const [id, action] = b.dataset.vs.split('|');
      const send = async (note) => {
        await SP.post('/api/admin/visits/' + id, { action, note });
        SP.toast(action === 'approve' ? '승인했어요. 회원에게 알림이 갔어요.' : '거절했어요. 회원에게 알림이 갔어요.');
        refreshCounts(); visits();
      };
      if (action === 'approve') { try { await send(null); } catch (er) { SP.fail(er); } return; }
      const m = SP.modal({
        title: '방문 인증 거절',
        body: `<p class="a-note">회원에게는 "예약번호를 다시 확인해 주세요"라고 알림이 가요. 아래 메모는 운영진만 봐요.</p><div class="field" style="margin-top:12px"><label class="label" for="vsNote">거절 이유</label><input class="input" id="vsNote" maxlength="120" value="호스트 예약 기록에서 찾지 못함"></div>`,
        foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="vsGo">거절하기</button>',
      });
      m.$('#vsGo').onclick = async () => { try { await send(m.$('#vsNote').value.trim()); m.close(); } catch (er) { SP.fail(er); } };
    };
  }

  /* ================= 문의함 ================= */
  const IQ = { status: 'all' };
  async function inquiries() {
    const d = await SP.get('/api/admin/inquiries?status=' + IQ.status);
    const ST = { new: ['red', '새 문의'], read: ['warn', '확인 중'], done: ['ok', '처리 끝'] };
    main.innerHTML = hd('문의함', '제휴·협업, 기업·단체 행사, 공간 입점 상담이 여기로 와요. 접수일로부터 1년이 지나면 자동으로 지워져요.')
      + `<div class="a-tools">${seg('iqSt', [['all', '전체'], ['new', '새 문의'], ['read', '확인 중'], ['done', '처리 끝']], IQ.status)}</div>
      <div class="a-card">${d.items.map((q) => `<div class="rp"><div><div class="row wrap-ok" style="gap:6px">${B(ST[q.status][0], ST[q.status][1])}${B('ink', q.kindLabel)}<span class="small muted">${when(q.created_at)}</span></div>
          <div style="margin-top:6px"><b>${esc(q.name || '')}</b>${q.org ? ` · ${esc(q.org)}` : ''} · <span class="mono">${esc(q.contact || '')}</span></div><div class="q">${esc(q.body || '')}</div>${q.memo ? `<p class="small" style="margin-top:6px"><b>메모</b> ${esc(q.memo)}</p>` : ''}</div>
          <div class="a-acts"><button class="btn btn-line btn-sm" type="button" data-iq="${q.id}">메모 · 상태</button></div></div>`).join('') || '<div class="a-empty">문의가 없어요.</div>'}</div>`;
    onSeg(main, 'iqSt', (v) => { IQ.status = v; inquiries(); });
    main.onclick = (e) => {
      const b = e.target.closest('[data-iq]'); if (!b) return;
      const q = d.items.find((x) => String(x.id) === b.dataset.iq);
      const m = SP.modal({
        title: `${q.kindLabel} · ${q.name || ''}`,
        body: `<div class="q" style="background:var(--fog);border-radius:10px;padding:12px;white-space:pre-wrap">${esc(q.body || '')}</div><p class="small" style="margin-top:8px">연락처 <span class="mono">${esc(q.contact || '')}</span></p>
          <div class="field" style="margin-top:14px"><span class="label">상태</span>${seg('iqS', [['new', '새 문의'], ['read', '확인 중'], ['done', '처리 끝']], q.status === 'new' ? 'read' : q.status)}</div>
          <div class="field"><label class="label" for="iqMemo">메모</label><textarea class="textarea" id="iqMemo" maxlength="1000" style="min-height:90px" placeholder="예) 10/12 전화 상담, 견적 보냄">${esc(q.memo || '')}</textarea></div>`,
        foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-ink" type="button" id="iqGo">저장</button>',
      });
      let st = q.status === 'new' ? 'read' : q.status;
      onSeg(m.el, 'iqS', (v) => { st = v; });
      m.$('#iqGo').onclick = async () => { try { await SP.post('/api/admin/inquiries/' + q.id, { status: st, memo: m.$('#iqMemo').value.trim() }); m.close(); refreshCounts(); inquiries(); } catch (er) { SP.fail(er); } };
    };
  }

  /* ================= 제휴 ================= */
  async function partners() {
    const [d] = await Promise.all([SP.get('/api/admin/partners'), spaces()]);
    const TIER = { all: '모든 회원', silver: '실버 이상', gold: '골드' };
    main.innerHTML = hd('제휴', '제휴·협업 화면과 쏘플 클럽 혜택에 보이는 제휴처예요. 혜택 문구는 제휴처와 합의한 내용 그대로 적어 주세요.', `<button class="btn btn-red btn-sm" type="button" data-new>${icon('plus', 'sm')}제휴처 추가</button>`)
      + `<div class="a-tbl-wrap"><table class="a-tbl"><thead><tr><th class="r">순서</th><th>제휴처</th><th>혜택</th><th>대상</th><th>지역 · 지점</th><th>공개</th><th></th></tr></thead><tbody>
      ${d.items.map((p) => `<tr><td class="r">${p.sort}</td><td><b>${esc(p.name)}</b><span class="sub">${esc(p.cat || '')}</span></td><td>${esc(p.benefit)}</td><td>${TIER[p.tier] || p.tier}</td><td>${esc(p.region || '')}${p.code ? ` · ${esc(nameOf(p.code))}` : ''}</td><td>${p.active ? B('ok', '공개') : B('mute', '숨김')}</td>
        <td><div class="a-acts"><button class="btn btn-line btn-sm" type="button" data-edit="${p.id}">고치기</button></div></td></tr>`).join('') || emptyRow(7, '아직 제휴처가 없어요.')}</tbody></table></div>`;
    main.onclick = (e) => {
      if (e.target.closest('[data-new]')) { partnerForm(null); return; }
      const b = e.target.closest('[data-edit]'); if (b) partnerForm(d.items.find((x) => String(x.id) === b.dataset.edit));
    };
  }
  function partnerForm(p) {
    const v = p || { tier: 'all', active: 1, sort: 0 };
    const m = SP.modal({
      title: p ? '제휴처 고치기' : '제휴처 추가', wide: true,
      body: `<form class="form-grid" id="ptf">
        <div class="field"><label class="label" for="p1">이름</label><input class="input" id="p1" name="name" maxlength="40" value="${esc(v.name || '')}"></div>
        <div class="field"><label class="label" for="p2">분류</label><input class="input" id="p2" name="cat" maxlength="20" list="ptCats" value="${esc(v.cat || '')}" placeholder="케이크·디저트"><datalist id="ptCats">${['케이크·디저트', '꽃·풍선', '음식·배달', '촬영·스냅', '파티용품', '클래스·체험', '기타'].map((c) => `<option value="${c}">`).join('')}</datalist></div>
        <div class="field full"><label class="label" for="p3">혜택 (한 줄)</label><input class="input" id="p3" name="benefit" maxlength="80" value="${esc(v.benefit || '')}" placeholder="예) 쏘플 예약 고객 레터링 케이크 10% 할인"></div>
        <div class="field full"><label class="label" for="p4">설명 · 이용 방법 <span class="opt">선택</span></label><textarea class="textarea" id="p4" name="body" maxlength="1000" style="min-height:90px">${esc(v.body || '')}</textarea></div>
        <div class="field"><label class="label" for="p5">링크</label><input class="input" id="p5" name="url" type="url" value="${esc(v.url || '')}" placeholder="https://"></div>
        <div class="field"><label class="label" for="p6">지역 <span class="opt">선택</span></label><input class="input" id="p6" name="region" maxlength="20" value="${esc(v.region || '')}" placeholder="예) 서울 성수"></div>
        <div class="field"><label class="label" for="p7">대상 등급</label><select class="select" id="p7" name="tier">${[['all', '모든 회원'], ['silver', '실버 이상'], ['gold', '골드']].map(([k, l]) => `<option value="${k}"${v.tier === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="p8">가까운 지점 <span class="opt">선택</span></label><select class="select" id="p8" name="code">${SP.spaceOptions(SPACES, v.code || '', '없음')}</select></div>
        <div class="field"><label class="label" for="p9">순서 (작을수록 앞)</label><input class="input" id="p9" name="sort" type="number" min="0" max="9999" value="${v.sort || 0}"></div>
        <div class="field"><span class="label">공개</span><label class="switch"><input type="checkbox" name="active"${v.active ? ' checked' : ''}><span>제휴 화면에 보여요</span></label></div>
        <div class="field full"><span class="label">대표 사진 · 로고 <span class="opt">선택</span></span><div id="ptImg"></div></div></form><div class="form-err" id="ptErr" hidden></div>`,
      foot: `${p ? '<button class="btn btn-ghost btn-sm" type="button" id="ptDel" style="margin-right:auto">지우기</button>' : ''}<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="ptGo">저장</button>`,
    });
    SP.coverPicker(m.$('#ptImg'), v.imgUrl || '', v.img || '');
    m.$('#ptGo').onclick = async () => {
      const f = SP.formData(m.$('#ptf'));
      const body = { ...f, img: f.cover || null, sort: Number(f.sort) || 0, code: f.code || null };
      delete body.cover;
      try { if (p) await SP.put('/api/admin/partners/' + p.id, body); else await SP.post('/api/admin/partners', body); m.close(); SP.toast('저장했어요.'); partners(); }
      catch (e) { const er = m.$('#ptErr'); er.textContent = e.message; er.hidden = false; }
    };
    const del = m.$('#ptDel');
    if (del) del.onclick = async () => { if (!(await SP.confirm('이 제휴처를 지울까요?', { ok: '지우기', danger: true }))) return; try { await SP.del('/api/admin/partners/' + p.id); m.close(); partners(); } catch (e) { SP.fail(e); } };
  }

  /* ================= 설정 ================= */
  async function settings() {
    const [d] = await Promise.all([SP.get('/api/admin/settings'), spaces()]);
    const s = d.settings;
    const ben = (() => { try { return JSON.parse(s['club.benefits']); } catch { return {}; } })();
    const I = (k, label, ph = '', help = '', type = 'text', full = false) => `<div class="field${full ? ' full' : ''}"><label class="label" for="st_${k}">${label}</label><input class="input" id="st_${k}" data-key="${k}" type="${type}" value="${esc(s[k] ?? '')}" placeholder="${esc(ph)}">${help ? `<p class="help">${help}</p>` : ''}</div>`;
    const T = (k, label, ph = '', help = '') => `<div class="field full"><label class="label" for="st_${k}">${label}</label><textarea class="textarea" id="st_${k}" data-key="${k}" style="min-height:80px" placeholder="${esc(ph)}">${esc(s[k] ?? '')}</textarea>${help ? `<p class="help">${help}</p>` : ''}</div>`;
    const sec = (title, inner, note = '') => `<div class="a-card set-sec"><div class="a-card-hd"><h2>${title}</h2></div>${note ? `<p class="a-note" style="margin:-4px 0 12px">${note}</p>` : ''}<div class="form-grid">${inner}</div></div>`;
    const featured = String(s['home.featured'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    main.innerHTML = hd('설정', isAdmin() ? '바꾼 내용은 저장하면 1분 안에 홈페이지에 반영돼요.' : '설정은 볼 수만 있어요. 저장은 대표 관리자만 할 수 있어요.')
      + sec('공지 띠', I('site.notice', '맨 위 공지 문구', '예) 추석 연휴에도 모든 지점이 문을 열어요.', '비워 두면 공지 띠가 안 보여요.', 'text', true) + I('site.notice_link', '공지를 누르면 갈 곳', '/event 또는 https://...', '', 'text', true))
      + sec('첫 화면', I('hero.title', '큰 제목', '파티룸은 쏘플, 우리 쏘플에서 만나요!', '비워 두면 기본 문구가 나와요. 쉼표 뒤에서 줄이 바뀌어요.', 'text', true) + I('hero.sub', '작은 설명', '', '', 'text', true)
        + `<div class="field full"><span class="label">추천 지점 <span class="opt">누른 순서대로 첫 화면에 보여요 · 비우면 많이 찾는 지점</span></span><div class="feat-pick" id="featPick">${SPACES.filter((x) => x.visible).map((x) => `<button type="button" class="chip${featured.includes(x.code) ? ' on' : ''}" data-fc="${x.code}">${esc(x.name)}</button>`).join('')}</div><input type="hidden" data-key="home.featured" id="st_home.featured" value="${esc(featured.join(','))}"></div>`)
      + sec('고객센터 · 연결', I('cs.phone', '대표 번호', '1544-3523') + I('cs.hours', '상담 시간', '월~목 10:00~19:00 · 금~일 10:00~22:00') + I('kakao.url', '카카오톡 상담 주소', 'https://pf.kakao.com/...') + I('link.chatbot', '챗봇 주소', '', '비워 두면 안 보여요.')
        + I('link.host', '호스트 센터 주소', 'https://host.jssystems.kr', '비워 두면 바닥글에서 숨겨요. 지금은 호스트 센터를 쓰지 않으니 비워 두세요.') + I('link.play', '쏘플 파티게임(폰 연결 버전) 주소', '', '배포한 ssople-play 주소(https://…)를 넣으면 파티게임 화면에 \'객실 TV로 방 열기\' 버튼과 놀이터 연결 카드가 보여요. 아직 없으면 비워 두세요.') + I('link.live', '온라인 파티룸 주소', '', '놀이터에 연결 카드로 보여요.'))
      + sec('SNS', I('sns.instagram', '인스타그램', 'https://instagram.com/...') + I('sns.blog', '블로그', 'https://blog.naver.com/...') + I('sns.youtube', '유튜브', 'https://youtube.com/...'), '적어 두면 검색엔진에 공식 채널로 같이 알려져요.')
      + sec('호스트 프로그램', I('host.plus_price', '플러스존 월 요금 (원)', '30000', '', 'number') + I('host.premium_price', '프리미엄존 월 요금 (원)', '50000', '', 'number') + I('host.discount6', '6개월 결제 할인 (%)', '10', '', 'number') + I('host.discount12', '12개월 결제 할인 (%)', '20', '', 'number') + I('host.managed_fee', '위탁운영 수수료 (매출의 %)', '20', '결제 수수료를 포함한 비율이에요.', 'number'), '호스트 센터 화면의 요금 표에 그대로 보여요. 숫자만 바꾸면 돼요.')
      + sec('검색 등록 (소유 확인)', I('seo.canonical_host', '대표 주소 (도메인)', '비워 두세요 — 자동으로 ssople.com', '비워 두면 돼요. ssople.com 을 Cloudflare Pages(ssople)의 사용자 지정 도메인으로 연결하면, ssople.com 으로 처음 들어온 순간부터 자동으로 대표 주소가 ssople.com 이 돼요. 그때부터 ssople.pages.dev·www.ssople.com 접속은 ssople.com 으로 넘어가고, 정식 주소·사이트맵·RSS도 ssople.com 기준이 돼요. 연결에 문제가 생겨 되돌려야 하면 여기에 ssople.pages.dev 를 적고 저장하세요.', 'text', true) + I('seo.naver_verify', '네이버 서치어드바이저 확인 코드', '비워 두세요 — 기본 코드가 이미 들어가 있어요', 'https://ssople.com 의 네이버 확인 코드(2b4906…)는 홈페이지에 이미 넣어 뒀어요. 확인 파일(naverbbbed…html)도 함께 준비돼 있어요. 네이버에서 다른 코드를 새로 받았을 때만 "HTML 태그"의 content 값을 붙여 넣으세요.') + I('seo.google_verify', '구글 서치 콘솔 확인 코드', '예) AbCdEf...', 'search.google.com/search-console → 속성 추가(URL 접두어) → "HTML 태그" 방식의 content 값만.') + I('seo.bing_verify', '빙 웹마스터 확인 코드 (선택)', '', '안 쓰면 비워 두세요.'), '저장하면 홈페이지 머리 부분에 확인용 태그가 들어가요. 그다음 각 서비스에서 "소유 확인"을 누르면 돼요. 사이트맵 주소는 /sitemap.xml, RSS 주소는 /rss.xml 이에요.')
      + sec('사업자 정보', I('biz.name', '상호', '브이픽서(주)') + I('biz.ceo', '대표자', '') + I('biz.no', '사업자등록번호', '000-00-00000') + I('biz.mailorder', '통신판매업 신고번호', '', '신고했다면 적어 주세요.') + I('biz.addr', '사업장 주소', '', '', 'text', true) + I('biz.email', '대표 이메일') + I('biz.privacy_officer', '개인정보 보호책임자', '', '개인정보처리방침에 이름이 들어가요.'), '바닥글, 브랜드 이야기의 회사 정보, 이용약관, 개인정보처리방침에 그대로 들어가요.')
      + sec('함께 표시하는 회사', I('biz2.name', '상호', '제이에스시스템즈(주)', '비우면 바닥글과 회사 정보에서 빠져요.') + I('biz2.ceo', '대표자', '') + I('biz2.no', '사업자등록번호', '000-00-00000') + I('biz2.email', '이메일') + I('biz2.addr', '사업장 주소', '', '', 'text', true), '바닥글과 회사 정보에 운영 회사 다음 줄로 보여요.')
      + sec('쏘플 클럽', I('club.silver', '실버가 되는 방문 횟수 (1년)', '2', '', 'number') + I('club.gold', '골드가 되는 방문 횟수 (1년)', '4', '', 'number')
        + ['welcome', 'silver', 'gold'].map((k) => `<div class="field"><label class="label" for="cb_${k}">${{ welcome: '웰컴', silver: '실버', gold: '골드' }[k]} 혜택 <span class="opt">한 줄에 하나</span></label><textarea class="textarea" id="cb_${k}" data-ben="${k}" style="min-height:96px">${esc((ben[k] || []).join('\n'))}</textarea></div>`).join('')
        + T('club.coupon_note', '실버·골드 회원에게만 보이는 안내', '예) 네이버 예약에서 쿠폰 코드 SSOPLE10을 넣으면 1만원 할인돼요.', '쿠폰 할인 금액은 점주 80%, 본사 20%로 나눠 부담하고, 정산은 정가에서 쿠폰·포인트를 뺀 금액을 기준으로 해요. 이 설명은 관리 화면에만 보여요.'))
      + sec('빈 방 표시', `<div class="field"><label class="label" for="st_avail.mode">예약 가능 표시</label><select class="select" id="st_avail.mode" data-key="avail.mode">${[['auto', '자동 (예약 데이터가 최신일 때만 보여 줘요)'], ['on', '항상 보여 줘요'], ['off', '숨겨요 (요금·지점 정보만)']].map(([k, l]) => `<option value="${k}"${s['avail.mode'] === k ? ' selected' : ''}>${l}</option>`).join('')}</select><p class="help">자동이면 예약 데이터가 오래됐을 때(엑셀은 올린 지 3일, 호스트 연결은 6시간) "예약 가능"을 "확인 필요"로 바꿔서 겹치기 예약을 막아요.</p></div>`
        + I('avail.sync_min', '자동 불러오기 간격 (분)', '10', '고객이 빈 방을 볼 때 이 간격마다 한 번씩 호스트 예약을 새로 읽어요. 3분보다 짧게는 안 돼요.', 'number'))
      + sec('커뮤니티 · 가입', I('community.hide_at', '자동으로 가리는 신고 수', '3', '', 'number') + `<div class="field"><span class="label">회원 가입</span><label class="switch"><input type="checkbox" id="st_signup.open" data-key="signup.open" data-bool${s['signup.open'] !== '0' ? ' checked' : ''}><span>새 회원 가입 받기</span></label></div>`
        + T('community.banned', '금지어', '쉼표나 줄바꿈으로 나눠요', '이 말이 들어간 글·댓글·모임 소개는 올라가지 않아요. 고객 화면에는 보이지 않아요.'))
      + (isAdmin() ? '<div class="save-bar"><button class="btn btn-red btn-lg" type="button" id="stSave">설정 저장</button></div>' : '');
    $('#featPick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fc]'); if (!b) return;
      const h = $('#st_home\\.featured');
      let cur = h.value ? h.value.split(',') : [];
      if (cur.includes(b.dataset.fc)) cur = cur.filter((x) => x !== b.dataset.fc); else cur.push(b.dataset.fc);
      h.value = cur.slice(0, 12).join(',');
      b.classList.toggle('on', cur.includes(b.dataset.fc));
    });
    if (!isAdmin()) $$('[data-key], [data-ben]', main).forEach((el) => { el.disabled = true; });
    const save = $('#stSave');
    if (save) save.onclick = async () => {
      const body = {};
      $$('[data-key]', main).forEach((el) => { body[el.dataset.key] = el.dataset.bool !== undefined ? (el.checked ? '1' : '0') : el.value.trim(); });
      const b2 = {}; $$('[data-ben]', main).forEach((el) => { b2[el.dataset.ben] = el.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8); });
      body['club.benefits'] = JSON.stringify(b2);
      if (Number(body['club.gold']) <= Number(body['club.silver'])) { SP.toast('골드 기준은 실버보다 커야 해요.', true); return; }
      SP.busy(save, true, '저장하는 중…');
      try { await SP.put('/api/admin/settings', body); try { sessionStorage.removeItem('sp.site'); } catch { /* 무시 */ } SP.toast('저장했어요.'); }
      catch (e) { SP.fail(e); }
      SP.busy(save, false);
    };
  }

  const VIEWS = { overview, avail, data, spaces: spacesView, events, community, groups, users, visits, inquiries, partners, settings };
  boot();
})();
