/* 파티 준비 도구 — 추천 퀴즈 · 예상 비용 · N빵 · 체크리스트 */
(function () {
  const { $, $$, esc, icon } = SP;
  const q = SP.qs();
  let spaces = [];

  /* ---------------- 추천 퀴즈 ---------------- */
  const PURPOSE = [['birthday', '생일파티'], ['bridal', '브라이덜 샤워'], ['yearend', '연말·송년회'], ['workshop', '워크숍·세미나'], ['filming', '촬영'], ['friends', '친구·동창 모임']];
  const NEED = [['karaoke', '노래방'], ['bbq', '바베큐'], ['pet', '반려견 동반'], ['terrace', '테라스·루프탑'], ['projector', '빔프로젝터'], ['console', '게임기'], ['parking', '주차']];
  const qz = { purpose: q.t && PURPOSE.some((p) => p[0] === q.t) ? q.t : '', people: 8, region: '', needs: [], slot: '' };
  const has = {
    karaoke: (s) => s.feat?.karaoke?.on, bbq: (s) => s.feat?.bbq?.on, pet: (s) => s.feat?.pet?.on,
    terrace: (s) => (s.feat?.zones || []).some((z) => /테라스|루프탑|베란다/.test(z)), projector: (s) => s.feat?.projector,
    console: (s) => s.feat?.console, parking: (s) => (s.tags || []).includes('주차'),
  };
  function drawQuiz() {
    const regs = [...new Set(spaces.map((s) => s.region))];
    $('#qzBody').innerHTML = `
      <div class="field"><span class="label">어떤 모임이에요?</span><div class="chips" data-k="purpose">${PURPOSE.map(([k, n]) => `<button type="button" class="chip${qz.purpose === k ? ' on' : ''}" data-v="${k}">${n}</button>`).join('')}</div></div>
      <div class="field"><label class="label" for="qzP">몇 명이 와요? <b id="qzPv">${qz.people}명</b></label><input type="range" id="qzP" min="2" max="40" value="${qz.people}" style="width:100%;accent-color:var(--red)"></div>
      <div class="field"><span class="label">어디서 모여요?</span><div class="chips" data-k="region"><button type="button" class="chip${!qz.region ? ' on' : ''}" data-v="">어디든 좋아요</button>${regs.map((r) => `<button type="button" class="chip${qz.region === r ? ' on' : ''}" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div></div>
      <div class="field"><span class="label">꼭 있었으면 하는 것 <span class="opt">여러 개 골라도 돼요</span></span><div class="chips" data-k="needs">${NEED.map(([k, n]) => `<button type="button" class="chip${qz.needs.includes(k) ? ' on' : ''}" data-v="${k}">${n}</button>`).join('')}</div></div>
      <div class="field"><span class="label">언제 놀아요?</span><div class="chips" data-k="slot"><button type="button" class="chip${!qz.slot ? ' on' : ''}" data-v="">상관없어요</button><button type="button" class="chip${qz.slot === 'day' ? ' on' : ''}" data-v="day">${icon('sun')}낮</button><button type="button" class="chip${qz.slot === 'night' ? ' on' : ''}" data-v="night">${icon('moon')}밤</button></div></div>
      <button class="btn btn-red btn-lg" type="button" id="qzGo" style="margin-top:8px">추천 받기</button>
      <div id="qzOut" style="margin-top:22px"></div>`;
    $('#qzP').oninput = (e) => { qz.people = Number(e.target.value); $('#qzPv').textContent = qz.people + '명'; };
  }
  function score(s) {
    let sc = 0;
    const why = [];
    if ((s.max || 0) < qz.people) return null;
    if (qz.region && s.region !== qz.region) return null;
    for (const n of qz.needs) { if (!has[n](s)) return null; why.push(NEED.find((x) => x[0] === n)[1]); }
    const fit = Math.abs((s.base || 4) - qz.people);
    sc += Math.max(0, 10 - fit);
    if ((s.max || 0) >= qz.people * 1.3) sc += 2;
    const p = qz.purpose;
    if (p === 'birthday' && has.karaoke(s)) { sc += 4; why.push('노래방'); }
    if (p === 'bridal' && has.terrace(s)) { sc += 4; why.push('사진 찍기 좋은 테라스'); }
    if (p === 'yearend') { if (has.bbq(s)) { sc += 3; why.push('바베큐'); } if ((s.max || 0) >= 20) { sc += 3; why.push('큰 방'); } }
    if (p === 'workshop' && has.projector(s)) { sc += 5; why.push('빔프로젝터'); }
    if (p === 'filming') { const n = Number(String(s.info?.size || '').replace(/\D/g, '')) || 0; if (n >= 25) { sc += 4; why.push('넓은 공간'); } if (has.terrace(s)) sc += 2; }
    if (p === 'friends') { if ((s.feat?.games || []).length >= 5) { sc += 3; why.push('보드게임'); } if (has.console(s)) { sc += 2; why.push('게임기'); } }
    if (qz.slot && !(s.pkgs || []).some((x) => x.fam === qz.slot)) return null;
    sc += Math.min(3, (s.reviews?.n || 0) / 3);
    return { s, sc, why: [...new Set(why)].slice(0, 3) };
  }
  function runQuiz() {
    const res = spaces.map(score).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 3);
    $('#qzOut').innerHTML = res.length
      ? `<h3 class="h4" style="margin-bottom:12px">이 세 곳을 먼저 보세요</h3><div class="rooms">${res.map((r) => `<div>${SP.roomCard(r.s, {})}${r.why.length ? `<p class="small" style="margin-top:8px;color:var(--red-deep)">${icon('check', 'sm')} ${r.why.map(esc).join(', ')}</p>` : ''}</div>`).join('')}</div>`
      : `<div class="empty">${icon('search')}<h3>조건을 다 맞는 곳이 없어요</h3><p>꼭 있었으면 하는 것을 하나 빼거나 인원을 줄여 보세요.</p></div>`;
    $('#qzOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#qzBody .chips [data-v]');
    if (b) {
      const k = b.parentElement.dataset.k, v = b.dataset.v;
      if (k === 'needs') { qz.needs = qz.needs.includes(v) ? qz.needs.filter((x) => x !== v) : [...qz.needs, v]; b.classList.toggle('on'); }
      else { qz[k] = v; $$('.chip', b.parentElement).forEach((x) => x.classList.toggle('on', x === b)); }
      return;
    }
    if (e.target.closest('#qzGo')) runQuiz();
  });

  /* ---------------- 예상 비용 ---------------- */
  function feeOf(s) {
    if (s.addFee) return s.addFee;
    const m = String(s.addFeeLabel || '').match(/([\d.]+)\s*만/);
    return m ? Number(m[1]) * 10000 : 10000;
  }
  function drawCost() {
    const s = spaces.find((x) => x.code === $('#cRoom').value);
    const out = $('#cOut');
    if (!s) { out.innerHTML = ''; $('#cPkg').innerHTML = ''; return; }
    const d = $('#cDate').value || SP.today();
    const pi = SP.priceIdx(d);
    const cur = $('#cPkg').value;
    const avail = (s.pkgs || []).filter((p) => p.p[pi]);
    $('#cPkg').innerHTML = avail.length ? avail.map((p) => `<option value="${p.k}"${p.k === cur ? ' selected' : ''}>${esc(p.label)} (${esc(p.hrs)})</option>`).join('') : '<option value="">이 요일엔 패키지가 없어요</option>';
    const p = avail.find((x) => x.k === $('#cPkg').value) || avail[0];
    if (!p) { out.innerHTML = '<p class="muted">다른 날짜를 골라 주세요.</p>'; return; }
    const people = Math.max(1, Number($('#cPeople').value) || 1);
    if (people > (s.max || 999)) { out.innerHTML = `<div class="callout warn">이 지점은 최대 ${s.max}명까지예요. 인원을 줄이거나 더 큰 지점을 찾아보세요.</div>`; return; }
    const extra = Math.max(0, people - (s.base || 0));
    const fee = feeOf(s);
    const total = p.p[pi] + extra * fee;
    out.innerHTML = `<div class="tbl-wrap"><table class="tbl"><tbody>
      <tr><td>${esc(p.label)} 기본 요금 <span class="tiny muted">${SP.mdw(d)} · 기준 ${s.base}명</span></td><td class="r num">${SP.fmt(p.p[pi])}원</td></tr>
      <tr><td>인원 추가 ${extra}명 <span class="tiny muted">${esc(s.addFeeLabel || '')}</span></td><td class="r num">${SP.fmt(extra * fee)}원</td></tr>
      <tr><td><b>예상 합계</b></td><td class="r num"><b style="font-size:20px">${SP.fmt(total)}원</b></td></tr>
      <tr><td>1인당</td><td class="r num">약 ${SP.fmt(Math.ceil(total / people / 100) * 100)}원</td></tr>
      </tbody></table></div>
      <p class="small muted" style="margin-top:10px">청소 보증금 ${esc(s.depositLabel || '')}은 따로 받고, 퇴실 후 확인해서 돌려 드려요. 바베큐 같은 옵션은 포함하지 않았어요.</p>
      <div class="row" style="margin-top:12px;flex-wrap:wrap"><a class="btn btn-naver" href="/room/${s.code}?date=${d}">${icon('calendar')}${esc(s.short || s.name)} 빈 방 보기</a><button class="btn btn-soft" type="button" id="toN">이 금액으로 N빵</button></div>`;
    $('#toN').onclick = () => { $('#nTotal').value = total; $('#nPeople').value = people; drawN(); $('#nbbang').scrollIntoView({ behavior: 'smooth' }); };
  }

  /* ---------------- N빵 ---------------- */
  let round = 100;
  function drawN() {
    const total = Number(String($('#nTotal').value).replace(/[^\d]/g, '')) || 0;
    const n = Math.max(1, Number($('#nPeople').value) || 1);
    const free = Math.max(0, Math.min(n - 1, Number($('#nFree').value) || 0));
    const payers = n - free;
    if (!total) { $('#nOut').innerHTML = ''; return; }
    const each = Math.ceil(total / payers / round) * round;
    const extra = each * payers - total;
    const text = `[N빵] 총 ${SP.fmt(total)}원 · ${payers}명이 나눠서 1인 ${SP.fmt(each)}원${free ? ` (${free}명은 빼고)` : ''}`;
    $('#nOut').innerHTML = `<div class="box fog" style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
      <div><div class="muted small">1인당</div><div class="display" style="font-size:40px">${SP.fmt(each)}원</div><div class="small muted">${payers}명이 내요${extra ? ` · 올림으로 ${SP.fmt(extra)}원이 남아요` : ''}</div></div>
      <button class="btn btn-ink" type="button" id="nCopy">${icon('copy')}단톡방에 보낼 문구 복사</button></div>`;
    $('#nCopy').onclick = () => SP.copy(text, '문구를 복사했어요.');
  }

  /* ---------------- 체크리스트 ---------------- */
  const LISTS = {
    기본: ['입실 안내 문자 확인하기', '보증금 입금 확인하기', '미성년자가 있다면 보호자 동의서 챙기기', '물티슈·휴지', '휴대폰 충전기·멀티탭', '일회용 컵·접시·수저', '얼음', '분리수거용 봉투 (지점 비치 여부 확인)'],
    생일: ['케이크·초·라이터', '생일 가랜드·풍선', '풍선 펌프', '마스킹 테이프 (벽 자국 방지)', '고깔모자', '선물', '폴라로이드·필름', '초대장 보내고 참석 인원 확인'],
    '브라이덜 샤워': ['베일·머리띠', '신부 어깨띠', '풍선 문구', '꽃다발', '포토존 소품', '핑거푸드', '드레스 코드 미리 공지', '케이크'],
    '연말 모임': ['회비 걷기 (N빵 계산기)', '경품 (현금 대신 물건으로)', '진행 순서표', '팀 게임 준비 (놀이터)', '바베큐 재료 (바베큐 되는 지점이면)', '마이크·스피커 확인', '단체 사진 찍을 사람 정하기'],
    워크숍: ['노트북·HDMI 젠더', '발표 자료 백업', '필기구·포스트잇', '이름표', '점심 배달 예약', '세금계산서·영수증 필요 여부 확인'],
    촬영: ['촬영 장비·조명', '콘센트 위치·멀티탭', '의상·소품', '출연자 촬영 동의 받기', '사전 답사 일정 잡기', '촬영 목적을 지점에 미리 알리기'],
  };
  let ktab = q.t === 'birthday' ? '생일' : q.t === 'bridal' ? '브라이덜 샤워' : q.t === 'yearend' ? '연말 모임' : q.t === 'workshop' ? '워크숍' : q.t === 'filming' ? '촬영' : '기본';
  const kget = () => SP.store.get('plan.check.' + ktab, { done: {}, extra: [] });
  function drawCheck() {
    const st = kget();
    $('#kTabs').innerHTML = Object.keys(LISTS).map((k) => `<button type="button" class="chip${k === ktab ? ' on' : ''}" data-k="${esc(k)}">${esc(k)}</button>`).join('');
    const items = [...LISTS[ktab], ...st.extra];
    $('#kList').innerHTML = items.map((t, i) => `<li style="padding:9px 2px;border-bottom:1px solid var(--line)"><label class="check"><input type="checkbox" data-i="${esc(t)}" ${st.done[t] ? 'checked' : ''}><span style="${st.done[t] ? 'text-decoration:line-through;color:var(--ash)' : ''}">${esc(t)}</span></label></li>`).join('');
  }
  $('#kTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; ktab = b.dataset.k; drawCheck(); });
  $('#kList').addEventListener('change', (e) => { const c = e.target.closest('[data-i]'); if (!c) return; const st = kget(); st.done[c.dataset.i] = c.checked; SP.store.set('plan.check.' + ktab, st); drawCheck(); });
  $('#kAdd').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#kIn').value.trim(); if (!v) return; const st = kget(); if (!st.extra.includes(v)) st.extra.push(v); SP.store.set('plan.check.' + ktab, st); $('#kIn').value = ''; drawCheck(); });
  $('#kCopy').addEventListener('click', () => { const st = kget(); const items = [...LISTS[ktab], ...st.extra]; SP.copy(`[${ktab} 준비물]\n` + items.map((t) => `${st.done[t] ? '☑' : '☐'} ${t}`).join('\n'), '목록을 복사했어요.'); });

  (async function init() {
    spaces = await SP.spaces().catch(() => []);
    drawQuiz();
    $('#cRoom').innerHTML = SP.spaceOptions(spaces, q.code || '', '지점을 골라 주세요');
    $('#cDate').min = SP.today();
    $('#cDate').value = q.date && q.date >= SP.today() ? q.date : SP.today();
    ['#cRoom', '#cDate', '#cPkg', '#cPeople'].forEach((s) => $(s).addEventListener(s === '#cPeople' ? 'input' : 'change', drawCost));
    drawCost();
    ['#nTotal', '#nPeople', '#nFree'].forEach((s) => $(s).addEventListener('input', drawN));
    $('#nRound').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; round = Number(b.dataset.v); $$('#nRound button').forEach((x) => x.classList.toggle('on', x === b)); drawN(); });
    if (q.total) $('#nTotal').value = q.total;
    drawN();
    drawCheck();
    if (location.hash) setTimeout(() => { const el = $(location.hash); if (el) el.scrollIntoView({ block: 'start' }); }, 200);
  })();
})();
