/* 쏘플 파티게임 — 한 화면 모드
   TV·노트북·폰 한 대로 진행하는 파티게임 8종. 문제 은행은 games-data.js(window.SP_GD).
   서버에는 아무것도 보내지 않아요. 팀 이름·참가자 이름·소리 설정·고른 옵션만 이 기기에 저장해요. */
(function () {
  'use strict';
  const D = window.SP_GD;
  const stage = document.getElementById('gs');
  if (!D || !stage || !window.SP) return;
  const esc = SP.esc;
  const body = stage.querySelector('.gs-body');
  const titleEl = stage.querySelector('#gsTitle');
  const subEl = stage.querySelector('#gsSub');

  /* ---------------- 작은 도구 ---------------- */
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const take = (a, n) => shuffle(a).slice(0, n);
  const store = {
    get: (k, d) => SP.store.get('games.' + k, d),
    set: (k, v) => SP.store.set('games.' + k, v),
  };
  const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const choOf = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; };
  const SHAPES = [
    '<path d="M12 2.8 22.4 20.6H1.6z"/>',
    '<path d="M12 1.6 22.4 12 12 22.4 1.6 12z"/>',
    '<circle cx="12" cy="12" r="10.2"/>',
    '<rect x="2.4" y="2.4" width="19.2" height="19.2" rx="2.4"/>',
  ];
  const SHAPE_NAMES = ['세모', '마름모', '동그라미', '네모'];
  const shp = (i, cls = '') => `<svg class="g-shp ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${SHAPES[i % 4]}</svg>`;
  const mark = () => `<span class="g-mark">${[0, 1, 2, 3].map((i) => `<i class="c${i}">${shp(i)}</i>`).join('')}</span>`;

  /* ---------------- 소리 ---------------- */
  const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 6; };
  let vol = store.get('vol', null);
  if (vol == null) vol = isNight() ? 1 : 2; // 0 끔 · 1 작게 · 2 보통 — 밤 10시부터는 작게 시작
  let actx = null;
  function tone(freqs, len = 0.16, gap = 0.16, type = 'sine') {
    if (!vol) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const g0 = vol === 1 ? 0.08 : 0.22;
      freqs.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * gap;
        o.type = type; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.start(t); o.stop(t + len + 0.02);
      });
    } catch { /* 소리를 못 내는 기기 */ }
  }
  const sfx = {
    tick: () => tone([700], 0.07),
    go: () => tone([523, 659, 784], 0.14, 0.12),
    end: () => { tone([880, 880, 660], 0.2, 0.22, 'square'); if (navigator.vibrate) navigator.vibrate([180, 80, 180]); },
    good: () => tone([659, 988], 0.13, 0.1),
    pass: () => tone([330], 0.12, 0.1, 'triangle'),
    drum: () => tone(Array.from({ length: 14 }, () => 140), 0.06, 0.12, 'triangle'),
    win: () => tone([523, 659, 784, 1047], 0.18, 0.14),
  };
  const VOL_LABEL = ['소리 끔', '소리 작게', '소리 보통'];

  /* ---------------- 화면 수명 관리 ---------------- */
  let gen = 0;
  const tos = new Set(), ivs = new Set();
  const later = (ms, fn) => { const g = gen; const t = setTimeout(() => { tos.delete(t); if (g === gen) fn(); }, ms); tos.add(t); return t; };
  const every = (ms, fn) => { const t = setInterval(fn, ms); ivs.add(t); return t; };
  const stopEvery = (t) => { clearInterval(t); ivs.delete(t); };
  function clearAll() { gen++; tos.forEach(clearTimeout); tos.clear(); ivs.forEach(clearInterval); ivs.clear(); }

  /** 제한 시간: 숫자·막대를 갱신하고 끝나면 onEnd. 돌려준 함수를 부르면 멈춰요. */
  function runTimer(sec, { num, bar, onEnd, tick = true }) {
    const total = sec * 1000, start = Date.now();
    let lastS = null, done = false;
    const step = () => {
      const left = Math.max(0, total - (Date.now() - start));
      const s = Math.ceil(left / 1000);
      if (num && s !== lastS) { num.textContent = s; num.classList.toggle('hurry', s <= 5); if (tick && s <= 3 && s > 0) sfx.tick(); }
      lastS = s;
      if (bar) bar.style.transform = `scaleX(${(left / total).toFixed(4)})`;
      if (left <= 0 && !done) { done = true; stopEvery(id); if (onEnd) onEnd(); }
    };
    const id = every(100, step);
    step();
    return () => { done = true; stopEvery(id); };
  }

  /** 3·2·1 크게 세고 나서 할 일 */
  function bigCount(label, then, from = 3) {
    const ov = document.createElement('div');
    ov.className = 'g-count';
    ov.innerHTML = `<b>${from}</b><span>${esc(label || '')}</span>`;
    body.appendChild(ov);
    let n = from;
    sfx.tick();
    const t = every(800, () => {
      n--;
      if (n > 0) { ov.querySelector('b').textContent = n; sfx.tick(); return; }
      stopEvery(t);
      ov.remove();
      then();
    });
  }

  /* ---------------- 그리기 ---------------- */
  let cur = null, curOpts = null; // 지금 게임 id, 다시 하기용 옵션
  function render(html, bind) {
    clearAll();
    body.innerHTML = html;
    body.scrollTop = 0;
    if (bind) bind(body);
    const f = body.querySelector('[data-autofocus]');
    if (f) setTimeout(() => f.focus(), 30);
  }
  function setSub(t) { subEl.textContent = t || ''; }
  const btn = (label, attrs = '', cls = '') => `<button type="button" class="g-btn ${cls}" ${attrs}>${label}</button>`;
  const on = (sel, fn) => { body.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => fn(el, e))); };

  /* 옵션 폼 — spec: [{k, label, type:'chips'|'seg', items:[[값, 이름]], hint}] */
  function form(spec, o) {
    return spec.map((f) => {
      if (f.type === 'html') return f.html;
      const items = f.items.map(([v, l]) => `<button type="button" data-k="${f.k}" data-v="${esc(String(v))}" aria-pressed="${String(o[f.k]) === String(v)}">${esc(l)}</button>`).join('');
      return `<div class="g-field"><span class="g-label">${esc(f.label)}</span><div class="${f.type === 'seg' ? 'g-seg' : 'g-chips'}">${items}</div>${f.hint ? `<p class="g-hint">${esc(f.hint)}</p>` : ''}</div>`;
    }).join('');
  }
  function bindForm(root, o, spec, onChange) {
    root.querySelectorAll('[data-k][data-v]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k, f = spec.find((x) => x.k === k);
      const raw = b.dataset.v;
      o[k] = f && f.num ? Number(raw) : raw;
      root.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (onChange) onChange(k);
    }));
  }

  /* 팀 — 0이면 점수 없이 */
  const TEAM_DEFAULT = ['1팀', '2팀', '3팀', '4팀'];
  function teamNames() { const t = store.get('teams', TEAM_DEFAULT); return TEAM_DEFAULT.map((d, i) => (t[i] || d)); }
  function teamBlock(o, allowNone = true) {
    const names = teamNames();
    const seg = [[0, '점수 없이'], [2, '2팀'], [3, '3팀'], [4, '4팀']].filter(([v]) => allowNone || v);
    return `<div class="g-field"><span class="g-label">팀 대항</span><div class="g-seg">${seg.map(([v, l]) => `<button type="button" data-k="teams" data-v="${v}" aria-pressed="${o.teams === v}">${l}</button>`).join('')}</div>
      <div class="g-teams" ${o.teams ? '' : 'hidden'}>${names.map((n, i) => `<label class="g-team c${i}" ${i < o.teams ? '' : 'hidden'}><span class="sr-only">${i + 1}팀 이름</span>${shp(i)}<input maxlength="8" value="${esc(n)}" data-team="${i}"></label>`).join('')}</div></div>`;
  }
  function bindTeams(root, o) {
    root.querySelectorAll('[data-k="teams"]').forEach((b) => b.addEventListener('click', () => {
      o.teams = Number(b.dataset.v);
      root.querySelectorAll('[data-k="teams"]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const box = root.querySelector('.g-teams');
      box.hidden = !o.teams;
      box.querySelectorAll('.g-team').forEach((l, i) => { l.hidden = i >= o.teams; });
    }));
    root.querySelectorAll('[data-team]').forEach((inp) => inp.addEventListener('change', () => {
      const t = teamNames(); t[Number(inp.dataset.team)] = inp.value.trim() || TEAM_DEFAULT[Number(inp.dataset.team)]; store.set('teams', t);
    }));
  }
  function makeTeams(n) { const names = teamNames(); return Array.from({ length: n }, (_, i) => ({ name: names[i], score: 0, i })); }
  function scoreBar(teams) {
    if (!teams.length) return '';
    return `<div class="g-score">${teams.map((t) => `<span class="c${t.i}">${shp(t.i)}<em>${esc(t.name)}</em><b>${t.score}</b></span>`).join('')}</div>`;
  }
  /* 맞힌 팀 고르기 (여러 팀 가능) */
  function teamPick(teams, label, pts) {
    if (!teams.length) return '';
    return `<div class="g-pick"><p>${esc(label)}${pts > 1 ? ` <strong>· ${pts}점</strong>` : ''}</p><div>${teams.map((t) => `<button type="button" class="c${t.i}" data-tp="${t.i}" aria-pressed="false">${shp(t.i)}${esc(t.name)}</button>`).join('')}</div></div>`;
  }
  function bindTeamPick(root) {
    const sel = new Set();
    root.querySelectorAll('[data-tp]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.tp);
      if (sel.has(i)) sel.delete(i); else sel.add(i);
      b.setAttribute('aria-pressed', String(sel.has(i)));
      if (sel.has(i)) sfx.good();
    }));
    return sel;
  }
  function finalBoard(teams, title, extra = '') {
    const sorted = teams.slice().sort((a, b) => b.score - a.score);
    let rank = 0, prev = null;
    const rows = sorted.map((t, k) => { if (t.score !== prev) { rank = k + 1; prev = t.score; } return { ...t, rank }; });
    const top = rows.filter((r) => r.rank === 1);
    return `<section class="g-final">
      <p class="g-eyebrow">${esc(title)}</p>
      <h2 class="g-display">${top.length > 1 ? '공동 1등!' : `${esc(top[0].name)} 우승!`}</h2>
      <ol class="g-rank">${rows.map((r) => `<li class="c${r.i} ${r.rank === 1 ? 'top' : ''}"><span class="rk">${r.rank}</span>${shp(r.i)}<span class="nm">${esc(r.name)}</span><b>${r.score}점</b></li>`).join('')}</ol>
      ${extra}
      ${endButtons()}
    </section>`;
  }
  const endButtons = () => `<div class="g-actions">${btn('한 판 더', 'data-again data-primary', 'primary lg')}${btn('설정 바꾸기', 'data-setup', 'line lg')}${btn('다른 게임', 'data-other', 'ghost lg')}</div>`;
  function bindEnd(root) {
    on('[data-again]', () => GAMES[cur].start(curOpts));
    on('[data-setup]', () => openSetup(cur));
    on('[data-other]', () => otherGames());
  }

  /* 참가자 이름 (놀이터와 같은 목록을 써요) */
  const getNames = () => SP.store.get('play.names', []);
  const setNames = (a) => SP.store.set('play.names', a.slice(0, 30));
  function namesBlock(hint) {
    const n = getNames();
    return `<div class="g-field"><span class="g-label">참가자 이름 <small>선택</small></span>
      <textarea class="g-input" data-names rows="2" placeholder="쉼표로 구분해서 적어요. 예) 민지, 서준, 하은">${esc(n.join(', '))}</textarea>${hint ? `<p class="g-hint">${esc(hint)}</p>` : ''}</div>`;
  }
  function readNames(root) {
    const el = root.querySelector('[data-names]');
    if (!el) return getNames();
    const a = el.value.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, 10));
    const uniq = [...new Set(a)];
    setNames(uniq);
    return uniq;
  }
  function stepper(k, label, o, min, max, hint) {
    return `<div class="g-field"><span class="g-label">${esc(label)}</span><div class="g-step"><button type="button" data-st="${k}" data-d="-1" aria-label="줄이기">−</button><b data-sv="${k}">${o[k]}</b><button type="button" data-st="${k}" data-d="1" aria-label="늘리기">+</button></div>${hint ? `<p class="g-hint">${esc(hint)}</p>` : ''}</div>`;
  }
  function bindStepper(root, o, lim) {
    root.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.st, [mn, mx] = lim[k];
      o[k] = Math.max(mn, Math.min(mx, o[k] + Number(b.dataset.d)));
      root.querySelector(`[data-sv="${k}"]`).textContent = o[k];
    }));
  }
  function setupShell(id, lead, inner) {
    const g = META[id];
    return `<section class="g-setup">
      <div class="g-setup-hd">${mark()}<h2 class="g-display">${esc(g.name)}</h2><p>${esc(lead)}</p></div>
      <div class="g-form">${inner}</div>
      <div class="g-actions">${btn('시작하기', 'data-go data-primary', 'primary lg')}</div>
    </section>`;
  }

  /* ---------------- 게임 정보 ---------------- */
  const META = {
    quiz: { name: '쏘플 퀴즈쇼', slug: 'quiz-show' },
    who: { name: '우리 중에 누가?', slug: 'who-among-us' },
    balance: { name: '밸런스 게임', slug: 'balance-game' },
    star: { name: '주인공 퀴즈', slug: 'star-quiz' },
    liar: { name: '라이어 게임', slug: 'liar-game' },
    relay: { name: '그림 릴레이', slug: 'drawing-relay' },
    chosung: { name: '초성 퀴즈', slug: 'chosung-quiz' },
    gesture: { name: '몸으로 말해요', slug: 'charades' },
  };
  const TOPIC_MIX = ['general', 'nonsense', 'food', 'sports', 'geo', 'culture', 'ssople'];

  /* =====================================================================
     G01 쏘플 퀴즈쇼
     ===================================================================== */
  const quiz = {
    setup() {
      const o = Object.assign({ topic: 'mix', n: 10, sec: 15, teams: 2 }, store.get('o.quiz', {}));
      const spec = [
        { k: 'topic', label: '주제', type: 'chips', items: D.quiz.topics.map((t) => [t.id, t.label]) },
        { k: 'n', label: '문제 수', type: 'seg', num: true, items: [[10, '10문제'], [15, '15문제'], [20, '20문제']] },
        { k: 'sec', label: '제한 시간', type: 'seg', num: true, items: [[10, '10초'], [15, '15초'], [20, '20초'], [0, '없음']] },
      ];
      render(setupShell('quiz', 'TV에 문제와 보기 네 개가 떠요. 팀끼리 상의해서 답을 외치거나 손을 들고, 진행자가 맞힌 팀을 눌러 점수를 줘요. 마지막 문제는 2배예요.', form(spec, o) + teamBlock(o)), (r) => {
        bindForm(r, o, spec); bindTeams(r, o);
        on('[data-go]', () => { store.set('o.quiz', o); quiz.start(o); });
      });
    },
    start(o) {
      curOpts = o;
      const pool = o.topic === 'mix' ? TOPIC_MIX.flatMap((k) => D.quiz.q[k] || []) : (D.quiz.q[o.topic] || []);
      const qs = take(pool, Math.min(o.n, pool.length)).map((q) => {
        const order = shuffle([0, 1, 2, 3]);
        return { text: q[0], opts: order.map((k) => q[1 + k]), ans: order.indexOf(0) };
      });
      const teams = makeTeams(o.teams);
      const topicLabel = (D.quiz.topics.find((t) => t.id === o.topic) || {}).label || '';
      setSub(`${topicLabel} · ${qs.length}문제`);
      render(`<section class="g-intro">
          <p class="g-eyebrow">${esc(topicLabel)} · ${qs.length}문제${o.sec ? ` · ${o.sec}초` : ''}</p>
          <h2 class="g-display xl">쏘플 퀴즈쇼</h2>
          <ul class="g-rules">
            <li>${shp(0)}문제와 보기 네 개가 TV에 떠요</li>
            <li>${shp(1)}팀끼리 상의하고, 답은 색이나 도형으로 외쳐요</li>
            <li>${shp(2)}진행자가 정답을 공개하고 맞힌 팀을 눌러요</li>
            <li>${shp(3)}마지막 문제는 점수 2배</li>
          </ul>
          <div class="g-actions">${btn('첫 문제', 'data-primary data-next', 'primary lg')}</div>
        </section>`, () => on('[data-next]', () => bigCount('곧 시작해요', () => ask(0))));
      function ask(i) {
        const q = qs[i], last = i === qs.length - 1;
        setSub(`${i + 1} / ${qs.length}`);
        render(`<section class="g-q">
            <div class="g-qmeta"><span class="g-no">Q${i + 1}<small>/${qs.length}</small></span>${last ? '<span class="g-pill hot">마지막 · 2배</span>' : ''}<span class="g-grow"></span>${o.sec ? `<span class="g-timer"><i><b data-bar></b></i><em data-num>${o.sec}</em></span>` : ''}</div>
            <h3 class="g-qtext ${q.text.length > 34 ? 'long' : ''}">${esc(q.text)}</h3>
            <ol class="g-opts">${q.opts.map((t, k) => `<li class="o${k}">${shp(k)}<span>${esc(t)}</span></li>`).join('')}</ol>
            <div class="g-foot">${scoreBar(teams)}<span class="g-grow"></span>${btn('정답 공개', 'data-primary data-reveal', 'primary lg')}</div>
          </section>`, (r) => {
          let stop = null;
          if (o.sec) stop = runTimer(o.sec, { num: r.querySelector('[data-num]'), bar: r.querySelector('[data-bar]'), onEnd: () => { sfx.end(); reveal(i); } });
          on('[data-reveal]', () => { if (stop) stop(); reveal(i); });
          sfx.go();
        });
      }
      function reveal(i) {
        const q = qs[i], last = i === qs.length - 1, pts = last ? 2 : 1;
        render(`<section class="g-q reveal">
            <div class="g-qmeta"><span class="g-no">Q${i + 1}<small>/${qs.length}</small></span><span class="g-pill">정답 공개</span></div>
            <h3 class="g-qtext small">${esc(q.text)}</h3>
            <ol class="g-opts">${q.opts.map((t, k) => `<li class="o${k} ${k === q.ans ? 'right' : 'dim'}">${shp(k)}<span>${esc(t)}</span></li>`).join('')}</ol>
            ${teamPick(teams, '맞힌 팀을 눌러 주세요', pts)}
            <div class="g-foot">${scoreBar(teams)}<span class="g-grow"></span>${btn(last ? '결과 보기' : '다음 문제', 'data-primary data-next', 'primary lg')}</div>
          </section>`, (r) => {
          const sel = bindTeamPick(r);
          on('[data-next]', () => {
            sel.forEach((k) => { teams[k].score += pts; });
            if (last) done(); else ask(i + 1);
          });
          sfx.good();
        });
      }
      function done() {
        sfx.win();
        setSub('결과');
        if (!teams.length) {
          render(`<section class="g-final"><p class="g-eyebrow">쏘플 퀴즈쇼</p><h2 class="g-display">${qs.length}문제 끝!</h2><p class="g-lead">몇 개 맞혔는지 서로 물어보세요. 다음엔 팀 대항으로 점수를 매겨 봐도 좋아요.</p>${endButtons()}</section>`, bindEnd);
        } else render(finalBoard(teams, '쏘플 퀴즈쇼 최종 순위'), bindEnd);
      }
    },
  };

  /* =====================================================================
     G02 우리 중에 누가?
     ===================================================================== */
  const who = {
    setup() {
      const o = Object.assign({ mode: 'vote', pack: 'mix', n: 10, awards: 8 }, store.get('o.who', {}));
      const spec = [
        { k: 'mode', label: '방식', type: 'seg', items: [['vote', '질문 모드'], ['awards', '시상식 모드']] },
        { k: 'pack', label: '질문 묶음', type: 'chips', items: D.who.packs.map((p) => [p.id, p.label]) },
        { k: 'n', label: '질문 수', type: 'seg', num: true, items: [[10, '10개'], [15, '15개'], [20, '20개']] },
        { k: 'awards', label: '상 개수', type: 'seg', num: true, items: [[5, '5개'], [8, '8개'], [12, '12개']] },
      ];
      render(setupShell('who', '질문이 뜨면 셋을 세고 다 같이 한 사람을 가리켜요. 가장 많이 지목된 사람이 한마디! 시상식 모드는 상을 하나씩 발표해요.',
        form(spec, o) + namesBlock('이름을 넣어 두면 지목된 사람을 눌러 기록하고, 마지막에 오늘의 우리를 모아 보여 줘요.')), (r) => {
        const sync = () => {
          r.querySelector('[data-k="pack"]').closest('.g-field').hidden = o.mode !== 'vote';
          r.querySelector('[data-k="n"]').closest('.g-field').hidden = o.mode !== 'vote';
          r.querySelector('[data-k="awards"]').closest('.g-field').hidden = o.mode !== 'awards';
        };
        bindForm(r, o, spec, sync); sync();
        on('[data-go]', () => { o.names = readNames(r); store.set('o.who', { mode: o.mode, pack: o.pack, n: o.n, awards: o.awards }); who.start(o); });
      });
    },
    start(o) {
      curOpts = o;
      const names = o.names || [];
      const log = []; // {q, who}
      const pickRow = () => names.length
        ? `<div class="g-names">${names.map((n, k) => `<button type="button" data-nm="${k}">${esc(n)}</button>`).join('')}<button type="button" class="g-skip" data-nm="-1">건너뛰기</button></div>`
        : `<div class="g-free"><input class="g-input" data-free maxlength="10" placeholder="뽑힌 사람 이름 (안 적어도 돼요)"></div>`;
      const readPick = (r, el) => {
        if (el && el.dataset.nm != null) return Number(el.dataset.nm) >= 0 ? names[Number(el.dataset.nm)] : '';
        const f = r.querySelector('[data-free]'); return f ? f.value.trim() : '';
      };
      if (o.mode === 'awards') return awards();
      const pool = o.pack === 'mix' ? ['memory', 'personality', 'daily', 'future'].flatMap((k) => D.who.q[k]) : D.who.q[o.pack];
      const qs = take(pool, o.n);
      ask(0);
      function ask(i) {
        setSub(`${i + 1} / ${qs.length}`);
        render(`<section class="g-who">
            <div class="g-qmeta"><span class="g-no">${i + 1}<small>/${qs.length}</small></span></div>
            <div class="g-card big"><p class="g-eyebrow">우리 중에</p><h3 class="g-display ${qs[i].length > 24 ? 'long' : ''}">${esc(qs[i].replace(/^우리 중에\s*/, ''))}</h3><p class="g-hint">셋을 세면 다 같이 한 사람을 가리켜요. 나를 가리켜도 돼요.</p></div>
            <div class="g-actions">${btn('하나, 둘, 셋!', 'data-primary data-count', 'primary lg')}${btn('다른 질문', 'data-skip', 'ghost')}</div>
          </section>`, () => {
          on('[data-count]', () => bigCount('다 같이 가리킬 준비', () => picked(i)));
          on('[data-skip]', () => { qs[i] = pool[rnd(pool.length)]; ask(i); });
        });
      }
      function picked(i) {
        sfx.good();
        render(`<section class="g-who">
            <div class="g-card big hot"><p class="g-eyebrow">지금 가리켜요!</p><h3 class="g-display">${esc(qs[i].replace(/^우리 중에\s*/, ''))}</h3><p class="g-hint">가장 많이 지목된 사람은 한마디 해 주세요.</p></div>
            ${pickRow()}
            <div class="g-actions">${btn(i === qs.length - 1 ? '오늘의 우리 보기' : '다음 질문', 'data-primary data-next', 'primary lg')}</div>
          </section>`, (r) => {
          const nextStep = (el) => { const w = readPick(r, el); if (w) log.push({ q: qs[i], who: w }); if (i === qs.length - 1) recap(); else ask(i + 1); };
          on('[data-nm]', (el) => nextStep(el));
          on('[data-next]', () => nextStep(null));
        });
      }
      function recap() {
        sfx.win();
        setSub('오늘의 우리');
        const cnt = {};
        log.forEach((x) => { cnt[x.who] = (cnt[x.who] || 0) + 1; });
        const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);
        render(`<section class="g-final">
            <p class="g-eyebrow">우리 중에 누가?</p><h2 class="g-display">오늘의 우리</h2>
            ${top.length ? `<ol class="g-rank">${top.map(([n, c], k) => `<li class="c${k} ${k === 0 ? 'top' : ''}"><span class="rk">${k + 1}</span>${shp(k)}<span class="nm">${esc(n)}</span><b>${c}번 지목</b></li>`).join('')}</ol>` : ''}
            ${log.length ? `<ul class="g-recap">${log.map((x) => `<li><span>${esc(x.q)}</span><b>${esc(x.who)}</b></li>`).join('')}</ul>` : `<p class="g-lead">${qs.length}개의 질문을 함께했어요. 누가 제일 많이 뽑혔는지 기억나요?</p>`}
            ${endButtons()}
          </section>`, bindEnd);
      }
      function awards() {
        const list = take(D.who.awards, o.awards);
        const won = [];
        show(0);
        function show(i) {
          const a = list[i];
          setSub(`시상식 ${i + 1} / ${list.length}`);
          render(`<section class="g-award">
              <div class="g-plaque"><p class="g-eyebrow">올해의 시상식 · ${i + 1}번째 상</p><h3 class="g-display">${esc(a.t)}</h3><p>${esc(a.r)}</p></div>
              <div class="g-actions">${btn('두구두구…', 'data-primary data-drum', 'primary lg')}${btn('다른 상', 'data-skip', 'ghost')}</div>
            </section>`, () => {
            on('[data-drum]', () => { sfx.drum(); body.querySelector('.g-plaque').classList.add('drum'); later(1900, () => winner(i)); });
            on('[data-skip]', () => { const rest = D.who.awards.filter((x) => !list.includes(x)); if (rest.length) list[i] = rest[rnd(rest.length)]; show(i); });
          });
        }
        function winner(i) {
          sfx.win();
          render(`<section class="g-award">
              <div class="g-plaque open"><p class="g-eyebrow">${esc(list[i].t)}</p><h3 class="g-display">수상자를 다 같이 가리켜요!</h3><p>상을 받은 사람은 짧게 수상 소감 한마디.</p></div>
              ${pickRow()}
              <div class="g-actions">${btn(i === list.length - 1 ? '시상식 결과' : '다음 상', 'data-primary data-next', 'primary lg')}</div>
            </section>`, (r) => {
            const nextStep = (el) => { won.push({ t: list[i].t, who: readPick(r, el) }); if (i === list.length - 1) result(); else show(i + 1); };
            on('[data-nm]', (el) => nextStep(el));
            on('[data-next]', () => nextStep(null));
          });
        }
        function result() {
          setSub('시상식 결과');
          render(`<section class="g-final"><p class="g-eyebrow">우리 중에 누가? · 시상식</p><h2 class="g-display">올해의 시상식 결과</h2>
              <ul class="g-awards">${won.map((w) => `<li><span>${esc(w.t)}</span><b>${esc(w.who || '모두의 마음속에')}</b></li>`).join('')}</ul>${endButtons()}</section>`, bindEnd);
        }
      }
    },
  };

  /* =====================================================================
     G03 밸런스 게임
     ===================================================================== */
  const balance = {
    setup() {
      const o = Object.assign({ pack: 'mix', n: 10, how: 'hand' }, store.get('o.balance', {}));
      const spec = [
        { k: 'pack', label: '질문 묶음', type: 'chips', items: D.balance.packs.map((p) => [p.id, p.label]) },
        { k: 'n', label: '질문 수', type: 'seg', num: true, items: [[10, '10개'], [15, '15개'], [20, '20개']] },
        { k: 'how', label: '고르는 방법', type: 'seg', items: [['hand', '주먹·보자기'], ['move', '자리 이동'], ['raise', '손 들기']] },
      ];
      render(setupShell('balance', '둘 중 하나만 골라야 해요. 셋을 세면 동시에 고르고, 적은 쪽이 왜 그걸 골랐는지 해명해요.', form(spec, o)), (r) => {
        bindForm(r, o, spec);
        on('[data-go]', () => { store.set('o.balance', o); balance.start(o); });
      });
    },
    start(o) {
      curOpts = o;
      const pool = o.pack === 'mix' ? ['food', 'travel', 'imagine', 'ssople'].flatMap((k) => D.balance.q[k]) : D.balance.q[o.pack];
      const qs = take(pool, o.n);
      const res = [];
      const CALL = { hand: ['A는 주먹', 'B는 보자기'], move: ['A는 왼쪽으로', 'B는 오른쪽으로'], raise: ['A 고른 사람 손!', '이제 B 고른 사람 손!'] };
      ask(0);
      function ask(i) {
        const [a, b] = qs[i];
        setSub(`${i + 1} / ${qs.length}`);
        render(`<section class="g-bal">
            <div class="g-qmeta"><span class="g-no">${i + 1}<small>/${qs.length}</small></span><span class="g-grow"></span><span class="g-pill">${CALL[o.how][0]} · ${CALL[o.how][1]}</span></div>
            <div class="g-vs"><div class="a"><span>A</span><p>${esc(a)}</p></div><b class="g-vsb">VS</b><div class="b"><span>B</span><p>${esc(b)}</p></div></div>
            <div class="g-actions">${btn('하나, 둘, 셋!', 'data-primary data-count', 'primary lg')}${btn('다른 질문', 'data-skip', 'ghost')}</div>
          </section>`, () => {
          on('[data-count]', () => bigCount('마음속으로 골라요', () => tally(i)));
          on('[data-skip]', () => { qs[i] = pool[rnd(pool.length)]; ask(i); });
        });
      }
      function tally(i) {
        const [a, b] = qs[i];
        const c = { a: 0, b: 0 };
        sfx.good();
        render(`<section class="g-bal">
            <p class="g-call">${CALL[o.how][0]}, ${CALL[o.how][1]}!</p>
            <div class="g-vs counted"><div class="a"><span>A</span><p>${esc(a)}</p><div class="g-step"><button type="button" data-c="a" data-d="-1" aria-label="A 줄이기">−</button><b data-cv="a">0</b><button type="button" data-c="a" data-d="1" aria-label="A 늘리기">+</button></div></div>
              <b class="g-vsb">VS</b>
              <div class="b"><span>B</span><p>${esc(b)}</p><div class="g-step"><button type="button" data-c="b" data-d="-1" aria-label="B 줄이기">−</button><b data-cv="b">0</b><button type="button" data-c="b" data-d="1" aria-label="B 늘리기">+</button></div></div></div>
            <p class="g-hint center">몇 명씩 골랐는지 세어 넣으면 비율이 나와요. 안 세도 괜찮아요.</p>
            <div class="g-actions">${btn('결과 보기', 'data-primary data-show', 'primary lg')}</div>
          </section>`, (r) => {
          on('[data-c]', (el) => { const k = el.dataset.c; c[k] = Math.max(0, c[k] + Number(el.dataset.d)); r.querySelector(`[data-cv="${k}"]`).textContent = c[k]; });
          on('[data-show]', () => show(i, c));
        });
      }
      function show(i, c) {
        const [a, b] = qs[i], tot = c.a + c.b;
        res.push({ a, b, ca: c.a, cb: c.b });
        const pa = tot ? Math.round((c.a / tot) * 100) : 50;
        const minor = !tot ? '' : c.a === c.b ? '팽팽해요! 양쪽에서 한 명씩 이유를 들어 봐요.' : `${c.a < c.b ? 'A' : 'B'}를 고른 소수파, 해명해 주세요!`;
        const last = i === qs.length - 1;
        render(`<section class="g-bal">
            <div class="g-ratio"><div class="a" style="flex:${tot ? Math.max(c.a, 0.0001) : 1}"><span>A ${tot ? `${pa}%` : ''}</span><p>${esc(a)}</p>${tot ? `<b>${c.a}명</b>` : ''}</div><div class="b" style="flex:${tot ? Math.max(c.b, 0.0001) : 1}"><span>B ${tot ? `${100 - pa}%` : ''}</span><p>${esc(b)}</p>${tot ? `<b>${c.b}명</b>` : ''}</div></div>
            <p class="g-call">${esc(minor || '적은 쪽을 고른 사람이 이유를 말해 봐요.')}</p>
            <div class="g-actions">${btn(last ? '오늘의 밸런스 모아 보기' : '다음 질문', 'data-primary data-next', 'primary lg')}</div>
          </section>`, () => on('[data-next]', () => (last ? recap() : ask(i + 1))));
      }
      function recap() {
        sfx.win();
        setSub('모아 보기');
        render(`<section class="g-final"><p class="g-eyebrow">밸런스 게임</p><h2 class="g-display">오늘의 선택</h2>
            <ul class="g-recap bal">${res.map((x) => { const t = x.ca + x.cb; return `<li><span class="${t && x.ca >= x.cb ? 'win' : ''}">${esc(x.a)}${t ? ` <em>${x.ca}</em>` : ''}</span><i>vs</i><span class="${t && x.cb >= x.ca ? 'win' : ''}">${esc(x.b)}${t ? ` <em>${x.cb}</em>` : ''}</span></li>`; }).join('')}</ul>${endButtons()}</section>`, bindEnd);
      }
    },
  };

  /* =====================================================================
     G04 주인공 퀴즈
     ===================================================================== */
  const star = {
    setup() {
      const o = Object.assign({ name: '', pack: 'mix', n: 10, teams: 2 }, store.get('o.star', {}));
      const spec = [
        { k: 'pack', label: '질문 묶음', type: 'chips', items: D.star.packs.map((p) => [p.id, p.label]) },
        { k: 'n', label: '질문 수', type: 'seg', num: true, items: [[8, '8개'], [10, '10개'], [12, '12개']] },
      ];
      const nameField = `<div class="g-field"><label class="g-label" for="gStar">오늘의 주인공</label><input class="g-input" id="gStar" maxlength="10" value="${esc(o.name)}" placeholder="주인공 이름 (예: 지민)" data-autofocus></div>`;
      render(setupShell('star', '주인공에 관한 질문과 보기 네 개가 떠요. 다 같이 손가락으로 번호를 정하고, 주인공이 정답을 말하면 맞힌 팀이 점수를 받아요.', nameField + form(spec, o) + teamBlock(o)), (r) => {
        bindForm(r, o, spec); bindTeams(r, o);
        on('[data-go]', () => {
          o.name = r.querySelector('#gStar').value.trim().slice(0, 10);
          if (!o.name) { SP.toast('주인공 이름을 적어 주세요.'); r.querySelector('#gStar').focus(); return; }
          store.set('o.star', o); star.start(o);
        });
      });
    },
    start(o) {
      curOpts = o;
      const special = o.pack === 'mix' ? [] : D.star.q.filter((q) => q[0] === o.pack);
      const base = D.star.q.filter((q) => q[0] === 'all');
      const qs = shuffle([...shuffle(special).slice(0, Math.ceil(o.n / 2)), ...take(base, o.n)].slice(0, o.n)).map((q) => ({ text: q[1].replace(/\{name\}/g, o.name), opts: q[2] }));
      const teams = makeTeams(o.teams);
      setSub(`주인공 ${o.name}`);
      render(`<section class="g-intro">
          <p class="g-eyebrow">오늘의 주인공</p><h2 class="g-display xl">${esc(o.name)}</h2>
          <ul class="g-rules">
            <li>${shp(0)}질문과 보기 네 개가 떠요</li>
            <li>${shp(1)}다 같이 손가락으로 번호를 정해요. 주인공도 몰래 정해요</li>
            <li>${shp(2)}셋을 세면 동시에 번호를 보여 줘요</li>
            <li>${shp(3)}주인공이 정답을 말하고, 맞힌 팀을 눌러요</li>
          </ul>
          <div class="g-actions">${btn('첫 질문', 'data-primary data-next', 'primary lg')}</div>
        </section>`, () => on('[data-next]', () => ask(0)));
      function ask(i) {
        const q = qs[i];
        setSub(`${i + 1} / ${qs.length}`);
        render(`<section class="g-q">
            <div class="g-qmeta"><span class="g-no">Q${i + 1}<small>/${qs.length}</small></span><span class="g-pill">손가락으로 번호!</span></div>
            <h3 class="g-qtext ${q.text.length > 30 ? 'long' : ''}">${esc(q.text)}</h3>
            <ol class="g-opts num">${q.opts.map((t, k) => `<li class="o${k}"><b>${k + 1}</b><span>${esc(t)}</span></li>`).join('')}</ol>
            <div class="g-foot">${scoreBar(teams)}<span class="g-grow"></span>${btn('하나, 둘, 셋!', 'data-primary data-count', 'primary lg')}</div>
          </section>`, () => on('[data-count]', () => bigCount('번호를 정했나요?', () => answer(i))));
      }
      function answer(i) {
        const q = qs[i];
        render(`<section class="g-q">
            <div class="g-qmeta"><span class="g-no">Q${i + 1}<small>/${qs.length}</small></span><span class="g-pill hot">${esc(o.name)}의 답은?</span></div>
            <h3 class="g-qtext small">${esc(q.text)}</h3>
            <ol class="g-opts num pickable">${q.opts.map((t, k) => `<li class="o${k}"><button type="button" data-ans="${k}"><b>${k + 1}</b><span>${esc(t)}</span></button></li>`).join('')}</ol>
            <p class="g-hint center">주인공이 고른 답을 눌러 주세요.</p>
          </section>`, () => on('[data-ans]', (el) => reveal(i, Number(el.dataset.ans))));
      }
      function reveal(i, k) {
        const q = qs[i], last = i === qs.length - 1;
        sfx.good();
        render(`<section class="g-q reveal">
            <div class="g-qmeta"><span class="g-no">Q${i + 1}<small>/${qs.length}</small></span><span class="g-pill hot">${esc(o.name)}의 답</span></div>
            <h3 class="g-qtext small">${esc(q.text)}</h3>
            <ol class="g-opts num">${q.opts.map((t, j) => `<li class="o${j} ${j === k ? 'right' : 'dim'}"><b>${j + 1}</b><span>${esc(t)}</span></li>`).join('')}</ol>
            <p class="g-call">${esc(o.name)}, 왜 이걸 골랐는지 한마디!</p>
            ${teamPick(teams, '맞힌 팀을 눌러 주세요', 1)}
            <div class="g-foot">${scoreBar(teams)}<span class="g-grow"></span>${btn(last ? '결과 보기' : '다음 질문', 'data-primary data-next', 'primary lg')}</div>
          </section>`, (r) => {
          const sel = bindTeamPick(r);
          on('[data-next]', () => { sel.forEach((t) => { teams[t].score += 1; }); if (last) done(); else ask(i + 1); });
        });
      }
      function done() {
        sfx.win();
        setSub('결과');
        const tail = `<p class="g-lead">마지막으로 ${esc(o.name)}에게 한마디씩 건네며 마무리해요.</p>`;
        if (!teams.length) render(`<section class="g-final"><p class="g-eyebrow">주인공 퀴즈</p><h2 class="g-display">${esc(o.name)}, 생각보다 잘 알죠?</h2>${tail}${endButtons()}</section>`, bindEnd);
        else render(finalBoard(teams, `${o.name}을(를) 제일 잘 아는 팀`, tail), bindEnd);
      }
    },
  };

  /* =====================================================================
     G05 라이어 게임 — 폰 한 대를 돌려 가며 제시어 확인
     ===================================================================== */
  const liar = {
    setup() {
      const o = Object.assign({ players: 5, cat: 'mix', mode: 'basic', talk: 0 }, store.get('o.liar', {}));
      const spec = [
        { k: 'cat', label: '주제', type: 'chips', items: [['mix', '섞어서'], ...D.liar.cats.map((c) => [c.id, c.label])] },
        { k: 'mode', label: '라이어 방식', type: 'seg', items: [['basic', '기본'], ['fool', '바보 라이어']], hint: '바보 라이어는 라이어도 같은 주제의 다른 제시어를 받아서, 자기가 라이어인 줄 몰라요.' },
        { k: 'talk', label: '한 사람 설명 시간', type: 'seg', num: true, items: [[0, '재지 않기'], [15, '15초'], [30, '30초']] },
      ];
      render(setupShell('liar', '한 명만 제시어를 모르는 라이어예요. 폰을 한 사람씩 돌려 제시어를 확인하고, 돌아가며 한 문장씩 설명한 뒤 라이어를 찾아요.',
        stepper('players', '몇 명이 해요?', o, 3, 12, '앉은 순서대로 1번부터 번호를 정해 두세요.') + form(spec, o)), (r) => {
        bindStepper(r, o, { players: [3, 12] }); bindForm(r, o, spec);
        on('[data-go]', () => { store.set('o.liar', o); liar.start(o); });
      });
    },
    start(o) {
      curOpts = o;
      const cats = o.cat === 'mix' ? D.liar.cats : D.liar.cats.filter((c) => c.id === o.cat);
      const cat = cats[rnd(cats.length)];
      const words = shuffle(D.liar.w[cat.id]);
      const word = words[0], decoy = words[1];
      const liarNo = rnd(o.players);
      const first = rnd(o.players);
      setSub(`${o.players}명 · ${cat.label}`);
      pass(0);
      function pass(i) {
        if (i >= o.players) return talk();
        render(`<section class="g-pass">
            <p class="g-eyebrow">제시어 확인 ${i + 1} / ${o.players}</p>
            <h2 class="g-display xl">${i + 1}번 차례</h2>
            <p class="g-lead">${i + 1}번만 화면을 보고, 나머지는 고개를 돌려 주세요.</p>
            <div class="g-actions">${btn('내 제시어 보기', 'data-primary data-see', 'primary lg')}</div>
          </section>`, () => on('[data-see]', () => see(i)));
      }
      function see(i) {
        const isLiar = i === liarNo;
        const show = isLiar && o.mode === 'basic'
          ? `<div class="g-card big dark"><p class="g-eyebrow">주제 · ${esc(cat.label)}</p><h3 class="g-display">당신은 라이어예요</h3><p class="g-hint">들키지 않게 다른 사람 설명을 듣고 그럴듯하게 말해요.</p></div>`
          : `<div class="g-card big"><p class="g-eyebrow">주제 · ${esc(cat.label)}</p><h3 class="g-display">${esc(isLiar ? decoy : word)}</h3><p class="g-hint">라이어에게 들키지 않게, 너무 뻔하지 않게 설명해요.</p></div>`;
        render(`<section class="g-pass">${show}<div class="g-actions">${btn('확인했어요, 화면 가리기', 'data-primary data-hide', 'dark lg')}</div></section>`, () => on('[data-hide]', () => pass(i + 1)));
      }
      function talk() {
        const order = Array.from({ length: o.players }, (_, k) => ((first + k) % o.players) + 1);
        let turn = 0, rounds = 0, stop = null;
        sfx.go();
        const draw = () => {
          const who = order[turn];
          render(`<section class="g-talk">
              <p class="g-eyebrow">주제 · ${esc(cat.label)} · ${rounds + 1}바퀴째</p>
              <h2 class="g-display">${who}번 설명할 차례</h2>
              <p class="g-lead">제시어를 한 문장으로 설명해요. 너무 자세하면 라이어가 눈치채요.</p>
              ${o.talk ? `<div class="g-bigtime"><em data-num>${o.talk}</em><i><b data-bar></b></i></div>` : ''}
              <ol class="g-order">${order.map((n, k) => `<li class="${k === turn ? 'now' : k < turn ? 'done' : ''}">${n}</li>`).join('')}</ol>
              <div class="g-actions">${btn('다음 사람', 'data-primary data-next', 'primary lg')}${btn('설명 끝, 투표하기', 'data-vote', 'line lg')}</div>
            </section>`, (r) => {
            if (o.talk) stop = runTimer(o.talk, { num: r.querySelector('[data-num]'), bar: r.querySelector('[data-bar]'), onEnd: () => sfx.end() });
            on('[data-next]', () => { if (stop) stop(); turn++; if (turn >= order.length) { turn = 0; rounds++; } draw(); });
            on('[data-vote]', () => { if (stop) stop(); vote(); });
          });
        };
        draw();
      }
      function vote() {
        render(`<section class="g-talk">
            <p class="g-eyebrow">토론 시간</p><h2 class="g-display">라이어는 누구일까요?</h2>
            <p class="g-lead">의심 가는 사람에게 질문해도 돼요. 마음이 정해지면 셋을 세고 다 같이 가리켜요.</p>
            <div class="g-actions">${btn('하나, 둘, 셋!', 'data-primary data-count', 'primary lg')}</div>
          </section>`, () => on('[data-count]', () => bigCount('라이어를 가리킬 준비', chosen)));
      }
      function chosen() {
        render(`<section class="g-talk">
            <h2 class="g-display">가장 많이 지목된 사람은?</h2>
            <div class="g-nums">${Array.from({ length: o.players }, (_, k) => `<button type="button" data-no="${k}">${k + 1}번</button>`).join('')}</div>
          </section>`, () => on('[data-no]', (el) => judge(Number(el.dataset.no))));
      }
      function judge(k) {
        const caught = k === liarNo;
        const words = o.mode === 'fool' ? `시민 제시어 <b>${esc(word)}</b> · 라이어 제시어 <b>${esc(decoy)}</b>` : `제시어는 <b>${esc(word)}</b>`;
        if (!caught) {
          sfx.end();
          return finish(false, `땡! 라이어는 <b>${liarNo + 1}번</b>이었어요. ${words}`);
        }
        sfx.good();
        render(`<section class="g-talk">
            <p class="g-eyebrow">라이어를 찾았어요</p><h2 class="g-display">${liarNo + 1}번이 라이어!</h2>
            <p class="g-lead">${o.mode === 'fool' ? '바보 라이어는 진짜 제시어를 맞히면 역전해요.' : '라이어에게 마지막 기회! 제시어를 맞히면 역전이에요.'} 정답을 말했나요?</p>
            <div class="g-actions">${btn('맞혔어요 (라이어 역전)', 'data-yes', 'line lg')}${btn('못 맞혔어요', 'data-primary data-no', 'primary lg')}</div>
          </section>`, () => {
          on('[data-yes]', () => finish(false, `라이어가 제시어를 맞혀 역전했어요. ${words}`));
          on('[data-no]', () => finish(true, `시민 승리! ${words}`));
        });
      }
      function finish(citizens, msg) {
        const tally = store.get('liarTally', { c: 0, l: 0 });
        if (citizens) tally.c++; else tally.l++;
        store.set('liarTally', tally);
        sfx.win();
        render(`<section class="g-final">
            <p class="g-eyebrow">라이어 게임</p><h2 class="g-display">${citizens ? '시민 승리!' : '라이어 승리!'}</h2>
            <p class="g-lead big">${msg}</p>
            <p class="g-hint center">오늘 전적 · 시민 ${tally.c}승 · 라이어 ${tally.l}승 <button type="button" class="g-link" data-reset>전적 지우기</button></p>
            ${endButtons()}
          </section>`, (r) => { bindEnd(r); on('[data-reset]', () => { store.set('liarTally', { c: 0, l: 0 }); SP.toast('전적을 지웠어요.'); }); });
      }
    },
  };

  /* =====================================================================
     G06 그림 릴레이 — 문장 → 그림 → 문장 … 폰을 돌려 가며 이어 가기
     ===================================================================== */
  function makePad(host) {
    const W = 800, H = 600;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.className = 'g-canvas';
    host.appendChild(cv);
    const g = cv.getContext('2d');
    const strokes = [];
    let color = '#1c1714', size = 6, drawing = null;
    const paint = () => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.lineCap = 'round'; g.lineJoin = 'round';
      strokes.forEach((s) => {
        g.strokeStyle = s.c; g.lineWidth = s.w; g.beginPath();
        s.p.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        if (s.p.length === 1) g.lineTo(s.p[0][0] + 0.1, s.p[0][1]);
        g.stroke();
      });
    };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = { c: color, w: size, p: [pos(e)] }; strokes.push(drawing); paint(); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; drawing.p.push(pos(e)); paint(); });
    const up = () => { drawing = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
    paint();
    return {
      set color(c) { color = c; }, set size(s) { size = s; },
      undo() { strokes.pop(); paint(); }, clear() { strokes.length = 0; paint(); },
      empty: () => !strokes.length,
      png: () => cv.toDataURL('image/png'),
    };
  }
  const relay = {
    setup() {
      const o = Object.assign({ players: 5, pack: 'mix', draw: 60, write: 30 }, store.get('o.relay', {}));
      const spec = [
        { k: 'pack', label: '제시어 묶음', type: 'chips', items: [['mix', '섞어서'], ...D.relay.packs.map((p) => [p.id, p.label])] },
        { k: 'draw', label: '그리는 시간', type: 'seg', num: true, items: [[60, '60초'], [90, '90초'], [0, '재지 않기']] },
        { k: 'write', label: '쓰는 시간', type: 'seg', num: true, items: [[30, '30초'], [45, '45초'], [0, '재지 않기']] },
      ];
      render(setupShell('relay', '첫 사람은 문장을 보고 그림을 그리고, 다음 사람은 그 그림만 보고 문장을 써요. 폰을 돌려 끝까지 이어 간 뒤 TV에서 다 같이 감상해요.',
        stepper('players', '몇 명이 해요?', o, 3, 10, '한 사람이 한 번씩 그리거나 써요. 폰은 앉은 순서대로 넘겨요.') + form(spec, o)), (r) => {
        bindStepper(r, o, { players: [3, 10] }); bindForm(r, o, spec);
        on('[data-go]', () => { store.set('o.relay', o); relay.start(o); });
      });
    },
    start(o) {
      curOpts = o;
      const packs = o.pack === 'mix' ? ['animal', 'daily', 'food', 'fantasy', 'place', 'party'] : [o.pack];
      const pk = packs[rnd(packs.length)];
      const prompt = D.relay.p[pk][rnd(D.relay.p[pk].length)];
      const chain = [{ type: 'text', v: prompt, by: 0 }];
      setSub(`${o.players}명`);
      pass(1);
      function pass(n) { // n번째 사람(1부터)
        if (n > o.players) return album(0);
        const drawTurn = n % 2 === 1;
        render(`<section class="g-pass">
            <p class="g-eyebrow">${n} / ${o.players}</p>
            <h2 class="g-display xl">${n}번 차례</h2>
            <p class="g-lead">${drawTurn ? (n === 1 ? '제시어 문장을 보고 그림을 그려요.' : '앞사람 문장만 보고 그림을 그려요.') : '앞사람 그림만 보고 무슨 장면인지 한 문장으로 써요.'} 다른 사람은 화면을 보지 마세요.</p>
            <div class="g-actions">${btn('시작', 'data-primary data-go', 'primary lg')}</div>
          </section>`, () => on('[data-go]', () => (drawTurn ? drawStep(n) : writeStep(n))));
      }
      function drawStep(n) {
        const src = chain[chain.length - 1];
        render(`<section class="g-relay">
            <div class="g-relay-hd"><div><p class="g-eyebrow">${n === 1 ? '제시어' : '앞사람이 쓴 문장'}</p><h3>${esc(src.v)}</h3></div>${o.draw ? `<span class="g-timer"><i><b data-bar></b></i><em data-num>${o.draw}</em></span>` : ''}</div>
            <div class="g-padbox"></div>
            <div class="g-tools">
              <div class="g-colors">${['#1c1714', '#e83217', '#2d6cdf', '#f2a102', '#1e9e6a', '#8a5a3c'].map((c, k) => `<button type="button" data-col="${c}" style="--c:${c}" aria-label="색 ${k + 1}" aria-pressed="${k === 0}"></button>`).join('')}<button type="button" data-col="#ffffff" class="eraser" aria-pressed="false">지우개</button></div>
              <div class="g-sizes">${[[4, '가늘게'], [8, '보통'], [16, '굵게']].map(([s, l]) => `<button type="button" data-sz="${s}" aria-pressed="${s === 8}">${l}</button>`).join('')}</div>
              <div class="g-sizes">${btn('되돌리기', 'data-undo', 'ghost')}${btn('모두 지우기', 'data-clear', 'ghost')}</div>
            </div>
            <div class="g-actions">${btn('다 그렸어요', 'data-primary data-done', 'primary lg')}</div>
          </section>`, (r) => {
          const pad = makePad(r.querySelector('.g-padbox'));
          pad.size = 8;
          let stop = null, sent = false;
          const send = () => { if (sent) return; sent = true; if (stop) stop(); chain.push({ type: 'img', v: pad.png(), by: n }); pass(n + 1); };
          on('[data-col]', (el) => { pad.color = el.dataset.col; r.querySelectorAll('[data-col]').forEach((x) => x.setAttribute('aria-pressed', String(x === el))); });
          on('[data-sz]', (el) => { pad.size = Number(el.dataset.sz); r.querySelectorAll('[data-sz]').forEach((x) => x.setAttribute('aria-pressed', String(x === el))); });
          on('[data-undo]', () => pad.undo());
          on('[data-clear]', () => pad.clear());
          on('[data-done]', () => { if (pad.empty()) { SP.toast('조금이라도 그려 주세요.'); return; } send(); });
          if (o.draw) stop = runTimer(o.draw, { num: r.querySelector('[data-num]'), bar: r.querySelector('[data-bar]'), onEnd: () => { sfx.end(); send(); } });
        });
      }
      function writeStep(n) {
        const src = chain[chain.length - 1];
        render(`<section class="g-relay">
            <div class="g-relay-hd"><div><p class="g-eyebrow">앞사람 그림</p><h3>무슨 장면일까요?</h3></div>${o.write ? `<span class="g-timer"><i><b data-bar></b></i><em data-num>${o.write}</em></span>` : ''}</div>
            <img class="g-drawn" src="${src.v}" alt="${n - 1}번이 그린 그림">
            <div class="g-field"><label class="g-label" for="gLine">한 문장으로 써요</label><input class="g-input lg" id="gLine" maxlength="40" placeholder="예) 고양이가 피자를 배달한다" data-autofocus></div>
            <div class="g-actions">${btn('다 썼어요', 'data-primary data-done', 'primary lg')}</div>
          </section>`, (r) => {
          let stop = null, sent = false;
          const inp = r.querySelector('#gLine');
          const send = (force) => {
            const v = inp.value.trim();
            if (!v && !force) { SP.toast('한 문장만 적어 주세요.'); inp.focus(); return; }
            if (sent) return; sent = true; if (stop) stop();
            chain.push({ type: 'text', v: v || '(시간 안에 못 썼어요)', by: n }); pass(n + 1);
          };
          on('[data-done]', () => send(false));
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(false); } });
          if (o.write) stop = runTimer(o.write, { num: r.querySelector('[data-num]'), bar: r.querySelector('[data-bar]'), onEnd: () => { sfx.end(); send(true); } });
        });
      }
      function album(k) {
        if (k === 0) sfx.go();
        setSub(`감상 ${k + 1} / ${chain.length}`);
        const s = chain[k], last = k === chain.length - 1;
        const who = s.by === 0 ? '처음 제시어' : `${s.by}번이 ${s.type === 'img' ? '그린 그림' : '쓴 문장'}`;
        render(`<section class="g-album">
            <p class="g-eyebrow">${esc(who)}</p>
            ${s.type === 'img' ? `<img class="g-drawn big" src="${s.v}" alt="${esc(who)}">` : `<div class="g-card big"><h3 class="g-display">${esc(s.v)}</h3></div>`}
            <div class="g-actions">${k ? btn('이전', 'data-prev', 'ghost lg') : ''}${btn(last ? '처음과 마지막 비교' : '다음', 'data-primary data-next', 'primary lg')}</div>
          </section>`, () => {
          on('[data-prev]', () => album(k - 1));
          on('[data-next]', () => (last ? compare() : album(k + 1)));
        });
      }
      function compare() {
        sfx.win();
        setSub('처음과 마지막');
        const endS = chain[chain.length - 1];
        render(`<section class="g-final">
            <p class="g-eyebrow">그림 릴레이</p><h2 class="g-display">처음 vs 마지막</h2>
            <div class="g-compare"><div><span>처음 제시어</span><p>${esc(prompt)}</p></div><div><span>마지막 ${endS.type === 'img' ? '그림' : '문장'}</span>${endS.type === 'img' ? `<img src="${endS.v}" alt="마지막 그림">` : `<p>${esc(endS.v)}</p>`}</div></div>
            <p class="g-hint center">제일 웃긴 그림을 그린 사람을 다 같이 가리켜 뽑아 보세요. 그림은 이 화면을 닫으면 사라져요.</p>
            ${endButtons()}
          </section>`, bindEnd);
      }
    },
  };

  /* =====================================================================
     G07 초성 퀴즈
     ===================================================================== */
  const chosung = {
    setup() {
      const o = Object.assign({ cat: 'mix', n: 10, sec: 20, teams: 2 }, store.get('o.chosung', {}));
      const spec = [
        { k: 'cat', label: '주제', type: 'chips', items: [['mix', '섞어서'], ...D.chosung.cats.map((c) => [c.id, c.label])] },
        { k: 'n', label: '문제 수', type: 'seg', num: true, items: [[10, '10문제'], [15, '15문제'], [20, '20문제']] },
        { k: 'sec', label: '제한 시간', type: 'seg', num: true, items: [[15, '15초'], [20, '20초'], [30, '30초'], [0, '없음']] },
      ];
      render(setupShell('chosung', '초성만 보고 먼저 외치는 팀이 이겨요. 막히면 힌트로 한 글자씩 열 수 있어요.', form(spec, o) + teamBlock(o)), (r) => {
        bindForm(r, o, spec); bindTeams(r, o);
        on('[data-go]', () => { store.set('o.chosung', o); chosung.start(o); });
      });
    },
    start(o) {
      curOpts = o;
      const cats = o.cat === 'mix' ? D.chosung.cats.map((c) => c.id) : [o.cat];
      const pool = cats.flatMap((c) => D.chosung.w[c].map((w) => ({ c, w })));
      const qs = take(pool, o.n).map(({ c, w }) => { const alts = w.split('/').map((x) => x.trim()); return { cat: c, word: alts[0], alts }; });
      const teams = makeTeams(o.teams);
      const catLabel = (id) => (D.chosung.cats.find((x) => x.id === id) || {}).label || '';
      ask(0);
      function tiles(word, open) {
        let k = 0;
        return Array.from(word).map((ch) => {
          if (ch === ' ') return '<i class="sp"></i>';
          const idx = k++;
          return `<span class="${idx < open ? 'open' : ''}">${esc(idx < open ? ch : choOf(ch))}</span>`;
        }).join('');
      }
      function ask(i) {
        const q = qs[i], len = q.word.replace(/\s/g, '').length;
        let open = 0, stop = null;
        setSub(`${i + 1} / ${qs.length}`);
        const draw = () => {
          render(`<section class="g-cho">
              <div class="g-qmeta"><span class="g-no">${i + 1}<small>/${qs.length}</small></span><span class="g-pill">${esc(catLabel(q.cat))}</span><span class="g-pill">${len}글자${q.word.includes(' ') ? ` · ${q.word.split(' ').length}단어` : ''}</span><span class="g-grow"></span>${o.sec ? `<span class="g-timer"><i><b data-bar></b></i><em data-num>${o.sec}</em></span>` : ''}</div>
              <div class="g-tiles ${len > 7 ? 'long' : ''}">${tiles(q.word, open)}</div>
              <div class="g-foot">${scoreBar(teams)}<span class="g-grow"></span>${open < len - 1 ? btn(`힌트 (${open}/${len - 1})`, 'data-hint', 'line lg') : ''}${btn('정답 공개', 'data-primary data-reveal', 'primary lg')}</div>
            </section>`, (r) => {
            on('[data-hint]', () => { open++; const t = r.querySelector('.g-tiles'); t.innerHTML = tiles(q.word, open); const h = r.querySelector('[data-hint]'); if (open >= len - 1) h.remove(); else h.textContent = `힌트 (${open}/${len - 1})`; });
            on('[data-reveal]', () => { if (stop) stop(); reveal(i, open); });
            if (o.sec) stop = runTimer(o.sec, { num: r.querySelector('[data-num]'), bar: r.querySelector('[data-bar]'), onEnd: () => { sfx.end(); reveal(i, open); } });
          });
        };
        draw();
        sfx.go();
      }
      function reveal(i, hints) {
        const q = qs[i], last = i === qs.length - 1;
        sfx.good();
        render(`<section class="g-cho">
            <div class="g-qmeta"><span class="g-no">${i + 1}<small>/${qs.length}</small></span><span class="g-pill hot">정답</span>${hints ? `<span class="g-pill">힌트 ${hints}개</span>` : ''}</div>
            <div class="g-tiles done ${q.word.length > 7 ? 'long' : ''}">${tiles(q.word, 99)}</div>
            ${q.alts.length > 1 ? `<p class="g-hint center">${q.alts.map(esc).join(', ')} 모두 정답이에요.</p>` : ''}
            ${teamPick(teams, '먼저 맞힌 팀을 눌러 주세요', 1)}
            <div class="g-foot">${scoreBar(teams)}<span class="g-grow"></span>${btn(last ? '결과 보기' : '다음 문제', 'data-primary data-next', 'primary lg')}</div>
          </section>`, (r) => {
          const sel = bindTeamPick(r);
          on('[data-next]', () => { sel.forEach((t) => { teams[t].score += 1; }); if (last) done(); else ask(i + 1); });
        });
      }
      function done() {
        sfx.win();
        setSub('결과');
        const words = `<ul class="g-wordlist">${qs.map((q) => `<li>${esc(q.word)}</li>`).join('')}</ul>`;
        if (!teams.length) render(`<section class="g-final"><p class="g-eyebrow">초성 퀴즈</p><h2 class="g-display">${qs.length}문제 끝!</h2>${words}${endButtons()}</section>`, bindEnd);
        else render(finalBoard(teams, '초성 퀴즈 최종 순위', words), bindEnd);
      }
    },
  };

  /* =====================================================================
     G08 몸으로 말해요
     ===================================================================== */
  const gesture = {
    setup() {
      const o = Object.assign({ level: 'easy', sec: 90, rounds: 1, teams: 2, quiet: isNight() ? 1 : 0 }, store.get('o.gesture', {}));
      if (o.teams < 2) o.teams = 2;
      const spec = [
        { k: 'level', label: '난이도', type: 'seg', items: D.gesture.levels.map((l) => [l.id, l.label]) },
        { k: 'sec', label: '한 팀 시간', type: 'seg', num: true, items: [[60, '60초'], [90, '90초'], [120, '120초']] },
        { k: 'rounds', label: '팀마다 몇 번씩', type: 'seg', num: true, items: [[1, '1번'], [2, '2번'], [3, '3번']] },
        { k: 'quiet', label: '조용 모드', type: 'seg', num: true, items: [[0, '끄기'], [1, '켜기']], hint: '밤에는 소리 대신 진동으로만 알려요. 정답도 손뼉 대신 손짓으로!' },
      ];
      render(setupShell('gesture', '설명하는 사람만 화면을 보고, 말없이 몸짓으로 제시어를 설명해요. 팀원이 맞히면 정답, 어려우면 패스. 시간 안에 많이 맞힌 팀이 이겨요.', form(spec, o) + teamBlock(o, false)), (r) => {
        bindForm(r, o, spec); bindTeams(r, o);
        on('[data-go]', () => { store.set('o.gesture', o); gesture.start(o); });
      });
    },
    start(o) {
      curOpts = o;
      const deck = shuffle(D.gesture.w[o.level]);
      let dk = 0;
      const teams = makeTeams(o.teams);
      const turns = [];
      for (let r = 0; r < o.rounds; r++) teams.forEach((t) => turns.push(t.i));
      const log = [];
      const savedVol = vol;
      if (o.quiet) vol = 0;
      intro(0);
      function intro(k) {
        const t = teams[turns[k]];
        setSub(`${k + 1} / ${turns.length}`);
        render(`<section class="g-pass">
            <div class="g-score-row">${scoreBar(teams)}</div>
            <p class="g-eyebrow">${k + 1}번째 차례 · ${o.sec}초</p>
            <h2 class="g-display xl c${t.i}-ink">${esc(t.name)} 차례</h2>
            <p class="g-lead">설명할 사람이 화면을 들고(또는 화면 앞에 서고), 같은 팀은 화면을 보지 않게 앉아요. 말, 입 모양, 글자 쓰기는 반칙이에요.</p>
            <div class="g-actions">${btn('시작', 'data-primary data-go', 'primary lg')}</div>
          </section>`, () => on('[data-go]', () => bigCount('설명할 준비', () => play(k))));
      }
      function play(k) {
        const t = teams[turns[k]];
        const got = [];
        const next = () => { const w = deck[dk % deck.length]; dk++; return w; };
        let word = next();
        render(`<section class="g-ges">
            <div class="g-qmeta"><span class="g-pill c${t.i}">${esc(t.name)}</span><span class="g-pill">정답 <b data-got>0</b></span><span class="g-grow"></span><span class="g-timer"><i><b data-bar></b></i><em data-num>${o.sec}</em></span></div>
            <div class="g-word"><span data-word>${esc(word)}</span></div>
            <div class="g-gesbtns">${btn('패스', 'data-pass', 'line xl')}${btn('정답!', 'data-primary data-ok', 'ok xl')}</div>
          </section>`, (r) => {
          const wEl = r.querySelector('[data-word]'), gEl = r.querySelector('[data-got]');
          const flip = (ok) => {
            got.push({ w: word, ok });
            if (ok) { sfx.good(); if (o.quiet && navigator.vibrate) navigator.vibrate(60); } else sfx.pass();
            gEl.textContent = got.filter((x) => x.ok).length;
            word = next(); wEl.textContent = word;
            wEl.parentElement.classList.remove("flip"); void wEl.parentElement.offsetWidth; wEl.parentElement.classList.add("flip");
          };
          on('[data-ok]', () => flip(true));
          on('[data-pass]', () => flip(false));
          runTimer(o.sec, { num: r.querySelector('[data-num]'), bar: r.querySelector('[data-bar]'), tick: !o.quiet, onEnd: () => { sfx.end(); if (navigator.vibrate) navigator.vibrate([200, 80, 200]); stopTurn(k, got, word); } });
        });
      }
      function stopTurn(k, got, lastWord) {
        const t = teams[turns[k]];
        const pts = got.filter((x) => x.ok).length;
        t.score += pts;
        log.push({ t: t.name, pts });
        const lastTurn = k === turns.length - 1;
        render(`<section class="g-final">
            <p class="g-eyebrow">그만!</p><h2 class="g-display">${esc(t.name)} ${pts}개 정답</h2>
            <ul class="g-wordlist">${got.map((x) => `<li class="${x.ok ? 'ok' : 'no'}">${esc(x.w)}</li>`).join('')}<li class="no">${esc(lastWord)}</li></ul>
            <div class="g-score-row">${scoreBar(teams)}</div>
            <div class="g-actions">${btn(lastTurn ? '최종 결과' : '다음 팀', 'data-primary data-next', 'primary lg')}</div>
          </section>`, () => on('[data-next]', () => (lastTurn ? done() : intro(k + 1))));
      }
      function done() {
        vol = savedVol;
        sfx.win();
        setSub('결과');
        render(finalBoard(teams, '몸으로 말해요 최종 순위'), bindEnd);
      }
    },
  };

  const GAMES = { quiz, who, balance, star, liar, relay, chosung, gesture };

  /* ---------------- 무대 열고 닫기 ---------------- */
  let lastFocus = null;
  function openSetup(id) {
    if (!GAMES[id]) return;
    if (cur === 'gesture' && id !== 'gesture') vol = store.get('vol', vol);
    cur = id;
    titleEl.textContent = META[id].name;
    setSub('');
    if (!stage.classList.contains('open')) {
      lastFocus = document.activeElement;
      stage.hidden = false;
      stage.classList.add('open');
      document.documentElement.classList.add('gs-lock');
      if (location.hash !== '#play') history.replaceState(null, '', location.pathname + location.search + '#play');
    }
    GAMES[id].setup();
    setTimeout(() => { const f = stage.querySelector('#gsClose'); if (f && !body.querySelector('[data-autofocus]')) f.focus(); }, 40);
  }
  function close() {
    clearAll();
    if (cur === 'gesture') vol = store.get('vol', vol);
    stage.classList.remove('open');
    stage.hidden = true;
    body.innerHTML = '';
    document.documentElement.classList.remove('gs-lock');
    if (location.hash === '#play') history.replaceState(null, '', location.pathname + location.search);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function otherGames() {
    setSub('');
    titleEl.textContent = '쏘플 파티게임';
    render(`<section class="g-setup"><div class="g-setup-hd">${mark()}<h2 class="g-display">다음 게임 고르기</h2><p>인원과 분위기에 맞는 게임을 골라요.</p></div>
      <div class="g-pickgame">${Object.entries(META).map(([id, m], k) => `<button type="button" data-g="${id}" class="c${k % 4}">${shp(k % 4)}<span>${esc(m.name)}</span></button>`).join('')}</div></section>`,
    () => on('[data-g]', (el) => openSetup(el.dataset.g)));
  }

  const volBtn = stage.querySelector('#gsSound');
  const syncVol = () => { if (volBtn) { volBtn.textContent = VOL_LABEL[vol]; volBtn.setAttribute('aria-label', VOL_LABEL[vol] + ' — 눌러서 바꾸기'); } };
  syncVol();
  if (volBtn) volBtn.addEventListener('click', () => { vol = (vol + 2) % 3; store.set('vol', vol); syncVol(); tone([660], 0.1); });
  stage.querySelector('#gsClose').addEventListener('click', close);
  stage.querySelector('#gsHome').addEventListener('click', () => openSetup(cur));
  const fullBtn = stage.querySelector('#gsFull');
  fullBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => SP.toast('이 기기에서는 전체 화면을 지원하지 않아요.'));
    else SP.toast('이 기기에서는 전체 화면을 지원하지 않아요.');
  });
  document.addEventListener('fullscreenchange', () => { fullBtn.textContent = document.fullscreenElement ? '전체 화면 끄기' : '전체 화면'; });

  /* 리모컨·키보드: 엔터·스페이스·→ 는 이 화면의 주 버튼, Esc 는 닫기 */
  document.addEventListener('keydown', (e) => {
    if (!stage.classList.contains('open')) return;
    if (e.key === 'Escape' && !document.fullscreenElement) { close(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'ArrowRight' || ((e.key === 'Enter' || e.key === ' ') && (e.target === document.body || e.target === stage || !e.target.closest('button,a')))) {
      const p = body.querySelector('[data-primary]');
      if (p) { e.preventDefault(); p.click(); }
    }
  });

  /* 화면의 시작 버튼 */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-game-start]');
    if (!b) return;
    e.preventDefault();
    openSetup(b.dataset.gameStart);
  });
  // 상세 화면에서 /games/<slug>#play 로 들어오면 바로 설정 화면을 연다
  const auto = stage.dataset.auto;
  if (auto && (location.hash === '#play' || location.hash === '#start')) setTimeout(() => openSetup(auto), 60);
  /* 각자 폰으로 참여하는 정식 버전 주소(관리자 설정 link.play)가 있으면 버튼을 보여 줘요 */
  if (SP.site) SP.site().then(({ settings: st }) => {
    const u = st && st['link.play'];
    if (!u || !/^https:\/\//.test(u)) return;
    document.querySelectorAll('[data-playlink]').forEach((a) => { a.href = u.replace(/\/$/, '') + '/tv'; a.hidden = false; });
  }).catch(() => {});
  window.SP_GAMES = { open: openSetup, close };
})();
