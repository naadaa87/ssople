/* 쏘플창업 — 창업 방식 고르기, 예산 계산기, 창업 문의 */
(function () {
  const { $, $$, esc, icon } = SP;
  const man = (n) => { // 만원 단위 숫자 → 읽기 쉬운 금액
    n = Math.round(n);
    if (!Number.isFinite(n)) return '-';
    const neg = n < 0; n = Math.abs(n);
    let s;
    if (n >= 10000) { const eok = Math.floor(n / 10000), rest = n % 10000; s = `${eok}억${rest ? ' ' + rest.toLocaleString('ko-KR') + '만' : ''}원`; }
    else s = n.toLocaleString('ko-KR') + '만원';
    return (neg ? '-' : '') + s;
  };
  const num = (id, d) => { const v = Number($(id).value); return Number.isFinite(v) && $(id).value !== '' ? v : d; };
  const PATH = { have: '공간이 있어요', none: '공간이 없어요 (매물부터)', running: '운영 중인 공간 전환', owner: '건물 공실 활용 (건물주)' };

  /* ---------- 계산기 ---------- */
  let calcText = '';
  function calc() {
    const grade = num('#cGrade', 105), py = Math.max(0, num('#cPy', 25)), dep = Math.max(0, num('#cDep', 0));
    const price = Math.max(0, num('#cPrice', 25)), times = Math.min(62, Math.max(0, num('#cTimes', 28))), fix = Math.max(0, num('#cFix', 0));
    const build = grade * py, total = build + dep;
    const sales = price * times, share = sales * 0.8, net = share - fix;
    $('#rBuild').textContent = man(build);
    $('#rTotal').textContent = man(total);
    $('#rSales').textContent = man(sales);
    $('#rShare').textContent = man(share);
    $('#rFix').textContent = man(fix);
    $('#rNet').textContent = man(net);
    $('#rNet').classList.toggle('neg', net < 0);
    $('#rPayback').textContent = net > 0 ? `약 ${Math.ceil(total / net)}개월` : '고정비를 넘기지 못해요';
    $('#cRate').textContent = `하루 두 타임 × 30일이면 최대 60타임이에요. ${times}타임은 ${Math.round((times / 60) * 100)}% 가동에 해당해요. 오픈 첫해에는 이 정도부터 잡는 편이 안전해요.`;
    calcText = `${grade === 180 ? '고급형' : '일반형'} ${py}평 · 보증금 ${man(dep)} · 타임 단가 ${man(price)} · 월 ${times}타임 · 고정비 ${man(fix)} → 공사 예산 ${man(build)}, 월 예상 수익 ${man(net)}`;
  }
  $('#calcForm').addEventListener('input', calc);
  $('#calcForm').addEventListener('submit', (e) => e.preventDefault());
  calc();

  /* ---------- 창업 문의 ---------- */
  const form = $('#sForm');
  let path = 'have';
  const setPath = (v) => {
    if (!PATH[v]) return;
    path = v;
    $$('#sPath .chip').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
  };
  $('#sPath').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) setPath(b.dataset.v); });
  // 창업 방식 카드의 「이 방식으로 문의」
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-path]');
    if (p) setPath(p.dataset.path);
    // 계산기의 「이 조건으로 문의하기」 — 계산 조건을 문의에 붙여요
    if (e.target.closest('[data-calc-ask]')) {
      $('#sCalcText').textContent = calcText;
      $('#sCalcBox').hidden = false;
      const py = num('#cPy', 0);
      if (py && !$('#s4').value) $('#s4').value = `${py}평`;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = SP.formData(form);
    const err = $('#sErr');
    err.hidden = true;
    const bad = (msg, el) => { err.textContent = msg; err.hidden = false; if (el) el.focus(); };
    if (!f.name) return bad('이름을 적어 주세요.', $('#s1'));
    if (!f.contact) return bad('연락받을 전화번호나 이메일을 적어 주세요.', $('#s2'));
    if (!f.region) return bad('지역을 골라 주세요. 아직 정하지 못했으면 맨 아래를 고르면 돼요.', $('#s3'));
    if (!f.agree) return bad('개인정보 수집·이용에 동의해 주세요.');
    const where = [f.region, f.where].filter(Boolean).join(' ');
    const lines = [
      `[지금 상황] ${PATH[path]}`,
      `[지역] ${where}`,
      `[투자 예산] ${f.budget}`,
      `[희망 시기] ${f.when}`,
      `[생각하는 운영 방식] ${f.run}`,
      `[연락 가능 시간] ${f.time}`,
      `[알게 된 경로] ${f.via}`,
      f.withCalc && !$('#sCalcBox').hidden && calcText ? `[계산기 조건] ${calcText}` : '',
      f.body ? `\n${f.body}` : '',
    ].filter(Boolean);
    const btn = form.querySelector('button[type=submit]');
    SP.busy(btn, true, '보내는 중');
    try {
      const r = await SP.post('/api/contact', { kind: 'startup', name: f.name, contact: f.contact, org: where.slice(0, 60), body: lines.join('\n'), agree: true });
      SP.ga('startup_inquiry', { path });
      done(r && r.id, f);
    } catch (er) { bad(er.message); }
    SP.busy(btn, false);
  });

  function done(id, f) {
    form.hidden = true;
    const box = $('#sDone');
    box.innerHTML = `<div class="sc-done-hd">${icon('check-c')}<div><h3 class="h3">창업 문의를 받았어요</h3>${id ? `<p class="small muted">접수 번호 ${esc(String(id))}</p>` : ''}</div></div>
      <p style="margin-top:12px;line-height:1.75">${esc(f.name)}님, 남겨 주셔서 고마워요. 영업일 기준 1~2일 안에 ${f.time === '아무 때나' ? '' : esc(f.time.replace(/\s*\(.*\)/, '')) + '에 '}남겨 주신 연락처(<b>${esc(f.contact)}</b>)로 연락드릴게요. 그다음은 안내한 순서대로 진행돼요.</p>
      <p class="small muted" style="margin-top:14px">연락처를 잘못 적었거나 더 알려 주실 게 있으면 <a class="link" href="tel:1544-3523">1544-3523</a>으로 접수 번호와 함께 알려 주세요.</p>
      <div class="row wrap-ok" style="gap:8px;margin-top:16px"><a class="btn btn-line btn-sm" href="#calc">${icon('chart', 'sm')}비용 다시 계산해 보기</a><a class="btn btn-ghost btn-sm" href="#faq">자주 묻는 질문</a></div>`;
    box.hidden = false;
    box.focus({ preventScroll: true });
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // 다른 화면에서 #ask · #form 으로 들어오면 문의 칸으로
  if (location.hash === '#form') { try { history.replaceState(null, '', '#ask'); } catch { /* 무시 */ } }
  if (location.hash === '#ask' || location.hash === '#form') setTimeout(() => $('#ask').scrollIntoView({ block: 'start' }), 200);
})();
