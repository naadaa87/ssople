/* 창업안내 — 예산 계산기, 상담 신청 */
(function () {
  const { $ } = SP;
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
  }
  $('#calcForm').addEventListener('input', calc);
  $('#calcForm').addEventListener('submit', (e) => e.preventDefault());
  calc();

  $('#sForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = SP.formData($('#sForm'));
    const err = $('#sErr');
    err.hidden = true;
    if (!f.name || !f.contact) { err.textContent = '이름과 연락처를 적어 주세요.'; err.hidden = false; return; }
    if (!f.agree) { err.textContent = '개인정보 수집·이용에 동의해 주세요.'; err.hidden = false; return; }
    const lines = [
      `[보유 공간] ${f.space}`,
      f.where ? `[지역·평수] ${f.where}` : '',
      `[투자 예산] ${f.budget}`,
      `[희망 시기] ${f.when}`,
      `[연락 가능 시간] ${f.time}`,
      `[알게 된 경로] ${f.via}`,
      f.body ? `\n${f.body}` : '',
    ].filter(Boolean);
    const btn = $('#sForm button[type=submit]');
    SP.busy(btn, true, '보내는 중');
    try {
      await SP.post('/api/contact', { kind: 'startup', name: f.name, contact: f.contact, org: f.where || '', body: lines.join('\n'), agree: true });
      $('#sForm').reset();
      SP.toast('상담 신청을 받았어요. 영업일 기준 1~2일 안에 연락드릴게요.');
    } catch (er) { err.textContent = er.message; err.hidden = false; }
    SP.busy(btn, false);
  });
  if (location.hash === '#form') setTimeout(() => $('#form').scrollIntoView({ block: 'start' }), 200);
})();
