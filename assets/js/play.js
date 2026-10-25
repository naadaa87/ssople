/* 놀이터 — 파티 진행 도구. 결과는 서버에 보내지 않고, 이름 목록만 이 기기에 저장한다. */
(function () {
  const { $, $$, esc, icon } = SP;
  const stage = $('#stage'), body = $('#stageBody');
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[rnd(a.length)];
  let cleanup = null;

  /* ---------------- 내용 ---------------- */
  const MISSIONS = ['옆 사람 칭찬 세 가지 하기', '10초 동안 말없이 웃기기', '휴대폰 최근 사진 한 장 보여 주기', '좋아하는 노래 1절 부르기', '아는 성대모사 하나 하기', '오른쪽 사람과 셀카 찍기',
    '다음 판까지 모두에게 존댓말 쓰기', '오늘의 MVP 지목하고 이유 말하기', '엉덩이로 자기 이름 쓰기', '최근에 제일 웃겼던 일 이야기하기', '다음 게임 진행자 맡기',
    '모두에게 물 한 잔씩 따라 주기', '여기 있는 사람 첫인상 하나 말하기', '30초 동안 신나게 춤추기', '자기 자랑 1분 하기', '통과! 이번엔 그냥 넘어가요'];
  const BALANCE = [['평생 여름만', '평생 겨울만'], ['떡볶이 없는 세상', '치킨 없는 세상'], ['아침형 인간', '저녁형 인간'], ['바다 여행', '산 여행'], ['친구 많은 사람', '진짜 친구 한 명'],
    ['연락 자주 하는 사이', '가끔 해도 편한 사이'], ['영화관 맨 앞줄', '맨 뒷줄 기둥 옆'], ['칼퇴하고 연봉 그대로', '야근 많고 연봉 두 배'], ['짜장면', '짬뽕'], ['부먹', '찍먹'],
    ['민트초코 좋아', '민트초코 싫어'], ['하루 종일 노래방', '하루 종일 보드게임'], ['투명인간 되기', '순간이동 하기'], ['과거로 가 보기', '미래로 가 보기'], ['1년 동안 휴대폰 없이', '1년 동안 커피 없이'],
    ['고양이', '강아지'], ['계획 세운 여행', '즉흥 여행'], ['생일에 깜짝 파티', '생일엔 조용히'], ['눈치 빠른 친구', '착한 친구'], ['매운 음식만 먹기', '단 음식만 먹기'],
    ['비 오는 날 집콕', '비 맞으며 산책'], ['노래 잘하기', '춤 잘추기'], ['평생 라면 금지', '평생 아이스크림 금지'], ['회사 근처에 살기', '친구들 근처에 살기'], ['깔끔한 룸메이트', '요리 잘하는 룸메이트'],
    ['단톡방 알림 999개', '답장 없는 읽음 표시'], ['여행 사진 많이 찍기', '눈으로만 담기'], ['한 달 동안 매일 같은 옷', '한 달 동안 매일 같은 메뉴'], ['10년 전으로 돌아가기', '지금 그대로 살기'], ['먼저 연락하는 쪽', '연락 기다리는 쪽']];
  const TALK = {
    '처음 만난 사이': ['요즘 제일 자주 듣는 노래는?', '주말엔 주로 뭐 하면서 쉬어요?', '최근에 제일 맛있게 먹은 음식은?', '어릴 때 꿈은 뭐였어요?', '혼자 가 본 곳 중 제일 좋았던 곳은?', '요즘 빠져 있는 취미가 있다면?',
      '나를 동물로 비유하면?', '인생 영화나 드라마 하나만 꼽는다면?', '올해 안에 꼭 해 보고 싶은 건?', '최근에 들은 말 중 제일 기분 좋았던 말은?', '여행 가면 꼭 하는 나만의 습관은?', '하루가 48시간이면 늘어난 시간에 뭘 할 거예요?'],
    '친한 친구끼리': ['우리 처음 만났을 때 첫인상 기억나?', '같이 간 곳 중 제일 기억에 남는 곳은?', '요즘 제일 고민되는 게 뭐야?', '서로에게 고마웠던 순간 하나씩 말해 보기', '10년 뒤 우리는 뭐 하고 있을까?', '나만 아는 너의 장점은?',
      '다음에 같이 가고 싶은 여행지는?', '지금까지 제일 웃겼던 우리 사건은?', '요즘 나한테 바라는 거 하나만 말해 줘', '서로를 노래 한 곡으로 표현하면?'],
    '회사·모임 사람들': ['입사(가입) 첫날 기억나는 일은?', '요즘 일하면서 제일 뿌듯했던 순간은?', '점심 메뉴 고를 때 나만의 기준은?', '퇴근하고 제일 먼저 하는 일은?', '우리 팀(모임)의 숨은 MVP는?', '휴가가 일주일 생기면 하고 싶은 건?',
      '회의할 때 나도 모르게 하는 버릇은?', '올해 우리끼리 해 보고 싶은 것은?'],
  };
  const WORDS = {
    음식: ['떡볶이', '김밥', '짜장면', '피자', '치킨', '삼겹살', '초밥', '라면', '마라탕', '붕어빵', '냉면', '비빔밥', '햄버거', '김치찌개'],
    장소: ['학교', '병원', '공항', '놀이공원', '도서관', '찜질방', '편의점', '영화관', '수영장', '캠핑장', '노래방', '헬스장', '지하철역', '빵집'],
    동물: ['고양이', '강아지', '펭귄', '기린', '판다', '코끼리', '다람쥐', '거북이', '호랑이', '햄스터', '돌고래', '앵무새', '캥거루', '부엉이'],
    직업: ['소방관', '요리사', '의사', '선생님', '유튜버', '경찰관', '택배 기사', '바리스타', '아이돌', '승무원', '개발자', '미용사', '농부', '마술사'],
    물건: ['우산', '냉장고', '칫솔', '이어폰', '지갑', '베개', '선풍기', '손목시계', '거울', '볼펜', '텀블러', '손전등', '리모컨', '노트북'],
    스포츠: ['축구', '야구', '농구', '배드민턴', '볼링', '수영', '탁구', '스키', '골프', '마라톤', '클라이밍', '테니스', '태권도', '피구'],
  };
  const QUIZ = {
    음식: WORDS.음식, 동물: WORDS.동물,
    나라: ['대한민국', '일본', '중국', '미국', '프랑스', '이탈리아', '스페인', '브라질', '캐나다', '호주', '베트남', '태국', '멕시코', '이집트', '인도', '독일'],
    과일: ['사과', '바나나', '딸기', '포도', '수박', '복숭아', '파인애플', '망고', '체리', '귤', '키위', '블루베리', '참외', '레몬', '자두'],
    직업: WORDS.직업, 물건: WORDS.물건,
  };
  const CHARADES = {
    동작: ['줄넘기', '볼링', '낚시', '양치질', '머리 감기', '운전하기', '피아노 치기', '셀카 찍기', '요가', '김밥 말기', '빨래 널기', '탬버린 치기', '수영', '활쏘기', '택시 잡기', '설거지'],
    동물: ['펭귄', '캥거루', '고릴라', '뱀', '닭', '코끼리', '원숭이', '게', '독수리', '개구리', '나무늘보', '미어캣'],
    직업: ['지휘자', '마술사', '권투 선수', '요리사', '사진작가', '경찰관', '발레리나', '택배 기사', '바리스타', '아이돌', '수영 선수', '헤어 디자이너'],
  };
  const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const chosung = (w) => Array.from(w).map((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');

  /* ---------------- 이름 목록 (이 기기에만 저장) ---------------- */
  const getNames = () => SP.store.get('play.names', []);
  const setNames = (a) => SP.store.set('play.names', a.slice(0, 30));
  function namesEditor(onChange) {
    const wrap = document.createElement('div');
    const draw = () => {
      const n = getNames();
      wrap.innerHTML = `<form class="names-input" data-nf><label class="sr-only" for="nIn">이름 추가</label><input class="input" id="nIn" maxlength="12" placeholder="이름을 쓰고 엔터 (쉼표로 여러 명)"><button class="btn btn-ink" type="submit">추가</button></form>
        <div class="name-tags">${n.map((x, i) => `<span class="chip">${esc(x)}<button type="button" data-ndel="${i}" aria-label="${esc(x)} 빼기">${icon('x', 'sm')}</button></span>`).join('')}${n.length ? `<button class="btn btn-ghost btn-sm" type="button" data-nclear>모두 지우기</button>` : '<span class="muted small">아직 아무도 없어요</span>'}</div>`;
      wrap.querySelector('[data-nf]').onsubmit = (e) => {
        e.preventDefault();
        const v = wrap.querySelector('#nIn').value.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean);
        if (!v.length) return;
        setNames([...getNames(), ...v]); draw(); onChange && onChange();
        wrap.querySelector('#nIn').focus();
      };
      wrap.onclick = (e) => {
        const d = e.target.closest('[data-ndel]');
        if (d) { const a = getNames(); a.splice(Number(d.dataset.ndel), 1); setNames(a); draw(); onChange && onChange(); }
        if (e.target.closest('[data-nclear]')) { setNames([]); draw(); onChange && onChange(); }
      };
    };
    draw();
    return wrap;
  }

  /* ---------------- 도구 ---------------- */
  const TOOLS = {
    teams: { title: '팀 나누기', render() {
      body.innerHTML = `<p class="muted">이름을 넣고 몇 팀으로 나눌지 고르세요.</p><div id="ne" style="margin-top:12px"></div>
        <div class="row" style="margin-top:16px;flex-wrap:wrap"><span class="b">팀 수</span><div class="seg" id="tc">${[2, 3, 4, 5, 6].map((n) => `<button type="button" data-n="${n}" class="${n === 2 ? 'on' : ''}">${n}팀</button>`).join('')}</div><button class="btn btn-red" type="button" id="go">${icon('shuffle')}섞기</button></div>
        <div class="teams" id="out"></div>`;
      $('#ne').appendChild(namesEditor());
      let n = 2;
      $('#tc').onclick = (e) => { const b = e.target.closest('[data-n]'); if (!b) return; n = Number(b.dataset.n); $$('#tc button').forEach((x) => x.classList.toggle('on', x === b)); };
      $('#go').onclick = () => {
        const names = shuffle(getNames());
        if (names.length < n) { SP.toast(`${n}팀으로 나누려면 ${n}명 이상 넣어 주세요.`); return; }
        const teams = Array.from({ length: n }, () => []);
        names.forEach((x, i) => teams[i % n].push(x));
        const colors = ['sun', 'moon', 'red', '', 'sun', 'moon'];
        $('#out').innerHTML = teams.map((t, i) => `<div class="team" style="${colors[i] === 'sun' ? 'background:var(--sun-tint)' : colors[i] === 'moon' ? 'background:var(--moon-tint)' : colors[i] === 'red' ? 'background:var(--red-tint)' : ''}"><h4>${i + 1}팀</h4><ul>${t.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
      };
    } },

    order: { title: '순서 정하기', render() {
      body.innerHTML = `<div id="ne"></div><button class="btn btn-red" type="button" id="go" style="margin-top:16px">${icon('shuffle')}순서 정하기</button><ol class="steps" id="out" style="margin-top:22px"></ol>`;
      $('#ne').appendChild(namesEditor());
      $('#go').onclick = () => {
        const n = shuffle(getNames());
        if (n.length < 2) { SP.toast('두 명 이상 넣어 주세요.'); return; }
        $('#out').innerHTML = n.map((x) => `<li><div><h4 style="font-size:22px">${esc(x)}</h4></div></li>`).join('');
      };
    } },

    pick: { title: '한 명 뽑기', render() {
      body.innerHTML = `<div id="ne"></div><div class="big-card" id="card" style="margin-top:18px"><span><small>오늘의 주인공</small>두구두구…</span></div><button class="btn btn-red btn-lg btn-block" type="button" id="go" style="margin-top:14px">${icon('sparkle')}뽑기</button>`;
      $('#ne').appendChild(namesEditor());
      let t = null;
      $('#go').onclick = () => {
        const n = getNames();
        if (n.length < 2) { SP.toast('두 명 이상 넣어 주세요.'); return; }
        clearInterval(t);
        const end = Date.now() + 1400;
        const card = $('#card');
        card.className = 'big-card';
        t = setInterval(() => {
          card.innerHTML = `<span><small>두구두구…</small>${esc(pick(n))}</span>`;
          if (Date.now() > end) { clearInterval(t); card.className = 'big-card red'; card.innerHTML = `<span><small>오늘의 주인공</small>${esc(pick(n))}</span>`; }
        }, 70);
      };
      cleanup = () => clearInterval(t);
    } },

    ladder: { title: '사다리 타기', render() {
      body.innerHTML = `<p class="muted">참가자와 결과를 같은 수만큼 넣어 주세요. 결과는 '꽝'만 넣어도 돼요.</p><div id="ne" style="margin-top:12px"></div>
        <div class="field" style="margin-top:14px"><label class="label" for="res">결과 (쉼표로 구분)</label><input class="input" id="res" placeholder="예) 설거지, 꽝, 꽝, 쓰레기 버리기"></div>
        <button class="btn btn-red" type="button" id="go" style="margin-top:12px">${icon('ladder')}사다리 만들기</button>
        <div class="ladder-wrap" style="margin-top:18px"><canvas id="cv" width="10" height="10"></canvas></div><p class="small muted" id="hint" style="text-align:center"></p>`;
      $('#ne').appendChild(namesEditor());
      $('#res').value = SP.store.get('play.ladderRes', '');
      let L = null;
      $('#go').onclick = () => {
        const names = getNames();
        if (names.length < 2) { SP.toast('두 명 이상 넣어 주세요.'); return; }
        if (names.length > 10) { SP.toast('사다리는 10명까지 탈 수 있어요.'); return; }
        SP.store.set('play.ladderRes', $('#res').value);
        let res = $('#res').value.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
        while (res.length < names.length) res.push('꽝');
        res = shuffle(res.slice(0, names.length));
        const N = names.length, R = 12, rungs = [];
        for (let r = 0; r < R; r++) for (let i = 0; i < N - 1; i++) if (Math.random() < 0.42 && !rungs.some((g) => g.r === r && (g.i === i - 1 || g.i === i + 1))) rungs.push({ r, i });
        L = { names, res, N, R, rungs, done: {} };
        draw();
        $('#hint').textContent = '위의 이름을 눌러 보세요.';
      };
      function geo() {
        const cv = $('#cv');
        const W = Math.min(body.clientWidth, 860), colW = W / L.N;
        return { cv, W, colW, top: 50, H: 380 };
      }
      function pathOf(c) {
        const pts = [];
        let col = c;
        pts.push([col, -1]);
        for (let r = 0; r < L.R; r++) {
          pts.push([col, r]);
          if (L.rungs.some((g) => g.r === r && g.i === col)) { col++; pts.push([col, r]); }
          else if (L.rungs.some((g) => g.r === r && g.i === col - 1)) { col--; pts.push([col, r]); }
        }
        pts.push([col, L.R]);
        return { pts, end: col };
      }
      function draw(active) {
        const { cv, W, colW, top, H } = geo();
        const dpr = window.devicePixelRatio || 1;
        cv.width = W * dpr; cv.height = (H + 110) * dpr; cv.style.width = W + 'px'; cv.style.height = (H + 110) + 'px';
        const g = cv.getContext('2d');
        g.scale(dpr, dpr);
        g.clearRect(0, 0, W, H + 110);
        const x = (c) => colW * c + colW / 2, y = (r) => top + 14 + (r + 0.5) * ((H - 28) / L.R);
        g.lineWidth = 4; g.strokeStyle = '#d9d9d9'; g.lineCap = 'round';
        for (let c = 0; c < L.N; c++) { g.beginPath(); g.moveTo(x(c), top); g.lineTo(x(c), top + H); g.stroke(); }
        L.rungs.forEach((r) => { g.beginPath(); g.moveTo(x(r.i), y(r.r)); g.lineTo(x(r.i + 1), y(r.r)); g.stroke(); });
        g.font = '700 16px Pretendard Variable, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#1a1a1a';
        L.names.forEach((n, c) => g.fillText(n.slice(0, 6), x(c), top - 16));
        Object.entries(L.done).forEach(([c, e]) => { g.fillStyle = '#e83217'; g.font = '800 15px Pretendard Variable, sans-serif'; g.fillText(L.res[e].slice(0, 7), x(e), top + H + 30); g.fillStyle = '#5e5e5e'; g.font = '600 12px Pretendard Variable, sans-serif'; g.fillText(L.names[c].slice(0, 6), x(e), top + H + 50); });
        if (active) {
          const { pts } = pathOf(active.c);
          g.strokeStyle = '#e83217'; g.lineWidth = 6;
          g.beginPath();
          const n = Math.max(1, Math.floor(pts.length * active.p));
          pts.slice(0, n).forEach(([c, r], i) => { const yy = r < 0 ? top : r >= L.R ? top + H : y(r); if (i) g.lineTo(x(c), yy); else g.moveTo(x(c), yy); });
          g.stroke();
        }
        cv.onclick = (ev) => {
          const rect = cv.getBoundingClientRect();
          const c = Math.floor((ev.clientX - rect.left) / colW);
          if (ev.clientY - rect.top > top + 10 || c < 0 || c >= L.N) return;
          let p = 0;
          const tick = () => { p += 0.035; draw({ c, p: Math.min(1, p) }); if (p < 1) requestAnimationFrame(tick); else { L.done[c] = pathOf(c).end; draw(); } };
          tick();
        };
      }
    } },

    wheel: { title: '미션 룰렛', render() {
      const saved = SP.store.get('play.wheel', null);
      body.innerHTML = `<div class="wheel-wrap"><div class="wheel-pin"></div><canvas id="wv" width="840" height="840"></canvas></div>
        <div class="big-card" id="wres" style="min-height:120px;font-size:clamp(24px,4.4vw,40px)">룰렛을 돌려 보세요</div>
        <button class="btn btn-red btn-lg btn-block" type="button" id="spin" style="margin-top:14px">${icon('wheel')}돌리기</button>
        <details style="margin-top:18px"><summary class="btn btn-soft btn-sm">미션 바꾸기</summary><textarea class="textarea" id="wItems" style="margin-top:10px">${esc((saved || MISSIONS).join('\n'))}</textarea><div class="row" style="margin-top:8px"><button class="btn btn-ink btn-sm" type="button" id="wSave">적용</button><button class="btn btn-ghost btn-sm" type="button" id="wReset">기본 미션으로</button></div></details>`;
      let items = saved || MISSIONS.slice();
      let ang = 0, spinning = false;
      const cols = ['#ffc83d', '#2b2f6b', '#e83217', '#f4f4f4'];
      const txt = ['#6b4a00', '#ffffff', '#ffffff', '#1a1a1a'];
      function draw() {
        const cv = $('#wv'), g = cv.getContext('2d'), R = cv.width / 2, n = items.length, seg = (Math.PI * 2) / n;
        g.clearRect(0, 0, cv.width, cv.height);
        for (let i = 0; i < n; i++) {
          const a0 = ang + i * seg - Math.PI / 2;
          g.beginPath(); g.moveTo(R, R); g.arc(R, R, R - 6, a0, a0 + seg); g.closePath();
          g.fillStyle = cols[i % 4]; g.fill();
          g.save(); g.translate(R, R); g.rotate(a0 + seg / 2); g.textAlign = 'right'; g.fillStyle = txt[i % 4];
          g.font = `700 ${n > 12 ? 26 : 32}px Pretendard Variable, sans-serif`;
          const t = items[i].length > 11 ? items[i].slice(0, 10) + '…' : items[i];
          g.fillText(t, R - 34, 10); g.restore();
        }
        g.beginPath(); g.arc(R, R, 46, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
      }
      draw();
      $('#spin').onclick = () => {
        if (spinning) return;
        spinning = true;
        const n = items.length, seg = (Math.PI * 2) / n;
        const target = rnd(n);
        const start = ang, t0 = performance.now(), dur = 3600;
        const endAng = start + Math.PI * 2 * (5 + rnd(3)) + (Math.PI * 2 - (target * seg + seg / 2) - (start % (Math.PI * 2)));
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        const tick = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          ang = start + (endAng - start) * ease(p);
          draw();
          if (p < 1) requestAnimationFrame(tick);
          else { spinning = false; $('#wres').className = 'big-card ' + ['sun', 'moon', 'red', ''][target % 4]; $('#wres').textContent = items[target]; }
        };
        requestAnimationFrame(tick);
      };
      $('#wSave').onclick = () => { const v = $('#wItems').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 24); if (v.length < 2) { SP.toast('두 개 이상 적어 주세요.'); return; } items = v; SP.store.set('play.wheel', v); draw(); SP.toast('미션을 바꿨어요.'); };
      $('#wReset').onclick = () => { items = MISSIONS.slice(); SP.store.del('play.wheel'); $('#wItems').value = items.join('\n'); draw(); };
    } },

    balance: { title: '밸런스 게임', render() {
      let order = shuffle(BALANCE.map((_, i) => i)), k = 0;
      const draw = () => {
        const [a, b] = BALANCE[order[k]];
        body.innerHTML = `<p class="muted" style="text-align:center;margin-bottom:12px">${k + 1} / ${order.length} · 둘 중 하나만 고를 수 있어요</p>
          <div class="vs"><button type="button" data-p="0">${esc(a)}</button><button type="button" data-p="1">${esc(b)}</button></div>
          <div class="row" style="justify-content:center;margin-top:16px"><button class="btn btn-ink btn-lg" type="button" id="next">다음 질문</button><button class="btn btn-ghost" type="button" id="re">처음부터</button></div>`;
        body.querySelector('.vs').onclick = (e) => { const p = e.target.closest('[data-p]'); if (!p) return; $$('.vs button', body).forEach((x) => x.classList.toggle('picked', x === p)); };
        $('#next').onclick = () => { k = (k + 1) % order.length; if (k === 0) order = shuffle(order); draw(); };
        $('#re').onclick = () => { order = shuffle(order); k = 0; draw(); };
      };
      draw();
    } },

    talk: { title: '토크 카드', render() {
      const cats = Object.keys(TALK);
      let cat = cats[0], deck = shuffle(TALK[cat]), k = 0;
      const draw = () => {
        body.innerHTML = `<div class="chips" style="justify-content:center;margin-bottom:16px">${cats.map((c) => `<button type="button" class="chip${c === cat ? ' on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
          <div class="big-card ${['sun', 'moon', 'red', ''][k % 4]}"><span><small>${k + 1} / ${deck.length}</small>${esc(deck[k])}</span></div>
          <div class="row" style="justify-content:center;margin-top:16px"><button class="btn btn-line btn-lg" type="button" id="prev">이전</button><button class="btn btn-ink btn-lg" type="button" id="next">다음 카드</button></div>`;
        body.querySelector('.chips').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; deck = shuffle(TALK[cat]); k = 0; draw(); };
        $('#prev').onclick = () => { k = (k - 1 + deck.length) % deck.length; draw(); };
        $('#next').onclick = () => { k = (k + 1) % deck.length; draw(); };
      };
      draw();
    } },

    liar: { title: '라이어 게임', render() {
      const cats = Object.keys(WORDS);
      let cat = cats[0], n = 5;
      const setup = () => {
        body.innerHTML = `<p class="muted">한 명만 제시어를 모르는 '라이어'가 돼요. 휴대폰을 한 사람씩 돌려 가며 확인하세요.</p>
          <div class="field" style="margin-top:16px"><span class="label">주제</span><div class="chips" id="lc">${cats.map((c) => `<button type="button" class="chip${c === cat ? ' on' : ''}" data-c="${c}">${c}</button>`).join('')}</div></div>
          <div class="field"><label class="label" for="ln">몇 명이 해요?</label><input class="input" id="ln" type="number" min="3" max="12" value="${n}" style="max-width:120px"></div>
          <button class="btn btn-red btn-lg" type="button" id="go" style="margin-top:8px">시작하기</button>`;
        $('#lc').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; $$('#lc .chip').forEach((x) => x.classList.toggle('on', x === b)); };
        $('#go').onclick = () => { n = Math.max(3, Math.min(12, Number($('#ln').value) || 5)); play(); };
      };
      const play = () => {
        const word = pick(WORDS[cat]), liar = rnd(n);
        let i = 0, shown = false;
        const step = () => {
          if (i >= n) {
            body.innerHTML = `<div class="big-card"><span><small>모두 확인했어요</small>한 명씩 제시어를 설명해 보세요</span></div>
              <p class="muted" style="text-align:center;margin-top:12px">라이어는 들키지 않게, 나머지는 라이어를 찾아내세요.</p>
              <div class="row" style="justify-content:center;margin-top:14px"><button class="btn btn-ink btn-lg" type="button" id="ans">정답 보기</button><button class="btn btn-line btn-lg" type="button" id="again">다시 하기</button></div><div id="ansBox" style="margin-top:14px"></div>`;
            $('#ans').onclick = () => { $('#ansBox').innerHTML = `<div class="big-card red" style="min-height:0;padding:22px"><span><small>제시어는</small>${esc(word)} · 라이어는 ${liar + 1}번째 사람</span></div>`; };
            $('#again').onclick = setup;
            return;
          }
          body.innerHTML = shown
            ? `<div class="big-card ${i === liar ? 'moon' : 'sun'}"><span><small>${i + 1}번째 사람</small>${i === liar ? `당신은 라이어예요<br><span style="font-size:.5em">주제: ${esc(cat)}</span>` : esc(word)}</span></div><button class="btn btn-ink btn-lg btn-block" type="button" id="hide" style="margin-top:14px">확인했어요, 다음 사람에게</button>`
            : `<div class="big-card"><span><small>${i + 1}번째 사람 차례</small>휴대폰을 건네주세요</span></div><button class="btn btn-red btn-lg btn-block" type="button" id="show" style="margin-top:14px">내 제시어 보기</button>`;
          const b = $('#show') || $('#hide');
          b.onclick = () => { if (shown) i++; shown = !shown; step(); };
        };
        step();
      };
      setup();
    } },

    chosung: { title: '초성 퀴즈', render() {
      const cats = Object.keys(QUIZ);
      let cat = cats[0], w = pick(QUIZ[cat]), open = false;
      const draw = () => {
        body.innerHTML = `<div class="chips" style="justify-content:center;margin-bottom:16px">${cats.map((c) => `<button type="button" class="chip${c === cat ? ' on' : ''}" data-c="${c}">${c}</button>`).join('')}</div>
          <div class="big-card ${open ? 'red' : ''}" style="letter-spacing:.06em"><span><small>${esc(cat)}</small>${esc(open ? w : chosung(w))}</span></div>
          <div class="row" style="justify-content:center;margin-top:16px"><button class="btn btn-line btn-lg" type="button" id="ans">${open ? '초성 다시 보기' : '정답 보기'}</button><button class="btn btn-ink btn-lg" type="button" id="next">다음 문제</button></div>`;
        body.querySelector('.chips').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; w = pick(QUIZ[cat]); open = false; draw(); };
        $('#ans').onclick = () => { open = !open; draw(); };
        $('#next').onclick = () => { let nw = pick(QUIZ[cat]); if (QUIZ[cat].length > 1) while (nw === w) nw = pick(QUIZ[cat]); w = nw; open = false; draw(); };
      };
      draw();
    } },

    charades: { title: '몸으로 말해요', render() {
      const cats = Object.keys(CHARADES);
      let cat = cats[0], deck = shuffle(CHARADES[cat]), k = 0, left = 0, t = null;
      const draw = () => {
        body.innerHTML = `<div class="chips" style="justify-content:center;margin-bottom:12px">${cats.map((c) => `<button type="button" class="chip${c === cat ? ' on' : ''}" data-c="${c}">${c}</button>`).join('')}</div>
          <div class="timer-face" id="tf" style="font-size:56px;margin:6px 0">${left ? left + '초' : '60초'}</div>
          <div class="big-card sun"><span><small>설명하는 사람만 보세요</small>${esc(deck[k])}</span></div>
          <div class="row" style="justify-content:center;margin-top:16px;flex-wrap:wrap"><button class="btn btn-red btn-lg" type="button" id="st">${t ? '타이머 멈춤' : '60초 시작'}</button><button class="btn btn-ink btn-lg" type="button" id="next">맞혔어요, 다음</button><button class="btn btn-line btn-lg" type="button" id="skip">넘기기</button></div>`;
        body.querySelector('.chips').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; deck = shuffle(CHARADES[cat]); k = 0; draw(); };
        $('#next').onclick = () => { k = (k + 1) % deck.length; draw(); };
        $('#skip').onclick = () => { k = (k + 1) % deck.length; draw(); };
        $('#st').onclick = () => {
          if (t) { clearInterval(t); t = null; draw(); return; }
          left = 60;
          t = setInterval(() => { left--; const tf = $('#tf'); if (tf) tf.textContent = left + '초'; if (left <= 0) { clearInterval(t); t = null; beep(); if (tf) { tf.textContent = '끝!'; tf.classList.add('done'); } } }, 1000);
          draw();
        };
      };
      draw();
      cleanup = () => clearInterval(t);
    } },

    timer: { title: '타이머', render() {
      let total = 180, left = 180, run = false, last = 0, raf = 0;
      const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      body.innerHTML = `<div class="chips" style="justify-content:center">${[1, 3, 5, 10, 15].map((m) => `<button type="button" class="chip" data-m="${m}">${m}분</button>`).join('')}<label class="row small" style="gap:6px">직접 <input class="input input-sm" id="cm" type="number" min="1" max="120" style="width:80px"> 분</label></div>
        <div class="timer-face" id="tf">${fmt(left)}</div>
        <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn btn-red btn-lg" type="button" id="go">${icon('play')}시작</button><button class="btn btn-line btn-lg" type="button" id="rs">${icon('refresh')}다시</button></div>`;
      const face = () => { $('#tf').textContent = left > 0 ? fmt(Math.ceil(left)) : '끝!'; $('#tf').classList.toggle('done', left <= 0); };
      const loop = (now) => { if (!run) return; left -= (now - last) / 1000; last = now; if (left <= 0) { left = 0; run = false; beep(); $('#go').innerHTML = `${icon('play')}시작`; } face(); if (run) raf = requestAnimationFrame(loop); };
      $('#go').onclick = () => { if (run) { run = false; $('#go').innerHTML = `${icon('play')}계속`; return; } if (left <= 0) left = total; run = true; last = performance.now(); $('#go').innerHTML = `${icon('pause')}멈춤`; raf = requestAnimationFrame(loop); };
      $('#rs').onclick = () => { run = false; left = total; $('#go').innerHTML = `${icon('play')}시작`; face(); };
      body.querySelector('.chips').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; total = left = Number(b.dataset.m) * 60; run = false; $('#go').innerHTML = `${icon('play')}시작`; face(); };
      $('#cm').onchange = (e) => { const m = Math.max(1, Math.min(120, Number(e.target.value) || 1)); total = left = m * 60; face(); };
      cleanup = () => { run = false; cancelAnimationFrame(raf); };
    } },

    score: { title: '점수판', render() {
      let list = SP.store.get('play.score', [{ n: '1팀', p: 0 }, { n: '2팀', p: 0 }]);
      const save = () => SP.store.set('play.score', list);
      const draw = () => {
        body.innerHTML = `<div class="score-list">${list.map((x, i) => `<div class="score-row"><b>${esc(x.n)}</b><button class="btn btn-line" type="button" data-d="${i}" aria-label="${esc(x.n)} 1점 빼기">${icon('minus')}</button><span class="pts">${x.p}</span><button class="btn btn-ink" type="button" data-u="${i}" aria-label="${esc(x.n)} 1점 더하기">${icon('plus')}</button></div>`).join('')}</div>
          <form class="names-input" id="af" style="margin-top:16px"><label class="sr-only" for="an">팀 이름</label><input class="input" id="an" maxlength="12" placeholder="팀이나 사람 이름 추가"><button class="btn btn-soft" type="submit">추가</button></form>
          <div class="row" style="margin-top:12px"><button class="btn btn-ghost btn-sm" type="button" id="zero">점수만 0으로</button><button class="btn btn-ghost btn-sm" type="button" id="clr">모두 지우기</button></div>`;
        body.querySelector('.score-list').onclick = (e) => { const u = e.target.closest('[data-u]'), d = e.target.closest('[data-d]'); if (u) list[u.dataset.u].p++; if (d) list[d.dataset.d].p--; if (u || d) { save(); draw(); } };
        $('#af').onsubmit = (e) => { e.preventDefault(); const v = $('#an').value.trim(); if (!v) return; list.push({ n: v, p: 0 }); save(); draw(); };
        $('#zero').onclick = () => { list.forEach((x) => { x.p = 0; }); save(); draw(); };
        $('#clr').onclick = () => { list = []; save(); draw(); };
      };
      draw();
    } },
  };

  let actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((d) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(0.25, actx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d + 0.22); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.24); });
    } catch { /* 소리를 못 내는 환경 */ }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  function open(key, push = true) {
    const t = TOOLS[key];
    if (!t) return;
    if (cleanup) { cleanup(); cleanup = null; }
    $('#stageTitle').textContent = t.title;
    stage.classList.add('open');
    document.body.style.overflow = 'hidden';
    t.render();
    if (push) history.replaceState(null, '', '#' + key);
    setTimeout(() => $('#stageClose').focus(), 30);
  }
  function close() {
    if (cleanup) { cleanup(); cleanup = null; }
    stage.classList.remove('open');
    document.body.style.overflow = '';
    body.innerHTML = '';
    history.replaceState(null, '', location.pathname);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) open(b.dataset.tool); });
  $('#stageClose').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stage.classList.contains('open')) close(); });
  $('#stageFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else stage.requestFullscreen ? stage.requestFullscreen().catch(() => SP.toast('이 기기에서는 전체 화면을 지원하지 않아요.')) : SP.toast('이 기기에서는 전체 화면을 지원하지 않아요.');
  });
  const h = location.hash.replace('#', '');
  if (TOOLS[h]) setTimeout(() => open(h, false), 50);

  SP.site().then(({ settings: s }) => {
    if (!s) return;
    const links = [];
    if (s['link.play']) links.push(['game', '쏘플 플레이', '점수 겨루는 본격 파티 게임은 쏘플 플레이에서', s['link.play']]);
    links.push(['users', '온라인 파티룸', '멀리 있는 친구와 아바타로 모여 파티게임·미니게임', s['link.live'] || '/live']);
    if (links.length) $('#playLinks').innerHTML = `<h2 class="h3" style="margin-bottom:12px">더 놀고 싶다면</h2><div class="grid g2">${links.map(([i, t, d, u]) => `<a class="box" style="display:flex;gap:14px;align-items:center" href="${esc(u)}"${u.startsWith('/') ? '' : ' target="_blank" rel="noopener"'}><span class="t-ic" style="width:46px;height:46px;border-radius:14px;background:var(--fog);display:grid;place-items:center">${icon(i)}</span><span><b style="font-size:17px">${t}</b><br><span class="muted small">${d}</span></span></a>`).join('')}</div>`;
  });
})();
