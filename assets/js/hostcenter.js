/* 쏘플파티룸 호스트센터 — 로그인 칸, 내 계정 칸, 목차, 사용법 탭, 체크리스트, 시즌 달력 */
(() => {
  const SP = window.SP;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => SP.esc(s);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장이 막힌 브라우저는 그냥 넘어간다 */ } },
  };
  const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

  // 카카오톡 채널 주소는 관리자 설정 값으로
  SP.site().then((d) => {
    const u = d && d.settings && d.settings['kakao.url'];
    if (u && /^https?:\/\//.test(u)) $$('[data-kakao]').forEach((a) => { a.href = u; });
  }).catch(() => {});

  const app = $('#hcApp');
  if (!app) { gate(); return; }
  account();
  toc();
  tabs();
  checklists();
  seasons();
  copyBtns();

  /* ---------------- 로그인 화면 ---------------- */
  async function gate() {
    const form = $('#hcLogin');
    if (!form) return;
    const err = $('#hcErr');
    const showErr = (m) => { err.textContent = m; err.hidden = !m; };
    let me = null;
    try { me = await SP.get('/api/hostcenter/me'); } catch { me = null; }
    if (me && me.access) {
      // 다른 창에서 막 로그인한 경우 — 한 번만 새로 불러온다
      let tried = false;
      try { tried = sessionStorage.getItem('hc.reload') === '1'; sessionStorage.setItem('hc.reload', '1'); } catch { tried = true; }
      if (!tried) { location.reload(); return; }
    }
    try { sessionStorage.removeItem('hc.reload'); } catch { /* 무시 */ }
    if (me && me.open === false) {
      $('#hcShared').hidden = true;
      $('#hcLoginNote').textContent = '지금은 호스트 권한이 연결된 쏘플 계정으로만 들어갈 수 있어요.';
    }
    if (me && me.user && !me.access) {
      const p = document.createElement('div');
      p.className = 'callout hc-gate-note';
      p.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-info"/></svg><div><b>${esc(me.user.nick)}님 계정은 아직 지점과 연결되지 않았어요.</b><br>새 파티룸을 올리려면 <a class="link" href="/myspace?new=1">공간 등록 신청</a>을, 이미 운영 중인 쏘플 지점이면 <a class="link" href="/myspace?link=1">지점 연결 요청</a>을 보내 주세요. 그동안은 공용 아이디로 안내를 볼 수 있어요.</div>`;
      $('#hcLoginNote').after(p);
      const acc = form.querySelector('a[href^="/login"]');
      if (acc) acc.hidden = true;
      const or = form.querySelector('.hc-or');
      if (or) or.hidden = true;
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('#hcId').value.trim();
      const pw = $('#hcPw').value;
      if (!id || !pw) { showErr('아이디와 비밀번호를 넣어 주세요.'); (id ? $('#hcPw') : $('#hcId')).focus(); return; }
      showErr('');
      const btn = $('#hcGo');
      SP.busy(btn, true, '확인하는 중…');
      try {
        await SP.api('/api/hostcenter/login', { method: 'POST', body: { id, pw }, loginRedirect: false });
        try { sessionStorage.removeItem('hc.reload'); } catch { /* 무시 */ }
        location.reload();
      } catch (ex) {
        SP.busy(btn, false);
        showErr(ex.message || '들어가지 못했어요. 잠시 후 다시 시도해 주세요.');
        $('#hcPw').select();
      }
    });
  }

  /* ---------------- 내 계정 칸 ---------------- */
  async function account() {
    const box = $('#hcAcct');
    if (!box) return;
    let me = null;
    try { me = await SP.get('/api/hostcenter/me'); } catch { me = null; }
    const kind = (me && me.access) || app.dataset.access || 'guest';
    box.classList.add(kind);
    if (kind === 'host') {
      const sp = (me && me.spaces) || [];
      box.innerHTML = `<span class="hc-acct-k">호스트 계정</span>
        <b class="hc-acct-name">${esc((me.user && me.user.nick) || '호스트')}님, 반가워요</b>
        <p>${sp.length ? `연결된 지점 ${sp.length}곳이에요. 지점 이름을 누르면 손님이 보는 화면이 열려요.` : '아직 연결된 지점이 없어요. 새 공간은 「공간 등록 신청」으로, 이미 운영 중인 쏘플 지점은 카카오톡 채널로 연결을 요청해 주세요.'}</p>
        ${sp.length ? `<div class="hc-acct-sp">${sp.map((s) => `<a href="/room/${encodeURIComponent(s.code)}" target="_blank" rel="noopener"><span>${esc(s.name)}</span>${s.visible ? '<svg class="ic sm" aria-hidden="true"><use href="#i-ext"/></svg>' : '<span class="badge mute">비공개</span>'}</a>`).join('')}</div>` : ''}
        <div class="hc-acct-act"><a class="btn btn-red btn-sm" href="/myspace"><svg class="ic sm" aria-hidden="true"><use href="#i-edit"/></svg>내 공간 관리</a><a class="btn btn-line btn-sm" href="/myspace?new=1"><svg class="ic sm" aria-hidden="true"><use href="#i-plus"/></svg>공간 등록 신청</a></div>`;
    } else if (kind === 'admin') {
      box.innerHTML = `<span class="hc-acct-k">관리자</span>
        <b class="hc-acct-name">관리자 계정으로 보고 있어요</b>
        <p>호스트센터 공용 아이디·비밀번호는 관리자 → 설정 → 「호스트센터 공용 로그인」에서 바꿀 수 있어요.</p>
        <div class="hc-acct-act"><a class="btn btn-ink btn-sm" href="/admin">관리자 화면</a><a class="btn btn-line btn-sm" href="/myspace">내 공간 관리</a></div>`;
    } else {
      const u = me && me.user;
      box.innerHTML = `<span class="hc-acct-k">공용 아이디</span>
        <b class="hc-acct-name">안내를 보는 중이에요</b>
        <p>${u ? `${esc(u.nick)}님 계정은 아직 지점과 연결되지 않았어요. ` : ''}새 파티룸을 올리려면 본인 쏘플 계정으로 「공간 등록 신청」을, 이미 운영 중인 쏘플 지점이면 지점 연결을 요청해 주세요. 방법은 「처음 시작하기」에 있어요.</p>
        <div class="hc-acct-act">${u ? '<a class="btn btn-red btn-sm" href="/myspace?new=1"><svg class="ic sm" aria-hidden="true"><use href="#i-plus"/></svg>공간 등록 신청</a><a class="btn btn-ink btn-sm" href="/myspace?link=1">운영 중인 지점 연결</a>' : '<a class="btn btn-red btn-sm" href="/signup?next=%2Fmyspace%3Fnew%3D1">가입하고 공간 등록</a><a class="btn btn-ink btn-sm" href="/login?next=%2Fmyspace">쏘플 계정으로 로그인</a>'}<button class="btn btn-ghost btn-sm" type="button" id="hcOut">나가기</button></div>`;
      const out = $('#hcOut');
      if (out) out.onclick = async () => {
        SP.busy(out, true);
        try { await SP.post('/api/hostcenter/logout'); } catch { /* 이미 끝난 세션 */ }
        location.reload();
      };
    }
  }

  /* ---------------- 목차 ---------------- */
  function toc() {
    const nav = $('#hcToc');
    if (!nav) return;
    const links = $$('a[href^="#"]', nav).filter((a) => a.getAttribute('href').length > 1);
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const secs = $$('.hc-sec').filter((s) => map.has(s.id));
    const mobile = () => window.matchMedia('(max-width: 960px)').matches;
    let cur = '';
    const set = (id) => {
      if (id === cur) return;
      cur = id;
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + id));
      const a = map.get(id);
      if (a && mobile()) {
        const r = a.getBoundingClientRect(), nr = nav.getBoundingClientRect();
        if (r.left < nr.left || r.right > nr.right) nav.scrollTo({ left: a.offsetLeft - 20, behavior: 'smooth' });
      }
    };
    // 화면 위쪽(머리글·목차 줄 바로 아래)을 지난 마지막 칸을 지금 읽는 칸으로
    let ticking = false;
    const pick = () => {
      ticking = false;
      const line = (mobile() ? 190 : 150);
      let id = secs[0] && secs[0].id;
      for (const s of secs) { if (s.getBoundingClientRect().top <= line) id = s.id; else break; }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && secs.length) id = secs[secs.length - 1].id;
      if (id) set(id);
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(pick); } }, { passive: true });
    window.addEventListener('resize', pick);
    pick();
  }

  /* ---------------- 사용법 탭 ---------------- */
  function tabs() {
    const wrap = $('#hcTools');
    if (!wrap) return;
    const panels = $$('.hc-tool', wrap);
    if (panels.length < 2) return;
    const bar = document.createElement('div');
    bar.className = 'hc-tabs';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', '내 공간 관리 기능');
    panels.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'tab-' + p.dataset.tool;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', p.id);
      b.textContent = p.dataset.label;
      b.addEventListener('click', () => show(p.id, true));
      bar.appendChild(b);
      p.setAttribute('role', 'tabpanel');
      p.setAttribute('aria-labelledby', b.id);
      p.tabIndex = -1;
      if (i) p.hidden = true;
    });
    bar.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const bs = $$('button', bar);
      const i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
      n.focus(); n.click();
    });
    wrap.prepend(bar);
    wrap.classList.add('tabbed');
    function show(id, focusTab) {
      panels.forEach((p) => { p.hidden = p.id !== id; });
      $$('button', bar).forEach((b) => {
        const on = b.getAttribute('aria-controls') === id;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on && focusTab) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    }
    show(panels[0].id);
    const open = (hash) => {
      const id = (hash || '').replace(/^#/, '');
      if (!id.startsWith('tool-') || !document.getElementById(id)) return false;
      show(id);
      bar.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    };
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#tool-"]');
      if (!a) return;
      if (open(a.getAttribute('href'))) { e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); }
    });
    if (location.hash) setTimeout(() => open(location.hash), 60);
  }

  /* ---------------- 체크리스트 (이 기기에만 저장) ---------------- */
  function checklists() {
    $$('.hc-checklist[data-store]').forEach((box) => {
      let key = box.dataset.store;
      if (box.hasAttribute('data-monthly')) {
        const ym = kstToday().slice(0, 7);
        key += '.' + ym;
        const lb = box.querySelector('[data-month-label]');
        if (lb) lb.textContent = `${Number(ym.slice(5))}월 체크리스트예요. 다음 달 1일에 새로 시작하고, 이 기기에만 저장돼요.`;
      }
      const state = store.get(key) || {};
      const boxes = $$('input[data-ck]', box);
      const cnt = box.querySelector('[data-count]');
      const paint = () => {
        const n = boxes.filter((x) => x.checked).length;
        if (cnt) { cnt.textContent = `${n} / ${boxes.length}`; cnt.classList.toggle('done', n === boxes.length); }
      };
      boxes.forEach((x) => {
        x.checked = !!state[x.dataset.ck];
        x.addEventListener('change', () => {
          state[x.dataset.ck] = x.checked;
          store.set(key, state);
          paint();
          if (boxes.every((y) => y.checked)) SP.toast('다 했어요. 수고 많으셨어요!');
        });
      });
      paint();
    });
  }

  /* ---------------- 시즌 달력 — 다가오는 시즌 표시 ---------------- */
  function seasons() {
    const list = $('#hcSeason');
    if (!list) return;
    const today = kstToday();
    const y = Number(today.slice(0, 4));
    const t0 = Date.parse(today + 'T00:00:00Z');
    const items = $$('li[data-md]', list).map((li) => {
      const md = li.dataset.md;
      let d = Date.parse(`${y}-${md}T00:00:00Z`);
      if (d < t0 - 3 * 864e5) d = Date.parse(`${y + 1}-${md}T00:00:00Z`);
      return { li, days: Math.round((d - t0) / 864e5) };
    });
    items.sort((a, b) => a.days - b.days);
    items.forEach((x, i) => { list.appendChild(x.li); if (i >= 6) x.li.classList.add('more'); });
    const soon = items.filter((x) => x.days <= 75).slice(0, 3);
    soon.forEach((x) => x.li.classList.add('soon'));
    const next = soon[0] || items[0];
    const badge = $('#hcSeasonNext');
    if (next && badge) {
      badge.textContent = `다음 시즌 · ${next.li.querySelector('b').textContent}${next.days > 0 ? ` D-${next.days}` : ''}`;
      badge.hidden = false;
    }
    if (items.length > 6) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-soft btn-sm btn-block hc-season-more';
      btn.textContent = `1년 시즌 모두 보기 (${items.length})`;
      btn.setAttribute('aria-expanded', 'false');
      btn.onclick = () => {
        const open = list.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? '접기' : `1년 시즌 모두 보기 (${items.length})`;
      };
      list.after(btn);
    }
  }

  /* ---------------- 복사 ---------------- */
  function copyBtns() {
    $$('[data-copy]').forEach((b) => {
      b.addEventListener('click', async () => {
        const el = document.getElementById(b.dataset.copy);
        if (!el) return;
        const text = el.textContent;
        try { await navigator.clipboard.writeText(text); SP.toast('복사했어요. 카카오톡 채널에 붙여 넣어 주세요.'); }
        catch {
          const r = document.createRange(); r.selectNodeContents(el);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          SP.toast('글을 선택해 두었어요. 길게 눌러 복사해 주세요.');
        }
      });
    });
  }
})();
