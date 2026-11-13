/* 호스트센터 — 홈(오늘 할 일) · 예약 장부(달력·목록·입력·가져오기) · 고객
   구독형(호스트가 직접 운영하는 공간)에서만 써요. 내 공간 탭은 myspace.js 가 그려요. */
(function () {
  const { $, esc, icon } = SP;
  const W = ['일', '월', '화', '수', '목', '금', '토'];
  const PKG_NAME = { day: '낮', night: '밤', allday: '올데이', tonight: '저녁', morning: '오전', hour3: '3시간', full: '풀타임', hour: '시간제' };
  const ST_CLS = { ok: 'ok', wait: 'warn', done: 'ink', cancel: 'mute', noshow: 'red' };
  const SRC_TOP = ['naver', 'spacecloud', 'phone', 'kakao', 'insta', 'ssople', 'walkin'];
  let H = null;   // { root, spaces(myspace), onSpaces, desk, tab, code, month, view, sel, books, f }

  /* ---------- 작은 도구 ---------- */
  const hm = (m) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const timeOf = (b) => `${hm(b.s)}~${b.e > 1440 ? '다음 날 ' : ''}${hm(b.e)}`;
  const wonF = (n) => (n == null || n === '' ? '' : SP.fmt(n) + '원');
  const mdw = (ymd) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8))}일 (${W[SP.wdi(ymd)]})`;
  const maskPhone = (p) => { const d = String(p || ''); return d.replace(/^(\d{3})-?(\d{3,4})-?(\d{4})$/, (m, a, b, c) => `${a}-${'*'.repeat(b.length)}-${c}`); };
  const priceIdx = (ymd) => { const w = SP.wdi(ymd); return w === 5 ? 1 : w === 6 ? 2 : w === 0 ? 3 : 0; };
  const ymOf = (ymd) => ymd.slice(0, 7);
  const monthAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  const spaceOf = (code) => (H.desk.spaces || []).find((s) => s.code === code);
  const nameOf = (code) => { const s = (H.spaces || []).find((x) => x.code === code); return s ? s.name : code; };
  const multi = () => (H.desk.spaces || []).length > 1;
  const codeQ = () => (H.code ? '&code=' + H.code : '');
  const meta = () => H.desk.meta || {};
  const pkgOptions = (sp) => {
    if (!sp) return [];
    return (sp.pkgs || []).filter((p) => p.k !== 'hour').map((p) => ({ k: p.k, label: (sp.labels && sp.labels[p.k]) || PKG_NAME[p.k] || p.k, s: p.s, e: p.e, p: p.p || [] }));
  };
  const hourly = (sp) => (sp && sp.hourly && (sp.hourly.p || []).some(Boolean) ? sp.hourly : null);

  /* ---------- 탭 ---------- */
  function tabsHtml() {
    const t = [['home', '홈', 'home'], ['books', '예약', 'calendar'], ['guests', '고객', 'users'], ['spaces', '내 공간', 'building']];
    return `<div class="hd-top">
      <nav class="hd-tabs" role="tablist" aria-label="호스트센터 메뉴">${t.map(([k, l, ic]) => `<a href="#${k}" role="tab" data-tab="${k}" aria-selected="${H.tab === k}" class="${H.tab === k ? 'on' : ''}">${icon(ic, 'sm')}${l}</a>`).join('')}</nav>
      <div class="hd-top-acts">${multi() ? `<select class="select hd-code" id="hdCode" aria-label="지점 고르기"><option value="">전체 지점</option>${H.desk.spaces.map((s) => `<option value="${esc(s.code)}"${H.code === s.code ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
        <button class="btn btn-red btn-sm" type="button" data-new-book>${icon('plus', 'sm')}예약 입력</button></div></div>`;
  }
  function setTab(tab, push = true) {
    H.tab = tab;
    if (push) { try { history.replaceState(null, '', '#' + tab); } catch { /* 무시 */ } }
    const top = $('#hdTop');
    top.innerHTML = tabsHtml();
    const sp = $('#hsRoot');
    const hd = $('#hdRoot');
    if (tab === 'spaces') { hd.hidden = true; sp.hidden = false; H.onSpaces(); return; }
    sp.hidden = true; hd.hidden = false;
    if (tab === 'home') home();
    else if (tab === 'books') books();
    else if (tab === 'guests') guests();
  }
  async function loadDesk() {
    H.desk = await SP.get('/api/host/desk' + (H.code ? '?code=' + H.code : ''));
  }

  /* ---------- 홈 ---------- */
  async function home() {
    const root = $('#hdRoot');
    root.innerHTML = '<div class="skel" style="height:320px"></div>';
    try { await loadDesk(); } catch (e) { root.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    const d = H.desk;
    const today = d.today || SP.today();
    const tmr = SP.addDays(today, 1);
    const soon = (d.soon || []).filter((b) => b.d >= today);
    const todays = soon.filter((b) => b.d === today);
    const m = d.month || {};
    const mm = Number((m.ym || today).slice(5, 7));
    const td = d.todo || {};
    const nq = (H.openQs || []).length;
    const ends = (H.spaces || []).filter((s) => s.listing && s.listing.type === 'host' && s.listing.until && SP.dayDiff(today, s.listing.until) <= 14);
    const todo = [
      [td.waiting, 'warn', `확정을 기다리는 예약 ${td.waiting}건`, '대기로 넣어 둔 예약이에요. 확정되면 상태를 바꿔 주세요.', '#books', 'wait'],
      [td.unpaid, 'warn', `결제가 끝나지 않은 예약 ${td.unpaid}건`, '이용일이 7일 안이거나 지난 예약 중 미결제·일부 결제', '#books', 'unpaid'],
      [td.deposit, 'warn', `보증금을 돌려줄 예약 ${td.deposit}건`, '이용일이 지났는데 보증금이 「받음」으로 남아 있어요.', '#books', 'deposit'],
      [td.pastOk, '', `이용 완료로 바꿀 예약 ${td.pastOk}건`, '지난 예약을 「이용 완료」로 정리하면 매출과 손님 기록이 정확해져요.', '#books', 'past'],
      [nq, 'red', `답변 기다리는 문의 ${nq}개`, '지점 화면 「지점에 물어보기」에 손님이 남긴 질문', '#spaces', 'qna'],
      ...ends.map((s) => [1, 'warn', `「${s.name}」 노출 기간 ${SP.dayDiff(today, s.listing.until) < 0 ? '끝남' : 'D-' + SP.dayDiff(today, s.listing.until)}`, '내 공간에서 「기간 연장」을 신청해 주세요.', '#spaces', 'renew']),
    ].filter((x) => x[0]);
    const maxSrc = Math.max(1, ...(m.bySrc || []).map((x) => x.n));
    root.innerHTML = `
      <div class="hd-kpis">
        <a class="hd-kpi${todays.length ? ' hot' : ''}" href="#books" data-go-day="${today}"><small>오늘 예약</small><b>${todays.length}건</b><span>${todays.length ? esc(todays.slice(0, 2).map((b) => `${hm(b.s)} ${b.name || b.srcLabel}`).join(' · ')) : '오늘은 비어 있어요'}</span></a>
        <a class="hd-kpi" href="#books"><small>앞으로 7일</small><b>${soon.length}건</b><span>내일 ${soon.filter((b) => b.d === tmr).length}건</span></a>
        <div class="hd-kpi"><small>${mm}월 매출</small><b>${wonF(m.sales || 0)}</b><span>예약 ${m.count || 0}건 · 손님 ${SP.fmt(m.people || 0)}명</span></div>
        <a class="hd-kpi" href="#guests"><small>다시 온 손님</small><b>${m.repeat || 0}명</b><span>${mm}월 손님 ${m.guests || 0}명 중 · 전체 ${d.guests || 0}명</span></a>
      </div>
      <div class="hd-home">
        <section class="hd-card">
          <div class="hd-card-hd"><h2>다가오는 예약</h2><a class="sec-more" href="#books">예약 달력</a></div>
          ${soon.length ? dayGroups(soon, today) : `<div class="hd-empty">${icon('calendar')}<b>앞으로 7일 동안 예약이 없어요</b><p>네이버 예약·스페이스클라우드·전화로 받은 예약을 여기에 적어 두면 한눈에 보이고, 손님 화면 달력에도 마감으로 표시돼요.</p><div class="row" style="gap:6px;justify-content:center"><button class="btn btn-red btn-sm" type="button" data-new-book>${icon('plus', 'sm')}예약 입력</button><button class="btn btn-line btn-sm" type="button" data-import>${icon('upload', 'sm')}여러 건 가져오기</button></div></div>`}
        </section>
        <div class="hd-side">
          <section class="hd-card">
            <div class="hd-card-hd"><h2>확인할 일</h2></div>
            ${todo.length ? `<ul class="hd-todo">${todo.map(([, cls, t, sub, href, key]) => `<li><a href="${href}" data-todo="${key}"><span class="dot ${cls}"></span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span>${icon('chev-r', 'sm')}</a></li>`).join('')}</ul>` : `<p class="small muted hd-note">${icon('check-c', 'sm')}<span>지금 챙길 일이 없어요.</span></p>`}
          </section>
          <section class="hd-card">
            <div class="hd-card-hd"><h2>${mm}월 예약 경로</h2></div>
            ${(m.bySrc || []).length ? `<ul class="hd-bars">${m.bySrc.map((x) => `<li><span>${esc(x.label)}</span><i style="--w:${Math.round((x.n / maxSrc) * 100)}%"></i><b>${x.n}</b></li>`).join('')}</ul>` : '<p class="small muted">이번 달 예약을 넣으면 어디서 예약이 많이 오는지 보여요.</p>'}
          </section>
          <section class="hd-card hd-quick">
            <button type="button" data-new-book>${icon('plus')}<span>예약 입력</span></button>
            <button type="button" data-import>${icon('upload')}<span>여러 건 가져오기</span></button>
            <a href="/api/host/books/export?${H.code ? 'code=' + H.code : ''}" download>${icon('download')}<span>엑셀로 내보내기</span></a>
            <a href="#spaces" data-go-spaces>${icon('building')}<span>공간 정보 고치기</span></a>
          </section>
        </div>
      </div>
      <p class="tiny faint hd-foot">예약 장부의 손님 이름·연락처는 이 지점 호스트만 볼 수 있어요. 이용일로부터 1년이 지나면 이름·연락처가 자동으로 지워져요.</p>`;
  }
  /** 날짜별로 묶은 예약 줄 */
  function dayGroups(list, today) {
    const by = {};
    list.forEach((b) => { (by[b.d] = by[b.d] || []).push(b); });
    return Object.keys(by).sort().map((dd) => `<div class="hd-dg"><h3>${dd === today ? '오늘' : dd === SP.addDays(today, 1) ? '내일' : ''} <span>${mdw(dd)}</span></h3>${by[dd].map(bookLine).join('')}</div>`).join('');
  }
  function bookLine(b, withDate) {
    const past = b.d < SP.today();
    const dLabel = withDate === true ? `<em>${b.d.slice(0, 4) === SP.today().slice(0, 4) ? '' : b.d.slice(2, 4) + '.'}${Number(b.d.slice(5, 7))}.${Number(b.d.slice(8, 10))}</em>` : '';
    return `<div class="hd-bk st-${b.status}" data-book="${b.id}" tabindex="0" role="button" aria-label="${esc(`${mdw(b.d)} ${timeOf(b)} ${b.name || ''} 예약 열기`)}">
      <div class="hd-bk-t">${dLabel}<b>${hm(b.s)}</b><small>~${b.e > 1440 ? '익일 ' : ''}${hm(b.e)}</small></div>
      <div class="hd-bk-m"><div class="hd-bk-n"><b>${esc(b.name || '이름 없음')}</b>${b.people ? `<span>${b.people}명</span>` : ''}${multi() ? `<span class="mute">${esc(nameOf(b.code))}</span>` : ''}</div>
        <div class="hd-bk-s"><span class="badge ${ST_CLS[b.status]}">${esc(b.statusLabel)}</span><span class="src src-${b.src}">${esc(b.srcLabel)}</span>${b.slotLabel && b.slotLabel !== '직접 입력' ? `<span>${esc(b.slotLabel)}</span>` : ''}${b.purpose ? `<span>${esc(b.purpose)}</span>` : ''}${b.memo ? `<span class="memo">${icon('edit', 'sm')}${esc(b.memo.slice(0, 30))}</span>` : ''}</div></div>
      <div class="hd-bk-r">${b.amount != null ? `<b>${wonF(b.amount)}</b>` : ''}${b.paid && b.paid !== 'paid' && b.status !== 'cancel' ? `<span class="badge warn">${esc(b.paidLabel)}</span>` : b.amount ? '<span class="tiny muted">결제 완료</span>' : ''}${b.depSt === 'held' && past ? '<span class="badge warn">보증금 반환</span>' : ''}</div>
      <div class="hd-bk-q">${quickBtns(b)}</div>
    </div>`;
  }
  function quickBtns(b) {
    const out = [];
    const past = b.d <= SP.today();
    if (b.status === 'wait') out.push(['status', 'ok', '확정']);
    if (b.status === 'ok' && past) out.push(['status', 'done', '이용 완료']);
    if ((b.paid === 'unpaid' || b.paid === 'part') && b.status !== 'cancel') out.push(['paid', 'paid', '결제 완료']);
    if (b.depSt === 'held' && past && b.status !== 'cancel') out.push(['dep_st', 'returned', '보증금 돌려줌']);
    return out.map(([k, v, l]) => `<button type="button" class="btn btn-soft btn-sm" data-quick="${b.id}" data-k="${k}" data-v="${v}">${l}</button>`).join('');
  }

  /* ---------- 예약 (달력 · 목록) ---------- */
  async function books() {
    const root = $('#hdRoot');
    if (!H.month) H.month = ymOf(SP.today());
    if (!H.sel) H.sel = SP.today();
    root.innerHTML = `
      <div class="hd-bar">
        <div class="hd-month"><button class="ibtn" type="button" data-mv="-1" aria-label="이전 달">${icon('chev-l')}</button><b id="hdMonth">${H.month.replace('-', '년 ')}월</b><button class="ibtn" type="button" data-mv="1" aria-label="다음 달">${icon('chev-r')}</button><button class="btn btn-soft btn-sm" type="button" data-mv="0">오늘</button></div>
        <div class="seg hd-view" role="group" aria-label="보기"><button type="button" data-view="cal" class="${H.view === 'list' ? '' : 'on'}">${icon('calendar', 'sm')}달력</button><button type="button" data-view="list" class="${H.view === 'list' ? 'on' : ''}">${icon('list', 'sm')}목록</button></div>
        <div class="hd-filters">
          <select class="select" id="hdSt" aria-label="상태"><option value="">모든 상태</option>${Object.entries(meta().statuses || {}).map(([k, l]) => `<option value="${k}"${H.f.status === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <select class="select" id="hdSrc" aria-label="예약 경로"><option value="">모든 경로</option>${Object.entries(meta().sources || {}).map(([k, l]) => `<option value="${k}"${H.f.src === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <label class="hd-search">${icon('search', 'sm')}<input class="input" id="hdQ" type="search" placeholder="이름·연락처·예약 번호" value="${esc(H.f.q || '')}" aria-label="예약 찾기"></label>
        </div>
        <div class="hd-bar-acts"><button class="btn btn-line btn-sm" type="button" data-import>${icon('upload', 'sm')}가져오기</button><a class="btn btn-line btn-sm" id="hdExport" href="#" download>${icon('download', 'sm')}내보내기</a></div>
      </div>
      <div id="hdBooks"><div class="skel" style="height:420px"></div></div>`;
    await loadBooks();
  }
  async function loadBooks() {
    const from = H.month + '-01';
    const to = H.month + '-' + String(lastDay(H.month)).padStart(2, '0');
    const exp = $('#hdExport');
    if (exp) exp.href = `/api/host/books/export?from=${from}&to=${to}${codeQ()}`;
    const wide = !!H.f.flag;   // 확인할 일(미결제·보증금·지난 확정)은 달을 넘어 넓게
    const qs = `from=${wide ? SP.addDays(SP.today(), -180) : SP.addDays(from, -7)}&to=${wide ? SP.addDays(SP.today(), 14) : SP.addDays(to, 7)}${codeQ()}${H.f.status ? '&status=' + H.f.status : ''}${H.f.src ? '&src=' + H.f.src : ''}${H.f.q ? '&q=' + encodeURIComponent(H.f.q) : ''}`;
    try { H.books = (await SP.get('/api/host/books?' + qs)).items || []; } catch (e) { $('#hdBooks').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    if (H.view === 'list') drawList(); else drawCal();
  }
  function drawCal() {
    const ym = H.month;
    const first = ym + '-01';
    const start = SP.addDays(first, -SP.wdi(first));
    const n = Math.ceil((SP.wdi(first) + lastDay(ym)) / 7) * 7;
    const today = SP.today();
    const by = {};
    H.books.forEach((b) => { (by[b.d] = by[b.d] || []).push(b); });
    let cells = W.map((w, i) => `<div class="hd-wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</div>`).join('');
    for (let i = 0; i < n; i++) {
      const dd = SP.addDays(start, i);
      const list = (by[dd] || []);
      const act = list.filter((b) => b.status !== 'cancel' && b.status !== 'noshow');
      const out = ymOf(dd) !== ym;
      cells += `<button type="button" class="hd-cd${out ? ' out' : ''}${dd === today ? ' today' : ''}${dd === H.sel ? ' sel' : ''}${SP.wdi(dd) === 0 ? ' sun' : ''}" data-d="${dd}" aria-label="${esc(mdw(dd))} 예약 ${act.length}건">
        <span class="n">${Number(dd.slice(8))}</span>${act.length ? `<span class="cnt">${act.length}</span>` : ''}
        <span class="pills">${list.slice(0, 3).map((b) => `<i class="st-${b.status}">${hm(b.s)} ${esc((b.name || b.srcLabel).slice(0, 5))}</i>`).join('')}${list.length > 3 ? `<i class="more">+${list.length - 3}</i>` : ''}</span></button>`;
    }
    $('#hdBooks').innerHTML = `<div class="hd-calwrap"><div class="hd-cal" id="hdCal">${cells}</div><aside class="hd-day" id="hdDay"></aside></div>
      <p class="tiny faint hd-note" style="margin-top:10px">${icon('lock', 'sm')}<span>확정·대기 예약은 손님 화면 날짜 달력에 「마감」으로 자동 표시돼요. 표시하지 않으려면 예약을 열어 「손님 화면에 마감 표시」를 꺼 주세요.</span></p>`;
    drawDay();
  }
  function drawDay() {
    const el = $('#hdDay');
    if (!el) return;
    const dd = H.sel;
    const list = H.books.filter((b) => b.d === dd);
    const act = list.filter((b) => ['ok', 'wait', 'done'].includes(b.status));
    // 아직 비어 있는 패키지 — 한 지점만 볼 때
    const code = H.code || ((H.desk.spaces || [])[0] || {}).code;
    const sp = multi() && !H.code ? null : spaceOf(code);
    const free = sp ? pkgOptions(sp).filter((p) => (p.p || [])[priceIdx(dd)] && !act.some((b) => b.code === sp.code && b.s < p.e && p.s < b.e)) : [];
    el.innerHTML = `<div class="hd-day-hd"><div><b>${mdw(dd)}</b><small>${act.length ? `예약 ${act.length}건` : '예약 없음'}</small></div><button class="btn btn-red btn-sm" type="button" data-new-book data-d="${dd}">${icon('plus', 'sm')}이 날 예약</button></div>
      ${list.length ? list.map(bookLine).join('') : '<p class="small muted" style="padding:14px 4px">이 날은 아직 예약이 없어요.</p>'}
      ${free.length && dd >= SP.today() ? `<div class="hd-free"><small>비어 있는 시간</small>${free.map((p) => `<button type="button" class="chip" data-new-book data-d="${dd}" data-pk="${esc(p.k)}" data-code="${esc(sp.code)}">${esc(p.label)} ${hm(p.s)}~${hm(p.e)}${p.p[priceIdx(dd)] ? ` · ${SP.won(p.p[priceIdx(dd)])}` : ''}</button>`).join('')}</div>` : ''}`;
  }
  const FLAG = {
    unpaid: ['결제가 끝나지 않은 예약', (b) => ['unpaid', 'part'].includes(b.paid) && ['ok', 'done'].includes(b.status) && b.d <= SP.addDays(SP.today(), 7)],
    deposit: ['보증금을 돌려줄 예약', (b) => b.depSt === 'held' && b.d < SP.today() && b.status !== 'cancel'],
    past: ['이용 완료로 바꿀 예약', (b) => b.status === 'ok' && b.d < SP.today()],
    wait: ['확정을 기다리는 예약', (b) => b.status === 'wait' && b.d >= SP.today()],
  };
  function drawList() {
    const fl = H.f.flag && FLAG[H.f.flag];
    const list = fl ? H.books.filter(fl[1]) : H.books.filter((b) => ymOf(b.d) === H.month);
    if (fl) {
      $('#hdBooks').innerHTML = `<div class="hd-flag"><b>${esc(fl[0])} ${list.length}건</b><button type="button" class="btn btn-soft btn-sm" data-unflag>${icon('x', 'sm')}전체 보기</button></div>${list.length ? `<div class="hd-list">${dayGroups(list, SP.today())}</div>` : `<div class="hd-empty">${icon('check-c')}<b>모두 정리했어요</b></div>`}`;
      return;
    }
    const sum = list.filter((b) => !['cancel', 'noshow'].includes(b.status)).reduce((a, b) => a + (b.amount || 0), 0);
    $('#hdBooks').innerHTML = list.length ? `<p class="small muted" style="margin-bottom:8px">${list.length}건 · 합계 ${wonF(sum)} (취소·노쇼 제외)</p><div class="hd-list">${dayGroups(list, SP.today())}</div>`
      : `<div class="hd-empty">${icon('calendar')}<b>이 달에 맞는 예약이 없어요</b><p>필터를 바꾸거나 다른 달을 보세요.</p></div>`;
  }

  /* ---------- 예약 입력 · 고치기 ---------- */
  async function bookForm(b0 = {}, opt = {}) {
    const isNew = !b0.id;
    const spaces = H.desk.spaces || [];
    if (!spaces.length) { SP.toast('예약을 넣을 수 있는 공간이 없어요.', true); return; }
    const b = { code: H.code || spaces[0].code, d: opt.d || SP.today(), status: 'ok', src: '', paid: '', dep_st: '', block: true, ...b0 };
    let sp = spaceOf(b.code) || spaces[0];
    let slot = b.slot || '';
    let amountTouched = !isNew;
    let guestId = b.guestId || null;
    const M = meta();
    const m = SP.modal({
      title: isNew ? '예약 입력' : '예약 고치기', wide: true,
      body: `<form id="bkF" class="hd-form" novalidate>
        <div class="hd-fs">
          ${spaces.length > 1 ? `<div class="field"><label class="label" for="bkCode">지점</label><select class="select" id="bkCode">${spaces.map((s) => `<option value="${esc(s.code)}"${s.code === b.code ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
          <div class="field"><label class="label" for="bkD">이용 날짜</label><input class="input" id="bkD" type="date" value="${esc(b.d)}" required><p class="help" id="bkDw"></p></div>
          <div class="field full"><span class="label">이용 시간</span><div class="hd-chips" id="bkSlots"></div>
            <div class="hd-time" id="bkTime"><select class="select" id="bkS" aria-label="시작 시간"></select><span>~</span><select class="select" id="bkE" aria-label="끝 시간"></select></div></div>
        </div>
        <div class="hd-fs">
          <div class="field full"><span class="label">어디서 받은 예약인가요?</span><div class="hd-chips" id="bkSrc">${Object.entries(M.sources || {}).sort((a, x) => (SRC_TOP.indexOf(a[0]) + 1 || 99) - (SRC_TOP.indexOf(x[0]) + 1 || 99)).map(([k, l]) => `<button type="button" class="chip${b.src === k ? ' on' : ''}" data-src="${k}">${esc(l)}</button>`).join('')}</div></div>
          <div class="field"><label class="label" for="bkExt">예약 번호 <span class="opt">선택</span></label><input class="input" id="bkExt" maxlength="40" value="${esc(b.extNo || '')}" placeholder="예) 네이버 예약 번호"></div>
          <div class="field"><span class="label">상태</span><div class="hd-chips" id="bkSt">${Object.entries(M.statuses || {}).map(([k, l]) => `<button type="button" class="chip${b.status === k ? ' on' : ''}" data-st="${k}">${esc(l)}</button>`).join('')}</div></div>
        </div>
        <div class="hd-fs">
          <div class="field hd-guest-f"><label class="label" for="bkName">예약자</label><input class="input" id="bkName" maxlength="30" autocomplete="off" value="${esc(b.name || '')}" placeholder="이름 (기존 손님은 검색돼요)"><div class="hd-ac" id="bkAc" hidden></div></div>
          <div class="field"><label class="label" for="bkPhone">연락처 <span class="opt">선택</span></label><input class="input" id="bkPhone" inputmode="tel" maxlength="20" autocomplete="off" value="${esc(b.phone || '')}" placeholder="010-1234-5678"></div>
          <div class="field full" id="bkGuest" hidden></div>
          <div class="field"><label class="label" for="bkPeople">인원</label><input class="input" id="bkPeople" type="number" min="1" max="300" inputmode="numeric" value="${esc(b.people ?? (isNew ? sp.base || '' : ''))}"><p class="help" id="bkPeopleHelp"></p></div>
          <div class="field"><span class="label">이용 목적 <span class="opt">선택</span></span><div class="hd-chips sm" id="bkPurpose">${(M.purposes || []).map((p) => `<button type="button" class="chip${b.purpose === p ? ' on' : ''}" data-pp="${esc(p)}">${esc(p)}</button>`).join('')}</div></div>
        </div>
        <div class="hd-fs">
          <div class="field"><label class="label" for="bkAmt">이용 금액</label><div class="hd-won"><input class="input" id="bkAmt" inputmode="numeric" maxlength="12" value="${b.amount != null ? SP.fmt(b.amount) : ''}" placeholder="0"><span>원</span></div><p class="help" id="bkAmtHelp"></p></div>
          <div class="field"><span class="label">결제</span><div class="hd-chips sm" id="bkPaid">${Object.entries(M.paid || {}).map(([k, l]) => `<button type="button" class="chip${(b.paid || 'paid') === k ? ' on' : ''}" data-pd="${k}">${esc(l)}</button>`).join('')}</div></div>
          <div class="field"><label class="label" for="bkDep">보증금 <span class="opt">선택</span></label><div class="hd-won"><input class="input" id="bkDep" inputmode="numeric" maxlength="10" value="${b.deposit != null ? SP.fmt(b.deposit) : ''}" placeholder="0"><span>원</span></div></div>
          <div class="field"><span class="label">보증금 상태</span><div class="hd-chips sm" id="bkDepSt">${Object.entries(M.dep || {}).map(([k, l]) => `<button type="button" class="chip${(b.depSt || 'none') === k ? ' on' : ''}" data-ds="${k}">${esc(l)}</button>`).join('')}</div></div>
          <div class="field full"><label class="label" for="bkMemo">메모 <span class="opt">호스트만 봐요</span></label><textarea class="textarea" id="bkMemo" rows="2" maxlength="500" placeholder="예) 케이크 반입, 풍선 장식 요청, 주차 1대">${esc(b.memo || '')}</textarea></div>
          <label class="switch full"><input type="checkbox" id="bkBlock"${b.block !== false ? ' checked' : ''}><span>손님 화면 날짜 달력에 이 시간을 「마감」으로 표시</span></label>
        </div>
        <div class="form-err" id="bkErr" hidden></div>
      </form>`,
      foot: `${isNew ? '' : '<button class="btn btn-ghost" type="button" id="bkDel" style="margin-right:auto">삭제</button>'}<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="bkGo">${isNew ? '예약 저장' : '고친 내용 저장'}</button>`,
    });
    const F = (id) => m.$('#' + id);
    // 시간 고르기 — 30분 단위, 끝 시간은 다음 날 아침까지
    const sOpts = () => Array.from({ length: 48 }, (_, i) => i * 30);
    const fillTimes = (s, e) => {
      F('bkS').innerHTML = sOpts().map((v) => `<option value="${v}"${v === s ? ' selected' : ''}>${hm(v)}</option>`).join('');
      const ss = Number(F('bkS').value);
      let eo = '';
      for (let v = ss + 30; v <= ss + 1440; v += 30) eo += `<option value="${v}"${v === e ? ' selected' : ''}>${v > 1440 ? '다음 날 ' : ''}${hm(v)}${v - ss < 1440 ? ` (${(v - ss) / 60}시간)` : ''}</option>`;
      F('bkE').innerHTML = eo;
    };
    const slotsHtml = () => {
      const opts = pkgOptions(sp);
      const hr = hourly(sp);
      const pi = priceIdx(F('bkD').value || b.d);
      return opts.map((p) => `<button type="button" class="chip slot${slot === p.k ? ' on' : ''}" data-slot="${esc(p.k)}"${p.p[pi] ? '' : ' data-off="1"'}><b>${esc(p.label)}</b><small>${hm(p.s)}~${p.e > 1440 ? '익일 ' : ''}${hm(p.e)}${p.p[pi] ? ` · ${SP.won(p.p[pi])}` : ' · 이 요일 없음'}</small></button>`).join('')
        + `<button type="button" class="chip slot${slot === 'custom' || (!slot && !opts.length) ? ' on' : ''}" data-slot="custom"><b>${hr ? '시간제' : '직접 입력'}</b><small>${hr ? `1시간 ${SP.won(hr.p[pi] || 0)} · 최소 ${hr.min}시간` : '시작·끝 시간 고르기'}</small></button>`;
    };
    const amountGuess = () => {
      const pi = priceIdx(F('bkD').value);
      const opt = pkgOptions(sp).find((p) => p.k === slot);
      let v = opt ? opt.p[pi] || 0 : 0;
      const hr = hourly(sp);
      if (!opt && hr && hr.p[pi]) v = Math.round(((Number(F('bkE').value) - Number(F('bkS').value)) / 60) * hr.p[pi]);
      const ppl = Number(F('bkPeople').value) || 0;
      const add = sp.base && ppl > sp.base && (H.spaces.find((x) => x.code === sp.code) || {}).addFee ? (ppl - sp.base) * Number((H.spaces.find((x) => x.code === sp.code) || {}).addFee) : 0;
      return v ? v + add : 0;
    };
    const syncAmount = () => {
      const g = amountGuess();
      F('bkAmtHelp').textContent = g ? `요금표 기준 ${SP.fmt(g)}원${amountTouched ? ' — 누르면 넣어요' : ''}` : '';
      F('bkAmtHelp').onclick = amountTouched && g ? () => { F('bkAmt').value = SP.fmt(g); } : null;
      F('bkAmtHelp').style.cursor = amountTouched && g ? 'pointer' : '';
      if (!amountTouched && g) F('bkAmt').value = SP.fmt(g);
    };
    const syncPeople = () => {
      const v = Number(F('bkPeople').value) || 0;
      F('bkPeopleHelp').textContent = sp.max && v > sp.max ? `최대 인원(${sp.max}명)을 넘었어요.` : sp.base ? `기준 ${sp.base}명 · 최대 ${sp.max || '-'}명` : '';
      F('bkPeopleHelp').classList.toggle('warn', !!(sp.max && v > sp.max));
    };
    const pickSlot = (k) => {
      slot = k;
      const opt = pkgOptions(sp).find((p) => p.k === k);
      const hr = hourly(sp);
      if (opt) fillTimes(opt.s, opt.e);
      else if (k === 'custom') {
        const cs = b.slot === 'custom' && b.s != null ? b.s : hr ? Math.ceil(hr.open / 30) * 30 % 1440 : 840;
        const ce = b.slot === 'custom' && b.e != null ? b.e : cs + (hr ? hr.min * 60 : 180);
        fillTimes(cs, ce);
      }
      F('bkSlots').innerHTML = slotsHtml();
      F('bkTime').classList.toggle('lock', !!opt);
      syncAmount();
    };
    const syncDate = () => {
      const v = F('bkD').value;
      F('bkDw').textContent = v ? `${W[SP.wdi(v)]}요일${v === SP.today() ? ' · 오늘' : ''}` : '';
      F('bkSlots').innerHTML = slotsHtml();
      syncAmount();
    };
    // 처음 값
    if (!isNew) {
      const opt = pkgOptions(sp).find((p) => p.k === b.slot);
      slot = opt ? b.slot : 'custom';
      fillTimes(b.s, b.e);
      F('bkSlots').innerHTML = slotsHtml();
      F('bkTime').classList.toggle('lock', !!opt);
    } else {
      const opts = pkgOptions(sp);
      const pk = opt.pk && opts.find((p) => p.k === opt.pk);
      pickSlot(pk ? pk.k : opts.length ? opts.find((p) => p.p[priceIdx(b.d)])?.k || opts[0].k : 'custom');
    }
    syncDate(); syncPeople();
    if (!isNew) syncAmount();
    // 손님 정보 표시 (다시 온 손님)
    const showGuest = (g) => {
      const box = F('bkGuest');
      if (!g) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      box.innerHTML = `<div class="hd-gbadge">${icon('user', 'sm')}<span><b>${esc(g.name || '이름 없음')}</b>${g.lastVisit ? ` · 마지막 이용 ${esc(g.lastVisit.replace(/-/g, '.'))}` : ''}${(g.tags || []).map((t) => ` <span class="badge ${t === '주의' ? 'red' : 'ink'}">${esc(t)}</span>`).join('')}${g.memo ? `<br><small>${esc(g.memo)}</small>` : ''}</span><button type="button" class="ibtn" data-unlink aria-label="손님 연결 풀기">${icon('x', 'sm')}</button></div>`;
    };
    if (guestId && b.name) showGuest({ name: b.name });
    // 이벤트
    m.el.addEventListener('click', (e) => {
      const t = e.target;
      const sl = t.closest('[data-slot]'); if (sl) { pickSlot(sl.dataset.slot); return; }
      const sr = t.closest('[data-src]'); if (sr) { m.$$('[data-src]').forEach((x) => x.classList.toggle('on', x === sr)); return; }
      const st = t.closest('[data-st]'); if (st) { m.$$('[data-st]').forEach((x) => x.classList.toggle('on', x === st)); return; }
      const pp = t.closest('[data-pp]'); if (pp) { const on = !pp.classList.contains('on'); m.$$('[data-pp]').forEach((x) => x.classList.remove('on')); pp.classList.toggle('on', on); return; }
      const pd = t.closest('[data-pd]'); if (pd) { m.$$('[data-pd]').forEach((x) => x.classList.toggle('on', x === pd)); return; }
      const ds = t.closest('[data-ds]'); if (ds) { m.$$('[data-ds]').forEach((x) => x.classList.toggle('on', x === ds)); return; }
      const un = t.closest('[data-unlink]'); if (un) { guestId = null; showGuest(null); return; }
      const ac = t.closest('[data-g]'); if (ac) {
        const g = JSON.parse(ac.dataset.g);
        guestId = g.id; F('bkName').value = g.name; if (g.phone) F('bkPhone').value = g.phone;
        F('bkAc').hidden = true; showGuest(g); return;
      }
    });
    if (F('bkCode')) F('bkCode').onchange = () => { sp = spaceOf(F('bkCode').value) || sp; slot = ''; pickSlot(pkgOptions(sp)[0] ? pkgOptions(sp)[0].k : 'custom'); syncPeople(); };
    F('bkD').onchange = syncDate;
    F('bkS').onchange = () => { const len = Number(F('bkE').value) - Number(F('bkS').value); fillTimes(Number(F('bkS').value), Number(F('bkS').value) + Math.max(30, len > 0 ? len : 180)); slot = 'custom'; F('bkSlots').innerHTML = slotsHtml(); F('bkTime').classList.remove('lock'); syncAmount(); };
    F('bkE').onchange = () => { if (slot !== 'custom') { slot = 'custom'; F('bkSlots').innerHTML = slotsHtml(); } syncAmount(); };
    F('bkTime').addEventListener('click', () => { if (F('bkTime').classList.contains('lock')) { F('bkTime').classList.remove('lock'); } });
    F('bkPeople').oninput = () => { syncPeople(); syncAmount(); };
    F('bkAmt').oninput = () => { amountTouched = true; const d = F('bkAmt').value.replace(/\D/g, ''); F('bkAmt').value = d ? SP.fmt(Number(d)) : ''; syncAmount(); };
    F('bkDep').oninput = () => {
      const d = F('bkDep').value.replace(/\D/g, ''); F('bkDep').value = d ? SP.fmt(Number(d)) : '';
      if (d && m.$('[data-ds].on')?.dataset.ds === 'none') m.$$('[data-ds]').forEach((x) => x.classList.toggle('on', x.dataset.ds === 'held'));
    };
    // 기존 손님 찾기 — 이름 앞글자나 연락처 일부
    const find = SP.debounce(async (q) => {
      const box = F('bkAc');
      if (!q || q.length < 1) { box.hidden = true; return; }
      try {
        const r = await SP.get('/api/host/guests/find?q=' + encodeURIComponent(q));
        const items = (r.items || []).filter((g) => g.id !== guestId);
        box.innerHTML = items.length ? items.map((g) => `<button type="button" data-g='${esc(JSON.stringify(g))}'><b>${esc(g.name || '이름 없음')}</b><span>${esc(maskPhone(g.phone))}${g.lastVisit ? ` · ${esc(g.lastVisit.replace(/-/g, '.'))}` : ''}${(g.tags || []).map((t) => ` · ${esc(t)}`).join('')}</span></button>`).join('') : '';
        box.hidden = !items.length;
      } catch { box.hidden = true; }
    }, 220);
    F('bkName').addEventListener('input', () => { if (guestId) { guestId = null; showGuest(null); } find(F('bkName').value.trim()); });
    F('bkPhone').addEventListener('input', () => { const d = F('bkPhone').value.replace(/\D/g, ''); if (d.length >= 4 && !guestId) find(d); });
    F('bkName').addEventListener('blur', () => setTimeout(() => { F('bkAc').hidden = true; }, 200));
    const body = (force) => ({
      code: F('bkCode') ? F('bkCode').value : sp.code,
      d: F('bkD').value, s: Number(F('bkS').value), e: Number(F('bkE').value),
      slot: slot || 'custom', slot_label: (pkgOptions(sp).find((p) => p.k === slot) || {}).label || '',
      src: (m.$('[data-src].on') || {}).dataset?.src || 'etc',
      ext_no: F('bkExt').value.trim(), status: (m.$('[data-st].on') || {}).dataset?.st || 'ok',
      name: F('bkName').value.trim(), phone: F('bkPhone').value.trim(), guestId: guestId || null,
      people: F('bkPeople').value, purpose: (m.$('[data-pp].on') || {}).dataset?.pp || '',
      amount: F('bkAmt').value.replace(/\D/g, ''), paid: (m.$('[data-pd].on') || {}).dataset?.pd || 'paid',
      deposit: F('bkDep').value.replace(/\D/g, ''), dep_st: (m.$('[data-ds].on') || {}).dataset?.ds || 'none',
      memo: F('bkMemo').value, block: F('bkBlock').checked, force: !!force,
    });
    const save = async (force) => {
      const err = F('bkErr'); err.hidden = true;
      const x = body(force);
      if (!x.d) { err.textContent = '이용 날짜를 골라 주세요.'; err.hidden = false; return; }
      if (!m.$('[data-src].on')) { err.textContent = '어디서 받은 예약인지 골라 주세요. 모르면 「기타」를 눌러 주세요.'; err.hidden = false; return; }
      const go = F('bkGo'); SP.busy(go, true, '저장하는 중');
      try {
        const r = isNew ? await SP.post('/api/host/books', x) : await SP.put('/api/host/books/' + b0.id, x);
        SP.busy(go, false);
        m.close();
        SP.toast(isNew ? `${mdw(r.book.d)} ${hm(r.book.s)} 예약을 저장했어요.` : '고친 내용을 저장했어요.');
        if (isNew) SP.ga('host_book_add', { src: x.src });
        H.sel = r.book.d; H.month = ymOf(r.book.d);
        refresh();
      } catch (er) {
        SP.busy(go, false);
        if (er.status === 409 && er.data && er.data.clash) {
          err.innerHTML = `<b>같은 시간에 예약이 있어요.</b> ${er.data.clash.map((c) => `${esc(mdw(c.d))} ${esc(c.time)} ${esc(c.name || c.src)}`).join(', ')}<br><button type="button" class="btn btn-line btn-sm" id="bkForce" style="margin-top:8px">겹쳐도 저장</button>`;
          err.hidden = false;
          F('bkForce').onclick = () => save(true);
          return;
        }
        err.textContent = er.message; err.hidden = false;
      }
    };
    F('bkGo').onclick = () => save(false);
    if (F('bkDel')) F('bkDel').onclick = async () => {
      if (!(await SP.confirm('이 예약을 지울까요? 손님 화면의 마감 표시도 함께 풀려요. 취소된 예약이라면 지우지 않고 상태를 「취소」로 바꿔 두는 걸 권해요.', { ok: '지우기', danger: true }))) return;
      try { await SP.del('/api/host/books/' + b0.id); m.close(); SP.toast('예약을 지웠어요.'); refresh(); } catch (er) { SP.fail(er); }
    };
  }

  /* ---------- 여러 건 가져오기 (엑셀 복사·CSV) ---------- */
  const COLS = [['d', '이용일', true], ['s', '시작', true], ['e', '끝', true], ['name', '예약자'], ['phone', '연락처'], ['people', '인원'], ['amount', '금액'], ['src', '예약 경로'], ['ext_no', '예약 번호'], ['memo', '메모']];
  const HEAD_ALIAS = { d: /이용\s*일|날짜|일자|date/i, s: /시작|입실|from|start/i, e: /끝|종료|퇴실|end|to$/i, name: /예약자|이름|고객|성함|name/i, phone: /연락처|전화|휴대|phone/i, people: /인원|명수|people/i, amount: /금액|결제|요금|price|amount/i, src: /경로|채널|플랫폼|source/i, ext_no: /예약\s*번호|번호|no\.?$/i, memo: /메모|요청|비고|memo/i, t: /이용\s*시간|^시간$|시간대|time/i, status: /상태|status/i };
  function parseCells(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
    const tab = lines.some((l) => l.includes('\t'));
    const split = (l) => {
      if (tab) return l.split('\t').map((x) => x.trim());
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { out.push(cur.trim()); cur = ''; } else cur += ch;
      }
      out.push(cur.trim());
      return out;
    };
    return lines.map(split);
  }
  const toYmd = (v) => {
    const s = String(v || '').trim();
    let m = s.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[.\-/월\s]+(\d{1,2})/);
    if (m) { const y = SP.today().slice(0, 4); return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
    return '';
  };
  const toMin = (v) => {
    const s = String(v || '').trim();
    const next = /다음|익일|\+1/.test(s);
    const m = s.match(/(오전|오후)?\s*(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
    if (!m) return null;
    let h = Number(m[2]); const mi = Number(m[3] || 0);
    if (m[1] === '오후' && h < 12) h += 12;
    if (m[1] === '오전' && h === 12) h = 0;
    return h * 60 + mi + (next ? 1440 : 0);
  };
  // 한 칸에 「14:00~18:00」, 「오후 2:00~오후 6:00」, 「2026.11.27(금) 19:00~익일 10:00」처럼 적힌 이용 시간
  const toRange = (v) => {
    let s = String(v || '');
    s = s.replace(/\d{4}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}일?/, ' ').replace(/^\s*\d{1,2}[./월]\s*\d{1,2}일?/, ' ').replace(/\([^)]*\)/g, ' ');
    const re = /(다음\s*날|익일|\+1)?\s*(오전|오후)?\s*(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/g;
    const out = []; let m;
    while ((m = re.exec(s)) && out.length < 2) {
      let h = Number(m[3]); const mi = Number(m[4] || 0);
      if (h > 30 || mi > 59) continue;
      let ap = m[2] || '';
      if (!ap && out.length === 1 && out[0].ap === '오후' && h < 12) ap = '오후';
      if (ap === '오후' && h < 12) h += 12;
      if (ap === '오전' && h === 12) h = 0;
      out.push({ v: h * 60 + mi + (m[1] ? 1440 : 0), ap: m[2] || '' });
    }
    return out.length ? [out[0].v, out[1] ? out[1].v : null] : null;
  };
  const toStatus = (v) => {
    const s = String(v || '');
    if (/취소|환불/.test(s)) return 'cancel';
    if (/노쇼/.test(s)) return 'noshow';
    if (/대기|신청|미확정/.test(s)) return 'wait';
    if (/이용\s*완료|완료/.test(s)) return 'done';
    return 'ok';
  };
  const toSrc = (v) => {
    const s = String(v || '');
    if (/네이버|naver/i.test(s)) return 'naver';
    if (/스페이스|space/i.test(s)) return 'spacecloud';
    if (/여기어때/.test(s)) return 'yeogi';
    if (/아워플/.test(s)) return 'ourplace';
    if (/전화|phone/i.test(s)) return 'phone';
    if (/카카오|카톡/.test(s)) return 'kakao';
    if (/인스타/.test(s)) return 'insta';
    if (/쏘플/.test(s)) return 'ssople';
    if (/지인|현장|직접/.test(s)) return 'walkin';
    return '';
  };
  function importModal() {
    const spaces = H.desk.spaces || [];
    if (!spaces.length) return;
    let parsed = [];
    let defSrc = 'naver';
    const M = meta();
    const m = SP.modal({
      title: '여러 건 가져오기', wide: true,
      body: `<ol class="hd-steps"><li>네이버 예약·스페이스클라우드 관리자 화면에서 예약 목록을 엑셀로 받거나, 표를 그대로 복사해요.</li><li>아래 칸에 붙여 넣거나 CSV 파일을 골라요. 첫 줄이 제목이면 칸을 알아서 맞춰요.</li><li>미리보기를 확인하고 「가져오기」를 눌러요. 같은 예약 번호는 두 번 들어가지 않아요.</li></ol>
        <div class="form-grid" style="margin-top:12px">
          ${spaces.length > 1 ? `<div class="field"><label class="label" for="imCode">지점</label><select class="select" id="imCode">${spaces.map((s) => `<option value="${esc(s.code)}"${s.code === (H.code || spaces[0].code) ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
          <div class="field"><label class="label" for="imSrc">예약 경로 (칸이 없을 때)</label><select class="select" id="imSrc">${Object.entries(M.sources || {}).map(([k, l]) => `<option value="${k}"${k === defSrc ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        </div>
        <div class="field" style="margin-top:4px"><label class="label" for="imTxt">붙여 넣기</label><textarea class="textarea mono" id="imTxt" rows="6" placeholder="이용일	시작	끝	예약자	연락처	인원	금액	예약 경로	예약 번호	메모&#10;2026-11-21	14:00	22:00	김쏘플	010-1234-5678	8	180000	네이버	1234567	케이크 반입"></textarea>
          <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><label class="btn btn-line btn-sm">${icon('upload', 'sm')}CSV 파일 고르기<input type="file" id="imFile" accept=".csv,text/csv,.txt" hidden></label><a class="btn btn-ghost btn-sm" id="imTpl" href="#" download="쏘플_예약_가져오기_양식.csv">${icon('download', 'sm')}빈 양식 받기</a></div>
          <p class="help">칸 순서: ${COLS.map((c) => c[1]).join(' · ')}. 시간은 14:00, 오후 2시, 다음 날 08:00 처럼 적어도 되고, 「14:00~18:00」처럼 한 칸에 적혀 있어도 읽어요.</p></div>
        <div id="imPrev"></div><div class="form-err" id="imErr" hidden></div>`,
      foot: '<button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="imGo" disabled>가져오기</button>',
    });
    const tpl = '﻿' + COLS.map((c) => c[1]).join(',') + '\r\n' + `${SP.today()},14:00,22:00,김쏘플,010-1234-5678,8,180000,네이버 예약,1234567,케이크 반입\r\n`;
    m.$('#imTpl').href = URL.createObjectURL(new Blob([tpl], { type: 'text/csv;charset=utf-8' }));
    const run = () => {
      const rows = parseCells(m.$('#imTxt').value);
      if (!rows.length) { m.$('#imPrev').innerHTML = ''; m.$('#imGo').disabled = true; return; }
      // 첫 줄이 제목인지 — 날짜로 못 읽으면 제목으로 보고 칸을 맞춰요
      let order = COLS.map((c) => c[0]);
      let body = rows;
      if (!toYmd(rows[0][0]) && rows[0].some((x) => /[가-힣a-z]/i.test(x))) {
        const head = rows[0];
        const map = head.map((h) => Object.keys(HEAD_ALIAS).find((k) => HEAD_ALIAS[k].test(h)) || '');
        if (map.includes('d')) order = map;
        body = rows.slice(1);
      }
      defSrc = m.$('#imSrc').value;
      parsed = body.slice(0, 300).map((r) => {
        const o = {};
        order.forEach((k, i) => { if (k && r[i] != null && r[i] !== '') o[k] = r[i]; });
        const d = toYmd(o.d);
        let s = o.s && !/[~∼〜]/.test(o.s) ? toMin(o.s) : null;
        let e = o.e ? toMin(o.e) : null;
        if (s == null || e == null) {
          const rg = toRange(o.t || o.s || o.d);
          if (rg) { if (s == null) s = rg[0]; if (e == null) e = rg[1]; }
        }
        if (s != null && s >= 1440) s -= 1440;
        if (s != null && e != null && e <= s) e += 1440;
        const x = { d, s, e, name: o.name || '', phone: o.phone || '', people: String(o.people || '').replace(/\D/g, ''), amount: String(o.amount || '').replace(/[^\d]/g, ''), src: toSrc(o.src) || defSrc, ext_no: o.ext_no || '', memo: o.memo || '', slot: 'custom', status: o.status ? toStatus(o.status) : 'ok' };
        x.err = !d ? '날짜를 못 읽었어요' : s == null || e == null ? '시간을 못 읽었어요' : '';
        return x;
      });
      const good = parsed.filter((x) => !x.err).length;
      m.$('#imPrev').innerHTML = `<p class="small" style="margin:10px 0 6px"><b>${good}건</b> 가져올 수 있어요${parsed.length - good ? ` · <span class="warn-t">${parsed.length - good}건은 확인이 필요해요</span>` : ''}${body.length > 300 ? ' · 한 번에 300건까지예요' : ''}</p>
        <div class="tbl-wrap hd-imtbl"><table class="tbl"><thead><tr><th>이용일</th><th>시간</th><th>예약자</th><th>인원</th><th>금액</th><th>경로</th><th>번호</th><th></th></tr></thead><tbody>
        ${parsed.slice(0, 50).map((x) => `<tr class="${x.err ? 'bad' : ''}"><td>${esc(x.d ? mdw(x.d) : '-')}</td><td>${x.s != null && x.e != null ? `${hm(x.s)}~${x.e > 1440 ? '익일 ' : ''}${hm(x.e)}` : '-'}</td><td>${esc(x.name)}</td><td>${esc(x.people)}</td><td>${x.amount ? SP.fmt(x.amount) : ''}</td><td>${esc((M.sources || {})[x.src] || '')}</td><td>${esc(x.ext_no)}</td><td>${x.err ? `<span class="badge red">${esc(x.err)}</span>` : x.status !== 'ok' ? `<span class="badge">${esc((M.statuses || {})[x.status] || '')}</span>` : icon('check', 'sm')}</td></tr>`).join('')}</tbody></table></div>
        ${parsed.length > 50 ? `<p class="tiny muted">미리보기는 50건까지만 보여요. 나머지 ${parsed.length - 50}건도 함께 가져와요.</p>` : ''}`;
      m.$('#imGo').disabled = !good;
      m.$('#imGo').textContent = good ? `${good}건 가져오기` : '가져오기';
    };
    m.$('#imTxt').addEventListener('input', SP.debounce(run, 250));
    m.$('#imSrc').onchange = run;
    m.$('#imFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const buf = await f.arrayBuffer();
      let t = new TextDecoder('utf-8').decode(buf);
      if (t.includes('�')) { try { t = new TextDecoder('euc-kr').decode(buf); } catch { /* utf-8 그대로 */ } }
      m.$('#imTxt').value = t.replace(/^﻿/, '');
      run();
    };
    m.$('#imGo').onclick = async () => {
      const rows = parsed.filter((x) => !x.err).map(({ err, ...x }) => x);
      if (!rows.length) return;
      const go = m.$('#imGo'); SP.busy(go, true, '가져오는 중');
      try {
        const r = await SP.post('/api/host/books/import', { code: m.$('#imCode') ? m.$('#imCode').value : spaces[0].code, rows });
        m.close();
        SP.toast(`${r.added}건을 가져왔어요.${r.skipped ? ` 이미 있던 ${r.skipped}건은 건너뛰었어요.` : ''}${r.errors && r.errors.length ? ` ${r.errors.length}건은 확인이 필요해요: ${r.errors[0].error}` : ''}`, !!(r.errors && r.errors.length && !r.added));
        SP.ga('host_book_import', { n: r.added });
        refresh();
      } catch (er) { SP.busy(go, false); const el = m.$('#imErr'); el.textContent = er.message; el.hidden = false; }
    };
  }

  /* ---------- 고객 ---------- */
  async function guests() {
    const root = $('#hdRoot');
    root.innerHTML = `<div class="hd-bar">
        <label class="hd-search grow">${icon('search', 'sm')}<input class="input" id="gQ" type="search" placeholder="이름·연락처·메모로 찾기" value="${esc(H.gq || '')}" aria-label="손님 찾기"></label>
        <div class="hd-chips" id="gF">${[['', '전체'], ['repeat', '다시 온 손님'], ...((meta().tags || []).map((t) => ['tag:' + t, t]))].map(([k, l]) => `<button type="button" class="chip${(H.gf || '') === k ? ' on' : ''}" data-gf="${esc(k)}">${esc(l)}</button>`).join('')}</div>
      </div><div id="gList"><div class="skel" style="height:260px"></div></div>
      <p class="tiny faint hd-foot">손님 정보는 예약을 넣을 때 자동으로 쌓여요. 연락처가 같으면 같은 손님으로 묶여요. 1년 넘게 이용하지 않은 손님 기록은 자동으로 지워지고, 손님이 원하면 언제든 「손님 정보 지우기」로 지울 수 있어요.</p>`;
    await loadGuests();
  }
  async function loadGuests() {
    const f = H.gf || '';
    const qs = `?q=${encodeURIComponent(H.gq || '')}${codeQ()}${f === 'repeat' ? '&repeat=1' : f.startsWith('tag:') ? '&tag=' + encodeURIComponent(f.slice(4)) : ''}`;
    let r;
    try { r = await SP.get('/api/host/guests' + qs); } catch (e) { $('#gList').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    const items = r.items || [];
    $('#gList').innerHTML = items.length ? `<p class="small muted" style="margin-bottom:8px">손님 ${items.length}명</p><div class="hd-guests">${items.map((g) => `<button type="button" class="hd-g" data-guest="${g.id}">
        <span class="av">${esc((g.name || '?').slice(0, 1))}</span>
        <span class="hd-g-m"><b>${esc(g.name || '이름 없음')}</b>${g.tags.map((t) => `<span class="badge ${t === '주의' ? 'red' : 'ink'}">${esc(t)}</span>`).join('')}<small>${esc(maskPhone(g.phone) || '연락처 없음')}${g.memo ? ` · ${esc(g.memo.slice(0, 40))}` : ''}</small></span>
        <span class="hd-g-s"><b>${g.visits}회</b><small>${g.lastVisit ? '마지막 ' + esc(g.lastVisit.slice(2).replace(/-/g, '.')) : '이용 전'}</small></span>
        <span class="hd-g-s"><b>${g.total ? SP.won(g.total) : '-'}</b><small>${g.nextVisit ? '다음 ' + esc(g.nextVisit.slice(5).replace('-', '.')) : g.noshow ? `노쇼 ${g.noshow}회` : '누적'}</small></span></button>`).join('')}</div>`
      : `<div class="hd-empty">${icon('users')}<b>${H.gq || H.gf ? '찾는 손님이 없어요' : '아직 손님 기록이 없어요'}</b><p>예약을 넣을 때 예약자 이름이나 연락처를 적으면 손님별로 방문 횟수와 누적 금액이 쌓여요.</p></div>`;
  }
  async function guestModal(id) {
    const m = SP.modal({ title: '손님', wide: true, body: '<div class="skel" style="height:240px"></div>', foot: '<button class="btn btn-ghost" type="button" id="gDel" style="margin-right:auto">손님 정보 지우기</button><button class="btn btn-soft" data-x>닫기</button><button class="btn btn-red" type="button" id="gSave">저장</button>' });
    let d;
    try { d = await SP.get('/api/host/guests/' + id); } catch (e) { m.$('.modal-body').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    const g = d.guest;
    const act = d.books.filter((b) => ['ok', 'done'].includes(b.status));
    m.$('.modal-body').innerHTML = `<div class="hd-gsum"><div><small>이용</small><b>${act.length}회</b></div><div><small>누적 금액</small><b>${wonF(act.reduce((a, b) => a + (b.amount || 0), 0)) || '-'}</b></div><div><small>취소·노쇼</small><b>${d.books.filter((b) => ['cancel', 'noshow'].includes(b.status)).length}회</b></div></div>
      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label class="label" for="gName">이름</label><input class="input" id="gName" maxlength="30" value="${esc(g.name)}"></div>
        <div class="field"><label class="label" for="gPhone">연락처</label><input class="input" id="gPhone" maxlength="20" inputmode="tel" value="${esc(g.phone)}">${g.phone ? `<p class="help"><a class="link" href="tel:${esc(g.phone.replace(/[^\d]/g, ''))}">전화</a> · <a class="link" href="sms:${esc(g.phone.replace(/[^\d]/g, ''))}">문자</a></p>` : ''}</div>
        <div class="field full"><span class="label">표시</span><div class="hd-chips" id="gTags">${(d.tags || []).map((t) => `<button type="button" class="chip${g.tags.includes(t) ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
        <div class="field full"><label class="label" for="gMemo">메모 <span class="opt">호스트만 봐요</span></label><textarea class="textarea" id="gMemo" rows="2" maxlength="500" placeholder="예) 매년 3월 생일파티, 케이크는 직접 가져와요">${esc(g.memo)}</textarea></div>
      </div>
      <div class="between" style="margin:16px 0 8px"><h3 class="h4">예약 기록</h3><button class="btn btn-line btn-sm" type="button" id="gNew">${icon('plus', 'sm')}이 손님 예약 추가</button></div>
      ${d.books.length ? `<div class="hd-list sm">${d.books.map((b) => bookLine(b, true)).join('')}</div>` : '<p class="small muted">예약 기록이 없어요.</p>'}
      <div class="form-err" id="gErr" hidden></div>`;
    setTimeout(() => { const mm = m.$('.modal'); if (mm) mm.scrollTop = 0; }, 60);
    m.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tag]'); if (t) { t.classList.toggle('on'); return; }
      const qk = e.target.closest('[data-quick]'); if (qk) { e.stopPropagation(); m.close(); quick(qk); return; }
      const bk = e.target.closest('[data-book]'); if (bk) { const b = d.books.find((x) => String(x.id) === bk.dataset.book); if (b) { m.close(); bookForm(b); } }
    });
    m.$('#gNew').onclick = () => { m.close(); bookForm({ name: g.name, phone: g.phone, guestId: g.id, code: g.code }); };
    m.$('#gSave').onclick = async () => {
      try {
        await SP.put('/api/host/guests/' + g.id, { name: m.$('#gName').value, phone: m.$('#gPhone').value, memo: m.$('#gMemo').value, tags: m.$$('[data-tag].on').map((x) => x.dataset.tag) });
        m.close(); SP.toast('손님 정보를 저장했어요.'); if (H.tab === 'guests') loadGuests();
      } catch (er) { const el = m.$('#gErr'); el.textContent = er.message; el.hidden = false; }
    };
    m.$('#gDel').onclick = async () => {
      if (!(await SP.confirm(`「${g.name || '이 손님'}」의 이름·연락처·메모를 지울까요? 예약 기록은 남고 예약자 칸만 비워져요. 되돌릴 수 없어요.`, { ok: '지우기', danger: true }))) return;
      try { await SP.del('/api/host/guests/' + g.id); m.close(); SP.toast('손님 정보를 지웠어요.'); if (H.tab === 'guests') loadGuests(); } catch (er) { SP.fail(er); }
    };
  }

  /* ---------- 공통 ---------- */
  function refresh() {
    if (H.tab === 'home') home();
    else if (H.tab === 'books') loadBooks();
    else if (H.tab === 'guests') loadGuests();
  }
  async function quick(btn) {
    const id = btn.dataset.quick;
    btn.disabled = true;
    try { await SP.post(`/api/host/books/${id}/quick`, { [btn.dataset.k]: btn.dataset.v }); SP.toast('바꿨어요.'); refresh(); } catch (e) { SP.fail(e); btn.disabled = false; }
  }
  function bind() {
    document.addEventListener('click', (e) => {
      if (!H || !e.target.closest('#hdTop, #hdRoot')) return;
      const tab = e.target.closest('[data-tab]');
      if (tab) { e.preventDefault(); setTab(tab.dataset.tab); return; }
      const nb = e.target.closest('[data-new-book]');
      if (nb) { e.preventDefault(); bookForm(nb.dataset.code ? { code: nb.dataset.code } : {}, { d: nb.dataset.d, pk: nb.dataset.pk }); return; }
      if (e.target.closest('[data-import]')) { importModal(); return; }
      const q = e.target.closest('[data-quick]'); if (q) { e.stopPropagation(); quick(q); return; }
      const bk = e.target.closest('[data-book]');
      if (bk) { const list = (H.books || []).concat((H.desk && H.desk.soon) || []); const b = list.find((x) => String(x.id) === bk.dataset.book); if (b) bookForm(b); return; }
      const cd = e.target.closest('.hd-cd[data-d]');
      if (cd) {
        H.sel = cd.dataset.d;
        if (ymOf(H.sel) !== H.month) { H.month = ymOf(H.sel); books(); return; }
        $$('.hd-cd').forEach((x) => x.classList.toggle('sel', x === cd)); drawDay();
        if (window.matchMedia('(max-width: 860px)').matches) $('#hdDay').scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      const mv = e.target.closest('[data-mv]');
      if (mv) { H.f.flag = ''; const n = Number(mv.dataset.mv); if (n) H.month = monthAdd(H.month, n); else { H.month = ymOf(SP.today()); H.sel = SP.today(); } $('#hdMonth').textContent = H.month.replace('-', '년 ') + '월'; loadBooks(); return; }
      const vw = e.target.closest('[data-view]');
      if (vw) { H.view = vw.dataset.view; $$('[data-view]').forEach((x) => x.classList.toggle('on', x === vw)); if (H.f.flag) { H.f.flag = ''; loadBooks(); return; } if (H.view === 'list') drawList(); else drawCal(); return; }
      const gd = e.target.closest('[data-go-day]');
      if (gd) { e.preventDefault(); H.sel = gd.dataset.goDay; H.month = ymOf(H.sel); H.view = 'cal'; setTab('books'); return; }
      const td = e.target.closest('[data-todo]');
      if (td) {
        e.preventDefault();
        const k = td.dataset.todo;
        if (k === 'qna' || k === 'renew') { setTab('spaces'); setTimeout(() => { const el = document.getElementById(k === 'qna' ? 'hsInbox' : 'hsBills'); if (el) el.scrollIntoView({ block: 'start' }); }, 120); return; }
        H.view = 'list'; H.f = { status: '', src: '', q: '', flag: k };
        setTab('books'); return;
      }
      if (e.target.closest('[data-unflag]')) { H.f.flag = ''; loadBooks(); return; }
      if (e.target.closest('[data-go-spaces]')) { e.preventDefault(); setTab('spaces'); return; }
      const gg = e.target.closest('[data-guest]'); if (gg) { guestModal(gg.dataset.guest); return; }
      const gf = e.target.closest('[data-gf]');
      if (gf) { H.gf = gf.dataset.gf; $$('[data-gf]').forEach((x) => x.classList.toggle('on', x === gf)); loadGuests(); return; }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#hdRoot [data-book]')) { e.preventDefault(); e.target.click(); }
    });
    document.addEventListener('change', (e) => {
      if (!H) return;
      if (e.target.id === 'hdCode') { H.code = e.target.value; setTab(H.tab); return; }
      if (e.target.id === 'hdSt') { H.f.status = e.target.value; loadBooks(); return; }
      if (e.target.id === 'hdSrc') { H.f.src = e.target.value; loadBooks(); return; }
    });
    const qIn = SP.debounce((v) => { H.f.q = v; loadBooks(); }, 300);
    const gIn = SP.debounce((v) => { H.gq = v; loadGuests(); }, 300);
    document.addEventListener('input', (e) => {
      if (!H) return;
      if (e.target.id === 'hdQ') qIn(e.target.value.trim());
      if (e.target.id === 'gQ') gIn(e.target.value.trim());
    });
  }
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /** myspace.js 가 부른다 — 구독형 공간이 있으면 탭을 붙이고, 없으면 아무것도 하지 않아요 */
  window.HostDesk = {
    async mount({ spaces, openQs, onSpaces, tab }) {
      const own = (spaces || []).filter((s) => s.listing && s.listing.type === 'host' && !s.closed);
      if (!own.length) return false;
      const first = !H;
      H = { ...(H || {}), spaces, openQs, onSpaces, desk: (H && H.desk) || { spaces: [] }, f: (H && H.f) || { status: '', src: '', q: '' }, view: (H && H.view) || 'cal' };
      try { await loadDesk(); } catch { return false; }
      if (!(H.desk.spaces || []).length) return false;
      if (first) bind();
      const top = $('#hdTop'); if (top) top.hidden = false;
      setTab(tab || H.tab || 'home', false);
      return true;
    },
    update({ spaces, openQs }) { if (H) { H.spaces = spaces; H.openQs = openQs; } },
    tab: () => (H ? H.tab : null),
    setTab: (t) => { if (H) setTab(t); },
  };
})();
