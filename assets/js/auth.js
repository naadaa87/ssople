/* 로그인 · 회원 가입 */
(function () {
  const { $, $$ } = SP;
  const next = (() => { const n = SP.qs().next || '/'; return /^\/(?!\/)/.test(n) && !/^\/(login|signup)/.test(n) ? n : '/'; })();
  const go = () => { try { sessionStorage.clear(); } catch { /* 무시 */ } location.href = next; };
  if ($('#toSignup')) $('#toSignup').href = '/signup?next=' + encodeURIComponent(next);
  if ($('#toLogin')) $('#toLogin').href = '/login?next=' + encodeURIComponent(next);
  SP.me().then((m) => { if (m.user) go(); });
  // 호스트센터에서 넘어온 가입·로그인 — 끝나면 공간 등록 신청서로 바로 이어진다는 걸 먼저 알려 줘요
  if (/^\/(myspace|hostcenter)/.test(next)) {
    const box = document.querySelector('#signupForm, #loginForm');
    if (box) {
      const n = document.createElement('div');
      n.className = 'callout hs-auth-note';
      n.innerHTML = `${SP.icon('flag')}<div><b>쏘플파티룸 호스트 ${$('#signupForm') ? '가입' : '로그인'}</b><br>${/new=1/.test(next) ? '가입하면 바로 공간 등록 신청서로 이어져요. 신청서는 중간에 저장되니 천천히 써도 돼요.' : '로그인하면 호스트센터 · 내 공간 관리로 이어져요.'} 이메일 하나로 손님 계정과 호스트 기능을 함께 써요.</div>`;
      box.parentNode.insertBefore(n, box);
    }
  }

  const lf = $('#loginForm');
  if (lf) lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#lErr');
    err.hidden = true;
    const email = $('#lEmail').value.trim(), pw = $('#lPw').value;
    if (!email || !pw) { err.textContent = '이메일과 비밀번호를 넣어 주세요.'; err.hidden = false; return; }
    const btn = lf.querySelector('button[type=submit]');
    SP.busy(btn, true, '로그인 중');
    try { await SP.api('/api/account/login', { method: 'POST', body: { email, pw }, loginRedirect: false }); go(); }
    catch (er) { err.textContent = er.message; err.hidden = false; SP.busy(btn, false); }
  });

  const sf = $('#signupForm');
  if (sf) {
    $('#sBirth').max = SP.today();
    $('#sAll').addEventListener('change', (e) => $$('.agree').forEach((c) => { c.checked = e.target.checked; }));
    $$('.agree').forEach((c) => c.addEventListener('change', () => { $('#sAll').checked = $$('.agree').every((x) => x.checked); }));
    $('#sNick').addEventListener('input', SP.debounce(async () => {
      const v = $('#sNick').value.trim();
      const h = $('#nickHelp');
      if (!v) { h.textContent = '한글·영문·숫자 2~12자, 커뮤니티에 보여요'; h.className = 'help'; return; }
      try {
        const r = await SP.get('/api/account/check?nick=' + encodeURIComponent(v));
        h.textContent = r.available ? '쓸 수 있는 닉네임이에요.' : (r.reason ? r.reason + '로 정해 주세요.' : '이미 쓰고 있는 닉네임이에요.');
        h.className = r.available ? 'help' : 'err';
      } catch { /* 무시 */ }
    }, 400));
    sf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#sErr');
      err.hidden = true;
      const body = { email: $('#sEmail').value.trim(), pw: $('#sPw').value, nick: $('#sNick').value.trim(), birth: $('#sBirth').value, region: $('#sRegion').value, agree_terms: $('#sTerms').checked, agree_privacy: $('#sPriv').checked, marketing: $('#sMkt').checked };
      const fail = (m) => { err.textContent = m; err.hidden = false; };
      if (!body.email || !body.pw || !body.nick || !body.birth) return fail('이메일, 비밀번호, 닉네임, 생년월일을 모두 넣어 주세요.');
      if (body.pw.length < 8 || !/[A-Za-z]/.test(body.pw) || !/\d/.test(body.pw)) return fail('비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.');
      if (!body.agree_terms || !body.agree_privacy) return fail('필수 약관에 동의해 주세요.');
      const btn = sf.querySelector('button[type=submit]');
      SP.busy(btn, true, '가입하는 중');
      try { await SP.api('/api/account/signup', { method: 'POST', body, loginRedirect: false }); SP.toast('가입을 환영해요!'); setTimeout(go, 400); }
      catch (er) { fail(er.message); SP.busy(btn, false); }
    });
  }
})();
